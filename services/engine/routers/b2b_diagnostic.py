"""
B2B RIA Diagnostic Engine — ephemeral advisor analysis.

POST /v1/b2b/diagnose-csv
  Accepts multipart: CSV file + broker slug + firm_name + client_label
  Parses via existing normalizer adapters, runs full behavioral analysis,
  returns diagnostic JSON.  No user_id, no DB write.

POST /v1/b2b/diagnose
  Accepts pre-normalized transaction list (JSON).
  Same analysis, same output, same no-DB-write guarantee.
"""

from __future__ import annotations

import logging
from collections import defaultdict, deque
from datetime import date
from statistics import mean
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from calculations.behavioral import build_profile
from calculations.behavioral_v2 import compute_behavioral_v2
from calculations.benchmark_replay import estimate_live_portfolio_value, replay
from calculations.returns import compute_mwr
from calculations.risk_suite import compute_risk_suite
from marketdata.prices import build_price_book
from normalizer.registry import detect_and_parse, get_adapter

log = logging.getLogger("engine.b2b")
router = APIRouter(tags=["b2b"])

_MAX_CSV_BYTES = 10 * 1024 * 1024   # 10 MB


# ══════════════════════════════════════════════════════════════════════════════
# Request / Response models
# ══════════════════════════════════════════════════════════════════════════════

class B2BTransaction(BaseModel):
    date:            str    # ISO YYYY-MM-DD
    ticker:          str
    action:          str    # 'buy' | 'sell'
    execution_price: float
    quantity:        float
    net_amount:      Optional[float] = None


class DiagnoseRequest(BaseModel):
    transactions: list[B2BTransaction]
    firm_name:    str = "Advisor"
    client_label: str = "Client Portfolio"
    currency:     str = "USD"    # drives ASX symbol resolution + benchmark choice


class WealthPoint(BaseModel):
    date:           str
    cumulative_in:  float
    cumulative_out: float
    net_position:   float


class DiagnosticGrades(BaseModel):
    overall:    str
    timing:     str
    discipline: str
    returns:    str


class B2BDiagnosticOutput(BaseModel):
    firm_name:              str
    client_label:           str
    analysis_date:          str
    transaction_count:      int
    period_start:           str
    period_end:             str
    profile_confidence:     str

    mwr_annualized:          float
    realized_return_avg:     float
    buy_hold_return_avg:     float
    behavioral_tax_pct:      float

    panic_liquidation_rate:  float
    timing_quality:          float
    avg_holding_days:        Optional[float]
    loss_aversion_score:     float
    buy_dip_probability:     float

    trade_win_rate:          float
    avg_gain_on_winners:     float
    avg_loss_on_losers:      float
    profit_factor:           float

    grades:       DiagnosticGrades
    insights:     list[str]
    wealth_path:  list[WealthPoint]

    # ── Market-data enrichment (Phases 1–2) — None when prices unavailable ────
    currency:                   str = "USD"
    estimated_portfolio_value:  Optional[float] = None   # open positions, live-priced
    live_price_coverage:        Optional[float] = None   # fraction valued at live prices
    benchmark_symbol:           Optional[str]   = None
    benchmark_end_value:        Optional[float] = None   # same flows into the index
    benchmark_mwr_annualized:   Optional[float] = None
    alpha_vs_benchmark_pp:      Optional[float] = None   # client − benchmark, pp
    opportunity_cost_dollars:   Optional[float] = None   # index value − client value
    benchmark_path:             Optional[list[dict]] = None

    # ── Phase 3: institutional risk suite ─────────────────────────────────────
    risk_suite:                 Optional[dict] = None

    # ── Phase 4: behavioral finance v2 (disposition, FOMO, panic, turnover) ───
    behavioral_v2:              Optional[dict] = None


# ══════════════════════════════════════════════════════════════════════════════
# CSV endpoint — parses file, then runs diagnostic
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/diagnose-csv", response_model=B2BDiagnosticOutput)
async def b2b_diagnose_csv(
    file:         UploadFile = File(...),
    broker:       str        = Form("csv_generic"),
    firm_name:    str        = Form("Advisor"),
    client_label: str        = Form("Client Portfolio"),
) -> B2BDiagnosticOutput:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(raw) > _MAX_CSV_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit.")

    if broker == "auto":
        # Score every registered adapter and use the best match.
        try:
            detected, norm_txs = detect_and_parse(raw)
            log.info("B2B auto-detect chose adapter=%s", detected)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
    else:
        try:
            adapter = get_adapter(broker)
        except KeyError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        try:
            norm_txs = adapter.parse_transactions(raw)
        except Exception as exc:
            # Wrong broker selected? Fall back to auto-detection before failing.
            log.warning("B2B parse failed for broker=%s (%s); trying auto-detect", broker, exc)
            try:
                detected, norm_txs = detect_and_parse(raw)
                log.info("B2B auto-detect rescued upload: adapter=%s", detected)
            except ValueError:
                raise HTTPException(status_code=422, detail=f"Could not parse CSV: {exc}")

    b2b_txs = [
        B2BTransaction(
            date=t.settled_at.strftime("%Y-%m-%d"),
            ticker=t.symbol or "",
            action=t.transaction_type,
            execution_price=float(t.price),
            quantity=float(t.quantity),
            net_amount=float(abs(t.net_amount)),
        )
        for t in norm_txs
        if t.symbol and t.transaction_type in ("buy", "sell") and t.price > 0 and t.quantity > 0
    ]

    # Majority-vote currency from the normalized rows (AU adapters emit AUD).
    currencies = [t.currency for t in norm_txs if getattr(t, "currency", None)]
    currency = max(set(currencies), key=currencies.count) if currencies else "USD"

    req = DiagnoseRequest(
        transactions=b2b_txs,
        firm_name=firm_name,
        client_label=client_label,
        currency=currency,
    )
    return await _run_diagnostic(req)


# ══════════════════════════════════════════════════════════════════════════════
# JSON endpoint — pre-normalized transactions
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/diagnose", response_model=B2BDiagnosticOutput)
async def b2b_diagnose(req: DiagnoseRequest) -> B2BDiagnosticOutput:
    if not req.transactions:
        raise HTTPException(status_code=400, detail="No transactions provided.")
    return await _run_diagnostic(req)


# ══════════════════════════════════════════════════════════════════════════════
# Core diagnostic engine
# ══════════════════════════════════════════════════════════════════════════════

async def _run_diagnostic(req: DiagnoseRequest) -> B2BDiagnosticOutput:
    txs = req.transactions

    # ── Normalise to internal dict format ─────────────────────────────────────
    trades: list[dict] = []
    for t in txs:
        action = t.action.lower()
        if action not in ("buy", "sell"):
            continue
        qty   = abs(t.quantity)
        price = abs(t.execution_price)
        net   = abs(t.net_amount) if t.net_amount is not None else price * qty
        trades.append({
            "transaction_type": action,
            "date":             t.date,
            "_date":            date.fromisoformat(t.date[:10]),
            "symbol":           t.ticker.upper().strip(),
            "price":            price,
            "quantity":         qty,
            "net_amount":       net,
        })

    if not trades:
        raise HTTPException(status_code=422, detail="No valid buy/sell transactions found.")

    trades.sort(key=lambda x: x["_date"])

    # ── Behavioral profile ────────────────────────────────────────────────────
    profile = build_profile(trades)

    # ── Cash flows for MWR ────────────────────────────────────────────────────
    cf_dates:   list[date]  = [t["_date"] for t in trades]
    cf_amounts: list[float] = []
    for t in trades:
        if t["transaction_type"] == "buy":
            cf_amounts.append(-t["net_amount"])
        else:
            cf_amounts.append(+t["net_amount"])

    remaining_value = _estimate_remaining_value(trades)
    mwr_raw         = compute_mwr(cf_amounts, cf_dates, final_value=remaining_value)

    # ── Market-data enrichment (Phases 1–2) ───────────────────────────────────
    # Live prices upgrade the valuation and MWR; the benchmark replay computes
    # the true opportunity cost. Any failure here degrades to the base report —
    # a diagnostic must never 500 because Yahoo Finance is unreachable.
    est_value  = remaining_value
    live_cov:  Optional[float] = None
    benchmark  = None
    risk       = None
    bv2        = None
    try:
        symbols = sorted({t["symbol"] for t in trades})
        book, bench_sym = build_price_book(symbols, req.currency, start=min(cf_dates))

        live_value, coverage = estimate_live_portfolio_value(trades, book)
        if live_value > 0:
            est_value = live_value
            live_cov  = round(coverage, 4)
            mwr_raw   = compute_mwr(cf_amounts, cf_dates, final_value=est_value)

        if bench_sym:
            benchmark = replay(
                list(zip(cf_dates, cf_amounts)),
                client_end_value=est_value,
                client_mwr=mwr_raw,
                book=book,
                benchmark_symbol=bench_sym,
            )

        # Phase 3: daily-series risk metrics (None if price coverage too thin)
        risk = compute_risk_suite(trades, book, bench_sym)

        # Phase 4: disposition effect, FOMO, market-panic sells, turnover
        bv2 = compute_behavioral_v2(
            trades, book, bench_sym,
            mean_portfolio_value=risk["mean_portfolio_value"] if risk else None,
        )
    except Exception as exc:
        log.warning("B2B enrichment unavailable, serving base report: %s", exc)

    # ── FIFO trade pairs (realized returns + buy-hold comparison) ─────────────
    pairs              = _fifo_match(trades)
    realized_returns   = [p["return_pct"]    for p in pairs]
    bh_returns         = [p["bh_return_pct"] for p in pairs]

    realized_return_avg = mean(realized_returns) if realized_returns else 0.0
    buy_hold_return_avg = mean(bh_returns)        if bh_returns        else 0.0
    behavioral_tax_pct  = buy_hold_return_avg - realized_return_avg

    # ── Win / loss stats ──────────────────────────────────────────────────────
    winners = [r for r in realized_returns if r > 0]
    losers  = [r for r in realized_returns if r <= 0]
    trade_win_rate      = len(winners) / len(realized_returns) if realized_returns else 0.5
    avg_gain_on_winners = mean(winners) if winners else 0.0
    avg_loss_on_losers  = mean(losers)  if losers  else 0.0
    total_gains         = sum(winners)  if winners else 0.0
    total_losses        = abs(sum(losers)) if losers else 0.0
    profit_factor       = total_gains / total_losses if total_losses > 0 else 999.0

    # ── Wealth path ───────────────────────────────────────────────────────────
    wealth_path = _build_wealth_path(trades)

    # ── Period bounds ─────────────────────────────────────────────────────────
    all_dates    = [t["_date"] for t in trades]
    period_start = str(min(all_dates))
    period_end   = str(max(all_dates))

    # ── Grades + insights ─────────────────────────────────────────────────────
    grades   = _compute_grades(profile, mwr_raw, behavioral_tax_pct, trade_win_rate)
    insights = _generate_insights(profile, behavioral_tax_pct, mwr_raw, trade_win_rate)

    # The opportunity-cost line leads when the benchmark replay succeeded —
    # it is the single most persuasive number in the report.
    if benchmark and est_value > 0:
        gap = benchmark["opportunity_cost_dollars"]
        if abs(gap) >= 100:
            direction = "behind" if gap > 0 else "ahead of"
            insights.insert(0, (
                f"Index replay: the same deposits into {benchmark['benchmark_symbol']} "
                f"on the same days would be worth {abs(benchmark['benchmark_end_value']):,.0f} "
                f"today vs {est_value:,.0f} actual — the portfolio is "
                f"{abs(gap):,.0f} {direction} the index."
            ))
        insights = insights[:5]

    return B2BDiagnosticOutput(
        firm_name=req.firm_name,
        client_label=req.client_label,
        analysis_date=str(date.today()),
        transaction_count=len(trades),
        period_start=period_start,
        period_end=period_end,
        profile_confidence=profile["profile_confidence"],
        mwr_annualized=round(mwr_raw * 100, 2),
        realized_return_avg=round(realized_return_avg * 100, 2),
        buy_hold_return_avg=round(buy_hold_return_avg * 100, 2),
        behavioral_tax_pct=round(behavioral_tax_pct * 100, 2),
        panic_liquidation_rate=round(profile["panic_sell_probability_10"] * 100, 2),
        timing_quality=round(profile["timing_quality_score"], 4),
        avg_holding_days=profile.get("avg_holding_days"),
        loss_aversion_score=round(profile["loss_aversion_score"], 4),
        buy_dip_probability=round(profile["buy_dip_probability"] * 100, 2),
        trade_win_rate=round(trade_win_rate * 100, 2),
        avg_gain_on_winners=round(avg_gain_on_winners * 100, 2),
        avg_loss_on_losers=round(avg_loss_on_losers * 100, 2),
        profit_factor=round(min(profit_factor, 999.0), 2),
        grades=grades,
        insights=insights,
        wealth_path=wealth_path,
        currency=req.currency,
        estimated_portfolio_value=round(est_value, 2) if est_value else None,
        live_price_coverage=live_cov,
        benchmark_symbol=benchmark["benchmark_symbol"] if benchmark else None,
        benchmark_end_value=benchmark["benchmark_end_value"] if benchmark else None,
        benchmark_mwr_annualized=benchmark["benchmark_mwr_annualized"] if benchmark else None,
        alpha_vs_benchmark_pp=benchmark["alpha_pp"] if benchmark else None,
        opportunity_cost_dollars=benchmark["opportunity_cost_dollars"] if benchmark else None,
        benchmark_path=list(benchmark["path"]) if benchmark else None,
        risk_suite=dict(risk) if risk else None,
        behavioral_v2=dict(bv2) if bv2 else None,
    )


# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════

def _fifo_match(trades: list[dict]) -> list[dict]:
    """Match buy→sell FIFO per symbol; return realized + buy-hold returns per pair."""
    buy_queues: dict[str, deque] = defaultdict(deque)
    first_buy:  dict[str, dict]  = {}

    for t in trades:
        sym = t["symbol"]
        if t["transaction_type"] == "buy":
            buy_queues[sym].append(t)
            if sym not in first_buy:
                first_buy[sym] = t

    pairs: list[dict] = []
    for t in trades:
        if t["transaction_type"] != "sell":
            continue
        sym   = t["symbol"]
        queue = buy_queues.get(sym)
        if not queue:
            continue
        buy = queue.popleft()
        bp, sp = buy["price"], t["price"]
        if bp <= 0:
            continue

        realized_return = (sp - bp) / bp

        fb = first_buy.get(sym, buy)
        bh_return = (sp - fb["price"]) / fb["price"] if fb["price"] > 0 else realized_return

        pairs.append({
            "symbol":       sym,
            "return_pct":   realized_return,
            "bh_return_pct": bh_return,
        })

    return pairs


def _estimate_remaining_value(trades: list[dict]) -> float:
    """Estimate open-position value using last-known price × remaining quantity."""
    qty_held:   dict[str, float] = defaultdict(float)
    last_price: dict[str, float] = {}

    for t in trades:
        sym             = t["symbol"]
        last_price[sym] = t["price"]
        if t["transaction_type"] == "buy":
            qty_held[sym] += t["quantity"]
        else:
            qty_held[sym]  = max(0.0, qty_held[sym] - t["quantity"])

    return sum(
        qty_held[sym] * last_price.get(sym, 0.0)
        for sym in qty_held
        if qty_held[sym] > 0
    )


def _build_wealth_path(trades: list[dict]) -> list[WealthPoint]:
    cum_in  = 0.0
    cum_out = 0.0
    path    = []
    for t in trades:
        if t["transaction_type"] == "buy":
            cum_in += t["net_amount"]
        else:
            cum_out += t["net_amount"]
        path.append(WealthPoint(
            date=str(t["_date"]),
            cumulative_in=round(cum_in,  2),
            cumulative_out=round(cum_out, 2),
            net_position=round(cum_out - cum_in, 2),
        ))
    return path


def _compute_grades(
    profile: dict,
    mwr: float,
    behavioral_tax: float,
    win_rate: float,
) -> DiagnosticGrades:
    def letter(score: float) -> str:
        if score >= 0.85: return "A"
        if score >= 0.70: return "B"
        if score >= 0.55: return "C"
        if score >= 0.40: return "D"
        return "F"

    timing_score     = (profile["timing_quality_score"] + 1) / 2
    discipline_score = max(0.0, 1.0 - profile["panic_sell_probability_10"])

    if mwr > 0.15:  returns_score = 0.90
    elif mwr > 0.10: returns_score = 0.75
    elif mwr > 0.05: returns_score = 0.60
    elif mwr > 0.0:  returns_score = 0.45
    else:            returns_score = 0.25
    if behavioral_tax < -0.10:
        returns_score *= 0.85

    overall = timing_score * 0.35 + discipline_score * 0.35 + returns_score * 0.30

    return DiagnosticGrades(
        overall=letter(overall),
        timing=letter(timing_score),
        discipline=letter(discipline_score),
        returns=letter(returns_score),
    )


def _generate_insights(
    profile: dict,
    behavioral_tax: float,
    mwr: float,
    win_rate: float,
) -> list[str]:
    insights: list[str] = []
    panic_rate   = profile["panic_sell_probability_10"]
    timing       = profile["timing_quality_score"]
    loss_aversion = profile["loss_aversion_score"]
    avg_hold     = profile.get("avg_holding_days")

    if panic_rate > 0.40:
        insights.append(
            f"High panic-sell tendency: {panic_rate*100:.0f}% of exits triggered during "
            f"drawdowns ≥ 10%. This systematically crystallises losses at the worst moments."
        )
    elif panic_rate < 0.10:
        insights.append(
            f"Exceptional emotional discipline: only {panic_rate*100:.0f}% of sells occurred "
            f"during downturns — a rare trait that protects long-term compounding."
        )

    if behavioral_tax < -0.05:
        insights.append(
            f"Behavioral tax identified: transaction timing cost ~{abs(behavioral_tax)*100:.1f} pp "
            f"vs a buy-and-hold equivalent across the same holdings."
        )
    elif behavioral_tax > 0.05:
        insights.append(
            f"Active timing added value: transaction decisions outperformed a passive "
            f"buy-and-hold baseline by {behavioral_tax*100:.1f} pp."
        )

    if timing < -0.30:
        insights.append(
            "Adverse entry timing: buys are clustering near relative highs and sells near "
            "relative lows — the inverse of optimal execution."
        )
    elif timing > 0.30:
        insights.append(
            "Contrarian timing advantage: buys are systematically near relative lows, "
            "suggesting disciplined dip-buying behaviour."
        )

    if loss_aversion > 0.70:
        insights.append(
            "Elevated loss aversion: positions held significantly longer when underwater "
            "than when profitable. This asymmetry can drag on portfolio velocity."
        )

    if avg_hold is not None and avg_hold < 30:
        insights.append(
            f"High turnover detected: avg holding period is {avg_hold:.0f} days. "
            f"Tax drag and transaction costs may materially reduce net returns."
        )

    if win_rate > 0.65:
        insights.append(
            f"Strong trade selectivity: {win_rate*100:.0f}% of completed positions were "
            f"profitable, indicating above-average stock selection."
        )
    elif win_rate < 0.40:
        insights.append(
            f"Trade selection warrants review: only {win_rate*100:.0f}% of completed "
            f"positions were profitable."
        )

    return insights[:5]

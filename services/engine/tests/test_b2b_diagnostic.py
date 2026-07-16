"""
Phase 10: golden-file + property tests for the B2B diagnostic pipeline.

Everything here is networkless — Yahoo Finance is replaced by a synthetic
PriceBook monkeypatched into the router. The suite pins down:

  1. GOLDEN OUTPUTS  — known inputs → exact expected numbers, so a refactor
     that silently changes a client-facing metric fails CI.
  2. DETERMINISM     — identical inputs must reproduce byte-identical reports
     (a compliance property for advisor-facing documents).
  3. ROBUSTNESS      — malformed uploads must produce clean errors, never
     unhandled exceptions.
  4. DEGRADATION     — with no price data at all, the base report still
     generates with enrichment fields nulled.
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from calculations.tax_drag import compute_tax_drag
from calculations.projection import project
from calculations.stat_rigor import binomial_skill_test, bootstrap_ci
from marketdata.prices import PriceBook
from normalizer.registry import detect_and_parse
from routers import b2b_diagnostic as b2b


# ── Synthetic market fixture ───────────────────────────────────────────────────

START = date(2025, 1, 6)


def _linear_series(days: int, start_price: float, end_price: float) -> dict[date, float]:
    return {
        START + timedelta(days=i): start_price + (end_price - start_price) * i / (days - 1)
        for i in range(days)
    }


@pytest.fixture()
def synthetic_book(monkeypatch):
    """Replace Yahoo with a deterministic in-memory market."""
    series = {
        "BHP":    _linear_series(400, 40.0, 52.0),
        "VAS":    _linear_series(400, 85.0, 95.0),
        "VAS.AX": _linear_series(400, 100.0, 118.0),   # benchmark
    }
    book = PriceBook(series)

    def fake_build_price_book(symbols, currency, start, end=None, include_benchmark=True):
        return book, "VAS.AX" if include_benchmark else None

    monkeypatch.setattr(b2b, "build_price_book", fake_build_price_book)
    return book


def _request() -> b2b.DiagnoseRequest:
    tx = b2b.B2BTransaction
    return b2b.DiagnoseRequest(
        currency="AUD",
        firm_name="Golden Test Advisors",
        client_label="Golden Client",
        transactions=[
            tx(date="2025-01-10", ticker="BHP", action="buy",  execution_price=40.15, quantity=100),
            tx(date="2025-06-20", ticker="BHP", action="sell", execution_price=45.00, quantity=50),
            tx(date="2025-02-14", ticker="VAS", action="buy",  execution_price=86.00, quantity=40),
            tx(date="2025-09-01", ticker="VAS", action="sell", execution_price=91.00, quantity=20),
            tx(date="2025-10-15", ticker="BHP", action="buy",  execution_price=49.00, quantity=30),
        ],
    )


# ── 1. Golden output ───────────────────────────────────────────────────────────

class TestGoldenDiagnostic:
    def test_full_report_shape(self, synthetic_book):
        out = b2b._run_diagnostic_sync(_request())

        assert out.transaction_count == 5
        assert out.currency == "AUD"
        assert out.period_start == "2025-01-10"
        assert out.period_end == "2025-10-15"

        # Enrichment present with the synthetic market
        assert out.benchmark_symbol == "VAS.AX"
        assert out.benchmark_end_value and out.benchmark_end_value > 0
        assert out.estimated_portfolio_value and out.estimated_portfolio_value > 0
        assert out.risk_suite is not None
        assert out.behavioral_v2 is not None
        assert out.statistics is not None
        assert out.tax_analysis is not None
        assert out.projection is not None
        assert out.score_v2 is not None and 0 <= out.score_v2["composite"] <= 100
        assert out.narrative and len(out.narrative) >= 1

    def test_golden_tax_numbers(self, synthetic_book):
        out = b2b._run_diagnostic_sync(_request())
        tax = out.tax_analysis
        # Both sells were < 12 months after their buys → 100% early gains.
        assert tax["pct_gains_taken_early"] == 100.0
        # BHP: (45.00 − 40.15) × 50 = 242.50; VAS: (91 − 86) × 20 = 100.00
        assert tax["short_term_gain"] == pytest.approx(342.50)
        assert tax["long_term_gain"] == 0.0
        # 342.50 × 0.37 × 0.5
        assert tax["est_discount_forgone"] == pytest.approx(63.36, abs=0.01)

    def test_determinism(self, synthetic_book):
        a = b2b._run_diagnostic_sync(_request()).model_dump()
        b_ = b2b._run_diagnostic_sync(_request()).model_dump()
        a.pop("analysis_date"); b_.pop("analysis_date")
        assert a == b_


# ── 2. Degradation: no prices at all ───────────────────────────────────────────

class TestDegradation:
    def test_base_report_without_prices(self, monkeypatch):
        def dead_book(symbols, currency, start, end=None, include_benchmark=True):
            return PriceBook({}), None
        monkeypatch.setattr(b2b, "build_price_book", dead_book)

        out = b2b._run_diagnostic_sync(_request())
        # Base metrics still present
        assert out.transaction_count == 5
        assert out.grades is not None
        assert out.tax_analysis is not None          # price-independent
        assert out.statistics is not None            # price-independent
        # Price-dependent enrichment nulled, never crashed
        assert out.benchmark_symbol is None
        assert out.risk_suite is None
        assert out.projection is None

    def test_enrichment_exception_degrades(self, monkeypatch):
        def exploding_book(*a, **k):
            raise RuntimeError("yahoo exploded")
        monkeypatch.setattr(b2b, "build_price_book", exploding_book)
        out = b2b._run_diagnostic_sync(_request())
        assert out.transaction_count == 5
        assert out.benchmark_symbol is None


# ── 3. Parser robustness (property-style) ──────────────────────────────────────

class TestParserRobustness:
    @pytest.mark.parametrize("garbage", [
        b"",
        b"\x00\xff\xfe\x01" * 50,
        b"hello world",
        b"a,b,c\n1,2,3\n",
        "émojis 🚀 and unicode ✓".encode("utf-8"),
        b"Date,Details\n,,,,\n" * 100,
    ])
    def test_garbage_never_crashes(self, garbage):
        with pytest.raises(ValueError):
            detect_and_parse(garbage)

    def test_valid_au_csv_still_detects(self):
        csv = (
            b"Trade Date,Transaction Type,Ticker,Units,Price,Total Amount\n"
            b"03/02/2025,Buy,BHP,100,45.67,4576.95\n"
        )
        slug, txs = detect_and_parse(csv)
        assert len([t for t in txs if t.transaction_type == "buy"]) == 1
        assert txs[0].settled_at.day == 3 and txs[0].settled_at.month == 2

    def test_extreme_numbers_survive(self):
        csv = (
            b"Trade Date,Transaction Type,Ticker,Units,Price,Total Amount\n"
            b'03/02/2025,Buy,BHP,"1,000,000",0.0001,100.00\n'
            b"04/02/2025,Sell,BHP,999999999,99999.99,1.00\n"
        )
        slug, txs = detect_and_parse(csv)
        assert len(txs) == 2


# ── 4. Pure-math invariants ─────────────────────────────────────────────────────

class TestMathInvariants:
    def test_binomial_exact(self):
        assert binomial_skill_test(7, 10) == pytest.approx(0.171875)
        assert binomial_skill_test(60, 100) < 0.05
        assert binomial_skill_test(3, 4) is None

    def test_bootstrap_deterministic_and_bracketing(self):
        vals = [0.05, -0.02, 0.08, 0.01, -0.04, 0.06, 0.03, -0.01, 0.07, 0.02]
        ci = bootstrap_ci(vals)
        assert ci == bootstrap_ci(vals)
        assert ci[0] <= sum(vals) / len(vals) <= ci[1]

    def test_projection_percentiles_ordered(self):
        p = project(100_000, 0.04, 0.25, 0.08, 0.15, horizon_years=10)
        for row in p["yearly"]:
            assert row["cur_p10"] < row["cur_p50"] < row["cur_p90"]
            assert row["dis_p10"] < row["dis_p50"] < row["dis_p90"]

    def test_tax_drag_golden(self):
        trades = [
            {"symbol": "A", "transaction_type": "buy",  "quantity": 100, "price": 50.0, "_date": date(2024, 1, 10)},
            {"symbol": "A", "transaction_type": "sell", "quantity": 100, "price": 60.0, "_date": date(2024, 11, 10)},
        ]
        tax = compute_tax_drag(trades, currency="AUD")
        assert tax["short_term_gain"] == 1000.0
        assert tax["est_discount_forgone"] == 185.0
        assert tax["near_miss_sales"] == 1

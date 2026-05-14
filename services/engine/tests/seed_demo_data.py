"""
Vestara Demo Data Seeder
========================
Generates and loads 2 years of realistic synthetic portfolio data so you can
explore every dashboard feature without a real brokerage account.

Usage (from services/engine/):
    python tests/seed_demo_data.py --email you@example.com --password yourpassword

What it does:
    1. Signs in to Supabase and resolves your user_id
    2. Uploads a Schwab-format holdings CSV  → POST /v1/ingest/schwab
    3. Uploads a Schwab-format transactions CSV → POST /v1/ingest/schwab
    4. Seeds portfolio_snapshots_v2 with 2 years of daily NAV (direct DB write)
    5. Syncs live market prices → POST /v1/sync/prices/{user_id}
    6. Computes all performance metrics → POST /v1/sync/compute/{user_id}

The portfolio is a diversified 10-position mix (ETFs + large-cap equities + cash)
with a realistic 2-year return history seeded with a reproducible random walk.
"""

from __future__ import annotations

import argparse
import csv
import io
import os
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv
from supabase import create_client

# ── Load env ──────────────────────────────────────────────────────────────────
_ENGINE_DIR = Path(__file__).parent.parent
load_dotenv(_ENGINE_DIR / ".env")

SUPABASE_URL        = os.environ["SUPABASE_URL"]
SERVICE_ROLE_KEY    = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
ENGINE_SERVICE_KEY  = os.environ["ENGINE_SERVICE_KEY"]
ENGINE_URL          = os.getenv("ENGINE_URL", "http://localhost:8000")

# ── Portfolio definition ──────────────────────────────────────────────────────
# (symbol, description, qty, avg_cost_per_share, current_price)
HOLDINGS: list[tuple[str, str, int, float, float]] = [
    ("VOO",  "Vanguard S&P 500 ETF",       35,  465.00, 510.20),
    ("QQQ",  "Invesco Nasdaq-100 ETF",      20,  420.50, 468.75),
    ("AAPL", "Apple Inc",                  50,  175.30, 211.40),
    ("MSFT", "Microsoft Corp",             15,  390.00, 432.80),
    ("NVDA", "NVIDIA Corp",                60,   82.00, 109.60),
    ("GOOGL","Alphabet Inc Class A",        25,  170.00, 173.20),
    ("JPM",  "JPMorgan Chase & Co",         20,  196.50, 234.90),
    ("JNJ",  "Johnson & Johnson",          20,  148.00, 155.30),
    ("XOM",  "Exxon Mobil Corp",           25,  115.00, 114.80),
]
CASH_VALUE  = 5_000.00
ACCOUNT_REF = "SCHWAB-DEMO-7421"


# ── CSV generators ────────────────────────────────────────────────────────────

def make_holdings_csv() -> bytes:
    """Schwab Positions export format."""
    lines = [
        f'"Positions for account {ACCOUNT_REF} as of 04/30/2026"',
        "",
        "Symbol,Description,Quantity,Price,Price Change %,Price Change $,"
        "Market Value,Day Change %,Day Change $,Cost Basis,Gain/Loss %,"
        "Gain/Loss $,Ratings,Reinvest Dividends?,Capital Gains?,% Of Account,Security Type",
    ]
    for sym, desc, qty, cost, price in HOLDINGS:
        total_cost = round(qty * cost, 2)
        market_val = round(qty * price, 2)
        gl_pct     = round((market_val / total_cost - 1) * 100, 2) if total_cost else 0
        gl         = round(market_val - total_cost, 2)
        lines.append(
            f'{sym},"{desc}",{qty},{price:.2f},,,'
            f'{market_val:.2f},,,{total_cost:.2f},{gl_pct:.2f},{gl:.2f},,,,,'
        )
    lines.append(
        f'"Cash & Cash Investments","Cash & Cash Investments",,,,,'
        f'{CASH_VALUE:.2f},,,,,,,,,,Cash and Money Market'
    )
    lines.append('"Account Total","","","","","","","","","","","","","","","",""')
    return "\n".join(lines).encode("utf-8")


def make_transactions_csv() -> bytes:
    """Schwab Transactions export format — 2 years of history."""
    rows: list[dict] = []
    start = datetime(2024, 5, 13, tzinfo=timezone.utc)
    holding_qty = {sym: qty for sym, _, qty, _, _ in HOLDINGS}

    def tx(date: datetime, action: str, symbol: str | None, desc: str,
           qty: float, price: float, fees: float, amount: float) -> None:
        rows.append({
            "Date":        date.strftime("%m/%d/%Y"),
            "Action":      action,
            "Symbol":      symbol or "",
            "Description": desc,
            "Quantity":    f"{qty:.4f}" if qty else "",
            "Price":       f"{price:.4f}" if price else "",
            "Fees & Comm": f"{fees:.2f}",
            "Amount":      f"{amount:.2f}",
        })

    # Initial deposit
    tx(start, "MoneyLink Deposit", None, "Bank transfer — initial funding", 0, 0, 0, 65_000.00)

    # Buy all positions on day 2
    for sym, desc, qty, cost, _ in HOLDINGS:
        tx(start + timedelta(days=1), "Buy", sym, desc, qty, cost, 0, -round(qty * cost, 2))

    # Dividends — realistic quarterly schedule for each paying stock/ETF
    _DIVS: list[tuple[str, int, float]] = [
        # (symbol, day-offset-from-start, amount-per-share)
        ("VOO",  90,  1.65), ("VOO",  180, 1.72), ("VOO",  270, 1.68),
        ("VOO",  365, 1.71), ("VOO",  455, 1.78), ("VOO",  545, 1.82), ("VOO",  635, 1.79),
        ("QQQ",  85,  0.62), ("QQQ",  175, 0.64), ("QQQ",  265, 0.61),
        ("QQQ",  360, 0.67), ("QQQ",  450, 0.70), ("QQQ",  540, 0.68),
        ("AAPL",  70, 0.25), ("AAPL", 160, 0.25), ("AAPL", 250, 0.25),
        ("AAPL", 345, 0.25), ("AAPL", 435, 0.25), ("AAPL", 525, 0.25),
        ("MSFT",  80, 0.75), ("MSFT", 170, 0.75), ("MSFT", 260, 0.83),
        ("MSFT", 355, 0.83), ("MSFT", 445, 0.83),
        ("JPM",   75, 1.15), ("JPM",  165, 1.15), ("JPM",  255, 1.25),
        ("JPM",  350, 1.25), ("JPM",  440, 1.40),
        ("JNJ",   72, 1.24), ("JNJ",  162, 1.24), ("JNJ",  252, 1.24),
        ("JNJ",  347, 1.24), ("JNJ",  437, 1.24),
        ("XOM",   68, 0.95), ("XOM",  158, 0.95), ("XOM",  248, 0.99),
        ("XOM",  343, 0.99), ("XOM",  433, 0.99),
    ]
    for sym, offset, div_ps in _DIVS:
        qty = holding_qty.get(sym, 0)
        amount = round(qty * div_ps, 2)
        tx(start + timedelta(days=offset), "Cash Dividend", sym,
           f"{sym} Quarterly Dividend", 0, 0, 0, amount)

    # Dollar-cost averaging — add to winners over 18 months
    _DCA: list[tuple[int, str, int, float]] = [
        ( 90, "VOO",  3, 472.00),
        (120, "NVDA", 10,  96.00),
        (180, "QQQ",  2, 438.00),
        (240, "AAPL", 5, 195.00),
        (300, "MSFT", 2, 415.00),
        (400, "JPM",  3, 218.00),
        (480, "VOO",  2, 498.00),
    ]
    for offset, sym, qty, price in _DCA:
        desc = next(d for s, d, *_ in HOLDINGS if s == sym)
        tx(start + timedelta(days=offset), "Buy", sym, desc, qty, price, 0, -round(qty * price, 2))

    # One tax-loss harvest sell
    tx(start + timedelta(days=200), "Sell", "JNJ", "Johnson & Johnson — partial sell",
       2, 144.50, 0, 289.00)

    rows.sort(key=lambda r: datetime.strptime(r["Date"], "%m/%d/%Y"))

    buf = io.StringIO()
    buf.write(f'"Transactions for account {ACCOUNT_REF}"\n\n')
    fields = ["Date", "Action", "Symbol", "Description", "Quantity", "Price", "Fees & Comm", "Amount"]
    writer = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    buf.write('"Transactions Total","","","","","","",""\n')
    return buf.getvalue().encode("utf-8")


# ── Snapshot generator ────────────────────────────────────────────────────────

def make_snapshots(user_id: str) -> list[dict]:
    """
    730 calendar days of daily portfolio NAV (weekdays only).
    Reproducible via fixed seed=42. Mimics S&P-like drift + realistic vol.
    """
    rng         = random.Random(42)
    start_date  = datetime(2024, 5, 13, 20, 0, tzinfo=timezone.utc)  # 4pm ET

    initial_invested = sum(qty * cost for _, _, qty, cost, _ in HOLDINGS)
    initial_cash     = CASH_VALUE
    start_total      = initial_invested + initial_cash

    # Market params: ~10% annualised drift, 1% daily vol (realistic equity portfolio)
    daily_mu    = 0.04 / 100
    daily_sigma = 1.00 / 100

    # Dividend cash by day-offset (same table as transactions)
    _DIVS: list[tuple[str, int, float]] = [
        ("VOO",  90,  1.65), ("VOO",  180, 1.72), ("VOO",  270, 1.68),
        ("VOO",  365, 1.71), ("VOO",  455, 1.78), ("VOO",  545, 1.82), ("VOO",  635, 1.79),
        ("QQQ",  85,  0.62), ("QQQ",  175, 0.64), ("QQQ",  265, 0.61),
        ("QQQ",  360, 0.67), ("QQQ",  450, 0.70), ("QQQ",  540, 0.68),
        ("AAPL",  70, 0.25), ("AAPL", 160, 0.25), ("AAPL", 250, 0.25),
        ("AAPL", 345, 0.25), ("AAPL", 435, 0.25), ("AAPL", 525, 0.25),
        ("MSFT",  80, 0.75), ("MSFT", 170, 0.75), ("MSFT", 260, 0.83),
        ("MSFT", 355, 0.83), ("MSFT", 445, 0.83),
        ("JPM",   75, 1.15), ("JPM",  165, 1.15), ("JPM",  255, 1.25),
        ("JPM",  350, 1.25), ("JPM",  440, 1.40),
        ("JNJ",   72, 1.24), ("JNJ",  162, 1.24), ("JNJ",  252, 1.24),
        ("JNJ",  347, 1.24), ("JNJ",  437, 1.24),
        ("XOM",   68, 0.95), ("XOM",  158, 0.95), ("XOM",  248, 0.99),
        ("XOM",  343, 0.99), ("XOM",  433, 0.99),
    ]
    holding_qty = {sym: qty for sym, _, qty, _, _ in HOLDINGS}
    div_by_day: dict[int, float] = {}
    for sym, offset, div_ps in _DIVS:
        div_by_day[offset] = div_by_day.get(offset, 0) + holding_qty[sym] * div_ps

    current_total = start_total
    current_cash  = initial_cash
    prev_total    = start_total
    snapshots: list[dict] = []

    for day in range(730):
        t = start_date + timedelta(days=day)
        if t.weekday() >= 5:   # skip weekends
            prev_total = current_total
            continue

        # Dividends land in cash
        current_cash += div_by_day.get(day, 0)

        # Market move applies only to invested portion
        invested    = current_total - current_cash
        daily_r     = rng.gauss(daily_mu, daily_sigma)
        new_invested = invested * (1 + daily_r)
        current_total = new_invested + current_cash

        daily_ret = (current_total - prev_total) / prev_total if prev_total else 0.0
        prev_total = current_total

        snapshots.append({
            "user_id":       user_id,
            "time":          t.isoformat(),
            "total_value":   round(current_total, 2),
            "invested_value":round(new_invested, 2),
            "cash_value":    round(current_cash, 2),
            "daily_return":  round(daily_ret, 8),
        })

    return snapshots


# ── Main ──────────────────────────────────────────────────────────────────────

def _bar(label: str, ok: bool) -> None:
    mark = "✓" if ok else "✗"
    print(f"  {mark} {label}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Vestara with demo portfolio data")
    parser.add_argument("--email",    required=True, help="Your Supabase account email")
    parser.add_argument("--password", required=True, help="Your Supabase account password")
    parser.add_argument("--engine-url", default=ENGINE_URL, help=f"Engine base URL (default: {ENGINE_URL})")
    args = parser.parse_args()
    engine = args.engine_url.rstrip("/")

    print(f"\n{'━'*60}")
    print("  Vestara Demo Data Seeder")
    print(f"  Engine: {engine}")
    print(f"{'━'*60}\n")

    # ── 1. Sign in ──────────────────────────────────────────────────────────────
    print("Step 1/6  Signing in to Supabase ...")

    # Read anon key from webapp .env.local — needed for the auth endpoint
    anon_key = SERVICE_ROLE_KEY   # fallback: service role also works for sign-in
    webapp_env = _ENGINE_DIR.parent.parent / "webapp" / ".env.local"
    if webapp_env.exists():
        for line in webapp_env.read_text(encoding="utf-8").splitlines():
            if line.startswith("NEXT_PUBLIC_SUPABASE_ANON_KEY="):
                anon_key = line.split("=", 1)[1].strip()
                break

    try:
        resp = httpx.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            json={"email": args.email, "password": args.password},
            headers={"apikey": anon_key, "Content-Type": "application/json"},
            timeout=15,
        )
        resp.raise_for_status()
    except Exception as exc:
        print(f"  ✗ Sign-in failed: {exc}")
        sys.exit(1)

    auth     = resp.json()
    user_jwt = auth["access_token"]
    user_id  = auth["user"]["id"]
    _bar(f"Signed in — user_id: {user_id}", True)

    # ── 2. Upload holdings ──────────────────────────────────────────────────────
    print("\nStep 2/6  Uploading holdings CSV ...")
    try:
        resp = httpx.post(
            f"{engine}/v1/ingest/schwab",
            files={"file": ("schwab_positions.csv", make_holdings_csv(), "text/csv")},
            data={"data_type": "holdings", "account_ref": ACCOUNT_REF},
            headers={"Authorization": f"Bearer {user_jwt}"},
            timeout=30,
        )
        resp.raise_for_status()
        r = resp.json()
        _bar(f"{r.get('holdings_upserted', 0)} positions upserted  ({len(r.get('errors', []))} errors)", True)
        for e in r.get("errors", [])[:3]:
            print(f"     ⚠  {e}")
    except Exception as exc:
        _bar(f"Holdings upload failed: {exc}", False)

    # ── 3. Upload transactions ──────────────────────────────────────────────────
    print("\nStep 3/6  Uploading transactions CSV ...")
    try:
        resp = httpx.post(
            f"{engine}/v1/ingest/schwab",
            files={"file": ("schwab_transactions.csv", make_transactions_csv(), "text/csv")},
            data={"data_type": "transactions", "account_ref": ACCOUNT_REF},
            headers={"Authorization": f"Bearer {user_jwt}"},
            timeout=30,
        )
        resp.raise_for_status()
        r = resp.json()
        _bar(
            f"{r.get('transactions_inserted', 0)} transactions inserted, "
            f"{r.get('skipped', 0)} skipped  ({len(r.get('errors', []))} errors)",
            True,
        )
        for e in r.get("errors", [])[:3]:
            print(f"     ⚠  {e}")
    except Exception as exc:
        _bar(f"Transactions upload failed: {exc}", False)

    # ── 4. Seed portfolio_snapshots_v2 ──────────────────────────────────────────
    print("\nStep 4/6  Seeding 2 years of daily portfolio snapshots ...")
    snapshots = make_snapshots(user_id)
    try:
        db = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)
        # Wipe any previous demo data for this user
        db.table("portfolio_snapshots_v2").delete().eq("user_id", user_id).execute()

        # Insert in batches of 200 (PostgREST default row limit)
        for i in range(0, len(snapshots), 200):
            db.table("portfolio_snapshots_v2").insert(snapshots[i:i + 200]).execute()

        start_v  = snapshots[0]["total_value"]
        end_v    = snapshots[-1]["total_value"]
        ret_pct  = (end_v - start_v) / start_v * 100
        _bar(
            f"{len(snapshots)} snapshots  "
            f"({snapshots[0]['time'][:10]} → {snapshots[-1]['time'][:10]})  "
            f"${start_v:,.0f} → ${end_v:,.0f}  ({ret_pct:+.1f}%)",
            True,
        )
    except Exception as exc:
        _bar(f"Snapshot seed failed: {exc}", False)

    # ── 5. Price sync ───────────────────────────────────────────────────────────
    print("\nStep 5/6  Fetching live market prices from Yahoo Finance ...")
    try:
        resp = httpx.post(
            f"{engine}/v1/sync/prices/{user_id}",
            headers={"Authorization": f"Bearer {ENGINE_SERVICE_KEY}"},
            timeout=60,
        )
        resp.raise_for_status()
        r = resp.json()
        _bar(
            f"{r.get('symbols_synced', 0)} symbols updated, "
            f"{r.get('symbols_failed', 0)} failed",
            True,
        )
    except Exception as exc:
        _bar(f"Price sync failed: {exc}", False)

    # ── 6. Compute metrics ──────────────────────────────────────────────────────
    print("\nStep 6/6  Computing performance metrics for all periods ...")
    try:
        resp = httpx.post(
            f"{engine}/v1/sync/compute/{user_id}",
            headers={"Authorization": f"Bearer {ENGINE_SERVICE_KEY}"},
            timeout=120,
        )
        resp.raise_for_status()
        r = resp.json()
        periods = r.get("periods_computed", [])
        _bar(f"Metrics computed: {', '.join(periods)}", True)
    except Exception as exc:
        _bar(f"Compute failed: {exc}", False)

    # ── Done ────────────────────────────────────────────────────────────────────
    print(f"\n{'━'*60}")
    print("  All done. Open your Vestara dashboard to see live data.")
    print(f"  Dashboard : http://localhost:3000")
    print(f"  API docs  : {engine}/docs")
    print(f"{'━'*60}\n")


if __name__ == "__main__":
    main()

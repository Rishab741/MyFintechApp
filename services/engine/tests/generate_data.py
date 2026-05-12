"""
Synthetic portfolio data generator for load and correctness testing.

Generates realistic portfolio snapshots, holdings, and transactions for N users
and inserts them directly into the DB via the service role.

Usage (run from services/engine/ or services/engine/tests/):
    python tests/generate_data.py --users 100 --days 90 --positions 20
    python tests/generate_data.py --users 1000 --days 365 --positions 50 --dry-run

Required env vars (only needed when not --dry-run):
    SUPABASE_URL              — your project URL
    SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS)

This script is self-contained — it does NOT import the engine's config module.
Run it with: pip install supabase  (or activate the engine venv)
"""

from __future__ import annotations

import argparse
import os
import random
import uuid
from datetime import datetime, timedelta, timezone

# ---------------------------------------------------------------------------
# Tickers by asset class — realistic distribution
EQUITIES = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B",
    "JPM", "V", "JNJ", "XOM", "UNH", "HD", "PG", "MA", "BAC", "ABBV",
]
ETFS     = ["SPY", "QQQ", "VTI", "IWM", "GLD", "TLT", "VEA", "AGG"]
CRYPTO   = ["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD"]

ALL_TICKERS = EQUITIES + ETFS + CRYPTO

# Rough base prices (approximate, will be varied per simulation)
BASE_PRICES: dict[str, float] = {
    "AAPL": 185.0, "MSFT": 380.0, "GOOGL": 170.0, "AMZN": 185.0,
    "NVDA": 850.0, "META": 490.0, "TSLA": 175.0, "BRK-B": 390.0,
    "JPM": 195.0, "V": 270.0, "JNJ": 155.0, "XOM": 110.0,
    "UNH": 510.0, "HD": 360.0, "PG": 160.0, "MA": 455.0,
    "BAC": 38.0, "ABBV": 170.0,
    "SPY": 520.0, "QQQ": 440.0, "VTI": 245.0, "IWM": 200.0,
    "GLD": 225.0, "TLT": 90.0, "VEA": 48.0, "AGG": 96.0,
    "BTC-USD": 65000.0, "ETH-USD": 3500.0, "SOL-USD": 155.0, "BNB-USD": 580.0,
}

DAILY_VOL = 0.015   # 1.5% daily volatility — reasonable for a mixed portfolio


def simulate_price_series(base: float, days: int) -> list[float]:
    """Random walk with drift = +8% annual (equities assumption)."""
    daily_drift = 0.08 / 252
    prices = [base]
    for _ in range(days - 1):
        shock = random.gauss(daily_drift, DAILY_VOL)
        prices.append(max(prices[-1] * (1 + shock), 0.01))
    return prices


def generate_user_data(
    user_id: str,
    n_positions: int,
    n_days: int,
    start_date: datetime,
) -> dict:
    """
    Generate a complete synthetic dataset for one user.

    Returns a dict with:
      snapshots   — list of portfolio_snapshots_v2 rows
      holdings    — list of holdings rows (latest state only)
      transactions — list of transaction rows
    """
    tickers = random.sample(ALL_TICKERS, min(n_positions, len(ALL_TICKERS)))

    # Simulate price series for each ticker
    price_series: dict[str, list[float]] = {
        t: simulate_price_series(BASE_PRICES.get(t, 100.0), n_days)
        for t in tickers
    }

    # Random quantities per position (bought at day 0)
    quantities: dict[str, float] = {
        t: round(random.uniform(1, 100) / BASE_PRICES.get(t, 100.0) * 5000, 4)
        for t in tickers
    }

    # Cash balance — 5-20% of initial portfolio value
    initial_invested = sum(
        quantities[t] * price_series[t][0] for t in tickers
    )
    cash = round(initial_invested * random.uniform(0.05, 0.20), 2)

    # ── Portfolio snapshots ──────────────────────────────────────────────
    snapshots = []
    for day in range(n_days):
        ts = (start_date + timedelta(days=day)).isoformat()
        invested = sum(quantities[t] * price_series[t][day] for t in tickers)
        total    = invested + cash
        # Tiny random cash drift (interest / fees)
        cash    *= random.uniform(0.9999, 1.00005)

        snapshots.append({
            "user_id":        user_id,
            "time":           ts,
            "total_value":    round(total, 4),
            "cash_value":     round(cash, 4),
            "invested_value": round(invested, 4),
            "daily_return": (
                round((total / snapshots[-1]["total_value"] - 1), 6)
                if snapshots else None
            ),
        })

    return {"snapshots": snapshots}


# ── CLI ───────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic portfolio test data")
    parser.add_argument("--users",     type=int, default=10,  help="Number of users to generate")
    parser.add_argument("--days",      type=int, default=90,  help="Days of history per user")
    parser.add_argument("--positions", type=int, default=15,  help="Positions per user")
    parser.add_argument("--dry-run",   action="store_true",   help="Print stats without writing to DB")
    args = parser.parse_args()

    start_date = datetime.now(tz=timezone.utc) - timedelta(days=args.days)
    total_snapshots = 0

    print(f"\nGenerating data: {args.users} users × {args.days} days × {args.positions} positions")
    print(f"Estimated rows: ~{args.users * args.days:,} snapshots, ~{args.users * args.positions:,} transactions\n")

    if args.dry_run:
        print("DRY RUN — no data written.")
        return

    # Auto-load .env from project root (two levels up from tests/)
    _here = os.path.dirname(os.path.abspath(__file__))
    _root = os.path.normpath(os.path.join(_here, "..", "..", ".."))
    _env_path = os.path.join(_root, ".env")
    if os.path.exists(_env_path):
        with open(_env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    os.environ.setdefault(k.strip(), v.strip())

    from supabase import create_client
    import base64, json as _json

    url = os.environ.get("SUPABASE_URL") or os.environ.get("EXPO_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not key:
        raise SystemExit(
            "\nMissing credentials. Add to your .env file:\n"
            "  SUPABASE_SERVICE_ROLE_KEY=eyJ...\n\n"
            "Find it in: Supabase Dashboard → Project Settings → API → service_role key\n"
            "(It is different from the anon/public key — do NOT use the anon key here.)"
        )

    # Decode the JWT role claim to catch the wrong-key mistake early.
    try:
        payload_b64 = key.split(".")[1]
        payload_b64 += "=" * (-len(payload_b64) % 4)   # fix padding
        role = _json.loads(base64.b64decode(payload_b64)).get("role", "unknown")
    except Exception:
        role = "unknown"

    if role != "service_role":
        raise SystemExit(
            f"\nWrong key type: the key you provided has role='{role}'.\n"
            "You must use the SERVICE ROLE key, not the anon/public key.\n\n"
            "Find it in: Supabase Dashboard → Project Settings → API → service_role (secret)"
        )

    print(f"  Connecting to {url} as role=service_role ✓")
    db = create_client(url, key)

    # ── Step 1: create real auth users ───────────────────────────────────────
    # portfolio_snapshots_v2 has a FK → auth.users(id), so we need real users.
    # All test users get email *@vestara-load-test.internal so they're easy to
    # identify and bulk-delete later.
    print(f"\nCreating {args.users} test auth users (this takes ~{args.users//5}s)...")
    user_ids: list[str] = []
    failed_users = 0
    for i in range(args.users):
        email = f"load-{uuid.uuid4().hex[:12]}@vestara-load-test.internal"
        try:
            resp = db.auth.admin.create_user({
                "email":          email,
                "password":       "LoadTest123!",
                "email_confirm":  True,
                "user_metadata":  {"is_test_user": True, "generator": "generate_data.py"},
            })
            user_ids.append(resp.user.id)
        except Exception as exc:
            failed_users += 1
            if failed_users <= 3:
                print(f"  ⚠ user creation failed ({email}): {exc}")
        if (i + 1) % 100 == 0:
            print(f"  created {i+1}/{args.users} users...")

    if not user_ids:
        raise SystemExit("No users created — cannot continue.")
    print(f"  ✓ Created {len(user_ids)} users ({failed_users} failed)\n")

    # ── Step 2: insert portfolio data ────────────────────────────────────────
    batch_size = 200   # smaller batch — rows are wide

    for i, user_id in enumerate(user_ids):
        data = generate_user_data(user_id, args.positions, args.days, start_date)

        snaps = data["snapshots"]
        for b in range(0, len(snaps), batch_size):
            db.table("portfolio_snapshots_v2").insert(snaps[b:b+batch_size]).execute()
        total_snapshots += len(snaps)

        if (i + 1) % 50 == 0 or i == len(user_ids) - 1:
            print(f"  [{i+1}/{len(user_ids)}] data inserted — "
                  f"total snapshots so far: {total_snapshots:,}")

    print(f"\n✓ Done.")
    print(f"  Snapshots inserted:    {total_snapshots:,}")
    print(f"  Test user emails:      *@vestara-load-test.internal")
    print(f"\nTo precompute metrics for all users:")
    print(f"  curl -X POST http://localhost:8000/v1/sync/compute/all \\")
    print(f"       -H 'Authorization: Bearer $ENGINE_SERVICE_KEY'")
    print(f"\nTo delete all test users when done:")
    print(f"  python tests/generate_data.py --cleanup")


if __name__ == "__main__":
    main()

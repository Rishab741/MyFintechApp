"""
Supabase client factory for the Portfolio Engine.

Uses the service-role key so all queries bypass Row Level Security.
The engine is responsible for filtering by user_id explicitly in every query —
never assume RLS does it when using the service role.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

from supabase import Client, create_client

from config import get_settings

log = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_db() -> Client:
    """Return a cached Supabase service-role client (one instance per process)."""
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_service_role_key)


# ── Portfolio snapshots ────────────────────────────────────────────────────────
def fetch_snapshots(
    user_id: str,
    limit: int = 500,
) -> list[dict[str, Any]]:
    """
    Fetch portfolio_snapshots_v2 rows for a user, oldest-first.
    Returns time, total_value, cash_value, invested_value, daily_return.
    """
    db = get_db()
    res = (
        db.table("portfolio_snapshots_v2")
        .select("time, total_value, cash_value, invested_value, daily_return")
        .eq("user_id", user_id)
        .order("time", desc=False)
        .limit(limit)
        .execute()
    )
    return res.data or []


# ── Holdings ──────────────────────────────────────────────────────────────────
def fetch_holdings(user_id: str) -> list[dict[str, Any]]:
    """
    Fetch current holdings joined with asset metadata.
    Mirrors the query_holdings view but via the service role for the engine.
    """
    db = get_db()
    res = (
        db.table("holdings")
        .select(
            "symbol, quantity, avg_cost_basis, last_price, currency, "
            "open_pnl, open_pnl_pct, last_price_at, "
            "assets(name, asset_class, sector, exchange, country), "
            "accounts(institution_name, account_type)"
        )
        .eq("user_id", user_id)
        .gt("quantity", 0)
        .execute()
    )

    # Flatten joined relations
    rows = []
    for h in res.data or []:
        asset = h.pop("assets", {}) or {}
        account = h.pop("accounts", {}) or {}
        qty = float(h.get("quantity") or 0)
        price = float(h.get("last_price") or 0)
        rows.append({
            **h,
            "asset_name":       asset.get("name"),
            "asset_class":      asset.get("asset_class", "unknown"),
            "sector":           asset.get("sector"),
            "exchange":         asset.get("exchange"),
            "country":          asset.get("country"),
            "institution_name": account.get("institution_name"),
            "account_type":     account.get("account_type"),
            "market_value":     round(qty * price, 2),
        })
    return rows


# ── Performance cache ─────────────────────────────────────────────────────────
def upsert_performance_cache(user_id: str, metrics: dict[str, Any]) -> None:
    """
    Upsert a performance_cache row for the given user and period.
    `metrics` must include a `period` key.
    """
    db = get_db()
    db.table("performance_cache").upsert(
        {"user_id": user_id, "computed_at": datetime.now(tz=timezone.utc).isoformat(), **metrics},
        on_conflict="user_id,period",
    ).execute()


# ── Price history ─────────────────────────────────────────────────────────────
def upsert_prices(rows: list[dict[str, Any]]) -> None:
    """
    Bulk-upsert price_history rows.
    Each row must have: time, asset_id, symbol, close, currency, source.
    """
    if not rows:
        return
    db = get_db()
    db.table("price_history").upsert(
        rows,
        on_conflict="time,asset_id",
    ).execute()


def fetch_asset_by_symbol(symbol: str) -> dict[str, Any] | None:
    """Return the assets row for a ticker symbol, or None if not found."""
    db = get_db()
    res = (
        db.table("assets")
        .select("id, symbol, asset_class, currency")
        .eq("symbol", symbol)
        .limit(1)
        .execute()
    )
    return (res.data or [None])[0]


def fetch_all_active_symbols(user_id: str) -> list[str]:
    """Return all ticker symbols held by a user (quantity > 0)."""
    db = get_db()
    res = (
        db.table("holdings")
        .select("symbol")
        .eq("user_id", user_id)
        .gt("quantity", 0)
        .execute()
    )
    return list({r["symbol"] for r in (res.data or [])})


# ── Holdings price update ─────────────────────────────────────────────────────
def update_holding_prices(
    user_id: str,
    price_map: dict[str, float],
) -> None:
    """
    Update last_price and open_pnl on each holding whose symbol is in price_map.
    Called after a successful price sync.
    """
    db = get_db()
    now_iso = datetime.now(tz=timezone.utc).isoformat()

    for symbol, price in price_map.items():
        if price <= 0:
            continue
        # Fetch the holding to compute open_pnl
        res = (
            db.table("holdings")
            .select("id, quantity, avg_cost_basis")
            .eq("user_id", user_id)
            .eq("symbol", symbol)
            .limit(1)
            .execute()
        )
        if not res.data:
            continue
        row = res.data[0]
        qty = float(row.get("quantity") or 0)
        cost = float(row.get("avg_cost_basis") or price)
        open_pnl = (price - cost) * qty
        open_pnl_pct = (price / cost - 1) * 100 if cost > 0 else 0.0

        db.table("holdings").update({
            "last_price":    price,
            "last_price_at": now_iso,
            "open_pnl":      round(open_pnl, 4),
            "open_pnl_pct":  round(open_pnl_pct, 4),
            "updated_at":    now_iso,
        }).eq("id", row["id"]).execute()


# ── Audit logging ─────────────────────────────────────────────────────────────
def write_audit_log(
    event_type: str,
    actor_id: str | None = None,
    resource: str | None = None,
    resource_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    """Append a row to audit_logs.  Never raises — failures are logged only."""
    try:
        db = get_db()
        db.table("audit_logs").insert({
            "event_type":  event_type,
            "actor_id":    actor_id,
            "resource":    resource,
            "resource_id": resource_id,
            "metadata":    metadata or {},
        }).execute()
    except Exception as exc:
        log.warning("audit_log write failed: %s", exc)

"""
DB writer for normalised custodian data.

Responsibilities:
  1. get_or_create_account  — upsert an accounts row for the custodian account
  2. get_or_create_asset    — upsert an assets row for each symbol
  3. write_holdings         — upsert holdings (one row per account+asset)
  4. write_transactions     — insert transactions (deduplicated via provider_tx_id)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from lib.supabase_client import get_db
from normalizer.protocol import (
    NormalizedHolding,
    NormalizedTransaction,
    infer_asset_class,
)

log = logging.getLogger(__name__)

# Module-level caches to avoid redundant DB calls within a single ingest job.
_account_cache: dict[str, str] = {}   # (user_id, account_ref) → account_id
_asset_cache:   dict[str, str] = {}   # symbol → asset_id


def _account_key(user_id: str, account_ref: str) -> str:
    return f"{user_id}::{account_ref}"


# ── Account ───────────────────────────────────────────────────────────────────

def get_or_create_account(
    user_id:          str,
    account_ref:      str,
    institution_name: str,
) -> str:
    """Return account_id, creating a 'manual' account row if needed."""
    cache_key = _account_key(user_id, account_ref)
    if cache_key in _account_cache:
        return _account_cache[cache_key]

    db = get_db()

    # Try to find an existing manual account for this user + account_ref
    res = (
        db.table("accounts")
        .select("id")
        .eq("user_id", user_id)
        .eq("provider", "manual")
        .eq("provider_account_id", account_ref)
        .limit(1)
        .execute()
    )
    if res.data:
        acct_id = res.data[0]["id"]
        _account_cache[cache_key] = acct_id
        return acct_id

    # Create a new manual account
    now = datetime.now(tz=timezone.utc).isoformat()
    insert_res = db.table("accounts").insert({
        "user_id":              user_id,
        "provider":             "manual",
        "provider_account_id":  account_ref,
        "institution_name":     institution_name,
        "account_name":         f"{institution_name} Import",
        "account_number":       account_ref[-4:].rjust(8, "*"),   # masked
        "account_type":         "brokerage",
        "currency":             "USD",
        "is_active":            True,
        "last_synced_at":       now,
    }).execute()

    acct_id = insert_res.data[0]["id"]
    _account_cache[cache_key] = acct_id
    log.info("created account: user=%s ref=%s id=%s", user_id, account_ref, acct_id)
    return acct_id


# ── Asset ─────────────────────────────────────────────────────────────────────

def get_or_create_asset(symbol: str) -> str:
    """Return asset_id, creating an asset row if needed."""
    if symbol in _asset_cache:
        return _asset_cache[symbol]

    db = get_db()
    res = (
        db.table("assets")
        .select("id")
        .eq("symbol", symbol)
        .is_("exchange", "null")    # prefer exchange-agnostic row
        .limit(1)
        .execute()
    )

    if not res.data:
        # Try any exchange
        res = (
            db.table("assets")
            .select("id")
            .eq("symbol", symbol)
            .limit(1)
            .execute()
        )

    if res.data:
        asset_id = res.data[0]["id"]
        _asset_cache[symbol] = asset_id
        return asset_id

    # Create a placeholder asset — enriched by price sync later
    insert_res = db.table("assets").insert({
        "symbol":      symbol,
        "name":        symbol,
        "asset_class": infer_asset_class(symbol),
        "currency":    "USD",
        "is_active":   True,
        "metadata":    {"source": "custodian_import"},
    }).execute()

    asset_id = insert_res.data[0]["id"]
    _asset_cache[symbol] = asset_id
    log.info("created asset placeholder: %s", symbol)
    return asset_id


# ── Holdings writer ───────────────────────────────────────────────────────────

def write_holdings(
    user_id:          str,
    institution_name: str,
    holdings:         list[NormalizedHolding],
) -> tuple[int, list[str]]:
    """
    Upsert holdings into the DB.
    Returns (upserted_count, error_list).
    """
    if not holdings:
        return 0, []

    db       = get_db()
    upserted = 0
    errors:  list[str] = []
    now      = datetime.now(tz=timezone.utc).isoformat()

    for h in holdings:
        try:
            acct_id  = get_or_create_account(user_id, h.account_ref, institution_name)
            asset_id = get_or_create_asset(h.symbol)

            row: dict[str, Any] = {
                "user_id":        user_id,
                "account_id":     acct_id,
                "asset_id":       asset_id,
                "symbol":         h.symbol,
                "quantity":       str(h.quantity),
                "avg_cost_basis": str(h.avg_cost_basis),
                "currency":       h.currency,
                "updated_at":     now,
            }
            if h.last_price:
                row["last_price"]    = str(h.last_price)
                row["last_price_at"] = now

            db.table("holdings").upsert(
                row,
                on_conflict="account_id,asset_id",
            ).execute()
            upserted += 1

        except Exception as exc:
            msg = f"holding {h.symbol}: {exc}"
            errors.append(msg)
            log.warning("write_holdings error — %s", msg)

    return upserted, errors


# ── Transaction writer ────────────────────────────────────────────────────────

def write_transactions(
    user_id:          str,
    institution_name: str,
    transactions:     list[NormalizedTransaction],
) -> tuple[int, int, list[str]]:
    """
    Insert transactions, skipping duplicates via provider_tx_id.
    Returns (inserted_count, skipped_count, error_list).
    """
    if not transactions:
        return 0, 0, []

    db       = get_db()
    inserted = 0
    skipped  = 0
    errors:  list[str] = []

    for tx in transactions:
        try:
            acct_id  = get_or_create_account(user_id, tx.account_ref, institution_name)
            asset_id = get_or_create_asset(tx.symbol) if tx.symbol else None

            row: dict[str, Any] = {
                "user_id":          user_id,
                "account_id":       acct_id,
                "asset_id":         asset_id,
                "symbol":           tx.symbol,
                "transaction_type": tx.transaction_type,
                "quantity":         str(tx.quantity) if tx.quantity else None,
                "price":            str(tx.price) if tx.price else None,
                "gross_amount":     str(tx.gross_amount) if tx.gross_amount else None,
                "fees":             str(tx.fees),
                "net_amount":       str(tx.net_amount),
                "currency":         tx.currency,
                "settled_at":       tx.settled_at.isoformat(),
                "notes":            tx.notes,
                "metadata":         {"source": "custodian_import"},
            }
            if tx.provider_tx_id:
                row["provider_tx_id"] = tx.provider_tx_id

            db.table("transactions").insert(row).execute()
            inserted += 1

        except Exception as exc:
            err_str = str(exc)
            # Unique constraint = duplicate — expected, not an error
            if "unique" in err_str.lower() or "23505" in err_str:
                skipped += 1
            else:
                msg = f"tx {tx.settled_at.date()} {tx.symbol} {tx.transaction_type}: {exc}"
                errors.append(msg)
                log.warning("write_transactions error — %s", msg)

    return inserted, skipped, errors

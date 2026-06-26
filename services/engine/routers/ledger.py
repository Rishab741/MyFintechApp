"""
Ledger integrity endpoints — for SOC 2 audits and enterprise clients.

GET  /v1/ledger/verify      — verify the full transaction chain for the authenticated user
GET  /v1/ledger/checkpoints — list Merkle checkpoints
POST /v1/ledger/checkpoint  — manually trigger a checkpoint write (service key required)
POST /v1/ledger/repair      — re-seal the hash chain (fixes chains broken by legacy inserts)
DELETE /v1/ledger/sample    — permanently delete all sample/demo data for the user
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from lib.ledger import verify_chain, maybe_write_checkpoint
from lib.supabase_client import get_db, write_audit_log
from middleware.auth import UserContext, require_user, require_service

log = logging.getLogger(__name__)
router = APIRouter(tags=["ledger"])


class VerificationResult(BaseModel):
    user_id:    str
    tenant_id:  str
    chain_ok:   bool
    tx_count:   int
    broken_links: list[dict]
    verified_at: datetime


class CheckpointSummary(BaseModel):
    id:          int
    tx_count:    int
    merkle_root: str
    created_at:  datetime


# ── GET /v1/ledger/verify ─────────────────────────────────────────────────────
@router.get("/verify", response_model=VerificationResult)
async def verify_ledger(
    user: Annotated[UserContext, Depends(require_user)],
) -> VerificationResult:
    """
    Walk the full transaction hash chain for the authenticated user.
    Returns chain_ok=true and an empty broken_links list if the ledger is intact.

    For B2B clients this is an auditable endpoint — every call is logged.
    """
    db = get_db()
    tx_count_res = (
        db.table("transactions")
        .select("id", count="exact")
        .eq("user_id", user.user_id)
        .execute()
    )
    tx_count = tx_count_res.count or 0

    broken = verify_chain(user.user_id)

    write_audit_log(
        event_type="ledger.verify",
        actor_id=user.user_id,
        resource="transactions",
        metadata={
            "tenant_id":    user.tenant_id,
            "tx_count":     tx_count,
            "chain_ok":     len(broken) == 0,
            "broken_count": len(broken),
        },
    )

    return VerificationResult(
        user_id=user.user_id,
        tenant_id=user.tenant_id,
        chain_ok=len(broken) == 0,
        tx_count=tx_count,
        broken_links=broken,
        verified_at=datetime.now(tz=timezone.utc),
    )


# ── GET /v1/ledger/checkpoints ────────────────────────────────────────────────
@router.get("/checkpoints", response_model=list[CheckpointSummary])
async def list_checkpoints(
    user: Annotated[UserContext, Depends(require_user)],
) -> list[CheckpointSummary]:
    """Return the Merkle checkpoints for the authenticated user, newest first."""
    db = get_db()
    res = (
        db.table("ledger_checkpoints")
        .select("id, tx_count, merkle_root, created_at")
        .eq("user_id", user.user_id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return [
        CheckpointSummary(
            id=r["id"],
            tx_count=r["tx_count"],
            merkle_root=r["merkle_root"],
            created_at=datetime.fromisoformat(r["created_at"].replace("Z", "+00:00")),
        )
        for r in (res.data or [])
    ]


# ── POST /v1/ledger/checkpoint ────────────────────────────────────────────────
@router.post("/checkpoint/{user_id}")
async def write_checkpoint(
    user_id: str,
    _: Annotated[None, Depends(require_service)],
) -> dict:
    """Manually trigger a Merkle checkpoint for a user (service key required)."""
    written = maybe_write_checkpoint(user_id)
    return {"user_id": user_id, "checkpoint_written": written}


# ── POST /v1/ledger/repair ────────────────────────────────────────────────────
@router.post("/repair")
async def repair_chain(
    user: Annotated[UserContext, Depends(require_user)],
) -> dict:
    """
    Re-seal the hash chain for the authenticated user.

    Walks all transactions in chronological order and rewrites prev_hash +
    row_hash so the chain is contiguous. Safe to run multiple times.

    Use this to fix chains broken by legacy inserts that did not set prev_hash
    (all transactions ingested before the hash-chaining fix was deployed).
    """
    db = get_db()

    rows_res = (
        db.table("transactions")
        .select("id, net_amount, settled_at, user_id, symbol, transaction_type")
        .eq("user_id", user.user_id)
        .order("settled_at", desc=False)
        .order("created_at", desc=False)
        .execute()
    )
    rows = rows_res.data or []
    if not rows:
        return {"resealed": 0}

    prev = "GENESIS"
    resealed = 0

    for row in rows:
        raw = (
            prev
            + str(row["id"])
            + str(row["net_amount"])
            + str(row["settled_at"])
            + str(row["user_id"])
            + (row.get("symbol") or "")
            + row["transaction_type"]
        )
        new_hash = hashlib.sha256(raw.encode()).hexdigest()

        db.table("transactions").update({
            "prev_hash": prev,
            "row_hash":  new_hash,
        }).eq("id", row["id"]).execute()

        prev = new_hash
        resealed += 1

    write_audit_log(
        event_type="ledger.repair",
        actor_id=user.user_id,
        resource="transactions",
        metadata={"tenant_id": user.tenant_id, "resealed": resealed},
    )

    log.info("ledger repair complete: user=%s resealed=%d", user.user_id, resealed)
    return {"resealed": resealed}


# ── DELETE /v1/ledger/sample ──────────────────────────────────────────────────
@router.delete("/sample")
async def retire_sample_data(
    user: Annotated[UserContext, Depends(require_user)],
) -> dict:
    """
    Permanently delete all sample/demo data for the authenticated user.

    Removes transactions, holdings, and accounts flagged with is_sample=true,
    then re-seals the hash chain so integrity verification passes after deletion.
    """
    db = get_db()

    # Delete sample transactions
    tx_res = (
        db.table("transactions")
        .delete()
        .eq("user_id", user.user_id)
        .eq("is_sample", True)
        .execute()
    )
    tx_deleted = len(tx_res.data or [])

    # Delete sample holdings
    h_res = (
        db.table("holdings")
        .delete()
        .eq("user_id", user.user_id)
        .eq("is_sample", True)
        .execute()
    )
    holdings_deleted = len(h_res.data or [])

    # Delete sample accounts (only if they have no remaining holdings or transactions)
    acct_res = (
        db.table("accounts")
        .delete()
        .eq("user_id", user.user_id)
        .eq("is_sample", True)
        .execute()
    )
    accounts_deleted = len(acct_res.data or [])

    # Re-seal chain after deletions to keep ledger consistent
    remaining = (
        db.table("transactions")
        .select("id, net_amount, settled_at, user_id, symbol, transaction_type")
        .eq("user_id", user.user_id)
        .order("settled_at", desc=False)
        .order("created_at", desc=False)
        .execute()
    )
    prev = "GENESIS"
    for row in (remaining.data or []):
        raw = (
            prev
            + str(row["id"])
            + str(row["net_amount"])
            + str(row["settled_at"])
            + str(row["user_id"])
            + (row.get("symbol") or "")
            + row["transaction_type"]
        )
        new_hash = hashlib.sha256(raw.encode()).hexdigest()
        db.table("transactions").update({
            "prev_hash": prev,
            "row_hash":  new_hash,
        }).eq("id", row["id"]).execute()
        prev = new_hash

    write_audit_log(
        event_type="ledger.retire_sample",
        actor_id=user.user_id,
        resource="transactions",
        metadata={
            "tenant_id":       user.tenant_id,
            "tx_deleted":      tx_deleted,
            "holdings_deleted": holdings_deleted,
            "accounts_deleted": accounts_deleted,
        },
    )

    log.info(
        "sample data retired: user=%s tx=%d holdings=%d accounts=%d",
        user.user_id, tx_deleted, holdings_deleted, accounts_deleted,
    )
    return {
        "tx_deleted":       tx_deleted,
        "holdings_deleted": holdings_deleted,
        "accounts_deleted": accounts_deleted,
    }

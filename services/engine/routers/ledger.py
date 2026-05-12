"""
Ledger integrity endpoints — for SOC 2 audits and enterprise clients.

GET  /v1/ledger/verify      — verify the full transaction chain for the authenticated user
GET  /v1/ledger/checkpoints — list Merkle checkpoints
POST /v1/ledger/checkpoint  — manually trigger a checkpoint write (service key required)
"""

from __future__ import annotations

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

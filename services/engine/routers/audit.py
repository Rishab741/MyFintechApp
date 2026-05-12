"""
Audit log read endpoints — SOC 2 compliance and enterprise transparency.

GET /v1/audit/logs  — paginated audit trail for the authenticated caller
                      (filtered to actor_id = caller's user_id)

B2B API key clients see logs written with their tenant_id as actor_id.
Service key callers can add ?actor_id= to query any user's logs.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from lib.supabase_client import get_db
from middleware.auth import UserContext, require_user

log = logging.getLogger(__name__)
router = APIRouter(tags=["audit"])


class AuditEntry(BaseModel):
    id:          int
    event_type:  str
    resource:    str | None
    resource_id: str | None
    metadata:    dict
    created_at:  datetime


class AuditPage(BaseModel):
    entries:  list[AuditEntry]
    total:    int
    limit:    int
    offset:   int


# ── GET /v1/audit/logs ────────────────────────────────────────────────────────

@router.get("/logs", response_model=AuditPage)
async def list_audit_logs(
    user:       Annotated[UserContext, Depends(require_user)],
    event_type: str | None = Query(None, description="Filter by event type prefix, e.g. 'ledger'"),
    limit:      int        = Query(50, ge=1, le=500),
    offset:     int        = Query(0,  ge=0),
) -> AuditPage:
    """
    Return a paginated audit trail for the authenticated user or API client.

    Results are always scoped to the caller's own actor_id — no cross-tenant
    data is ever returned.
    """
    db = get_db()

    query = (
        db.table("audit_logs")
        .select("id, event_type, resource, resource_id, metadata, created_at", count="exact")
        .eq("actor_id", user.user_id)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )

    if event_type:
        query = query.like("event_type", f"{event_type}%")

    res = query.execute()
    total = res.count or 0

    entries = [
        AuditEntry(
            id=r["id"],
            event_type=r["event_type"],
            resource=r.get("resource"),
            resource_id=r.get("resource_id"),
            metadata=r.get("metadata") or {},
            created_at=datetime.fromisoformat(r["created_at"].replace("Z", "+00:00")),
        )
        for r in (res.data or [])
    ]

    return AuditPage(entries=entries, total=total, limit=limit, offset=offset)

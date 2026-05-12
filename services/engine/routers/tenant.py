"""
Tenant management endpoints — self-serve API key lifecycle + usage stats.

GET  /v1/tenant/me          — tenant profile for the authenticated caller
GET  /v1/tenant/usage       — current month usage vs tier limits
POST /v1/tenant/api-key     — generate (or rotate) an API key  [JWT only]
DELETE /v1/tenant/api-key   — revoke the current API key       [JWT only]
"""

from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from lib.supabase_client import get_db, write_audit_log
from middleware.auth import UserContext, require_user
from middleware.rate_limit import TIER_DAILY_LIMITS

log = logging.getLogger(__name__)
router = APIRouter(tags=["tenant"])


# ── Response models ───────────────────────────────────────────────────────────

class TenantProfile(BaseModel):
    id:                str
    name:              str
    slug:              str
    tier:              str
    owner_email:       str | None
    is_active:         bool
    api_key_label:     str | None
    api_key_issued_at: datetime | None
    has_api_key:       bool
    created_at:        datetime


class UsageSummary(BaseModel):
    tenant_id:    str
    tier:         str
    month:        str
    api_calls:    int
    compute_runs: int
    price_syncs:  int
    daily_limit:  int | None    # None = unlimited


class ApiKeyResponse(BaseModel):
    api_key:    str
    label:      str | None
    issued_at:  datetime
    warning:    str = (
        "Store this key securely — it will NOT be shown again. "
        "Rotate it here if compromised."
    )


# ── GET /v1/tenant/me ─────────────────────────────────────────────────────────

@router.get("/me", response_model=TenantProfile)
async def get_tenant_profile(
    user: Annotated[UserContext, Depends(require_user)],
) -> TenantProfile:
    """Return the tenant record for the authenticated user or API client."""
    db = get_db()
    res = (
        db.table("tenants")
        .select(
            "id, name, slug, tier, owner_email, is_active, "
            "api_key_hash, api_key_label, api_key_issued_at, created_at"
        )
        .eq("id", user.tenant_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Tenant not found.")

    t = res.data
    return TenantProfile(
        id=t["id"],
        name=t["name"],
        slug=t["slug"],
        tier=t["tier"],
        owner_email=t.get("owner_email"),
        is_active=t["is_active"],
        api_key_label=t.get("api_key_label"),
        api_key_issued_at=(
            datetime.fromisoformat(t["api_key_issued_at"].replace("Z", "+00:00"))
            if t.get("api_key_issued_at") else None
        ),
        has_api_key=bool(t.get("api_key_hash")),
        created_at=datetime.fromisoformat(t["created_at"].replace("Z", "+00:00")),
    )


# ── GET /v1/tenant/usage ──────────────────────────────────────────────────────

@router.get("/usage", response_model=UsageSummary)
async def get_tenant_usage(
    user: Annotated[UserContext, Depends(require_user)],
) -> UsageSummary:
    """Return current month API usage and the daily tier limit."""
    db = get_db()
    month_start = datetime.now(tz=timezone.utc).replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    ).date().isoformat()

    res = (
        db.table("tenant_usage")
        .select("api_calls, compute_runs, price_syncs")
        .eq("tenant_id", user.tenant_id)
        .eq("month", month_start)
        .limit(1)
        .execute()
    )
    row = (res.data or [{}])[0]
    daily_limit = TIER_DAILY_LIMITS.get(user.tier, 500)

    return UsageSummary(
        tenant_id=user.tenant_id,
        tier=user.tier,
        month=month_start,
        api_calls=row.get("api_calls", 0),
        compute_runs=row.get("compute_runs", 0),
        price_syncs=row.get("price_syncs", 0),
        daily_limit=None if daily_limit == -1 else daily_limit,
    )


# ── POST /v1/tenant/api-key ───────────────────────────────────────────────────

class ApiKeyRequest(BaseModel):
    label: str | None = None


@router.post("/api-key", response_model=ApiKeyResponse, status_code=status.HTTP_201_CREATED)
async def issue_api_key(
    body: ApiKeyRequest,
    user: Annotated[UserContext, Depends(require_user)],
) -> ApiKeyResponse:
    """
    Generate (or rotate) the API key for this tenant.

    Requires a Supabase JWT — API key clients cannot rotate their own key.
    The plaintext key is returned ONCE and never stored. Rotating generates
    a new key and immediately invalidates the previous one.
    """
    if user.role == "api_client":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "API key clients cannot issue keys via this endpoint. "
                "Authenticate with your Supabase JWT to manage API keys."
            ),
        )

    # Generate: "vst_live_" prefix makes keys easy to identify in logs/configs.
    raw_key  = "vst_live_" + secrets.token_hex(32)
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    now      = datetime.now(tz=timezone.utc)

    db = get_db()
    db.table("tenants").update({
        "api_key_hash":     key_hash,
        "api_key_label":    body.label,
        "api_key_issued_at": now.isoformat(),
        "updated_at":       now.isoformat(),
    }).eq("id", user.tenant_id).execute()

    write_audit_log(
        event_type="tenant.api_key.issued",
        actor_id=user.user_id,
        resource="tenants",
        resource_id=user.tenant_id,
        metadata={"label": body.label, "tier": user.tier},
    )

    log.info("api key issued: tenant=%s label=%s", user.tenant_id, body.label)
    return ApiKeyResponse(api_key=raw_key, label=body.label, issued_at=now)


# ── DELETE /v1/tenant/api-key ─────────────────────────────────────────────────

@router.delete("/api-key", status_code=status.HTTP_200_OK)
async def revoke_api_key(
    user: Annotated[UserContext, Depends(require_user)],
) -> dict:
    """
    Revoke the tenant's current API key.

    Requires a Supabase JWT. After revocation, any requests using the old
    key will be rejected immediately.
    """
    if user.role == "api_client":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authenticate with your Supabase JWT to revoke API keys.",
        )

    db = get_db()
    db.table("tenants").update({
        "api_key_hash":     None,
        "api_key_label":    None,
        "api_key_issued_at": None,
        "updated_at":       datetime.now(tz=timezone.utc).isoformat(),
    }).eq("id", user.tenant_id).execute()

    write_audit_log(
        event_type="tenant.api_key.revoked",
        actor_id=user.user_id,
        resource="tenants",
        resource_id=user.tenant_id,
        metadata={"tier": user.tier},
    )

    log.info("api key revoked: tenant=%s", user.tenant_id)
    return {"revoked": True, "tenant_id": user.tenant_id}

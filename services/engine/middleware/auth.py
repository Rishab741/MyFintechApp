"""
Authentication middleware for the Vestara Portfolio Engine.

Three authentication modes:

1. USER AUTH — Supabase JWT from the mobile app / web dashboard.
   Validated via Supabase Auth API (works for HS256 and RS256 projects).
   Tenant is resolved via get_or_create_tenant() DB call (cached per process).

2. API KEY AUTH — Bearer token for B2B licensees (RIAs, hedge funds).
   Validated by SHA-256 hash lookup against tenants.api_key_hash.
   No Supabase JWT involved; tenant_id is returned directly.

3. SERVICE AUTH — static ENGINE_SERVICE_KEY for internal cron/edge calls.
   No user or tenant context; user_id passed in request body instead.
"""

from __future__ import annotations

import hashlib
import logging
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import get_settings

log = logging.getLogger(__name__)
security = HTTPBearer(auto_error=True)
settings = get_settings()

# Module-level tenant_id cache: {user_id: tenant_id}
# Avoids a DB round-trip on every request for existing users.
_tenant_cache: dict[str, str] = {}


# ── Models ────────────────────────────────────────────────────────────────────
class UserContext:
    """Decoded identity — works for both JWT users and B2B API key clients."""

    def __init__(
        self,
        user_id: str,
        tenant_id: str,
        email: str | None,
        role: str,
        tier: str = "self_serve",
    ):
        self.user_id   = user_id
        self.tenant_id = tenant_id
        self.email     = email
        self.role      = role
        self.tier      = tier

    def __repr__(self) -> str:
        return (
            f"UserContext(user_id={self.user_id!r}, "
            f"tenant_id={self.tenant_id!r}, tier={self.tier!r})"
        )


def _resolve_tenant(user_id: str) -> str:
    """
    Return tenant_id for a user — from cache or via DB call.
    Creates a self-serve tenant if none exists (first-time users).
    """
    if user_id in _tenant_cache:
        return _tenant_cache[user_id]

    from lib.supabase_client import get_db
    db = get_db()

    # Call the DB function that gets-or-creates the tenant
    res = db.rpc("get_or_create_tenant", {"p_user_id": user_id}).execute()
    tenant_id = res.data
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not resolve tenant for user.",
        )

    _tenant_cache[user_id] = str(tenant_id)
    return str(tenant_id)


# ── User JWT validation ───────────────────────────────────────────────────────
async def require_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Security(security)],
) -> UserContext:
    """
    FastAPI dependency. Validates a Supabase JWT or a B2B API key.

    - If the token decodes as a valid Supabase JWT → USER AUTH path.
    - If JWT decode fails and the token is 64 hex chars → API KEY path.
    """
    token = credentials.credentials

    # ── Try Supabase JWT via Auth API ────────────────────────────────────────
    # Validates server-side — works for HS256 and RS256, no local secret needed.
    try:
        from lib.supabase_client import get_db
        response = get_db().auth.get_user(token)
        if response.user:
            user      = response.user
            tenant_id = _resolve_tenant(str(user.id))
            return UserContext(
                user_id=str(user.id),
                tenant_id=tenant_id,
                email=user.email,
                role="authenticated",
            )
    except HTTPException:
        raise
    except Exception as e:
        log.warning("Supabase JWT validation failed (will try API key): %s", e)

    # ── Try B2B API key ───────────────────────────────────────────────────────
    key_hash = hashlib.sha256(token.encode()).hexdigest()
    from lib.supabase_client import get_db
    db = get_db()
    res = (
        db.table("tenants")
        .select("id, tier, owner_email")
        .eq("api_key_hash", key_hash)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    if res.data:
        tenant = res.data[0]
        return UserContext(
            user_id=tenant["id"],   # for B2B: user_id == tenant_id
            tenant_id=tenant["id"],
            email=tenant.get("owner_email"),
            role="api_client",
            tier=tenant.get("tier", "starter"),
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token.",
        headers={"WWW-Authenticate": "Bearer"},
    )


# ── Service key validation ────────────────────────────────────────────────────
async def require_service(
    credentials: Annotated[HTTPAuthorizationCredentials, Security(security)],
) -> None:
    """
    FastAPI dependency for internal service-to-service calls.
    Validates the static ENGINE_SERVICE_KEY.
    """
    if credentials.credentials != settings.engine_service_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid service key.",
        )

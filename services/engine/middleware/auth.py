"""
Authentication middleware for the Vestara Portfolio Engine.

Two authentication modes:

1. USER AUTH — Supabase JWT supplied by the mobile app / web dashboard.
   Validated locally against the Supabase JWT secret (no network round-trip).
   Extracts user_id from the `sub` claim.

2. SERVICE AUTH — static bearer token shared with Supabase Edge Functions
   and pg_cron jobs.  Used by the compute trigger and nightly cron.
   These calls do not represent a specific user; they pass user_id in the
   request body instead.
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from config import get_settings

log = logging.getLogger(__name__)
security = HTTPBearer(auto_error=True)
settings = get_settings()


# ── Models ────────────────────────────────────────────────────────────────────
class UserContext:
    """Decoded user identity from a Supabase JWT."""

    def __init__(self, user_id: str, email: str | None, role: str):
        self.user_id = user_id
        self.email = email
        self.role = role

    def __repr__(self) -> str:
        return f"UserContext(user_id={self.user_id!r}, role={self.role!r})"


# ── User JWT validation ───────────────────────────────────────────────────────
async def require_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Security(security)],
) -> UserContext:
    """
    FastAPI dependency.  Validates a Supabase JWT and returns the user context.

    Usage:
        @router.get("/portfolio/metrics")
        async def metrics(user: UserContext = Depends(require_user)):
            ...
    """
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except JWTError as exc:
        log.debug("JWT validation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing user identity.",
        )

    return UserContext(
        user_id=user_id,
        email=payload.get("email"),
        role=payload.get("role", "authenticated"),
    )


# ── Service key validation ────────────────────────────────────────────────────
async def require_service(
    credentials: Annotated[HTTPAuthorizationCredentials, Security(security)],
) -> None:
    """
    FastAPI dependency for internal service-to-service calls.
    Validates the static ENGINE_SERVICE_KEY.

    Usage:
        @router.post("/sync/compute/{user_id}")
        async def compute(_: None = Depends(require_service), ...):
            ...
    """
    if credentials.credentials != settings.engine_service_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid service key.",
        )

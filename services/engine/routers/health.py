import logging
from fastapi import APIRouter, BackgroundTasks
from models.portfolio import HealthResponse
from lib.supabase_client import get_db

log = logging.getLogger(__name__)
router = APIRouter(tags=["health"])

# Cached result of the last Supabase check — updated in the background
# so the /health liveness probe always returns instantly (no DB round-trip).
_last_supabase_status: str = "unknown"


def _check_supabase() -> None:
    """Run in a background task — never blocks the health response."""
    global _last_supabase_status
    try:
        db = get_db()
        db.table("assets").select("id").limit(1).execute()
        _last_supabase_status = "ok"
    except Exception as exc:
        log.error("Supabase connectivity check failed: %s", exc)
        _last_supabase_status = f"error: {exc}"


@router.get("/health", response_model=HealthResponse)
async def health_check(background_tasks: BackgroundTasks) -> HealthResponse:
    """
    Liveness + readiness probe.
    Always returns 200 immediately — Supabase check runs in the background
    so Railway's healthcheck never times out waiting for a DB round-trip.
    The `checks.supabase` field shows the result of the *previous* probe.
    """
    background_tasks.add_task(_check_supabase)
    checks = {"supabase": _last_supabase_status}
    status = "ok" if _last_supabase_status in ("ok", "unknown") else "degraded"
    return HealthResponse(status=status, checks=checks)

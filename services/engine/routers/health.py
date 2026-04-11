import logging
from fastapi import APIRouter
from models.portfolio import HealthResponse
from lib.supabase_client import get_db

log = logging.getLogger(__name__)
router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """
    Liveness + readiness probe.
    Railway / load balancers poll this endpoint.
    Returns 200 when the engine and its Supabase connection are healthy.
    """
    checks: dict[str, str] = {}

    # ── Supabase connectivity ─────────────────────────────────────────────────
    try:
        db = get_db()
        # Lightweight query — just checks the connection is alive
        db.table("assets").select("id").limit(1).execute()
        checks["supabase"] = "ok"
    except Exception as exc:
        log.error("Supabase health check failed: %s", exc)
        checks["supabase"] = f"error: {exc}"

    status = "ok" if all(v == "ok" for v in checks.values()) else "degraded"
    return HealthResponse(status=status, checks=checks)

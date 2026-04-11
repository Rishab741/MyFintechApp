"""
Vestara Portfolio Engine — FastAPI entry point.

All financial computation that would exceed Supabase Edge Function CPU limits
lives here: TWR, Sharpe, Sortino, Beta, Max Drawdown, CAGR, sector exposure,
and the price-sync pipeline.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import get_settings
from routers import health, portfolio, sync

# ── Logging (basic config before settings load so startup errors are visible) ─
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
log = logging.getLogger("engine")


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Validate settings eagerly so missing env vars surface as a clear log
    # message rather than a cryptic 502 from Railway.
    try:
        settings = get_settings()
        # Re-apply log level from settings now that we know it loaded
        logging.getLogger().setLevel(
            getattr(logging, settings.log_level.upper(), logging.INFO)
        )
        log.info("Vestara Portfolio Engine starting up (log_level=%s)", settings.log_level)
    except Exception as exc:
        log.critical("Engine failed to load settings — check env vars: %s", exc)
        raise
    yield
    log.info("Vestara Portfolio Engine shutting down")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Vestara Portfolio Engine",
    version="2.0.0",
    description=(
        "Production-grade financial computation service. "
        "Computes TWR, Sharpe, Beta, Drawdown, CAGR and exposure metrics "
        "from normalised portfolio time-series data."
    ),
    docs_url="/docs" if settings.debug else None,   # disable Swagger in production
    redoc_url=None,
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

# ── Global exception handler ──────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    log.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": "internal_server_error", "detail": str(exc)},
    )

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(health.router)
app.include_router(portfolio.router, prefix="/portfolio")
app.include_router(sync.router,      prefix="/sync")

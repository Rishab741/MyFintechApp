"""
Vestara Portfolio Engine — FastAPI entry point.

All financial computation that would exceed Supabase Edge Function CPU limits
lives here: TWR, Sharpe, Sortino, Beta, Max Drawdown, CAGR, sector exposure,
and the price-sync pipeline.
"""

import logging
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.logging import LoggingIntegration

from config import get_settings
from middleware.rate_limit import rate_limit_middleware
from routers import audit, health, ingest, ingest_universal, ledger, portfolio, simulate, sync, tenant

# ── Settings (loaded once at import; all required vars must be present) ───────
settings = get_settings()

# ── Sentry (no-op when SENTRY_DSN is blank) ───────────────────────────────────
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment="production" if not settings.debug else "development",
        integrations=[
            FastApiIntegration(),
            LoggingIntegration(level=logging.WARNING, event_level=logging.ERROR),
        ],
        # 100 % locally so every request appears in Sentry during dev.
        # Set to 0.05 in Railway via DEBUG=false (production guard above).
        traces_sample_rate=1.0 if settings.debug else 0.05,
        profiles_sample_rate=0.01,
        send_default_pii=False,
        debug=settings.debug,      # logs Sentry activity to stdout in dev
    )

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
log = logging.getLogger("engine")


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Vestara Portfolio Engine starting up")
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
    docs_url="/docs",       # always on — needed for B2B client onboarding
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── Rate limiting (before CORS so 429s are still CORS-safe) ──────────────────
app.middleware("http")(rate_limit_middleware)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Tenant-ID"],
)

# ── Global exception handler ──────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    log.exception("Unhandled exception on %s %s", request.method, request.url.path)
    # Explicitly capture here because FastAPI's exception_handler intercepts
    # the exception before Sentry's middleware can see it automatically.
    sentry_sdk.capture_exception(exc)
    return JSONResponse(
        status_code=500,
        content={"error": "internal_server_error", "detail": str(exc)},
    )

# ── Routers ───────────────────────────────────────────────────────────────────
# Unversioned health check — always at root so load balancers can probe it.
app.include_router(health.router)

# Versioned API — all client-facing and B2B endpoints live under /v1/.
# Future: /v2/ can be added without breaking existing integrations.
app.include_router(portfolio.router, prefix="/v1/portfolio")
app.include_router(sync.router,      prefix="/v1/sync")
app.include_router(ledger.router,    prefix="/v1/ledger")
app.include_router(tenant.router,    prefix="/v1/tenant")
app.include_router(audit.router,     prefix="/v1/audit")
app.include_router(ingest.router,           prefix="/v1/ingest")
app.include_router(ingest_universal.router, prefix="/v1/ingest")
app.include_router(simulate.router,         prefix="/v1/simulate")

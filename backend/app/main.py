"""FastAPI application entry point."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.core.middleware import RequestLogMiddleware, SecurityHeadersMiddleware
from app.api.routes import (
    health,
    areas,
    roi,
    dashboard,
    compare,
    advisor,
    admin,
    auth,
    opportunities,
    rankings,
    alerts,
    methodology,
    insights,
    brokers_public,
    broker_admin,
    broker_self,
    consultations,
    webhooks,
    dld,
    developers,
    offplan,
    dld_projects,
    claims,
    admin_accounts,
    market_timing,
)
from app.services.bootstrap import ensure_bootstrap_admin


logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("floxcy")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        "Starting %s v%s [%s]",
        settings.APP_NAME,
        settings.APP_VERSION,
        settings.ENVIRONMENT,
    )
    try:
        await ensure_bootstrap_admin()
    except Exception:
        logger.exception("bootstrap admin failed — continuing without it")
    yield
    logger.info("Shutting down %s", settings.APP_NAME)


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.APP_VERSION,
    debug=settings.DEBUG,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)


# ---- Middleware (order: innermost added first) ----
app.add_middleware(
    SecurityHeadersMiddleware,
    enable_hsts=settings.ENVIRONMENT != "development",
)
app.add_middleware(RequestLogMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "X-API-Key", "X-Requested-With"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining"],
)


# ---- Error handlers — never leak stack traces ----

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.__class__.__name__, "detail": exc.detail},
        headers=exc.headers or {},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": "ValidationError",
            "detail": "Request validation failed",
            "errors": exc.errors(),
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("unhandled exception path=%s", request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "detail": "An unexpected error occurred."},
    )


# ---- Routers (compare before areas so /areas/compare matches first) ----
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(compare.router)
app.include_router(areas.router)
app.include_router(roi.router)
app.include_router(dashboard.router)
app.include_router(advisor.router)
app.include_router(opportunities.router)
app.include_router(rankings.router)
app.include_router(alerts.router)
app.include_router(methodology.router)
app.include_router(insights.router)
app.include_router(admin.router)

# ---- Supply layer (brokers, opportunities, consultations) ----
app.include_router(brokers_public.router)
app.include_router(consultations.router)
app.include_router(broker_self.router)
app.include_router(broker_admin.router)
app.include_router(webhooks.router)

# ---- DLD data layer ----
app.include_router(dld.router)
app.include_router(developers.router)
app.include_router(offplan.router)
app.include_router(dld_projects.router)
app.include_router(claims.router)
app.include_router(admin_accounts.router)
app.include_router(market_timing.router)


@app.get("/")
async def root():
    return {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "auth_login": "/api/v1/auth/login",
            "areas": "/api/v1/areas",
            "areas_compare": "/api/v1/areas/compare?ids=...",
            "areas_stats": "/api/v1/areas/stats",
            "area_confidence": "/api/v1/areas/{id}/confidence",
            "roi": "/api/v1/roi/calculate",
            "dashboard": "/api/v1/dashboard/summary",
            "advisor": "/api/v1/advisor/query",
            "opportunities": "/api/v1/opportunities",
            "rankings": "/api/v1/rankings?by=yield|appreciation|score|low_risk|volume|price_low",
            "alerts": "/api/v1/alerts",
            "methodology": "/api/v1/methodology",
            "market_brief": "/api/v1/insights/market-brief",
            "area_insight": "/api/v1/insights/area/{id}",
            "trends": "/api/v1/insights/trends",
            "brokers_apply": "/api/v1/brokers/apply",
            "broker_login": "/api/v1/broker/login",
            "broker_me": "/api/v1/broker/me",
            "consultation_request": "/api/v1/consultations/request",
            "deal_detail": "/api/v1/opportunities/deals/{id}",
            "dld_areas": "/api/v1/dld/areas",
            "dld_area_detail": "/api/v1/dld/areas/{name_norm}",
            "dld_areas_stats": "/api/v1/dld/areas/stats",
            "dld_buildings": "/api/v1/dld/buildings",
            "dld_rent_check": "/api/v1/dld/rent-check",
            "dld_brokers": "/api/v1/dld/brokers",
            "dld_broker_detail": "/api/v1/dld/brokers/{broker_number}",
        },
    }

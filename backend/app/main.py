"""FastAPI application entry point."""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.routes import health, areas, roi, dashboard, compare, advisor, admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    print(f"🚀 Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    print(f"📊 Environment: {settings.ENVIRONMENT}")
    yield
    print(f"👋 Shutting down {settings.APP_NAME}")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.APP_VERSION,
    debug=settings.DEBUG,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers (compare before areas so /areas/compare matches first)
app.include_router(health.router)
app.include_router(compare.router)
app.include_router(areas.router)
app.include_router(roi.router)
app.include_router(dashboard.router)
app.include_router(advisor.router)
app.include_router(admin.router)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "areas": "/api/v1/areas",
            "areas_compare": "/api/v1/areas/compare?ids=...",
            "areas_stats": "/api/v1/areas/stats",
            "roi": "/api/v1/roi/calculate",
            "dashboard": "/api/v1/dashboard/summary",
            "advisor": "/api/v1/advisor/query",
            "admin_seed": "/api/v1/admin/seed",
        }
    }

"""FastAPI application entry point with enhanced security, authentication, and rate limiting."""

import os
import sys

# Add the app directory to Python path to fix import issues
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Temporarily disable complex features for basic startup
# from services.performance import initialize_performance_optimizations
# from services.minio_lifecycle import setup_minio_lifecycle_and_backup
import asyncio
import logging

import redis
import uvicorn

# Use simplified APIs for development
from api import admin  # Admin user management and dashboard
from api import curation  # Admin curation and review queue
from api import rbac  # Phase 0: RBAC foundation
from api import auth, featured, feeds
from api import images_simple as images  # Use simple version
from api import metadata, ogc_records, stac, upload, webhooks
from core.config import settings
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from middleware.logging import RequestLoggingMiddleware, configure_structlog, get_logger

# Enable monitoring for production observability
from services.monitoring import monitoring_background_tasks, setup_monitoring

# Configure structured logging early
LOG_LEVEL = logging.DEBUG if settings.DEBUG else logging.INFO
configure_structlog(LOG_LEVEL, force=True)
logger = get_logger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Impact Database API",
    description="API for disaster impact image database with enhanced security",
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,  # Disable docs in production
    redoc_url="/redoc" if settings.DEBUG else None,
)

# Setup Redis connection for rate limiting
redis_client = None
if settings.REDIS_URL:
    try:
        redis_client = redis.from_url(settings.REDIS_URL)
        redis_client.ping()
        logger.info("Connected to Redis for rate limiting and session management")
    except Exception as e:
        logger.warning(f"Failed to connect to Redis: {e}. Using in-memory fallbacks.")

# Add security middleware (order matters - add from outermost to innermost)
# Import rate limiting middleware
from middleware.rate_limit import RateLimitMiddleware, RedisRateLimitMiddleware

# Add structured logging with request IDs (outermost - logs everything)
app.add_middleware(
    RequestLoggingMiddleware,
    exclude_paths=["/health", "/metrics", "/docs", "/openapi.json", "/redoc", "/favicon.ico"],
)

# Add rate limiting (10 requests per minute per user)
if redis_client:
    logger.info("Using Redis-based rate limiting")
    app.add_middleware(
        RedisRateLimitMiddleware,
        redis_client=redis_client,
        requests_per_minute=10,
        exclude_paths=["/api/health", "/api/docs", "/docs", "/openapi.json", "/redoc"],
    )
else:
    logger.info("Using in-memory rate limiting")
    app.add_middleware(
        RateLimitMiddleware,
        requests_per_minute=10,
        burst_size=15,
        exclude_paths=["/api/health", "/api/docs", "/docs", "/openapi.json", "/redoc"],
    )

# Import user API
from api import user as user_api

# Configure CORS - more restrictive in production
if settings.ENVIRONMENT.lower() == "production":
    allowed_origins = [
        "https://your-production-domain.com",  # Replace with actual production domain
        "https://api.your-production-domain.com",
    ]
else:
    allowed_origins = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ]

# SECURITY FIX: Add comprehensive security headers middleware
from middleware.security_headers import SecurityHeadersMiddleware

app.add_middleware(
    SecurityHeadersMiddleware,
    environment=settings.ENVIRONMENT,
    enable_hsts=settings.ENVIRONMENT.lower() == "production",
)

# Add CSRF protection (before CORS)
from middleware.csrf import CSRFMiddleware

app.add_middleware(
    CSRFMiddleware,
    cookie_secure=settings.ENVIRONMENT.lower() == "production",
    cookie_samesite="lax",
    exempt_paths=[
        "/docs",
        "/openapi.json",
        "/redoc",
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/refresh",
        "/api/health",
        "/favicon.ico",
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "X-CSRF-Token",  # Allow CSRF token header
        "X-Requested-With",
        "X-CSRF-Token",
    ],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Window", "X-Process-Time"],
    max_age=86400,  # Cache preflight responses for 24 hours (reduces 300ms overhead)
)

# Include routers with enhanced security
# SECURITY FIX: Mount auth router to enable token-based authentication
from api import auth

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])

# RBAC routers
from api import rbac

app.include_router(rbac.router, prefix="/api/rbac", tags=["rbac"])

# Secure upload endpoint (replaces upload.py, upload_backup.py, upload_fixed.py)
# from api import upload_secure  # Commented out - optional module
# app.include_router(upload_secure.router, prefix="/api/upload", tags=["upload"])  # Commented out

# Legacy upload endpoint for backward compatibility (will be deprecated)
app.include_router(upload.router, prefix="/upload", tags=["upload-legacy"])

# Batch upload endpoint for multiple files with async processing
from api import batch_upload

app.include_router(batch_upload.router, tags=["batch-upload"])

# app.include_router(graphql_schema.graphql_router, prefix="/graphql", tags=["graphql"])  # Commented out - not imported
# app.include_router(presign.router, prefix="/api/presign", tags=["presign"])  # Commented out - not imported

# Admin endpoints - protected by RBAC
app.include_router(curation.router, prefix="/api/admin/curation", tags=["admin", "curation"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])

# API endpoints - now require authentication
app.include_router(images.router, prefix="/api", tags=["api", "images"])
app.include_router(metadata.router, prefix="/api", tags=["metadata"])

# User endpoints - profile, stats, settings
app.include_router(user_api.router, prefix="/api", tags=["user"])

# RBAC endpoints - Phase 0: Foundation
app.include_router(rbac.router, tags=["rbac", "roles", "permissions", "users"])

# Review Workflow endpoints - Phase 1: Assignment & Audit Trail
from api import review_workflow

app.include_router(review_workflow.router, tags=["review-workflow"])

# STAC and OGC API - Records with authentication
app.include_router(stac.router, prefix="/stac", tags=["stac"])
app.include_router(ogc_records.router, prefix="/ogc", tags=["ogc-records"])
app.include_router(webhooks.router, prefix="/api/webhooks", tags=["webhooks"])

# Lightweight feeds for external integration
app.include_router(feeds.router, prefix="/feeds", tags=["feeds"])

# Featured stories endpoint for homepage
app.include_router(featured.router, prefix="/api", tags=["featured"])

# Setup monitoring with Prometheus metrics
setup_monitoring(app)


def setup_error_monitoring() -> None:
    """Initialize Sentry when DSN is provided."""
    if not settings.SENTRY_DSN:
        logger.info("sentry_disabled", reason="missing_dsn")
        return

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration

        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.ENVIRONMENT,
            traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
            enable_tracing=settings.SENTRY_ENABLE_TRACING,
            integrations=[
                FastApiIntegration(transaction_style="endpoint"),
                LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
            ],
            release=settings.VERSION,
        )
        logger.info("sentry_initialized", environment=settings.ENVIRONMENT)
    except Exception as exc:  # pragma: no cover - defensive guard
        logger.warning("sentry_init_failed", error=str(exc))


setup_error_monitoring()


# Application startup event
@app.on_event("startup")
async def startup_event():
    """Initialize application on startup"""
    try:
        # Initialize database
        from models.database import get_db

        db = next(get_db())
        # await initialize_performance_optimizations(db)  # Temporarily disabled

        # Setup MinIO lifecycle and backup policies
        # setup_minio_lifecycle_and_backup()  # Temporarily disabled

        # Start background monitoring tasks for metrics collection
        asyncio.create_task(monitoring_background_tasks())

        logger.info(
            "startup_completed",
            project=settings.PROJECT_NAME,
            environment=settings.ENVIRONMENT,
            monitoring_endpoints=["/health", "/metrics"],
        )
        logger.info("stac_api_ready", path="/stac")
        logger.info("ogc_api_ready", path="/ogc")

    except Exception as e:
        logger.error("startup_error", error=str(e), error_type=type(e).__name__)
        # Don't raise exception to allow app to start even if some features fail


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": f"Welcome to {settings.PROJECT_NAME}",
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "docs_url": "/docs" if settings.DEBUG else None,
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "environment": settings.ENVIRONMENT,
        "redis_configured": bool(settings.REDIS_URL),
        "database_configured": bool(settings.DATABASE_URL),
    }


if __name__ == "__main__":
    uvicorn.run("core.main:app", host="0.0.0.0", port=8000, reload=settings.DEBUG, log_level="info")

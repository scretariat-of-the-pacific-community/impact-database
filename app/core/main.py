"""FastAPI application entry point with enhanced security, authentication, and rate limiting."""

import sys
import os

# Add the app directory to Python path to fix import issues
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import logging
import uvicorn
import json
import redis

from core.config import settings
# Use simplified APIs for development
from api import upload, auth, stac, ogc_records, metadata, webhooks, feeds, featured
from api import images_simple as images  # Use simple version
from api import rbac  # Phase 0: RBAC foundation
# Temporarily disable complex features for basic startup
# from services.monitoring import setup_monitoring, monitoring_background_tasks
# from services.performance import initialize_performance_optimizations
# from services.minio_lifecycle import setup_minio_lifecycle_and_backup
import asyncio

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Impact Database API",
    description="API for disaster impact image database with enhanced security",
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,  # Disable docs in production
    redoc_url="/redoc" if settings.DEBUG else None
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

# Add rate limiting (10 requests per minute per user)
if redis_client:
    logger.info("Using Redis-based rate limiting")
    app.add_middleware(
        RedisRateLimitMiddleware,
        redis_client=redis_client,
        requests_per_minute=10,
        exclude_paths=['/api/health', '/api/docs', '/docs', '/openapi.json', '/redoc']
    )
else:
    logger.info("Using in-memory rate limiting")
    app.add_middleware(
        RateLimitMiddleware,
        requests_per_minute=10,
        burst_size=15,
        exclude_paths=['/api/health', '/api/docs', '/docs', '/openapi.json', '/redoc']
    )

# Import user API
from api import user as user_api

# Configure CORS - more restrictive in production
if settings.ENVIRONMENT.lower() == "production":
    allowed_origins = [
        "https://your-production-domain.com",  # Replace with actual production domain
        "https://api.your-production-domain.com"
    ]
else:
    allowed_origins = [
        "http://localhost:3000",
        "http://localhost:3001", 
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001"
    ]

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
        "/favicon.ico"
    ]
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
        "X-Requested-With"
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

# app.include_router(graphql_schema.graphql_router, prefix="/graphql", tags=["graphql"])  # Commented out - not imported
# app.include_router(presign.router, prefix="/api/presign", tags=["presign"])  # Commented out - not imported

# Admin endpoints - protected by RBAC
# app.include_router(curation.router, prefix="/admin/curation", tags=["admin", "curation"])  # Commented out - not imported
# app.include_router(admin.router, prefix="/admin", tags=["admin"])  # Commented out - not imported

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

# Setup monitoring - temporarily disabled
# setup_monitoring(app)

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
        
        # Start background monitoring tasks
        # asyncio.create_task(monitoring_background_tasks())  # Temporarily disabled
        
        logger.info(f"{settings.PROJECT_NAME} started successfully")
        logger.info("STAC API available at /stac")
        logger.info("OGC API - Records available at /ogc")
        # logger.info("Monitoring endpoints available at /health, /metrics")  # Temporarily disabled
        
    except Exception as e:
        logger.error(f"Startup error: {e}")
        # Don't raise exception to allow app to start even if some features fail


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": f"Welcome to {settings.PROJECT_NAME}",
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "docs_url": "/docs" if settings.DEBUG else None
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "environment": settings.ENVIRONMENT,
        "redis_configured": bool(settings.REDIS_URL),
        "database_configured": bool(settings.DATABASE_URL)
    }


if __name__ == "__main__":
    uvicorn.run(
        "core.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_level="info"
    )

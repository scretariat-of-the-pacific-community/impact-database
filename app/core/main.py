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
from api import upload, auth, stac, ogc_records, metadata
from api import images_simple as images_simple as images  # Use simple version
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
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware, redis_client=redis_client)

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization", 
        "Content-Type", 
        "Accept",
        "X-Requested-With",
        "X-CSRF-Token"
    ],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Window", "X-Process-Time"]
)

# Include routers with enhanced security
app.include_router(auth_enhanced_router, prefix="/api/auth", tags=["auth"])

# Secure upload endpoint (replaces upload.py, upload_backup.py, upload_fixed.py)
from api import upload_secure
app.include_router(upload_secure.router, prefix="/api/upload", tags=["upload"])

# Legacy upload endpoint for backward compatibility (will be deprecated)
# app.include_router(upload.router, prefix="/upload", tags=["upload-legacy"])

app.include_router(graphql_schema.graphql_router, prefix="/graphql", tags=["graphql"])
app.include_router(presign.router, prefix="/api/presign", tags=["presign"])

# Admin endpoints - protected by RBAC
app.include_router(curation.router, prefix="/admin/curation", tags=["admin", "curation"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])

# API endpoints - now require authentication
app.include_router(images.router, prefix="/api", tags=["api", "images"])
app.include_router(metadata.router, prefix="/api", tags=["metadata"])

# STAC and OGC API - Records with authentication
app.include_router(stac.router, prefix="/stac", tags=["stac"])
app.include_router(ogc_records.router, prefix="/ogc", tags=["ogc-records"])

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

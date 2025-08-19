"""FastAPI application entry point with health check endpoint."""

import sys
import os

# Add the app directory to Python path to fix import issues
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import logging
import uvicorn
import json

from core.config import settings
from api import upload, auth, graphql_schema, presign, curation, admin, stac, ogc_records, metadata
# Temporarily disable advanced features for basic startup
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
    description="API for disaster impact image database",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(upload.router, prefix="/api/upload", tags=["upload"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(graphql_schema.graphql_router, prefix="/graphql", tags=["graphql"])
app.include_router(presign.router, prefix="/api/presign", tags=["presign"])
app.include_router(curation.router, prefix="/admin/curation", tags=["admin", "curation"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])
app.include_router(metadata.router, prefix="/api", tags=["metadata"])

# STAC and OGC API - Records
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

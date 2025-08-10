"""FastAPI application entry point with health check endpoint."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import sys
import os

# Add the app directory to Python path to fix import issues
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api import upload, auth
from api.graphql_schema import graphql_router

app = FastAPI(
    title="Impact Database API",
    description="API for collecting and managing hazard impact images with ISO 19115 compliant metadata",
    version="1.0.0",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(upload.router, prefix="/api", tags=["upload"])
app.include_router(auth.router, prefix="/api", tags=["auth"])
app.include_router(graphql_router, prefix="/graphql", tags=["graphql"])


@app.get("/")
async def root():
    return {
        "message": "Impact Database API",
        "version": "1.0.0",
        "docs": "/docs",
        "iso_compliance": "ISO 19115:2003 compatible",
    }


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "Impact Database API"}


if __name__ == "__main__":
    uvicorn.run("core.main:app", host="0.0.0.0", port=8000, reload=True)

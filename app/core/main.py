"""FastAPI application entry point with health check endpoint."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import sys
import os
import json

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


@app.get("/images/{filename}/metadata")
async def get_image_metadata(filename: str):
    """Get detailed metadata for a specific image including ISO 19115 fields"""
    try:
        # Query the database for the specific image
        query = """
        SELECT 
            filename, title, location, country, hazard_type, 
            timestamp, latitude, longitude, abstract, keywords,
            file_size, acquisition_date, responsible_party,
            spatial_resolution, temporal_extent, lineage,
            data_quality, constraints, maintenance_info,
            contact_info, citation_info, distribution_info,
            metadata_standard, character_set, hierarchy_level,
            language, topic_category, extent_description,
            reference_system, format_name, format_version
        FROM images 
        WHERE filename = %s
        """
        
        cursor.execute(query, (filename,))
        result = cursor.fetchone()
        
        if not result:
            raise HTTPException(status_code=404, detail="Image not found")
        
        # Convert to dictionary with proper field mapping
        columns = [desc[0] for desc in cursor.description]
        image_data = dict(zip(columns, result))
        
        # Handle JSON fields (keywords)
        if image_data.get('keywords'):
            try:
                image_data['keywords'] = json.loads(image_data['keywords'])
            except (json.JSONDecodeError, TypeError):
                image_data['keywords'] = []
        
        return image_data
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving image metadata: {str(e)}")


if __name__ == "__main__":
    uvicorn.run("core.main:app", host="0.0.0.0", port=8000, reload=True)

"""
Simplified FastAPI main application for local development
This version excludes complex middleware and auth for easier startup
"""
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import logging
from datetime import datetime, timedelta
from collections import defaultdict
import random

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Impact Database API (Simple)",
    description="Simplified API for local development",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware - essential for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, be more specific
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "simple"}

# Root endpoint
@app.get("/")
async def root():
    return {"message": "Impact Database API - Simple Mode"}

# Include only essential routers
try:
    # Import simplified images API
    from api.images_simple import router as images_router
    app.include_router(images_router, prefix="/api/images", tags=["images"])
    
    # Import upload API for file uploads
    from api.upload import router as upload_router
    app.include_router(upload_router, prefix="/upload", tags=["upload"])
    
    logger.info("Images API and Upload API routers included")
except ImportError as e:
    logger.warning(f"Could not import routers: {e}")

# Add essential endpoints directly to main app
@app.get("/api/vocabularies")
async def get_vocabularies():
    """Get vocabulary data for form dropdowns."""
    return {
        "hazard_types": [
            {"id": "flood", "label": "Flood"},
            {"id": "cyclone", "label": "Cyclone"}, 
            {"id": "drought", "label": "Drought"},
            {"id": "tsunami", "label": "Tsunami"},
            {"id": "landslide", "label": "Landslide"},
            {"id": "earthquake", "label": "Earthquake"},
            {"id": "wildfire", "label": "Wildfire"},
            {"id": "storm_surge", "label": "Storm Surge"}
        ],
        "source_agencies": [
            {"id": "spc", "label": "Pacific Community (SPC)"},
            {"id": "sprep", "label": "SPREP"},
            {"id": "usp", "label": "University of the South Pacific"},
            {"id": "government", "label": "National Government"},
            {"id": "ngo", "label": "NGO/Civil Society"}
        ],
        "topic_categories": [
            {"id": "environment", "label": "Environment"},
            {"id": "disaster", "label": "Disaster"},
            {"id": "imageryBaseMapsEarthCover", "label": "Imagery/Base Maps/Earth Cover"},
            {"id": "climatologyMeteorologyAtmosphere", "label": "Climatology/Meteorology/Atmosphere"}
        ],
        "countries": [
            {"id": "FJ", "label": "Fiji"},
            {"id": "TO", "label": "Tonga"},
            {"id": "VU", "label": "Vanuatu"},
            {"id": "SB", "label": "Solomon Islands"},
            {"id": "NC", "label": "New Caledonia"},
            {"id": "PG", "label": "Papua New Guinea"},
            {"id": "WS", "label": "Samoa"},
            {"id": "FM", "label": "Federated States of Micronesia"},
            {"id": "PW", "label": "Palau"},
            {"id": "MH", "label": "Marshall Islands"},
            {"id": "KI", "label": "Kiribati"},
            {"id": "TV", "label": "Tuvalu"},
            {"id": "NR", "label": "Nauru"},
            {"id": "CK", "label": "Cook Islands"},
            {"id": "NU", "label": "Niue"},
            {"id": "TK", "label": "Tokelau"}
        ]
    }

@app.get("/api/hazards")
async def get_hazards(type: str = None):
    """Get hazard statistics and data."""
    try:
        from models.database import get_db, ImageMetadata
        from typing import Optional
        
        db = next(get_db())
        try:
            query = db.query(ImageMetadata)
            
            if type:
                query = query.filter(ImageMetadata.hazard_type == type)
                
            images = query.all()
            
            # Convert to response format
            hazard_data = []
            for img in images:
                hazard_data.append({
                    "filename": img.filename,
                    "title": img.title,
                    "hazard_type": img.hazard_type,
                    "country": img.country,
                    "location": img.location,
                    "upload_timestamp": img.date_stamp.isoformat() if img.date_stamp else None
                })
                
            return hazard_data
        finally:
            db.close()
            
    except Exception as e:
        logger.error(f"Error fetching hazards: {e}")
        return {"error": f"Failed to fetch hazards: {str(e)}"}

@app.post("/upload")  
async def simple_upload():
    """Simple upload endpoint - placeholder for development"""
    return {
        "status": "success",
        "message": "Upload functionality coming soon",
        "filename": "placeholder.jpg",
        "upload_timestamp": "2025-09-04T00:00:00Z"
    }

@app.get("/api/v1/images/search")
async def search_images(
    q: str = None,
    hazard_type: str = None,
    country: str = None,
    sort_by: str = "relevance",
    sort_order: str = "desc",
    limit: int = 24,
    offset: int = 0
):
    """
    Search images with various filters
    This is a simplified version for development
    """
    try:
        # Mock search results - in production this would query the database
        mock_images = [
            {
                "id": "1",
                "filename": "dawasamu_cartopy_map.png",
                "title": "Dawasamu Cartopy Map",
                "hazard_type": "flood",
                "country": "FJ",
                "location": "Dawasamu, Fiji",
                "abstract": "Cartographic representation of flood impact in Dawasamu area",
                "keywords": ["flood", "cartopy", "dawasamu", "fiji"],
                "upload_timestamp": "2025-09-04T12:00:00Z",
                "thumbnail_url": "/api/images/dawasamu_cartopy_map.png/thumbnail",
                "coordinates": {"latitude": -18.0, "longitude": 178.0}
            },
            {
                "id": "2", 
                "filename": "dawasamu_satellite_view.png",
                "title": "Dawasamu Satellite View",
                "hazard_type": "flood",
                "country": "FJ",
                "location": "Dawasamu, Fiji",
                "abstract": "Satellite imagery showing flood extent in Dawasamu region",
                "keywords": ["flood", "satellite", "dawasamu", "fiji"],
                "upload_timestamp": "2025-09-04T12:30:00Z",
                "thumbnail_url": "/api/images/dawasamu_satellite_view.png/thumbnail",
                "coordinates": {"latitude": -18.0, "longitude": 178.0}
            }
        ]
        
        # Apply filters if provided
        filtered_images = mock_images
        if hazard_type:
            filtered_images = [img for img in filtered_images if img["hazard_type"] == hazard_type]
        if country:
            filtered_images = [img for img in filtered_images if img["country"] == country]
        if q:
            # Simple text search in title, abstract, and keywords
            q_lower = q.lower()
            filtered_images = [
                img for img in filtered_images 
                if (q_lower in img["title"].lower() or 
                    q_lower in img["abstract"].lower() or 
                    any(q_lower in keyword.lower() for keyword in img["keywords"]))
            ]
        
        # Apply sorting
        if sort_by == "date":
            filtered_images.sort(
                key=lambda x: x["upload_timestamp"], 
                reverse=(sort_order == "desc")
            )
        # For relevance, keep original order (could implement scoring)
        
        # Apply pagination
        total = len(filtered_images)
        paginated_images = filtered_images[offset:offset + limit]
        
        return {
            "images": paginated_images,
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": (offset + limit) < total
        }
        
    except Exception as e:
        logging.error(f"Search images error: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": "Failed to search images"}
        )

@app.get("/upload/images/{image_id}/metadata")
async def get_image_metadata(image_id: str):
    """
    Get metadata for a specific image
    """
    try:
        if image_id == "undefined" or not image_id:
            return JSONResponse(
                status_code=404,
                content={"detail": "Image ID is required"}
            )
        
        # Mock metadata - in production this would query the database
        mock_metadata = {
            "id": image_id,
            "filename": f"{image_id}.png",
            "title": f"Image {image_id}",
            "hazard_type": "flood",
            "country": "FJ", 
            "location": "Fiji",
            "abstract": f"Metadata for image {image_id}",
            "keywords": ["hazard", "fiji"],
            "upload_timestamp": "2025-09-04T12:00:00Z",
            "coordinates": {"latitude": -18.0, "longitude": 178.0},
            "file_size": 1024000,
            "image_dimensions": {"width": 1920, "height": 1080}
        }
        
        return mock_metadata
        
    except Exception as e:
        logging.error(f"Get image metadata error: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": "Failed to get image metadata"}
        )

# Error handlers
@app.exception_handler(500)
async def internal_server_error(request, exc):
    logger.error(f"Internal server error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

@app.get("/api/analytics")
async def get_analytics():
    """
    Get analytics data for the dashboard
    Returns distribution of hazards, countries, monthly uploads, and recent activity
    """
    try:
        # In a real implementation, this would query the database
        # For now, we'll generate realistic mock data based on actual patterns
        
        # Sample data that would come from database queries
        hazard_distribution = {
            "Cyclone": random.randint(30, 45),
            "Flood": random.randint(25, 35),
            "Drought": random.randint(20, 30),
            "Tsunami": random.randint(10, 20),
            "Earthquake": random.randint(8, 18),
            "Wildfire": random.randint(5, 15),
            "Landslide": random.randint(3, 12),
            "Storm Surge": random.randint(2, 10)
        }
        
        country_distribution = {
            "Fiji": random.randint(25, 40),
            "Tonga": random.randint(20, 30),
            "Vanuatu": random.randint(18, 28),
            "Solomon Islands": random.randint(15, 25),
            "Papua New Guinea": random.randint(12, 22),
            "Samoa": random.randint(8, 18),
            "New Caledonia": random.randint(5, 15),
            "Others": random.randint(3, 10)
        }
        
        # Generate monthly upload data for the last 8 months
        months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"]
        monthly_uploads = {}
        base_count = 10
        for i, month in enumerate(months):
            # Simulate seasonal patterns
            seasonal_factor = 1 + 0.3 * (i / len(months))  # Gradual increase
            monthly_uploads[month] = int(base_count * seasonal_factor + random.randint(-3, 8))
        
        # Recent activity simulation
        recent_activity = [
            {
                "type": "Image Upload",
                "count": random.randint(3, 8),
                "timestamp": f"{random.randint(1, 3)} hours ago"
            },
            {
                "type": "Data Export", 
                "count": random.randint(1, 4),
                "timestamp": f"{random.randint(4, 8)} hours ago"
            },
            {
                "type": "Search Query",
                "count": random.randint(15, 30),
                "timestamp": f"{random.randint(1, 12)} hours ago"
            },
            {
                "type": "Metadata Update",
                "count": random.randint(2, 6),
                "timestamp": f"{random.randint(1, 24)} hours ago"
            }
        ]
        
        total_images = sum(hazard_distribution.values())
        
        analytics_data = {
            "totalImages": total_images,
            "hazardDistribution": hazard_distribution,
            "countryDistribution": country_distribution,
            "monthlyUploads": monthly_uploads,
            "recentActivity": recent_activity,
            "lastUpdated": datetime.now().isoformat()
        }
        
        return JSONResponse(content=analytics_data)
        
    except Exception as e:
        logging.error(f"Analytics endpoint error: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": "Failed to fetch analytics data"}
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main_simple:app",
        host="0.0.0.0",
        port=8010,
        reload=True,
        log_level="info"
    )

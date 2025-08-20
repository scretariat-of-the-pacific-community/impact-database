"""Images API endpoints for listing and browsing images."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_
from typing import List, Optional
import logging

from models.database import get_db, ImageMetadata
from api.schemas.image_schemas import ImageResponse

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/images")
async def get_all_images(
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of images to return"),
    offset: int = Query(0, ge=0, description="Number of images to skip"),
    hazard_type: Optional[str] = Query(None, description="Filter by hazard type"),
    db: Session = Depends(get_db)
):
    """Get all images with optional filtering and pagination."""
    try:
        query = db.query(ImageMetadata)
        
        # Apply filters
        if hazard_type:
            query = query.filter(ImageMetadata.hazard_type == hazard_type)
        
        # Apply pagination and ordering
        query = query.order_by(desc(ImageMetadata.date_stamp))
        query = query.offset(offset).limit(limit)
        
        images = query.all()
        
        # Convert to response format
        result = []
        for image in images:
            result.append({
                "id": image.filename,  # Use filename as ID since it's the primary key
                "filename": image.filename,
                "title": image.title,
                "description": image.abstract,  # Use abstract as description
                "hazard_type": image.hazard_type,
                "location": image.location,
                "latitude": float(image.latitude) if image.latitude else None,
                "longitude": float(image.longitude) if image.longitude else None,
                "upload_date": image.date_stamp.isoformat() if image.date_stamp else None,
                "file_size": getattr(image, 'file_size', None),
                "image_hash": getattr(image, 'image_hash', None),
                "thumbnail_url": f"/upload/images/{image.filename}/thumbnail" if image.filename else None,
                "full_url": f"/upload/images/{image.filename}" if image.filename else None,
                "contact": {
                    "organisation_name": getattr(image, 'contact_organisation_name', None),
                    "individual_name": getattr(image, 'contact_individual_name', None),
                    "email": getattr(image, 'contact_email', None)
                }
            })
        
        return result
        
    except Exception as e:
        logger.error(f"Error fetching images: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching images: {str(e)}")

@router.get("/v1/images/search")
async def search_images(
    q: Optional[str] = Query(None, description="Search query"),
    hazard_type: Optional[str] = Query(None, description="Filter by hazard type"),
    location: Optional[str] = Query(None, description="Filter by location"),
    sort_by: str = Query("relevance", description="Sort by: relevance, date, title"),
    sort_order: str = Query("desc", description="Sort order: asc, desc"),
    limit: int = Query(24, ge=1, le=100, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    db: Session = Depends(get_db)
):
    """Search images with full-text search and filtering."""
    try:
        query = db.query(ImageMetadata)
        
        # Apply text search across multiple fields
        if q:
            search_term = f"%{q}%"
            from sqlalchemy import or_
            query = query.filter(or_(
                ImageMetadata.title.ilike(search_term),
                ImageMetadata.abstract.ilike(search_term),
                ImageMetadata.location.ilike(search_term),
                ImageMetadata.hazard_type.ilike(search_term)
            ))
        
        # Apply filters
        if hazard_type:
            query = query.filter(ImageMetadata.hazard_type == hazard_type)
        
        if location:
            query = query.filter(ImageMetadata.location.ilike(f"%{location}%"))
        
        # Apply sorting
        if sort_by == "date":
            sort_field = ImageMetadata.date_stamp
        elif sort_by == "title":
            sort_field = ImageMetadata.title
        else:  # relevance or default
            sort_field = ImageMetadata.date_stamp  # Default to date for now
        
        if sort_order == "asc":
            query = query.order_by(sort_field)
        else:
            query = query.order_by(desc(sort_field))
        
        # Get total count for pagination
        total_count = query.count()
        
        # Apply pagination
        images = query.offset(offset).limit(limit).all()
        
        # Convert to response format
        results = []
        for image in images:
            results.append({
                "id": image.filename,
                "filename": image.filename,
                "title": image.title,
                "description": image.abstract,
                "hazard_type": image.hazard_type,
                "location": image.location,
                "latitude": float(image.latitude) if image.latitude else None,
                "longitude": float(image.longitude) if image.longitude else None,
                "upload_date": image.date_stamp.isoformat() if image.date_stamp else None,
                "file_size": getattr(image, 'file_size', None),
                "image_hash": getattr(image, 'image_hash', None),
                "thumbnail_url": f"/upload/images/{image.filename}/thumbnail" if image.filename else None,
                "image_url": f"/upload/images/{image.filename}" if image.filename else None
            })
        
        return {
            "images": results,
            "total": total_count,
            "page": (offset // limit) + 1,
            "limit": limit,
            "total_pages": (total_count + limit - 1) // limit,
            "has_more": offset + limit < total_count
        }
        
    except Exception as e:
        logger.error(f"Error searching images: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error searching images: {str(e)}")

@router.get("/hazards")
async def get_hazard_types(db: Session = Depends(get_db)):
    """Get all unique hazard types from the database."""
    try:
        hazards = db.query(ImageMetadata.hazard_type).filter(
            ImageMetadata.hazard_type.isnot(None)
        ).distinct().all()
        
        hazard_list = [hazard[0] for hazard in hazards if hazard[0]]
        
        # Add default hazard types if none exist in database
        default_hazards = [
            "flood", "cyclone", "tsunami", "drought", "landslide", 
            "earthquake", "wildfire", "volcanic", "coastal_erosion"
        ]
        
        if not hazard_list:
            hazard_list = default_hazards
        
        return {"hazards": hazard_list}
        
    except Exception as e:
        logger.error(f"Error fetching hazard types: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching hazard types: {str(e)}")

@router.get("/vocabularies")
async def get_vocabularies():
    """Get vocabulary data for the frontend."""
    try:
        vocabularies = {
            "hazard_types": [
                {"id": "flood", "label": "Flood", "description": "Flooding and inundation events"},
                {"id": "cyclone", "label": "Cyclone/Hurricane", "description": "Tropical cyclones and hurricanes"},
                {"id": "tsunami", "label": "Tsunami", "description": "Tsunami waves and impacts"},
                {"id": "drought", "label": "Drought", "description": "Drought conditions and water scarcity"},
                {"id": "landslide", "label": "Landslide", "description": "Landslides and slope failures"},
                {"id": "earthquake", "label": "Earthquake", "description": "Seismic events and ground shaking"},
                {"id": "wildfire", "label": "Wildfire", "description": "Forest fires and bush fires"},
                {"id": "volcanic", "label": "Volcanic", "description": "Volcanic eruptions and ash fall"},
                {"id": "coastal_erosion", "label": "Coastal Erosion", "description": "Beach and coastal erosion"}
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
                {"id": "NR", "label": "Nauru"}
            ]
        }
        
        return vocabularies
        
    except Exception as e:
        logger.error(f"Error fetching vocabularies: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching vocabularies: {str(e)}")

@router.get("/geojson")
async def get_images_geojson(db: Session = Depends(get_db)):
    """Get all geolocated images as GeoJSON."""
    try:
        images = db.query(ImageMetadata).filter(
            ImageMetadata.latitude.isnot(None),
            ImageMetadata.longitude.isnot(None)
        ).all()
        
        features = []
        for image in images:
            if image.latitude and image.longitude:
                feature = {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [float(image.longitude), float(image.latitude)]
                    },
                    "properties": {
                        "id": image.filename,  # Use filename as ID
                        "filename": image.filename,
                        "title": image.title,
                        "description": image.abstract,  # Use abstract as description
                        "hazard_type": image.hazard_type,
                        "location": image.location,
                        "upload_date": image.date_stamp.isoformat() if image.date_stamp else None,
                        "thumbnail_url": f"/upload/images/{image.filename}/thumbnail" if image.filename else None
                    }
                }
                features.append(feature)
        
        geojson = {
            "type": "FeatureCollection",
            "features": features
        }
        
        return geojson
        
    except Exception as e:
        logger.error(f"Error creating GeoJSON: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating GeoJSON: {str(e)}")

"""Images API endpoints for listing and browsing images."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_
from typing import List, Optional
import logging

from models.database import get_db, ImageMetadata
from api.schemas.image_schemas import ImageResponse
from typing import Optional
# Simple pagination for basic functionality
from pydantic import BaseModel

class QueryLimits:
    MAX_LIMIT = 100
    DEFAULT_LIMIT = 20

class ValidatedPagination(BaseModel):
    offset: int = 0
    limit: int = QueryLimits.DEFAULT_LIMIT
    
    def __post_init__(self):
        if self.limit > QueryLimits.MAX_LIMIT:
            self.limit = QueryLimits.MAX_LIMIT

ALLOWED_SORT_FIELDS = ["created_at", "updated_at", "filename"]

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/images")
async def get_all_images(
    request: Request,
    limit: int = Query(QueryLimits.DEFAULT_LIMIT, ge=1, le=QueryLimits.MAX_LIMIT, 
                      description="Maximum number of images to return"),
    offset: int = Query(0, ge=0, 
                       description="Number of images to skip"),
    hazard_type: Optional[str] = Query(None, max_length=100,
                                     description="Filter by hazard type"),
    location: Optional[str] = Query(None, max_length=200,
                                  description="Filter by location"),
    country: Optional[str] = Query(None, max_length=100,
                                 description="Filter by country"),
    sort_by: str = Query("date_stamp", description="Sort field: date_stamp, title, hazard_type"),
    sort_order: str = Query("desc", description="Sort order: asc, desc"),
    db: Session = Depends(get_db)
):
    """Get all images with optional filtering and pagination (simplified implementation)."""
    try:
        # Build base query
        query = db.query(ImageMetadata)
        
        # Apply filters
        if hazard_type:
            query = query.filter(ImageMetadata.hazard_type == hazard_type)
        if location:
            query = query.filter(ImageMetadata.location.ilike(f"%{location}%"))
        if country:
            query = query.filter(ImageMetadata.country.ilike(f"%{country}%"))
        
        # Apply sorting
        if sort_by == "date_stamp" and hasattr(ImageMetadata, 'date_stamp'):
            order_col = ImageMetadata.date_stamp
        elif sort_by == "title" and hasattr(ImageMetadata, 'title'):
            order_col = ImageMetadata.title
        elif sort_by == "hazard_type":
            order_col = ImageMetadata.hazard_type
        else:
            order_col = ImageMetadata.datetime  # Default to datetime
        
        if sort_order == "desc":
            query = query.order_by(desc(order_col))
        else:
            query = query.order_by(order_col)
        
        # Apply pagination
        images = query.limit(limit).offset(offset).all()
        
        # Convert to response format
        result = []
        for image in images:
            result.append({
                "id": str(image.id) if hasattr(image, 'id') else image.filename,
                "filename": image.filename,
                "title": image.title,
                "description": image.abstract if hasattr(image, 'abstract') else None,
                "hazard_type": image.hazard_type,
                "location": image.location,
                "country": image.country,
                "keywords": image.keywords if hasattr(image, 'keywords') else [],
                "upload_date": image.date_stamp.isoformat() if hasattr(image, 'date_stamp') and image.date_stamp else None,
                "thumbnail_url": f"/upload/images/{image.filename}/thumbnail" if image.filename else None,
                "full_url": f"/upload/images/{image.filename}" if image.filename else None
            })
        
        # Calculate total count
        total_count = db.query(ImageMetadata).count()
        
        return {
            "images": result,
            "total": total_count,
            "page": (offset // limit) + 1,
            "limit": limit,
            "total_pages": (total_count + limit - 1) // limit,
            "has_more": offset + limit < total_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching images: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching images: {str(e)}")

@router.get("/v1/images/search")
async def search_images(
    request: Request,
    q: Optional[str] = Query(None, max_length=500,
                           description="Search query"),
    hazard_type: Optional[str] = Query(None, max_length=100,
                                     description="Filter by hazard type"),
    location: Optional[str] = Query(None, max_length=200,
                                  description="Filter by location"),
    country: Optional[str] = Query(None, max_length=100,
                                 description="Filter by country"),
    sort_by: str = Query("relevance", description="Sort by: relevance, date_stamp, title"),
    sort_order: str = Query("desc", description="Sort order: asc, desc"),
    limit: int = Query(QueryLimits.DEFAULT_LIMIT, ge=1, le=QueryLimits.MAX_LIMIT, 
                      description="Maximum number of results"),
    offset: int = Query(0, ge=0, 
                       description="Number of results to skip"),
    db: Session = Depends(get_db)
):
    """Search images with full-text search and filtering (simplified implementation)."""
    try:
        # Build base query
        query = db.query(ImageMetadata)
        
        # Apply text search if provided
        if q:
            search_pattern = f"%{q}%"
            query = query.filter(
                or_(
                    ImageMetadata.title.ilike(search_pattern),
                    ImageMetadata.abstract.ilike(search_pattern),
                    ImageMetadata.filename.ilike(search_pattern)
                )
            )
        
        # Apply filters
        if hazard_type:
            query = query.filter(ImageMetadata.hazard_type == hazard_type)
        if location:
            query = query.filter(ImageMetadata.location.ilike(f"%{location}%"))
        if country:
            query = query.filter(ImageMetadata.country.ilike(f"%{country}%"))
        
        # Apply sorting
        if sort_by == "date_stamp" and hasattr(ImageMetadata, 'date_stamp'):
            order_col = ImageMetadata.date_stamp
        elif sort_by == "title" and hasattr(ImageMetadata, 'title'):
            order_col = ImageMetadata.title
        else:
            order_col = ImageMetadata.datetime  # Default to datetime
        
        if sort_order == "desc":
            query = query.order_by(desc(order_col))
        else:
            query = query.order_by(order_col)
        
        # Get total before pagination
        total_count = query.count()
        
        # Apply pagination
        images = query.limit(limit).offset(offset).all()
        
        
        # Convert to response format
        results = []
        for image in images:
            results.append({
                "id": str(image.id) if hasattr(image, 'id') else image.filename,
                "filename": image.filename,
                "title": image.title,
                "description": image.abstract if hasattr(image, 'abstract') else None,
                "hazard_type": image.hazard_type,
                "location": image.location,
                "country": image.country,
                "upload_date": image.date_stamp.isoformat() + "Z" if hasattr(image, 'date_stamp') and image.date_stamp else None,
                "thumbnail_url": f"/upload/images/{image.filename}/thumbnail" if image.filename else None,
                "image_url": f"/upload/images/{image.filename}" if image.filename else None
            })
        
        return {
            "images": results,
            "total": total_count,
            "page": (offset // limit) + 1,
            "limit": limit,
            "total_pages": (total_count + limit - 1) // limit,
            "has_more": offset + limit < total_count,
            "query": q
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching images: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error searching images: {str(e)}")

@router.get("/hazards")
async def get_hazards(
    request: Request,
    db: Session = Depends(get_db)
):
    """Get list of all available hazard types (simplified - public endpoint)."""
    try:
        hazards = db.query(ImageMetadata.hazard_type).filter(
            ImageMetadata.hazard_type.isnot(None),
            ImageMetadata.hazard_type != ''
        ).distinct().all()
        
        hazard_list = [hazard[0] for hazard in hazards if hazard[0]]
        
        # If no hazards found, return default list
        default_hazards = [
            'flood', 'cyclone', 'drought', 'earthquake', 
            'tsunami', 'landslide', 'wildfire'
        ]
        if not hazard_list:
            hazard_list = default_hazards
        
        return {"hazards": hazard_list}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching hazards: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching hazards: {str(e)}")


@router.get("/vocabularies")
async def get_vocabularies(request: Request):
    """Get vocabularies for metadata fields. Public endpoint for upload form."""
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
async def get_images_geojson(
    request: Request,
    limit: int = Query(QueryLimits.DEFAULT_LIMIT_GEOJSON, ge=1, le=QueryLimits.MAX_LIMIT_GEOJSON,
                      description="Maximum number of features to return"),
    hazard_type: Optional[str] = Query(None, max_length=QueryLimits.MAX_FILTER_VALUE_LENGTH,
                                     description="Filter by hazard type"),
    bbox: Optional[str] = Query(None, description="Bounding box: min_lon,min_lat,max_lon,max_lat"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all geolocated images as GeoJSON. Requires authentication."""
    try:
        # Check permissions - GeoJSON is sensitive geolocation data
        if "read:images" not in current_user.permissions and "read:all" not in current_user.permissions:
            raise HTTPException(
                status_code=403,
                detail="Insufficient permissions to access geolocation data"
            )
        
        # Create validated filters
        filters = {}
        if hazard_type:
            filters['hazard_type'] = hazard_type
        
        # Parse and validate bounding box if provided
        bbox_coords = None
        if bbox:
            try:
                parts = bbox.split(',')
                if len(parts) != 4:
                    raise ValueError("Bounding box must have 4 values: min_lon,min_lat,max_lon,max_lat")
                bbox_coords = [float(x) for x in parts]
                min_lon, min_lat, max_lon, max_lat = bbox_coords
                # Validate ranges
                if not (-180 <= min_lon <= 180 and -180 <= max_lon <= 180):
                    raise ValueError("Longitude must be between -180 and 180")
                if not (-90 <= min_lat <= 90 and -90 <= max_lat <= 90):
                    raise ValueError("Latitude must be between -90 and 90")
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
        
        # Build query
        query = db.query(ImageMetadata)
        
        # Apply hazard type filter
        if hazard_type:
            query = query.filter(ImageMetadata.hazard_type == hazard_type)
        
        # Apply bounding box filter if provided
        if bbox_coords:
            min_lon, min_lat, max_lon, max_lat = bbox_coords
            if hasattr(ImageMetadata, 'longitude') and hasattr(ImageMetadata, 'latitude'):
                query = query.filter(
                    ImageMetadata.longitude.between(min_lon, max_lon),
                    ImageMetadata.latitude.between(min_lat, max_lat)
                )
        
        # Filter for only geolocated images
        if hasattr(ImageMetadata, 'longitude') and hasattr(ImageMetadata, 'latitude'):
            query = query.filter(
                ImageMetadata.longitude.isnot(None),
                ImageMetadata.latitude.isnot(None)
            )
        
        images = query.limit(limit).all()
        
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
                        "country": image.country,
                        "upload_date": image.date_stamp.isoformat() if image.date_stamp else None,
                        "thumbnail_url": f"/upload/images/{image.filename}/thumbnail" if image.filename else None
                    }
                }
                features.append(feature)
        
        geojson = {
            "type": "FeatureCollection",
            "features": features,
            "metadata": {
                "total_features": len(features),
                "limit": limit,
                "has_more": len(features) == limit,  # If we got the max, there might be more
                "bbox_filter": bbox_coords,
                "hazard_type_filter": hazard_type
            }
        }
        
        return geojson
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating GeoJSON: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating GeoJSON: {str(e)}")

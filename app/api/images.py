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
    limit: int = Query(QueryLimits.DEFAULT_LIMIT_IMAGES, ge=1, le=QueryLimits.MAX_LIMIT_IMAGES, 
                      description="Maximum number of images to return"),
    offset: int = Query(0, ge=0, le=QueryLimits.MAX_OFFSET, 
                       description="Number of images to skip"),
    hazard_type: Optional[str] = Query(None, max_length=QueryLimits.MAX_FILTER_VALUE_LENGTH,
                                     description="Filter by hazard type"),
    location: Optional[str] = Query(None, max_length=QueryLimits.MAX_FILTER_VALUE_LENGTH,
                                  description="Filter by location"),
    country: Optional[str] = Query(None, max_length=QueryLimits.MAX_FILTER_VALUE_LENGTH,
                                 description="Filter by country"),
    sort_by: str = Query("date_stamp", description="Sort field: date_stamp, title, hazard_type"),
    sort_order: str = Query("desc", description="Sort order: asc, desc"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all images with optional filtering and pagination. Requires authentication."""
    try:
        # Check if user has permission to read images
        if "read:images" not in current_user.permissions and "read:all" not in current_user.permissions:
            raise HTTPException(
                status_code=403, 
                detail="Insufficient permissions to access images"
            )
        
        # Create validated pagination
        pagination = ValidatedPagination.create(limit, offset, QueryLimits.MAX_LIMIT_IMAGES)
        
        # Create validated filters
        filters = ValidatedFilter.create(
            hazard_type=hazard_type,
            location=location, 
            country=country
        )
        
        # Build secure query using the available method
        query_builder = ImageQueryBuilder()
        
        # Create filters dict
        filter_dict = {}
        if hazard_type:
            filter_dict['hazard_type'] = hazard_type
        if location:
            filter_dict['location'] = location
        if country:
            filter_dict['country'] = country
            
        # Use the base build_query method
        from models.database import ImageMetadata
        images = query_builder.build_query(
            db=db,
            model=ImageMetadata,
            filters=filter_dict,
            allowed_filters=['hazard_type', 'location', 'country'],
            sort_by=sort_by,
            sort_order=sort_order,
            allowed_sorts=['date_stamp', 'title', 'hazard_type', 'created_at'],
            limit=limit,
            offset=offset
        )
        
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
                "country": image.country,
                "keywords": image.keywords,  # Add keywords field
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
    q: Optional[str] = Query(None, max_length=QueryLimits.MAX_SEARCH_TERM_LENGTH,
                           description="Search query"),
    hazard_type: Optional[str] = Query(None, max_length=QueryLimits.MAX_FILTER_VALUE_LENGTH,
                                     description="Filter by hazard type"),
    location: Optional[str] = Query(None, max_length=QueryLimits.MAX_FILTER_VALUE_LENGTH,
                                  description="Filter by location"),
    country: Optional[str] = Query(None, max_length=QueryLimits.MAX_FILTER_VALUE_LENGTH,
                                 description="Filter by country"),
    sort_by: str = Query("relevance", description="Sort by: relevance, date_stamp, title"),
    sort_order: str = Query("desc", description="Sort order: asc, desc"),
    limit: int = Query(QueryLimits.DEFAULT_LIMIT_SEARCH, ge=1, le=QueryLimits.MAX_LIMIT_SEARCH, 
                      description="Maximum number of results"),
    offset: int = Query(0, ge=0, le=QueryLimits.MAX_OFFSET, 
                       description="Number of results to skip"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Search images with full-text search and filtering. Requires authentication."""
    try:
        # Check permissions
        if "search:basic" not in current_user.permissions and "read:all" not in current_user.permissions:
            raise HTTPException(
                status_code=403,
                detail="Insufficient permissions to search images"
            )
        
        # Create validated pagination
        pagination = ValidatedPagination.create(limit, offset, QueryLimits.MAX_LIMIT_SEARCH)
        
        # Create validated search term
        validated_search = ValidatedSearch.create(q)
        search_term = validated_search.q if validated_search else None
        
        # Create validated filters
        filters = ValidatedFilter.create(
            hazard_type=hazard_type,
            location=location,
            country=country
        )
        
        # Map sort_by for compatibility
        if sort_by == "relevance":
            sort_field = "date_stamp"  # Default to date when relevance requested
        else:
            sort_field = sort_by
        
        # Build secure query using the available method
        query_builder = ImageQueryBuilder()
        
        # Create filters dict
        filter_dict = {}
        if hazard_type:
            filter_dict['hazard_type'] = hazard_type
        if location:
            filter_dict['location'] = location
        if country:
            filter_dict['country'] = country
            
        # Use the base build_query method
        from models.database import ImageMetadata
        images = query_builder.build_query(
            db=db,
            model=ImageMetadata,
            filters=filter_dict,
            allowed_filters=['hazard_type', 'location', 'country'],
            sort_by=sort_field,
            sort_order=sort_order,
            allowed_sorts=['date_stamp', 'title', 'hazard_type', 'created_at'],
            limit=pagination.limit,
            offset=pagination.offset
        )
        
        # Get total count for pagination
        total_count = db.query(ImageMetadata).count()
        
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
                "country": image.country,
                "latitude": float(image.latitude) if image.latitude else None,
                "longitude": float(image.longitude) if image.longitude else None,
                "upload_date": image.date_stamp.isoformat() + "Z" if image.date_stamp else None,
                "file_size": getattr(image, 'file_size', None),
                "image_hash": getattr(image, 'image_hash', None),
                "thumbnail_url": f"/upload/images/{image.filename}/thumbnail" if image.filename else None,
                "image_url": f"/upload/images/{image.filename}" if image.filename else None
            })
        
        return {
            "images": results,
            "total": total_count,
            "page": (pagination.offset // pagination.limit) + 1,
            "limit": pagination.limit,
            "total_pages": (total_count + pagination.limit - 1) // pagination.limit,
            "has_more": pagination.offset + pagination.limit < total_count,
            "query": search_term
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching images: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error searching images: {str(e)}")

@router.get("/hazards")
async def get_hazards(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get list of all available hazard types. Requires authentication."""
    try:
        # Check permissions
        if "read:metadata" not in current_user.permissions and "read:all" not in current_user.permissions:
            raise HTTPException(
                status_code=403,
                detail="Insufficient permissions to access hazard data"
            )
        
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
async def get_vocabularies(
    request: Request,
    current_user: User = Depends(get_current_user)
):
    """Get vocabularies for metadata fields. Requires authentication."""
    try:
        # Check permissions
        if "read:metadata" not in current_user.permissions and "read:all" not in current_user.permissions:
            raise HTTPException(
                status_code=403,
                detail="Insufficient permissions to access vocabulary data"
            )
        
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
            from core.query_security import validate_bbox
            try:
                bbox_coords = validate_bbox(bbox)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
        
        # Use secure query builder for GeoJSON
        query_builder = ImageQueryBuilder()
        from models.database import ImageMetadata
        
        # Create filters dict
        filter_dict = {}
        if hazard_type:
            filter_dict['hazard_type'] = hazard_type
            
        # Build query with filters and bbox constraint
        query = db.query(ImageMetadata)
        
        # Apply filters
        if filter_dict:
            for key, value in filter_dict.items():
                if hasattr(ImageMetadata, key):
                    query = query.filter(getattr(ImageMetadata, key) == value)
        
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

"""Images API endpoints for listing and browsing images."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_
from typing import List, Optional, Dict, Any
import logging

from models.database import get_db, ImageMetadata
from models.audit_log import AuditLog
from api.schemas.image_schemas import ImageResponse
from api.auth import get_current_user, User
# Simple pagination for basic functionality
from pydantic import BaseModel
from api.services.iso_vocabulary import HAZARD_TYPES
from api.upload import create_audit_log

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

def _escape_ilike(value: str) -> str:
    """Escape special characters for ILIKE patterns."""
    if value is None:
        return value
    return (
        value.replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )

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
            safe_location = _escape_ilike(location)
            query = query.filter(
                ImageMetadata.location.ilike(f"%{safe_location}%", escape='\\')
            )
        if country:
            safe_country = _escape_ilike(country)
            query = query.filter(
                ImageMetadata.country.ilike(f"%{safe_country}%", escape='\\')
            )
        
        # Capture filtered total before pagination
        total_count = query.count()
        
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
            safe_q = _escape_ilike(q)
            search_pattern = f"%{safe_q}%"
            query = query.filter(
                or_(
                    ImageMetadata.title.ilike(search_pattern, escape='\\'),
                    ImageMetadata.abstract.ilike(search_pattern, escape='\\'),
                    ImageMetadata.filename.ilike(search_pattern, escape='\\')
                )
            )
        
        # Apply filters
        if hazard_type:
            query = query.filter(ImageMetadata.hazard_type == hazard_type)
        if location:
            safe_location = _escape_ilike(location)
            query = query.filter(
                ImageMetadata.location.ilike(f"%{safe_location}%", escape='\\')
            )
        if country:
            safe_country = _escape_ilike(country)
            query = query.filter(
                ImageMetadata.country.ilike(f"%{safe_country}%", escape='\\')
            )
        
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
        
        hazard_vocab = []
        for hazard_id, hazard in HAZARD_TYPES.items():
            label = hazard.get("name", {}).get("eng", hazard_id.replace("_", " ").title())
            keywords = hazard.get("keywords", {}).get("eng", [])
            description = ", ".join(keywords[:2]) or "Hazard event"
            hazard_vocab.append({
                "id": hazard_id,
                "label": label,
                "description": description
            })

        hazard_vocab.sort(key=lambda item: item["label"])

        vocabularies = {
            "hazard_types": hazard_vocab,
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


class ImageUpdateRequest(BaseModel):
    """Schema for updating image metadata."""
    title: Optional[str] = None
    description: Optional[str] = None
    hazard_type: Optional[str] = None
    country: Optional[str] = None
    location: Optional[str] = None
    keywords: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_draft: Optional[bool] = False


class ImageHistoryEntry(BaseModel):
    id: int
    field: Optional[str]
    action: str
    old_value: Optional[str]
    new_value: Optional[str]
    changed_at: str
    changed_by: Optional[str]


@router.put("/images/{image_id}")
async def update_image_metadata(
    image_id: str,
    update_data: ImageUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update image metadata with validation and version tracking."""
    try:
        # Find the image
        image = db.query(ImageMetadata).filter(
            ImageMetadata.id == image_id
        ).first()
        
        if not image:
            raise HTTPException(status_code=404, detail="Image not found")
        
        # Track changes for version history
        changes: List[Dict[str, Any]] = []

        def _stringify(value: Optional[Any]) -> Optional[str]:
            if value is None:
                return None
            if isinstance(value, (str, int, float)):
                return str(value)
            return str(value)
        
        # Update fields if provided
        if update_data.title is not None and update_data.title != image.title:
            changes.append({
                "field": "title",
                "old_value": image.title,
                "new_value": update_data.title
            })
            image.title = update_data.title
        
        if update_data.description is not None:
            old_desc = image.abstract if hasattr(image, 'abstract') else None
            if update_data.description != old_desc:
                changes.append({
                    "field": "description",
                    "old_value": old_desc,
                    "new_value": update_data.description
                })
                if hasattr(image, 'abstract'):
                    image.abstract = update_data.description
        
        if update_data.hazard_type is not None:
            # Validate hazard type
            valid_hazards = [h_id for h_id in HAZARD_TYPES.keys()]
            if update_data.hazard_type not in valid_hazards:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid hazard type. Must be one of: {', '.join(valid_hazards)}"
                )
            if update_data.hazard_type != image.hazard_type:
                changes.append({
                    "field": "hazard_type",
                    "old_value": image.hazard_type,
                    "new_value": update_data.hazard_type
                })
                image.hazard_type = update_data.hazard_type
        
        if update_data.country is not None and update_data.country != image.country:
            changes.append({
                "field": "country",
                "old_value": image.country,
                "new_value": update_data.country
            })
            image.country = update_data.country
        
        if update_data.location is not None and update_data.location != image.location:
            changes.append({
                "field": "location",
                "old_value": image.location,
                "new_value": update_data.location
            })
            image.location = update_data.location
        
        if update_data.keywords is not None:
            old_keywords = image.keywords if hasattr(image, 'keywords') else None
            if update_data.keywords != old_keywords:
                changes.append({
                    "field": "keywords",
                    "old_value": old_keywords,
                    "new_value": update_data.keywords
                })
                if hasattr(image, 'keywords'):
                    image.keywords = update_data.keywords
        
        if update_data.latitude is not None:
            # Validate latitude range
            if not -90 <= update_data.latitude <= 90:
                raise HTTPException(
                    status_code=400,
                    detail="Latitude must be between -90 and 90"
                )
            if update_data.latitude != image.latitude:
                changes.append({
                    "field": "latitude",
                    "old_value": str(image.latitude) if image.latitude else None,
                    "new_value": str(update_data.latitude)
                })
                image.latitude = update_data.latitude
        
        if update_data.longitude is not None:
            # Validate longitude range
            if not -180 <= update_data.longitude <= 180:
                raise HTTPException(
                    status_code=400,
                    detail="Longitude must be between -180 and 180"
                )
            if update_data.longitude != image.longitude:
                changes.append({
                    "field": "longitude",
                    "old_value": str(image.longitude) if image.longitude else None,
                    "new_value": str(update_data.longitude)
                })
                image.longitude = update_data.longitude
        
        # Update geometry if coordinates changed
        if update_data.latitude is not None or update_data.longitude is not None:
            lat = update_data.latitude if update_data.latitude is not None else image.latitude
            lng = update_data.longitude if update_data.longitude is not None else image.longitude
            if lat and lng and hasattr(image, 'geometry'):
                from geoalchemy2.elements import WKTElement
                image.geometry = WKTElement(f'POINT({lng} {lat})', srid=4326)
        
        # Mark as draft if requested
        if hasattr(image, 'is_draft'):
            image.is_draft = update_data.is_draft
        
        # Update modified timestamp
        from datetime import datetime
        if hasattr(image, 'updated_at'):
            image.updated_at = datetime.utcnow()
        
        # Commit changes
        try:
            # Record audit logs before commit so they participate in same transaction
            for change in changes:
                create_audit_log(
                    db=db,
                    record_id=str(image.id),
                    action="UPDATE_DRAFT" if update_data.is_draft else "UPDATE",
                    user=current_user,
                    field_name=change["field"],
                    old_value=_stringify(change["old_value"]),
                    new_value=_stringify(change["new_value"]),
                    request=request
                )

            db.commit()
            db.refresh(image)
        except Exception as e:
            db.rollback()
            logger.error(f"Database error updating image {image_id}: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to save changes to database")
        
        # TODO: Store version history in separate table
        # For now, log changes
        if changes:
            logger.info(f"Image {image_id} updated. Changes: {len(changes)} fields modified")
        
        return {
            "success": True,
            "message": "Image metadata updated successfully",
            "image_id": str(image.id),
            "changes": len(changes),
            "is_draft": update_data.is_draft
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating image {image_id}: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating image: {str(e)}")


@router.get("/images/{image_id}/history")
async def get_image_history(
    image_id: str,
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return audit history entries for an image."""
    try:
        logs = (
            db.query(AuditLog)
            .filter(
                AuditLog.table_name == "image_metadata",
                AuditLog.record_id == image_id
            )
            .order_by(AuditLog.timestamp.desc())
            .limit(limit)
            .all()
        )

        history = [
            {
                "id": log.id,
                "field": log.field_name,
                "action": log.action,
                "old_value": log.old_value,
                "new_value": log.new_value,
                "changed_at": log.timestamp.isoformat() if log.timestamp else None,
                "changed_by": log.username or log.user_id,
            }
            for log in logs
        ]

        return {"history": history}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch history for {image_id}: {e}")
        raise HTTPException(status_code=500, detail="Unable to load history for this image")

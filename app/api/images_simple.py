"""
Simple Images API endpoint - Basic functionality for development
"""
import logging
from typing import List, Optional, Dict, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc
from geoalchemy2 import WKTElement

from models.database import get_db, ImageMetadata
from api.auth_rbac import EnhancedUser, get_current_user_enhanced
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()


def _find_image(db: Session, image_id: str) -> Optional[ImageMetadata]:
    """Look up an image by UUID or filename."""
    image = None
    try:
        uuid_value = UUID(image_id)
        image = db.query(ImageMetadata).filter(ImageMetadata.id == uuid_value).first()
    except (ValueError, TypeError, AttributeError):
        pass

    if image:
        return image

    return db.query(ImageMetadata).filter(ImageMetadata.filename == image_id).first()


def _serialize_image(image: ImageMetadata) -> Dict[str, Any]:
    """Format ImageMetadata for API responses."""
    return {
        "id": str(image.id) if hasattr(image, 'id') and image.id else image.filename,
        "filename": image.filename,
        "title": image.title,
        "description": image.abstract if hasattr(image, 'abstract') else None,
        "hazard_type": image.hazard_type,
        "country": image.country,
        "location": image.location,
        "keywords": image.keywords if hasattr(image, 'keywords') and image.keywords else [],
        "latitude": float(image.latitude) if hasattr(image, 'latitude') and image.latitude is not None else None,
        "longitude": float(image.longitude) if hasattr(image, 'longitude') and image.longitude is not None else None,
        "upload_date": image.date_stamp.isoformat() if hasattr(image, 'date_stamp') and image.date_stamp else None,
        "thumbnail_url": f"/upload/images/{image.filename}/thumbnail" if image.filename else None,
        "full_url": f"/upload/images/{image.filename}" if image.filename else None,
        "contact": {
            "organisation_name": getattr(image, 'contact_organisation_name', None),
            "individual_name": getattr(image, 'contact_individual_name', None),
            "email": getattr(image, 'contact_email', None)
        } if hasattr(image, 'point_of_contact') else None
    }


class SimpleImageResponse(BaseModel):
    filename: str
    title: Optional[str] = None
    description: Optional[str] = None
    hazard_type: Optional[str] = None
    country: Optional[str] = None
    location: Optional[str] = None
    date_taken: Optional[str] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    keywords: Optional[List[str]] = None
    coordinates: Optional[Dict[str, Any]] = None
    upload_timestamp: str
    uploaded_by: Optional[str] = None


class ImageUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    hazard_type: Optional[str] = None
    country: Optional[str] = None
    location: Optional[str] = None
    keywords: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_draft: Optional[bool] = False

@router.get("/", response_model=Dict[str, Any])
async def get_images(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=100, description="Number of records to return"),
    hazard_type: Optional[str] = Query(None, description="Filter by hazard type"),
    country: Optional[str] = Query(None, description="Filter by country"),
    db: Session = Depends(get_db)
):
    """Get paginated list of images with optional filtering."""
    try:
        # Build query
        query = db.query(ImageMetadata)
        
        # Apply filters
        if hazard_type:
            query = query.filter(ImageMetadata.hazard_type == hazard_type)
        if country:
            query = query.filter(ImageMetadata.country == country)
        
        # Get total count
        total = query.count()
        
        # Apply pagination and ordering (using date_stamp instead of upload_timestamp)
        images = query.order_by(desc(ImageMetadata.date_stamp)).offset(skip).limit(limit).all()
        
        # Convert to response format
        image_list = []
        for img in images:
            image_data = {
                "filename": img.filename,
                "title": img.title,
                "description": img.abstract,  # Using abstract as description
                "hazard_type": img.hazard_type,
                "country": img.country,
                "location": img.location,
                "date_taken": img.timestamp.isoformat() if img.timestamp else None,
                "file_size": None,  # Not available in current model
                "mime_type": img.format_name,
                "keywords": img.keywords if img.keywords else [],
                "coordinates": {
                    "latitude": img.latitude,
                    "longitude": img.longitude
                } if img.latitude and img.longitude else None,
                "upload_timestamp": img.date_stamp.isoformat() if img.date_stamp else None,
                "uploaded_by": img.point_of_contact
            }
            image_list.append(image_data)
        
        return {
            "images": image_list,
            "total": total,
            "skip": skip,
            "limit": limit,
            "has_next": skip + limit < total,
            "has_previous": skip > 0
        }
        
    except Exception as e:
        logger.error(f"Error fetching images: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch images: {str(e)}")

@router.get("/list", response_model=List[SimpleImageResponse])
async def get_images_list(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=100, description="Number of records to return"),
    hazard_type: Optional[str] = Query(None, description="Filter by hazard type"),
    country: Optional[str] = Query(None, description="Filter by country"),
    db: Session = Depends(get_db)
):
    """Get simple list of images (array format for legacy frontend compatibility)."""
    try:
        # Build query
        query = db.query(ImageMetadata)
        
        # Apply filters
        if hazard_type:
            query = query.filter(ImageMetadata.hazard_type == hazard_type)
        if country:
            query = query.filter(ImageMetadata.country == country)
        
        # Apply pagination and ordering (using date_stamp instead of upload_timestamp)
        images = query.order_by(desc(ImageMetadata.date_stamp)).offset(skip).limit(limit).all()
        
        # Convert to simple array format for frontend compatibility
        image_list = []
        for img in images:
            image_data = {
                "filename": img.filename,
                "title": img.title,
                "description": img.abstract,  # Using abstract as description
                "hazard_type": img.hazard_type,
                "country": img.country,
                "location": img.location,
                "date_taken": img.timestamp.isoformat() if img.timestamp else None,
                "file_size": None,  # Not available in current model
                "mime_type": img.format_name,
                "keywords": img.keywords if img.keywords else [],
                "coordinates": {
                    "latitude": img.latitude,
                    "longitude": img.longitude
                } if img.latitude and img.longitude else None,
                "upload_timestamp": img.date_stamp.isoformat() if img.date_stamp else None,
                "uploaded_by": img.point_of_contact
            }
            image_list.append(image_data)
        
        return image_list  # Return direct array
        
    except Exception as e:
        logger.error(f"Error fetching images list: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch images: {str(e)}")

@router.get("/{image_id}", response_model=Dict[str, Any])
async def get_image_by_id(
    image_id: str,
    db: Session = Depends(get_db)
):
    """Get single image by ID or filename."""
    try:
        image = _find_image(db, image_id)

        if not image:
            raise HTTPException(status_code=404, detail=f"Image with id '{image_id}' not found")

        return _serialize_image(image)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching image {image_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch image: {str(e)}")


@router.put("/{image_id}", response_model=Dict[str, Any])
async def update_image_by_id(
    image_id: str,
    update_data: ImageUpdateRequest,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Update editable fields for an image record."""
    try:
        if "metadata:update" not in current_user.permissions:
            raise HTTPException(
                status_code=403,
                detail="Insufficient permissions to update image metadata"
            )

        image = _find_image(db, image_id)
        if not image:
            raise HTTPException(status_code=404, detail=f"Image with id '{image_id}' not found")

        updated_fields: List[str] = []

        def track_update(field: str, new_value: Optional[Any]) -> None:
            current_value = getattr(image, field, None)
            if current_value != new_value:
                setattr(image, field, new_value)
                updated_fields.append(field)

        if update_data.title is not None:
            track_update("title", update_data.title)

        if update_data.description is not None:
            track_update("abstract", update_data.description)

        if update_data.hazard_type is not None:
            track_update("hazard_type", update_data.hazard_type)

        if update_data.country is not None:
            track_update("country", update_data.country)

        if update_data.location is not None:
            track_update("location", update_data.location)

        if update_data.keywords is not None:
            normalized_keywords = [
                kw.strip() for kw in update_data.keywords.split(",") if kw.strip()
            ]
            current_keywords = image.keywords or []
            if normalized_keywords != current_keywords:
                image.keywords = normalized_keywords
                updated_fields.append("keywords")

        lat = update_data.latitude
        lng = update_data.longitude
        if lat is not None or lng is not None:
            if lat is None or lng is None:
                raise HTTPException(
                    status_code=400,
                    detail="Both latitude and longitude are required to update coordinates"
                )
            image.geometry = WKTElement(f"POINT({lng} {lat})", srid=4326)
            updated_fields.append("geometry")

        if update_data.is_draft is not None and hasattr(image, "is_draft"):
            track_update("is_draft", update_data.is_draft)

        if not updated_fields:
            return {
                "success": True,
                "message": "No changes detected",
                "image": _serialize_image(image)
            }

        db.commit()
        db.refresh(image)

        logger.info(
            "User %s updated image %s fields: %s",
            getattr(current_user, "username", "unknown"),
            image_id,
            ", ".join(updated_fields)
        )

        return {
            "success": True,
            "message": f"Updated {len(updated_fields)} field(s)",
            "updated_fields": updated_fields,
            "image": _serialize_image(image)
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating image {image_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update image: {str(e)}")

@router.get("/search", response_model=Dict[str, Any])
async def search_images(
    q: Optional[str] = Query(None, description="Search query"),
    hazard_type: Optional[str] = Query(None, description="Filter by hazard type"),
    country: Optional[str] = Query(None, description="Filter by country"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=100, description="Number of records to return"),
    sort_by: Optional[str] = Query("upload_date", description="Sort field"),
    sort_order: Optional[str] = Query("desc", description="Sort order: asc or desc"),
    db: Session = Depends(get_db)
):
    """Search images with text query, filters, and sorting."""
    try:
        query = db.query(ImageMetadata)
        
        # Apply filters
        if hazard_type:
            query = query.filter(ImageMetadata.hazard_type == hazard_type)
        if country:
            query = query.filter(ImageMetadata.country == country)
        
        # Apply text search if query provided
        if q:
            from sqlalchemy import or_
            search_pattern = f"%{q}%"
            query = query.filter(
                or_(
                    ImageMetadata.title.ilike(search_pattern),
                    ImageMetadata.abstract.ilike(search_pattern),
                    ImageMetadata.location.ilike(search_pattern),
                    ImageMetadata.hazard_type.ilike(search_pattern)
                )
            )
        
        # Apply sorting
        order_field = ImageMetadata.date_stamp  # Default
        if sort_by == "title":
            order_field = ImageMetadata.title
        elif sort_by == "hazard_type":
            order_field = ImageMetadata.hazard_type
        
        if sort_order == "asc":
            query = query.order_by(asc(order_field))
        else:
            query = query.order_by(desc(order_field))
        
        # Get total count and paginated results
        total = query.count()
        images = query.offset(skip).limit(limit).all()
        
        # Debug logging
        logger.info(f"Search query returned {total} total images, fetched {len(images)} images")
        
        # Convert to response format matching frontend expectations
        image_list = []
        for img in images:
            image_data = {
                "id": str(img.id) if hasattr(img, 'id') else img.filename,
                "filename": img.filename,
                "title": img.title,
                "description": img.abstract if hasattr(img, 'abstract') else None,
                "hazard_type": img.hazard_type,
                "country": img.country,
                "location": img.location,
                "keywords": img.keywords if hasattr(img, 'keywords') else [],
                "latitude": float(img.latitude) if hasattr(img, 'latitude') and img.latitude else None,
                "longitude": float(img.longitude) if hasattr(img, 'longitude') and img.longitude else None,
                "upload_date": img.date_stamp.isoformat() if hasattr(img, 'date_stamp') and img.date_stamp else None,
                "thumbnail_url": f"/upload/images/{img.filename}/thumbnail" if img.filename else None,
                "full_url": f"/upload/images/{img.filename}" if img.filename else None,
                "contact": {
                    "organisation_name": getattr(img, 'contact_organisation_name', None),
                    "individual_name": getattr(img, 'contact_individual_name', None),
                    "email": getattr(img, 'contact_email', None)
                } if hasattr(img, 'point_of_contact') else None
            }
            image_list.append(image_data)
        
        return {
            "images": image_list,
            "total": total,
            "page": (skip // limit) + 1,
            "limit": limit,
            "total_pages": (total + limit - 1) // limit,
            "has_more": skip + limit < total
        }
        
    except Exception as e:
        logger.error(f"Error searching images: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to search images: {str(e)}")

@router.get("/hazards", response_model=Dict[str, Any])
async def get_hazard_types(db: Session = Depends(get_db)):
    """Get available hazard types."""
    try:
        hazards = db.query(ImageMetadata.hazard_type).distinct().filter(
            ImageMetadata.hazard_type.isnot(None)
        ).all()
        
        hazard_list = [hazard[0] for hazard in hazards if hazard[0]]
        
        return {
            "hazards": sorted(hazard_list),
            "count": len(hazard_list)
        }
        
    except Exception as e:
        logger.error(f"Error fetching hazard types: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch hazard types: {str(e)}")

@router.get("/countries", response_model=Dict[str, Any])
async def get_countries(db: Session = Depends(get_db)):
    """Get available countries."""
    try:
        countries = db.query(ImageMetadata.country).distinct().filter(
            ImageMetadata.country.isnot(None)
        ).all()
        
        country_list = [country[0] for country in countries if country[0]]
        
        return {
            "countries": sorted(country_list),
            "count": len(country_list)
        }
        
    except Exception as e:
        logger.error(f"Error fetching countries: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch countries: {str(e)}")

@router.get("/stats", response_model=Dict[str, Any])
async def get_stats(db: Session = Depends(get_db)):
    """Get basic statistics about the image database."""
    try:
        total_images = db.query(ImageMetadata).count()
        
        hazard_counts = {}
        hazards = db.query(ImageMetadata.hazard_type).filter(
            ImageMetadata.hazard_type.isnot(None)
        ).all()
        for hazard in hazards:
            if hazard[0]:
                hazard_counts[hazard[0]] = hazard_counts.get(hazard[0], 0) + 1
        
        country_counts = {}
        countries = db.query(ImageMetadata.country).filter(
            ImageMetadata.country.isnot(None)
        ).all()
        for country in countries:
            if country[0]:
                country_counts[country[0]] = country_counts.get(country[0], 0) + 1
        
        return {
            "total_images": total_images,
            "hazard_types": hazard_counts,
            "countries": country_counts,
            "unique_hazards": len(hazard_counts),
            "unique_countries": len(country_counts)
        }
        
    except Exception as e:
        logger.error(f"Error fetching stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch stats: {str(e)}")

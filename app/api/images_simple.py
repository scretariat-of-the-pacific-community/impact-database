"""
Simple Images API endpoint - Basic functionality for development
"""

import logging
from datetime import datetime, time, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from api.auth_rbac import EnhancedUser, get_current_user_enhanced, get_current_user_optional
from fastapi import APIRouter, Depends, HTTPException, Query
from geoalchemy2 import WKTElement
from models.database import ImageMetadata, VideoMetadata, get_db
from models.review_workflow import ReviewItem, ReviewStatus
from pydantic import BaseModel
from sqlalchemy import asc, case, desc, func, or_
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

router = APIRouter()


def _escape_ilike(value: str) -> str:
    """Escape special characters for ILIKE patterns to prevent SQL injection."""
    if value is None:
        return value
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _parse_date_param(value: Optional[str], clamp: str = "start") -> Optional[datetime]:
    """Parse ISO date strings (YYYY-MM-DD) into datetime boundaries."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        try:
            parsed = datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            return None
    if parsed.tzinfo is None:
        # Treat naive dates as UTC to keep comparisons consistent.
        parsed = parsed.replace(tzinfo=timezone.utc)
    if clamp == "start":
        return datetime.combine(parsed.date(), time.min, tzinfo=parsed.tzinfo)
    return datetime.combine(parsed.date(), time.max, tzinfo=parsed.tzinfo)


def _find_image(db: Session, image_id: str) -> Optional[ImageMetadata]:
    """Look up an image by UUID or filename."""
    image = None
    try:
        uuid_value = UUID(image_id)
        image = db.query(ImageMetadata).filter(ImageMetadata.id == uuid_value).first()
    except (ValueError, TypeError, AttributeError):
        # If image_id is not a valid UUID, silently fall back to filename lookup below
        pass

    if image:
        return image

    return db.query(ImageMetadata).filter(ImageMetadata.filename == image_id).first()


def _serialize_image(image: ImageMetadata) -> Dict[str, Any]:
    """Format ImageMetadata for API responses with full ISO 19115 metadata."""
    # Build contact information
    contact_info = None
    if hasattr(image, "point_of_contact") and image.point_of_contact:
        contact_info = {
            "organisation_name": getattr(image, "contact_organisation_name", None),
            "individual_name": getattr(image, "contact_individual_name", None),
            "role": "pointOfContact",
            "contact_info": (
                {"email": getattr(image, "contact_email", None)}
                if getattr(image, "contact_email", None)
                else None
            ),
        }

    # Build geographic bounding box if coordinates exist
    geographic_element = None
    if (
        hasattr(image, "latitude")
        and image.latitude
        and hasattr(image, "longitude")
        and image.longitude
    ):
        lat = float(image.latitude)
        lon = float(image.longitude)
        geographic_element = {
            "west_bound_longitude": lon,
            "east_bound_longitude": lon,
            "south_bound_latitude": lat,
            "north_bound_latitude": lat,
        }
    elif hasattr(image, "geographic_bounding_box") and image.geographic_bounding_box:
        geographic_element = image.geographic_bounding_box

    return {
        "id": str(image.id) if hasattr(image, "id") and image.id else image.filename,
        "filename": image.filename,
        "title": image.title or "Untitled",
        "abstract": image.abstract if hasattr(image, "abstract") else None,
        "purpose": getattr(image, "purpose", None),
        "hazard_type": image.hazard_type,
        "source_agency": getattr(image, "source", None) or getattr(image, "source_type", None),
        "uploader_id": (
            str(image.uploader_id) if hasattr(image, "uploader_id") and image.uploader_id else None
        ),
        "topic_category": (
            image.topic_category
            if hasattr(image, "topic_category") and image.topic_category
            else ["environment"]
        ),
        "keywords": image.keywords if hasattr(image, "keywords") and image.keywords else [],
        "latitude": (
            float(image.latitude)
            if hasattr(image, "latitude") and image.latitude is not None
            else None
        ),
        "longitude": (
            float(image.longitude)
            if hasattr(image, "longitude") and image.longitude is not None
            else None
        ),
        "geographic_element": geographic_element,
        "upload_date": (
            image.datetime.isoformat() if hasattr(image, "datetime") and image.datetime else None
        ),
        "date_stamp": (
            image.date_stamp.isoformat()
            if hasattr(image, "date_stamp") and image.date_stamp
            else None
        ),
        "thumbnail_url": f"/upload/images/{image.filename}/thumbnail" if image.filename else None,
        "resource_locator": (
            getattr(image, "resource_locator", None) or f"/upload/images/{image.filename}"
            if image.filename
            else None
        ),
        # ISO 19115 metadata fields
        "file_identifier": str(image.id) if hasattr(image, "id") and image.id else None,
        "language": getattr(image, "metadata_language", "eng"),
        "character_set": "UTF-8",
        "hierarchy_level": "dataset",
        "contact": contact_info,
        "spatial_resolution": getattr(image, "spatial_resolution", None),
        "reference_system_info": "EPSG:4326",
        "format_name": getattr(image, "format_name", "JPEG"),
        "format_version": getattr(image, "format_version", None),
        "access_constraints": getattr(image, "access_constraints", None),
        "use_constraints": getattr(image, "use_constraints", None),
        "classification": getattr(image, "security_classification", None),
        "processing_level": None,  # Not in current model
        "file_size": None,  # Not stored in current model
        # Legacy fields for backward compatibility
        "country": image.country,
        "location": image.location,
        "full_url": f"/upload/images/{image.filename}" if image.filename else None,
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
    db: Session = Depends(get_db),
    current_user: Optional[EnhancedUser] = Depends(get_current_user_optional),
):
    """Get paginated list of images with optional filtering."""
    try:
        # Build query with public visibility filter
        query = db.query(ImageMetadata)

        # PUBLIC VISIBILITY: Only show approved images unless user is authenticated
        if not current_user:
            # Public access - show approved images OR images without review items (legacy/development)
            query = query.outerjoin(ReviewItem, ReviewItem.image_id == ImageMetadata.id).filter(
                or_(
                    ReviewItem.status == ReviewStatus.APPROVED.value,
                    ReviewItem.id == None,  # Include images without review items
                )
            )
            logger.debug("Public access - filtering to approved or unreviewed images")
        else:
            # Authenticated user - show all their uploads + approved images
            logger.debug(f"Authenticated access for user {current_user.id}")

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
                "coordinates": (
                    {"latitude": img.latitude, "longitude": img.longitude}
                    if img.latitude and img.longitude
                    else None
                ),
                "upload_timestamp": img.date_stamp.isoformat() if img.date_stamp else None,
                "uploaded_by": img.point_of_contact,
            }
            image_list.append(image_data)

        return {
            "images": image_list,
            "total": total,
            "skip": skip,
            "limit": limit,
            "has_next": skip + limit < total,
            "has_previous": skip > 0,
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
    db: Session = Depends(get_db),
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
                "coordinates": (
                    {"latitude": img.latitude, "longitude": img.longitude}
                    if img.latitude and img.longitude
                    else None
                ),
                "upload_timestamp": img.date_stamp.isoformat() if img.date_stamp else None,
                "uploaded_by": img.point_of_contact,
            }
            image_list.append(image_data)

        return image_list  # Return direct array

    except Exception as e:
        logger.error(f"Error fetching images list: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch images: {str(e)}")


# IMPORTANT: Specific routes must come BEFORE the /{image_id} catch-all route
@router.get("/hazards", response_model=Dict[str, Any])
async def get_hazard_types(db: Session = Depends(get_db)):
    """Get available hazard types."""
    try:
        hazards = (
            db.query(ImageMetadata.hazard_type)
            .distinct()
            .filter(ImageMetadata.hazard_type.isnot(None))
            .all()
        )
        hazard_list = [hazard[0] for hazard in hazards if hazard[0]]
        return {"hazards": sorted(hazard_list), "count": len(hazard_list)}
    except Exception as e:
        logger.error(f"Error fetching hazard types: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch hazard types: {str(e)}")


@router.get("/countries", response_model=Dict[str, Any])
async def get_countries(db: Session = Depends(get_db)):
    """Get available countries."""
    try:
        countries = (
            db.query(ImageMetadata.country)
            .distinct()
            .filter(ImageMetadata.country.isnot(None))
            .all()
        )
        country_list = [country[0] for country in countries if country[0]]
        return {"countries": sorted(country_list), "count": len(country_list)}
    except Exception as e:
        logger.error(f"Error fetching countries: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch countries: {str(e)}")


@router.get("/stats", response_model=Dict[str, Any])
async def get_stats(db: Session = Depends(get_db)):
    """Get basic statistics about the image database."""
    try:
        total_images = db.query(ImageMetadata).count()
        hazard_counts = {}
        hazards = (
            db.query(ImageMetadata.hazard_type).filter(ImageMetadata.hazard_type.isnot(None)).all()
        )
        for hazard in hazards:
            if hazard[0]:
                hazard_counts[hazard[0]] = hazard_counts.get(hazard[0], 0) + 1
        country_counts = {}
        countries = db.query(ImageMetadata.country).filter(ImageMetadata.country.isnot(None)).all()
        for country in countries:
            if country[0]:
                country_counts[country[0]] = country_counts.get(country[0], 0) + 1
        return {
            "total_images": total_images,
            "hazard_types": hazard_counts,
            "countries": country_counts,
            "unique_hazards": len(hazard_counts),
            "unique_countries": len(country_counts),
        }
    except Exception as e:
        logger.error(f"Error fetching stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch stats: {str(e)}")


@router.get("/search", response_model=Dict[str, Any])
async def image_search_compat(
    q: Optional[str] = Query(None, description="Search query"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Compatibility endpoint - image search."""
    try:
        query = db.query(ImageMetadata)
        if q:
            search_term = f"%{q}%"
            query = query.filter(
                or_(
                    ImageMetadata.filename.ilike(search_term),
                    ImageMetadata.caption.ilike(search_term),
                    ImageMetadata.event_name.ilike(search_term),
                )
            )
        total = query.count()
        offset = (page - 1) * page_size
        results = query.offset(offset).limit(page_size).all()
        return {
            "results": [
                {
                    "id": str(img.id),
                    "filename": img.filename,
                    "caption": img.caption,
                    "hazard_type": img.hazard_type,
                    "country": img.country,
                    "created_at": img.created_at.isoformat() if img.created_at else None,
                }
                for img in results
            ],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    except Exception as e:
        logger.error(f"Error in search: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Generic routes AFTER specific routes
@router.get("/{image_id}", response_model=Dict[str, Any])
async def get_image_by_id(image_id: str, db: Session = Depends(get_db)):
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


@router.get("/{image_id}/metadata", response_model=Dict[str, Any])
async def get_image_metadata(image_id: str, db: Session = Depends(get_db)):
    """Get image metadata by ID or filename. Alias for get_image_by_id."""
    return await get_image_by_id(image_id, db)


@router.put("/{image_id}", response_model=Dict[str, Any])
async def update_image_by_id(
    image_id: str,
    update_data: ImageUpdateRequest,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
):
    """Update editable fields for an image record. Only the uploader or an admin can edit."""
    try:
        # Check if user has permission to update metadata
        if "metadata:update" not in current_user.permissions:
            raise HTTPException(
                status_code=403, detail="Insufficient permissions to update image metadata"
            )

        image = _find_image(db, image_id)
        if not image:
            raise HTTPException(status_code=404, detail=f"Image with id '{image_id}' not found")

        # Check if user is the uploader or an admin
        is_admin = current_user.role in ["admin", "superadmin"]
        is_uploader = str(image.uploader_id) == str(current_user.id)

        if not is_admin and not is_uploader:
            raise HTTPException(
                status_code=403,
                detail="Only the image uploader or an administrator can edit this image",
            )

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
                    detail="Both latitude and longitude are required to update coordinates",
                )
            image.geometry = WKTElement(f"POINT({lng} {lat})", srid=4326)
            updated_fields.append("geometry")

        if update_data.is_draft is not None and hasattr(image, "is_draft"):
            track_update("is_draft", update_data.is_draft)

        if not updated_fields:
            return {
                "success": True,
                "message": "No changes detected",
                "image": _serialize_image(image),
            }

        db.commit()
        db.refresh(image)

        logger.info(
            "User %s updated image %s fields: %s",
            getattr(current_user, "username", "unknown"),
            image_id,
            ", ".join(updated_fields),
        )

        return {
            "success": True,
            "message": f"Updated {len(updated_fields)} field(s)",
            "updated_fields": updated_fields,
            "image": _serialize_image(image),
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
    q: Optional[str] = Query(None, max_length=500, description="Search query"),
    hazard_type: Optional[List[str]] = Query(
        None,
        description="Filter by hazard type (repeat to select multiple, comma-separated supported)",
    ),
    country: Optional[str] = Query(None, max_length=100, description="Filter by country"),
    source_agency: Optional[List[str]] = Query(
        None,
        description="Filter by source agency (pass multiple values to match any)",
    ),
    date_from: Optional[str] = Query(
        None, description="Filter results captured on/after this date (YYYY-MM-DD)"
    ),
    date_to: Optional[str] = Query(
        None, description="Filter results captured on/before this date (YYYY-MM-DD)"
    ),
    skip: int = Query(0, ge=0, le=10000, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=100, description="Number of records to return"),
    sort_by: Optional[str] = Query(
        "relevance", description="Sort field: relevance, date, upload_date, title"
    ),
    sort_order: Optional[str] = Query("desc", description="Sort order: asc or desc"),
    db: Session = Depends(get_db),
    current_user: Optional[EnhancedUser] = Depends(get_current_user_optional),
):
    """Search images with text query, filters, and sorting."""
    try:
        query = db.query(ImageMetadata)

        # PUBLIC VISIBILITY: Only show approved images unless user is authenticated
        if not current_user:
            # Public access - show approved images OR images without review items (legacy/development)
            query = query.outerjoin(ReviewItem, ReviewItem.image_id == ImageMetadata.id).filter(
                or_(
                    ReviewItem.status == ReviewStatus.APPROVED.value,
                    ReviewItem.id == None,  # Include images without review items
                )
            )
            logger.debug("Public search - filtering to approved or unreviewed images")
        else:
            logger.debug(f"Authenticated search for user {current_user.id}")

        date_field = (
            ImageMetadata.date_stamp
            if hasattr(ImageMetadata, "date_stamp")
            else ImageMetadata.datetime
        )

        # Hazard filters (support single, repeated, or comma-delimited values)
        hazard_filters: List[str] = []
        if hazard_type:
            for hazard in hazard_type:
                if not hazard:
                    continue
                hazard_filters.extend([h.strip().lower() for h in hazard.split(",") if h.strip()])
        if hazard_filters:
            query = query.filter(func.lower(ImageMetadata.hazard_type).in_(hazard_filters))

        if country:
            safe_country = _escape_ilike(country)
            query = query.filter(ImageMetadata.country.ilike(f"%{safe_country}%", escape="\\"))

        if source_agency:
            normalized_agencies = [
                agency.strip().lower() for agency in source_agency if agency and agency.strip()
            ]
            if normalized_agencies:
                query = query.filter(
                    or_(
                        func.lower(ImageMetadata.source).in_(normalized_agencies),
                        func.lower(ImageMetadata.source_type).in_(normalized_agencies),
                    )
                )

        captured_from = _parse_date_param(date_from, "start")
        captured_to = _parse_date_param(date_to, "end")
        if captured_from:
            query = query.filter(date_field >= captured_from)
        if captured_to:
            query = query.filter(date_field <= captured_to)

        search_pattern = None
        if q:
            safe_q = _escape_ilike(q)
            search_pattern = f"%{safe_q}%"
            query = query.filter(
                or_(
                    ImageMetadata.title.ilike(search_pattern, escape="\\"),
                    ImageMetadata.abstract.ilike(search_pattern, escape="\\"),
                    ImageMetadata.location.ilike(search_pattern, escape="\\"),
                    ImageMetadata.hazard_type.ilike(search_pattern, escape="\\"),
                )
            )

        sort_field = (sort_by or "relevance").lower()
        sort_direction = (sort_order or "desc").lower()
        order_field = date_field
        if sort_field == "title":
            order_field = ImageMetadata.title
        elif sort_field == "hazard_type":
            order_field = ImageMetadata.hazard_type
        elif sort_field == "upload_date":
            order_field = ImageMetadata.datetime
        elif sort_field == "date":
            order_field = date_field

        if sort_field == "relevance" and search_pattern:
            relevance_case = case(
                (ImageMetadata.title.ilike(search_pattern, escape="\\"), 3),
                (ImageMetadata.abstract.ilike(search_pattern, escape="\\"), 2),
                (ImageMetadata.location.ilike(search_pattern, escape="\\"), 1),
                else_=0,
            )
            query = query.order_by(desc(relevance_case), desc(date_field))
        else:
            if sort_direction == "asc":
                query = query.order_by(asc(order_field))
            else:
                query = query.order_by(desc(order_field))

        total = query.count()
        images = query.offset(skip).limit(limit).all()

        logger.info(f"Search query returned {total} total images, fetched {len(images)} images")

        image_list = []
        for img in images:
            image_data = {
                "id": str(img.id) if hasattr(img, "id") else img.filename,
                "filename": img.filename,
                "title": img.title,
                "description": img.abstract if hasattr(img, "abstract") else None,
                "hazard_type": img.hazard_type,
                "country": img.country,
                "location": img.location,
                "keywords": img.keywords if hasattr(img, "keywords") else [],
                "latitude": (
                    float(img.latitude) if hasattr(img, "latitude") and img.latitude else None
                ),
                "longitude": (
                    float(img.longitude) if hasattr(img, "longitude") and img.longitude else None
                ),
                "upload_date": (
                    img.date_stamp.isoformat()
                    if hasattr(img, "date_stamp") and img.date_stamp
                    else None
                ),
                "thumbnail_url": (
                    f"/upload/images/{img.filename}/thumbnail" if img.filename else None
                ),
                "full_url": f"/upload/images/{img.filename}" if img.filename else None,
                "contact": (
                    {
                        "organisation_name": getattr(img, "contact_organisation_name", None),
                        "individual_name": getattr(img, "contact_individual_name", None),
                        "email": getattr(img, "contact_email", None),
                    }
                    if hasattr(img, "point_of_contact")
                    else None
                ),
            }
            image_list.append(image_data)

        return {
            "images": image_list,
            "total": total,
            "page": (skip // limit) + 1,
            "limit": limit,
            "total_pages": (total + limit - 1) // limit,
            "has_more": skip + limit < total,
        }

    except Exception as e:
        logger.error(f"Error searching images: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to search images: {str(e)}")


# Note: hazards, countries, stats, and search routes have been moved earlier in the file
# to avoid being caught by the /{image_id} catch-all route


@router.get("/images/{image_id}/history")
async def get_image_history(
    image_id: str,
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
):
    """Return audit history entries for an image."""
    try:
        if (
            "metadata:read" not in current_user.permissions
            and "audit:view" not in current_user.permissions
        ):
            raise HTTPException(
                status_code=403, detail="Insufficient permissions to view image history"
            )

        from models.audit_log import AuditLog

        logs = (
            db.query(AuditLog)
            .filter(AuditLog.table_name == "image_metadata", AuditLog.record_id == image_id)
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


@router.get("/user/uploads", response_model=List[Dict[str, Any]])
async def get_user_uploads_list(
    db: Session = Depends(get_db), current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Get all uploads for the current authenticated user (images + videos)."""
    try:
        # Query images uploaded by current user (support legacy username identifiers)
        user_identifiers = {current_user.username}
        if hasattr(current_user, "id") and current_user.id:
            user_identifiers.add(str(current_user.id))

        images = (
            db.query(ImageMetadata)
            .filter(ImageMetadata.uploader_id.in_(user_identifiers))
            .order_by(desc(ImageMetadata.datetime))
            .all()
        )
        
        # Query videos uploaded by current user
        videos = (
            db.query(VideoMetadata)
            .filter(VideoMetadata.uploader_id.in_(user_identifiers))
            .order_by(desc(VideoMetadata.created_at))
            .all()
        )

        # Serialize to match frontend UserUpload type
        uploads = []
        
        # Add images
        for img in images:
            uploads.append(
                {
                    "id": str(img.id),
                    "filename": img.filename,
                    "title": img.title or img.filename,
                    "hazard_type": img.hazard_type,
                    "location": img.location or img.country,
                    "uploaded_at": img.datetime.isoformat() if img.datetime else None,
                    "approval_status": getattr(img, "status", "pending_review"),
                    "views": getattr(img, "views", 0),
                    "latitude": float(img.latitude) if img.latitude else None,
                    "longitude": float(img.longitude) if img.longitude else None,
                    "thumbnail_url": f"/upload/images/{img.filename}/thumbnail",
                    "content_type": "image",
                }
            )
        
        # Add videos
        for video in videos:
            uploads.append(
                {
                    "id": str(video.id),
                    "filename": video.filename,
                    "title": video.title or video.original_filename or video.filename,
                    "hazard_type": video.hazard_type,
                    "location": "",  # Videos don't have location field yet
                    "uploaded_at": video.created_at.isoformat() if video.created_at else None,
                    "approval_status": video.status,
                    "views": video.view_count if hasattr(video, "view_count") else 0,
                    "latitude": float(video.latitude) if hasattr(video, "latitude") and video.latitude else None,
                    "longitude": float(video.longitude) if hasattr(video, "longitude") and video.longitude else None,
                    "thumbnail_url": f"/api/video/thumbnail/{video.id}",
                    "content_type": "video",
                    "duration": video.duration,
                }
            )
        
        # Sort by upload date (newest first)
        uploads.sort(key=lambda x: x["uploaded_at"] or "", reverse=True)

        return uploads
    except Exception as e:
        logger.error(f"Error fetching user uploads: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch user uploads: {str(e)}")


@router.get("/content/search")
async def search_all_content(
    q: Optional[str] = Query(None, max_length=500, description="Search query"),
    hazard_type: Optional[List[str]] = Query(None, description="Filter by hazard type"),
    country: Optional[str] = Query(None, max_length=100, description="Filter by country"),
    date_from: Optional[str] = Query(None, description="Filter results captured on/after this date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Filter results captured on/before this date (YYYY-MM-DD)"),
    skip: int = Query(0, ge=0, le=10000, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=100, description="Number of records to return"),
    sort_by: Optional[str] = Query("upload_date", description="Sort field: date, upload_date, title"),
    sort_order: Optional[str] = Query("desc", description="Sort order: asc or desc"),
    db: Session = Depends(get_db),
    current_user: Optional[EnhancedUser] = Depends(get_current_user_optional),
):
    """
    Search ALL content (images + videos) with unified results.
    
    Returns combined list with 'content_type' field to distinguish between 'image' and 'video'.
    """
    from models.database import VideoMetadata
    
    try:
        # Build image query
        image_query = db.query(ImageMetadata)
        
        # PUBLIC VISIBILITY: Only show approved images unless user is authenticated
        if not current_user:
            image_query = image_query.outerjoin(ReviewItem, ReviewItem.image_id == ImageMetadata.id).filter(
                or_(
                    ReviewItem.status == ReviewStatus.APPROVED.value,
                    ReviewItem.id == None,
                )
            )
        
        # Build video query (videos are always visible if uploaded successfully)
        video_query = db.query(VideoMetadata).filter(VideoMetadata.status == "ready")
        
        # Apply filters to both queries
        date_field_image = ImageMetadata.date_stamp if hasattr(ImageMetadata, "date_stamp") else ImageMetadata.datetime
        date_field_video = VideoMetadata.created_at
        
        # Hazard type filter
        if hazard_type:
            hazard_filters = []
            for h in hazard_type:
                if h:
                    hazard_filters.extend([hz.strip().lower() for hz in h.split(",") if hz.strip()])
            if hazard_filters:
                image_query = image_query.filter(func.lower(ImageMetadata.hazard_type).in_(hazard_filters))
                video_query = video_query.filter(func.lower(VideoMetadata.hazard_type).in_(hazard_filters))
        
        # Country filter (only applies to images - videos don't have country field yet)
        if country:
            safe_country = _escape_ilike(country)
            image_query = image_query.filter(ImageMetadata.country.ilike(f"%{safe_country}%", escape="\\"))
            # TODO: Add country field to VideoMetadata or derive from coordinates
        
        # Date filters
        captured_from = _parse_date_param(date_from, "start")
        captured_to = _parse_date_param(date_to, "end")
        if captured_from:
            image_query = image_query.filter(date_field_image >= captured_from)
            video_query = video_query.filter(date_field_video >= captured_from)
        if captured_to:
            image_query = image_query.filter(date_field_image <= captured_to)
            video_query = video_query.filter(date_field_video <= captured_to)
        
        # Text search
        if q:
            safe_q = _escape_ilike(q)
            search_pattern = f"%{safe_q}%"
            image_query = image_query.filter(
                or_(
                    ImageMetadata.title.ilike(search_pattern, escape="\\"),
                    ImageMetadata.abstract.ilike(search_pattern, escape="\\"),
                    ImageMetadata.location.ilike(search_pattern, escape="\\"),
                    ImageMetadata.hazard_type.ilike(search_pattern, escape="\\"),
                )
            )
            video_query = video_query.filter(
                or_(
                    VideoMetadata.title.ilike(search_pattern, escape="\\"),
                    VideoMetadata.abstract.ilike(search_pattern, escape="\\"),
                    VideoMetadata.hazard_type.ilike(search_pattern, escape="\\"),
                )
            )
        
        # Execute queries
        images = image_query.all()
        videos = video_query.all()
        
        # Combine and serialize results
        combined_results = []
        
        for img in images:
            combined_results.append({
                "content_type": "image",
                "id": str(img.id),
                "filename": img.filename,
                "title": img.title,
                "description": img.abstract if hasattr(img, "abstract") else None,
                "hazard_type": img.hazard_type,
                "country": img.country,
                "location": img.location,
                "keywords": img.keywords if hasattr(img, "keywords") else [],
                "latitude": float(img.latitude) if hasattr(img, "latitude") and img.latitude else None,
                "longitude": float(img.longitude) if hasattr(img, "longitude") and img.longitude else None,
                "upload_date": img.datetime.isoformat() if img.datetime else None,
                "captured_date": img.date_stamp.isoformat() if hasattr(img, "date_stamp") and img.date_stamp else None,
                "thumbnail_url": f"/upload/images/{img.filename}/thumbnail",
                "url": f"/upload/images/{img.filename}",
            })
        
        for video in videos:
            combined_results.append({
                "content_type": "video",
                "id": str(video.id),
                "filename": video.filename,
                "title": video.title or "",
                "description": video.abstract or "",
                "hazard_type": video.hazard_type,
                "country": "",  # TODO: Add country field to VideoMetadata
                "location": "",  # TODO: Add location field to VideoMetadata
                "keywords": video.keywords if video.keywords else [],
                "latitude": float(video.latitude) if video.latitude else None,
                "longitude": float(video.longitude) if video.longitude else None,
                "upload_date": video.created_at.isoformat() if video.created_at else None,
                "captured_date": video.created_at.isoformat() if video.created_at else None,  # Use created_at as proxy
                "duration": video.duration,
                "width": video.width,
                "height": video.height,
                "resolution": f"{video.width}x{video.height}" if video.width and video.height else None,
                "thumbnail_url": f"/api/video/thumbnail/{video.id}",
                "url": f"/api/video/file/{video.id}",
            })
        
        # Sort combined results
        sort_key = "upload_date"
        if sort_by == "title":
            sort_key = "title"
        elif sort_by == "date":
            sort_key = "captured_date"
        
        combined_results.sort(
            key=lambda x: x.get(sort_key) or "",
            reverse=(sort_order == "desc")
        )
        
        # Apply pagination
        total = len(combined_results)
        paginated_results = combined_results[skip:skip + limit]
        
        logger.info(f"Content search returned {total} total items ({len(images)} images, {len(videos)} videos), fetched {len(paginated_results)}")
        
        return {
            "total": total,
            "skip": skip,
            "limit": limit,
            "results": paginated_results,
            "stats": {
                "images": len(images),
                "videos": len(videos)
            }
        }
        
    except Exception as e:
        logger.error(f"Error in unified content search: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

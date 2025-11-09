from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Response, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from typing import List, Optional
import json

from models.database import get_db, ImageMetadata
from geoalchemy2.functions import ST_Intersects, ST_MakeEnvelope
from api.schemas.iso_metadata import (
    ISO19115Metadata,
    ResponsibleParty,
    GeographicBoundingBox,
    TopicCategoryCode,
    HazardTypeVocabulary,
    SourceAgencyVocabulary,
    CharacterSetCode,
    ScopeCode,
)
from .services.iso19139_export import metadata_to_iso19139
from .services.iso_vocabulary import (
    create_geographic_bounding_box,
    HAZARD_TYPES,
    ISO_TOPIC_CATEGORIES,
    STATUS_VALUES,
    MAINTENANCE_FREQUENCY,
    CAPTURE_METHODS,
    ACCESS_CONSTRAINTS,
    SECURITY_CLASSIFICATIONS,
    LANGUAGE_CODES
)

router = APIRouter()


@router.get("/metadata/{filename}/xml", response_class=Response, responses={200: {"content": {"application/xml": {}}}})
def get_metadata_xml(filename: str, db: Session = Depends(get_db)) -> Response:
    """Return ISO 19139 XML for the given image metadata."""
    image = db.query(ImageMetadata).filter(ImageMetadata.filename == filename).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    bbox_data = image.geographic_bounding_box or create_geographic_bounding_box(image.latitude, image.longitude)
    if not bbox_data:
        bbox_data = {
            "westBoundLongitude": -180.0,
            "eastBoundLongitude": 180.0,
            "southBoundLatitude": -90.0,
            "northBoundLatitude": 90.0,
        }

    bbox = GeographicBoundingBox(
        west_bound_longitude=bbox_data["westBoundLongitude"],
        east_bound_longitude=bbox_data["eastBoundLongitude"],
        south_bound_latitude=bbox_data["southBoundLatitude"],
        north_bound_latitude=bbox_data["northBoundLatitude"],
    )

    topic_categories = []
    if image.topic_category:
        for cat in image.topic_category:
            if cat in TopicCategoryCode._value2member_map_:
                topic_categories.append(TopicCategoryCode(cat))
    if not topic_categories:
        topic_categories = [TopicCategoryCode.ENVIRONMENT]

    hazard = (
        HazardTypeVocabulary(image.hazard_type)
        if image.hazard_type in HazardTypeVocabulary._value2member_map_
        else HazardTypeVocabulary.OTHER
    )

    iso_meta = ISO19115Metadata(
        file_identifier=image.filename,
        language=image.metadata_language or "en",
        character_set=CharacterSetCode.UTF8,
        hierarchy_level=ScopeCode.DATASET,
        contact=ResponsibleParty(
            individual_name=image.point_of_contact or "Unknown",
            role="pointOfContact",
        ),
        date_stamp=image.metadata_date or datetime.utcnow(),
        title=image.title or image.filename,
        abstract=image.abstract or "",
        purpose=image.purpose,
        topic_category=topic_categories,
        keywords=image.keywords or [],
        hazard_type=hazard,
        source_agency=SourceAgencyVocabulary.USGS,
        cited_responsible_party=[],
        geographic_element=bbox,
        format_name=image.format_name or "JPEG",
        format_version=image.format_version,
    )

    xml_str = metadata_to_iso19139(iso_meta)
    return Response(content=xml_str, media_type="application/xml")


@router.get("/vocabularies")
def get_vocabularies():
    """Return all vocabularies used by the application."""
    return {
        "hazard_types": list(HAZARD_TYPES.keys()),  # Simple array for frontend
        "hazard_types_detailed": HAZARD_TYPES,      # Detailed object for future use
        "topic_categories": ISO_TOPIC_CATEGORIES,
        "status_values": STATUS_VALUES,
        "maintenance_frequency": MAINTENANCE_FREQUENCY,
        "capture_methods": CAPTURE_METHODS,
        "access_constraints": ACCESS_CONSTRAINTS,
        "security_classifications": SECURITY_CLASSIFICATIONS,
        "language_codes": LANGUAGE_CODES
    }


@router.get("/hazards")
def get_hazards(
    type: Optional[str] = Query(None, description="Filter by hazard type"),
    country: Optional[str] = Query(None, description="Filter by country"),
    date: Optional[str] = Query(None, description="Filter by date (YYYY-MM-DD)"),
    status: Optional[List[str]] = Query(default=["approved"], description="Filter by status. Default: approved only"),
    event_id: Optional[str] = Query(None, description="Filter by event ID"),
    from_datetime: Optional[datetime] = Query(None, description="Filter from datetime (ISO8601)"),
    to_datetime: Optional[datetime] = Query(None, description="Filter to datetime (ISO8601)"),
    db: Session = Depends(get_db)
):
    """Get hazard images with optional filters.
    
    By default, only returns approved images for operational use.
    """
    query = db.query(ImageMetadata)
    
    # Status filter (default to approved only)
    if status:
        query = query.filter(ImageMetadata.status.in_(status))
    
    if type:
        query = query.filter(ImageMetadata.hazard_type == type)
    
    if country:
        query = query.filter(ImageMetadata.country == country)
    
    # Event ID filter
    if event_id:
        query = query.filter(ImageMetadata.event_id == event_id)
    
    if date:
        try:
            # Parse date and filter for that day
            from datetime import timedelta
            start_date = datetime.strptime(date, "%Y-%m-%d")
            end_date = start_date + timedelta(days=1)
            query = query.filter(
                and_(
                    ImageMetadata.datetime >= start_date,
                    ImageMetadata.datetime < end_date
                )
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    # Datetime range filters (if date not specified)
    if not date:
        if from_datetime:
            query = query.filter(ImageMetadata.datetime >= from_datetime)
        
        if to_datetime:
            query = query.filter(ImageMetadata.datetime <= to_datetime)
    
    hazards = query.all()
    
    # Format response to match expected structure
    hazards_data = []
    for h in hazards:
        hazards_data.append({
            "id": str(h.id) if hasattr(h, 'id') else h.filename,
            "filename": h.filename,
            "datetime": h.datetime.isoformat() if h.datetime else None,
            "hazard_type": h.hazard_type,
            "event_id": h.event_id,
            "status": h.status,
            "location": h.location,
            "country": h.country,
            "latitude": h.latitude,
            "longitude": h.longitude,
            "data_license": h.data_license,
            "source_type": h.source_type
        })
    
    return {
        "count": len(hazards_data),
        "hazards": hazards_data
    }


@router.get("/images")
def get_images(
    status: Optional[List[str]] = Query(default=["approved"], description="Filter by status (pending_review, approved, rejected). Default: approved only"),
    hazard_type: Optional[List[str]] = Query(None, description="Filter by hazard type(s)"),
    event_id: Optional[str] = Query(None, description="Filter by event ID"),
    from_datetime: Optional[datetime] = Query(None, description="Filter images from this datetime (ISO8601)"),
    to_datetime: Optional[datetime] = Query(None, description="Filter images until this datetime (ISO8601)"),
    bbox: Optional[str] = Query(None, description="Bounding box filter: minx,miny,maxx,maxy (EPSG:4326)"),
    location: Optional[str] = Query(None, description="Filter by location (partial match)"),
    has_coordinates: Optional[bool] = Query(None, description="Filter by presence of coordinates"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    db: Session = Depends(get_db)
):
    """Get all images with comprehensive filtering options.
    
    By default, only returns approved images. Set status parameter to include other statuses.
    Supports filtering by status, hazard type, event, datetime range, and spatial bounding box.
    """
    query = db.query(ImageMetadata)
    
    # Status filter (default to approved only for forecast/operational use)
    if status:
        # Allow querying multiple statuses
        query = query.filter(ImageMetadata.status.in_(status))
    
    # Hazard type filter (supports multiple types)
    if hazard_type:
        query = query.filter(ImageMetadata.hazard_type.in_(hazard_type))
    
    # Event ID filter
    if event_id:
        query = query.filter(ImageMetadata.event_id == event_id)
    
    # Datetime range filters
    if from_datetime:
        query = query.filter(ImageMetadata.datetime >= from_datetime)
    
    if to_datetime:
        query = query.filter(ImageMetadata.datetime <= to_datetime)
    
    # Bounding box filter using PostGIS
    if bbox:
        try:
            coords = [float(x) for x in bbox.split(',')]
            if len(coords) != 4:
                raise ValueError("Bbox must have exactly 4 coordinates")
            minx, miny, maxx, maxy = coords
            
            # Validate coordinate ranges
            if not (-180 <= minx <= 180 and -180 <= maxx <= 180):
                raise ValueError("Longitude must be between -180 and 180")
            if not (-90 <= miny <= 90 and -90 <= maxy <= 90):
                raise ValueError("Latitude must be between -90 and 90")
            if minx >= maxx or miny >= maxy:
                raise ValueError("Invalid bbox: min values must be less than max values")
            
            # Use PostGIS ST_Intersects with bbox
            bbox_geom = ST_MakeEnvelope(minx, miny, maxx, maxy, 4326)
            query = query.filter(ST_Intersects(ImageMetadata.geometry, bbox_geom))
            
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Invalid bbox parameter: {str(e)}")
    
    # Location filter (partial match)
    if location:
        query = query.filter(ImageMetadata.location.ilike(f"%{location}%"))
    
    # Coordinate presence filter
    if has_coordinates is not None:
        if has_coordinates:
            query = query.filter(ImageMetadata.geometry.isnot(None))
        else:
            query = query.filter(ImageMetadata.geometry.is_(None))
    
    # Get total count before pagination
    total_count = query.count()
    
    # Apply pagination
    images = query.offset(offset).limit(limit).all()
    
    # Format response
    images_data = []
    for img in images:
        images_data.append({
            "id": str(img.id) if hasattr(img, 'id') else img.filename,
            "filename": img.filename,
            "datetime": img.datetime.isoformat() if img.datetime else None,
            "hazard_type": img.hazard_type,
            "event_id": img.event_id,
            "status": img.status,
            "location": img.location,
            "country": img.country,
            "latitude": img.latitude,
            "longitude": img.longitude,
            "title": img.title,
            "abstract": img.abstract,
            "resource_locator": img.resource_locator,
            "thumbnail_url": img.thumbnail_url,
            "data_license": img.data_license,
            "source_type": img.source_type,
            "uploader_id": img.uploader_id,
            "positional_accuracy": img.positional_accuracy
        })
    
    return {
        "count": len(images_data),
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "images": images_data
    }


@router.get("/geojson")
def get_geojson(
    status: Optional[List[str]] = Query(default=["approved"], description="Filter by status (pending_review, approved, rejected). Default: approved only"),
    hazard_type: Optional[List[str]] = Query(None, description="Filter by hazard type(s)"),
    event_id: Optional[str] = Query(None, description="Filter by event ID"),
    from_datetime: Optional[datetime] = Query(None, description="Filter images from this datetime (ISO8601)"),
    to_datetime: Optional[datetime] = Query(None, description="Filter images until this datetime (ISO8601)"),
    bbox: Optional[str] = Query(None, description="Bounding box filter: minx,miny,maxx,maxy (EPSG:4326)"),
    limit: int = Query(1000, ge=1, le=10000, description="Maximum number of features"),
    offset: int = Query(0, ge=0, description="Number of features to skip"),
    db: Session = Depends(get_db)
):
    """Get all geolocated images as GeoJSON FeatureCollection.
    
    By default, only returns approved images. Set status parameter to include other statuses.
    Supports filtering by status, hazard type, event, datetime range, and spatial bounding box.
    """
    # Start with images that have geometry
    query = db.query(ImageMetadata).filter(ImageMetadata.geometry.isnot(None))
    
    # Status filter (default to approved only)
    if status:
        query = query.filter(ImageMetadata.status.in_(status))
    
    # Hazard type filter (supports multiple types)
    if hazard_type:
        query = query.filter(ImageMetadata.hazard_type.in_(hazard_type))
    
    # Event ID filter
    if event_id:
        query = query.filter(ImageMetadata.event_id == event_id)
    
    # Datetime range filters
    if from_datetime:
        query = query.filter(ImageMetadata.datetime >= from_datetime)
    
    if to_datetime:
        query = query.filter(ImageMetadata.datetime <= to_datetime)
    
    # Bounding box filter using PostGIS
    if bbox:
        try:
            coords = [float(x) for x in bbox.split(',')]
            if len(coords) != 4:
                raise ValueError("Bbox must have exactly 4 coordinates")
            minx, miny, maxx, maxy = coords
            
            # Validate coordinate ranges
            if not (-180 <= minx <= 180 and -180 <= maxx <= 180):
                raise ValueError("Longitude must be between -180 and 180")
            if not (-90 <= miny <= 90 and -90 <= maxy <= 90):
                raise ValueError("Latitude must be between -90 and 90")
            if minx >= maxx or miny >= maxy:
                raise ValueError("Invalid bbox: min values must be less than max values")
            
            # Use PostGIS ST_Intersects with bbox
            bbox_geom = ST_MakeEnvelope(minx, miny, maxx, maxy, 4326)
            query = query.filter(ST_Intersects(ImageMetadata.geometry, bbox_geom))
            
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Invalid bbox parameter: {str(e)}")
    
    # Get total count before pagination
    total_count = query.count()
    
    # Apply pagination
    images = query.offset(offset).limit(limit).all()
    
    # Build GeoJSON features
    features = []
    for img in images:
        if img.latitude and img.longitude:
            feature = {
                "type": "Feature",
                "id": str(img.id) if hasattr(img, 'id') else img.filename,
                "geometry": {
                    "type": "Point",
                    "coordinates": [float(img.longitude), float(img.latitude)]
                },
                "properties": {
                    "filename": img.filename,
                    "datetime": img.datetime.isoformat() if img.datetime else None,
                    "hazard_type": img.hazard_type,
                    "event_id": img.event_id,
                    "status": img.status,
                    "location": img.location,
                    "country": img.country,
                    "title": img.title or img.filename,
                    "abstract": img.abstract,
                    "resource_locator": img.resource_locator,
                    "thumbnail_url": img.thumbnail_url,
                    "data_license": img.data_license,
                    "source_type": img.source_type,
                    "positional_accuracy": img.positional_accuracy
                }
            }
            features.append(feature)
    
    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "total_features": total_count,
            "returned_features": len(features),
            "limit": limit,
            "offset": offset,
            "has_more": (offset + len(features)) < total_count
        }
    }


@router.get("/health")
async def health_check():
    """Health check endpoint under /api"""
    return {
        "status": "healthy",
        "service": "metadata-api"
    }

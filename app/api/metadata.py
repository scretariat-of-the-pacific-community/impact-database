from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Response, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from typing import List, Optional
import json

from models.database import get_db, ImageMetadata
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
    date: Optional[str] = Query(None, description="Filter by date (YYYY-MM-DD)"),
    country: Optional[str] = Query(None, description="Filter by country"),
    db: Session = Depends(get_db)
):
    """Get hazard images with optional filters."""
    query = db.query(ImageMetadata)
    
    if type:
        query = query.filter(ImageMetadata.hazard_type == type)
    
    if country:
        query = query.filter(ImageMetadata.country == country)
    
    if date:
        try:
            # Parse date and filter for that day
            from datetime import datetime, timedelta
            start_date = datetime.strptime(date, "%Y-%m-%d")
            end_date = start_date + timedelta(days=1)
            query = query.filter(
                and_(
                    ImageMetadata.timestamp >= start_date,
                    ImageMetadata.timestamp < end_date
                )
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    hazards = query.all()
    
    # Format response to match expected structure
    hazards_data = []
    for h in hazards:
        hazards_data.append({
            "filename": h.filename,
            "hazard_type": h.hazard_type,
            "location": h.location,
            "country": h.country,
            "timestamp": h.timestamp.isoformat() if h.timestamp else None,
            "latitude": h.latitude,
            "longitude": h.longitude
        })
    
    return {
        "count": len(hazards_data),
        "hazards": hazards_data
    }


@router.get("/images")
def get_images(
    hazard_type: Optional[str] = Query(None, description="Filter by hazard type"),
    location: Optional[str] = Query(None, description="Filter by location"),
    has_coordinates: Optional[bool] = Query(None, description="Filter by presence of coordinates"),
    db: Session = Depends(get_db)
):
    """Get all images with optional filters."""
    query = db.query(ImageMetadata)
    
    if hazard_type:
        query = query.filter(ImageMetadata.hazard_type == hazard_type)
    
    if location:
        query = query.filter(ImageMetadata.location.ilike(f"%{location}%"))
    
    if has_coordinates is not None:
        if has_coordinates:
            query = query.filter(
                and_(
                    ImageMetadata.latitude.isnot(None),
                    ImageMetadata.longitude.isnot(None)
                )
            )
        else:
            query = query.filter(
                and_(
                    ImageMetadata.latitude.is_(None),
                    ImageMetadata.longitude.is_(None)
                )
            )
    
    images = query.all()
    
    # Format response
    images_data = []
    for img in images:
        images_data.append({
            "filename": img.filename,
            "hazard_type": img.hazard_type,
            "location": img.location,
            "country": img.country,
            "timestamp": img.timestamp.isoformat() if img.timestamp else None,
            "latitude": img.latitude,
            "longitude": img.longitude,
            "title": img.title,
            "abstract": img.abstract,
            "resource_locator": img.resource_locator
        })
    
    return images_data


@router.get("/geojson")
def get_geojson(db: Session = Depends(get_db)):
    """Get all geolocated images as GeoJSON."""
    # Get all images with coordinates
    images = db.query(ImageMetadata).filter(
        and_(
            ImageMetadata.latitude.isnot(None),
            ImageMetadata.longitude.isnot(None)
        )
    ).all()
    
    features = []
    for img in images:
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [float(img.longitude), float(img.latitude)]
            },
            "properties": {
                "filename": img.filename,
                "hazard_type": img.hazard_type,
                "location": img.location,
                "country": img.country,
                "timestamp": img.timestamp.isoformat() if img.timestamp else None,
                "title": img.title or img.filename
            }
        }
        features.append(feature)
    
    return {
        "type": "FeatureCollection",
        "features": features
    }


@router.get("/health")
async def health_check():
    """Health check endpoint under /api"""
    return {
        "status": "healthy",
        "service": "metadata-api"
    }

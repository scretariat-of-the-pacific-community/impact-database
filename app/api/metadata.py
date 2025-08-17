from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

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
from .services.iso_vocabulary import create_geographic_bounding_box

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

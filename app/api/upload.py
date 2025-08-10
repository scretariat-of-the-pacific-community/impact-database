from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import create_engine, or_, inspect, text
from typing import Optional, Dict, Any
import os
import shutil
from datetime import datetime, timedelta
import json
import sys
from jsonschema import ValidationError

from api.auth import get_current_user, User

# Add the app directory to Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import ImageMetadata, Base
from api.services.exif_utils import extract_gps_from_exif
from api.services.metadata_validation import validate_metadata

# Import ISO vocabulary if available
try:
    from api.services.iso_vocabulary import (
        HAZARD_TYPES,
        STATUS_VALUES,
        MAINTENANCE_FREQUENCY,
        CAPTURE_METHODS,
        ACCESS_CONSTRAINTS,
        SECURITY_CLASSIFICATIONS,
        LANGUAGE_CODES,
    )
    ISO_ENABLED = True
except ImportError:
    # Fallback if ISO vocabulary not available
    HAZARD_TYPES = {
        "cyclone": {"keywords": ["tropical cyclone"], "topic_categories": ["environment"]},
        "flood": {"keywords": ["flooding"], "topic_categories": ["environment"]},
        "drought": {"keywords": ["drought"], "topic_categories": ["environment"]},
        "landslide": {"keywords": ["landslide"], "topic_categories": ["environment"]},
        "tsunami": {"keywords": ["tsunami"], "topic_categories": ["environment"]},
        "earthquake": {"keywords": ["earthquake"], "topic_categories": ["environment"]},
        "volcano": {"keywords": ["volcano"], "topic_categories": ["environment"]},
        "wildfire": {"keywords": ["wildfire"], "topic_categories": ["environment"]}
    }
    STATUS_VALUES = ["Completed", "Ongoing", "Planned"]
    MAINTENANCE_FREQUENCY = ["AsNeeded", "Monthly", "Annually"]
    CAPTURE_METHODS = ["Mobile phone camera", "Digital camera", "Drone/UAV"]
    ACCESS_CONSTRAINTS = ["Public", "Restricted"]
    SECURITY_CLASSIFICATIONS = ["Unclassified", "Restricted"]
    LANGUAGE_CODES = ["eng"]
    ISO_ENABLED = False

router = APIRouter()

# Database setup
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://impactuser:impactpass@db:5432/impactdb")
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)

# Ensure the "country" column exists; add it if missing
with engine.begin() as conn:
    inspector = inspect(conn)
    if "image_metadata" in inspector.get_table_names():
        cols = [c["name"] for c in inspector.get_columns("image_metadata")]
        if "country" not in cols:
            conn.execute(text("ALTER TABLE image_metadata ADD COLUMN country VARCHAR"))

Base.metadata.create_all(bind=engine)

def get_db():
    from sqlalchemy.orm import sessionmaker
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

@router.get("/vocabularies")
async def get_vocabularies():
    """Return controlled vocabularies for hazard types and ISO fields"""
    return {
        "hazard_types": list(HAZARD_TYPES.keys()),
        "status_values": STATUS_VALUES,
        "maintenance_frequency": MAINTENANCE_FREQUENCY,
        "capture_methods": CAPTURE_METHODS,
        "access_constraints": ACCESS_CONSTRAINTS,
        "security_classifications": SECURITY_CLASSIFICATIONS,
        "language_codes": LANGUAGE_CODES,
        "iso_enabled": ISO_ENABLED,
    }

@router.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    hazard_type: str = Form(...),
    location: str = Form(...),
    country: Optional[str] = Form(None),
    manual_latitude: Optional[float] = Form(None),
    manual_longitude: Optional[float] = Form(None),
    title: Optional[str] = Form(None),
    title_i18n: Optional[str] = Form(None),
    abstract: Optional[str] = Form(None),
    abstract_i18n: Optional[str] = Form(None),
    purpose: Optional[str] = Form(None),
    purpose_i18n: Optional[str] = Form(None),
    keywords: Optional[str] = Form(None),
    keywords_i18n: Optional[str] = Form(None),
    metadata_language: str = Form("eng"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Upload image with metadata"""
    
    # Validate hazard type
    if hazard_type not in HAZARD_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid hazard type. Must be one of: {list(HAZARD_TYPES.keys())}")
    
    # Validate coordinates if provided
    if manual_latitude is not None:
        if not (-90 <= manual_latitude <= 90):
            raise HTTPException(status_code=400, detail="Latitude must be between -90 and 90")
    
    if manual_longitude is not None:
        if not (-180 <= manual_longitude <= 180):
            raise HTTPException(status_code=400, detail="Longitude must be between -180 and 180")
    
    # Check if file already exists
    existing_image = db.query(ImageMetadata).filter(ImageMetadata.filename == file.filename).first()
    if existing_image:
        raise HTTPException(status_code=400, detail=f"Image {file.filename} already exists")
    
    # Save file
    file_path = f"/app/uploads/{file.filename}"
    os.makedirs("/app/uploads", exist_ok=True)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Extract EXIF data
    exif_data = extract_gps_from_exif(file_path)

    # Use manual coordinates if provided, otherwise use EXIF
    final_latitude = manual_latitude if manual_latitude is not None else exif_data.get("latitude")
    final_longitude = manual_longitude if manual_longitude is not None else exif_data.get("longitude")

    def parse_json_field(value: Optional[str], field_name: str) -> Optional[Any]:
        """Parse a JSON string field, raising HTTPException on failure."""
        if value is None:
            return None
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail=f"Invalid JSON for {field_name}")

    def merge_i18n(default_val: Optional[Any], translations: Optional[Dict[str, Any]], lang: str) -> Optional[Dict[str, Any]]:
        translations = translations or {}
        if default_val is not None:
            translations[lang] = default_val
        return translations or None

    keywords_list = parse_json_field(keywords, "keywords")
    title_trans = parse_json_field(title_i18n, "title_i18n")
    abstract_trans = parse_json_field(abstract_i18n, "abstract_i18n")
    purpose_trans = parse_json_field(purpose_i18n, "purpose_i18n")
    keywords_trans = parse_json_field(keywords_i18n, "keywords_i18n")

    title_trans = merge_i18n(title, title_trans, metadata_language)
    abstract_trans = merge_i18n(abstract, abstract_trans, metadata_language)
    purpose_trans = merge_i18n(purpose, purpose_trans, metadata_language)
    keywords_trans = merge_i18n(keywords_list, keywords_trans, metadata_language)

    metadata = {
        "filename": file.filename,
        "hazard_type": hazard_type,
        "location": location,
        "timestamp": exif_data.get("timestamp").isoformat() if exif_data.get("timestamp") else datetime.utcnow().isoformat(),
        "title": title,
        "title_i18n": title_trans,
        "abstract": abstract,
        "abstract_i18n": abstract_trans,
        "purpose": purpose,
        "purpose_i18n": purpose_trans,
        "keywords": keywords_list,
        "keywords_i18n": keywords_trans,
        "metadata_language": metadata_language,
    }

    try:
        validate_metadata(metadata)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=e.message)

    # Create database record
    image_metadata = ImageMetadata(
        filename=file.filename,
        hazard_type=hazard_type,
        location=location,
        country=country,
        timestamp=exif_data.get("timestamp"),
        latitude=final_latitude,
        longitude=final_longitude,
        title=title,
        title_i18n=title_trans,
        abstract=abstract,
        abstract_i18n=abstract_trans,
        purpose=purpose,
        purpose_i18n=purpose_trans,
        keywords=keywords_list,
        keywords_i18n=keywords_trans,
        metadata_language=metadata_language,
    )
    
    db.add(image_metadata)
    db.commit()
    db.refresh(image_metadata)
    
    response_data = image_metadata.to_dict()
    response_data.update(
        {
            "message": "Image uploaded successfully",
            "exif_extracted": bool(exif_data),
            "coordinates_source": "manual" if manual_latitude is not None else "exif" if final_latitude else "none",
        }
    )
    return response_data


@router.get("/hazards")
async def list_hazards(
    hazard_type: Optional[str] = Query(None, alias="type"),
    date: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """List hazards with optional filtering by type, date, and country."""
    query = db.query(ImageMetadata)

    if hazard_type:
        query = query.filter(ImageMetadata.hazard_type == hazard_type)

    if country:
        query = query.filter(ImageMetadata.country == country)

    if date:
        try:
            start_date = datetime.strptime(date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Expected YYYY-MM-DD")
        end_date = start_date + timedelta(days=1)
        query = query.filter(ImageMetadata.timestamp >= start_date, ImageMetadata.timestamp < end_date)

    hazards = query.all()
    return {"count": len(hazards), "hazards": [h.to_dict() for h in hazards]}

@router.get("/images")
async def list_images(
    hazard_type: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    has_coordinates: Optional[bool] = Query(None),
    db: Session = Depends(get_db)
):
    """List images with filtering options"""
    query = db.query(ImageMetadata)
    
    if hazard_type:
        query = query.filter(ImageMetadata.hazard_type == hazard_type)
    
    if location:
        query = query.filter(ImageMetadata.location.ilike(f"%{location}%"))
    
    if has_coordinates is not None:
        if has_coordinates:
            query = query.filter(
                ImageMetadata.latitude.isnot(None),
                ImageMetadata.longitude.isnot(None)
            )
        else:
            query = query.filter(
                or_(ImageMetadata.latitude.is_(None), ImageMetadata.longitude.is_(None))
            )

    images = query.all()
    return {
        "count": len(images),
        "images": [img.to_dict() for img in images],
    }


@router.get("/geojson")
async def get_geojson(db: Session = Depends(get_db)):
    """Return image metadata as GeoJSON FeatureCollection for entries with coordinates."""
    images = db.query(ImageMetadata).filter(
        ImageMetadata.latitude.isnot(None),
        ImageMetadata.longitude.isnot(None)
    ).all()

    features = []
    for img in images:
        props = img.to_dict()
        props.pop("latitude", None)
        props.pop("longitude", None)
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [img.longitude, img.latitude],
                },
                "properties": props,
            }
        )

    return {"type": "FeatureCollection", "features": features}


@router.get("/images/{filename}")
async def get_image(filename: str, db: Session = Depends(get_db)):
    img = db.query(ImageMetadata).filter(ImageMetadata.filename == filename).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    return img.to_dict()

@router.get("/statistics")
async def get_statistics(db: Session = Depends(get_db)):
    """Get database statistics"""
    total_images = db.query(ImageMetadata).count()
    images_with_coords = db.query(ImageMetadata).filter(
        ImageMetadata.latitude.isnot(None),
        ImageMetadata.longitude.isnot(None)
    ).count()
    
    # Count by hazard type
    hazard_counts = {}
    for hazard in HAZARD_TYPES.keys():
        count = db.query(ImageMetadata).filter(ImageMetadata.hazard_type == hazard).count()
        hazard_counts[hazard] = count
    
    return {
        "total_images": total_images,
        "images_with_coordinates": images_with_coords,
        "coordinate_coverage": f"{(images_with_coords/total_images*100):.1f}%" if total_images > 0 else "0%",
        "hazard_type_distribution": hazard_counts,
        "iso_compliance": "ISO 19115:2003 compatible" if ISO_ENABLED else "Basic metadata only"
    }

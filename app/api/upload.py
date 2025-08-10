from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import create_engine, or_
from typing import Optional, List
import os
import shutil
from datetime import datetime
import json
import sys
from jsonschema import ValidationError

# Add the app directory to Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import ImageMetadata, Base
from api.services.exif_utils import extract_gps_from_exif
from api.services.metadata_validation import validate_metadata

# Import ISO vocabulary if available
try:
    from api.services.iso_vocabulary import (
        HAZARD_TYPES, STATUS_VALUES, MAINTENANCE_FREQUENCY, 
        CAPTURE_METHODS, ACCESS_CONSTRAINTS, SECURITY_CLASSIFICATIONS
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
    ISO_ENABLED = False

router = APIRouter()

# Database setup
DATABASE_URL = "postgresql://impactuser:impactpass@db:5432/impactdb"
engine = create_engine(DATABASE_URL)
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
        "iso_enabled": ISO_ENABLED
    }

@router.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    hazard_type: str = Form(...),
    location: str = Form(...),
    manual_latitude: Optional[float] = Form(None),
    manual_longitude: Optional[float] = Form(None),
    db: Session = Depends(get_db)
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

    metadata = {
        "filename": file.filename,
        "hazard_type": hazard_type,
        "location": location,
        "timestamp": exif_data.get("timestamp").isoformat() if exif_data.get("timestamp") else datetime.utcnow().isoformat(),
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
        timestamp=exif_data.get("timestamp"),
        latitude=final_latitude,
        longitude=final_longitude
    )
    
    db.add(image_metadata)
    db.commit()
    db.refresh(image_metadata)
    
    return {
        "message": "Image uploaded successfully",
        "filename": file.filename,
        "hazard_type": hazard_type,
        "location": location,
        "latitude": final_latitude,
        "longitude": final_longitude,
        "timestamp": exif_data.get("timestamp").isoformat() if exif_data.get("timestamp") else None,
        "exif_extracted": bool(exif_data),
        "coordinates_source": "manual" if manual_latitude is not None else "exif" if final_latitude else "none"
    }

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
        "images": [
            {
                "filename": img.filename,
                "hazard_type": img.hazard_type,
                "location": img.location,
                "latitude": img.latitude,
                "longitude": img.longitude,
                "timestamp": img.timestamp.isoformat() if img.timestamp else None
            }
            for img in images
        ]
    }

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

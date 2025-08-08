from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from uuid import uuid4
import os
import boto3
from io import BytesIO
from typing import Optional

from api.services.exif_utils import extract_exif_metadata
from models.database import get_db, ImageMetadata

router = APIRouter()

MINIO_ENDPOINT = "minio:9000"
MINIO_ACCESS_KEY = "admin"
MINIO_SECRET_KEY = "password123"
MINIO_BUCKET = "hazards"

s3 = boto3.client(
    "s3",
    endpoint_url=f"http://{MINIO_ENDPOINT}",
    aws_access_key_id=MINIO_ACCESS_KEY,
    aws_secret_access_key=MINIO_SECRET_KEY
)

# Ensure bucket exists
try:
    s3.head_bucket(Bucket=MINIO_BUCKET)
except:
    s3.create_bucket(Bucket=MINIO_BUCKET)

@router.post("/images/")
async def upload_image(
    file: UploadFile = File(...),
    hazard_type: str = Form(...),
    location: str = Form(...),
    latitude: Optional[float] = Form(None, description="Manual latitude input (overrides EXIF)"),
    longitude: Optional[float] = Form(None, description="Manual longitude input (overrides EXIF)"),
    timestamp: Optional[str] = Form(None, description="Manual timestamp (YYYY-MM-DD HH:MM:SS)"),
    db: Session = Depends(get_db)
):
    """
    Upload an image with hazard metadata.
    
    - **file**: Image file to upload
    - **hazard_type**: Type of hazard (flood, earthquake, etc.)
    - **location**: Location description
    - **latitude**: Manual latitude coordinate (optional, overrides EXIF)
    - **longitude**: Manual longitude coordinate (optional, overrides EXIF)
    - **timestamp**: Manual timestamp (optional, overrides EXIF)
    """
    try:
        # Read file content
        file_content = await file.read()
        
        # Generate unique filename
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
        unique_filename = f"{uuid4()}.{file_extension}"
        
        # Extract EXIF metadata
        exif_data = extract_exif_metadata(BytesIO(file_content))
        
        # Use manual coordinates if provided, otherwise use EXIF data
        final_latitude = latitude if latitude is not None else exif_data.get('latitude')
        final_longitude = longitude if longitude is not None else exif_data.get('longitude')
        final_timestamp = timestamp if timestamp is not None else exif_data.get('timestamp')
        
        # Validate coordinate ranges if provided
        if final_latitude is not None and not (-90 <= final_latitude <= 90):
            raise HTTPException(status_code=400, detail="Latitude must be between -90 and 90")
        if final_longitude is not None and not (-180 <= final_longitude <= 180):
            raise HTTPException(status_code=400, detail="Longitude must be between -180 and 180")
        
        # Upload to MinIO
        s3.put_object(
            Bucket=MINIO_BUCKET,
            Key=unique_filename,
            Body=file_content,
            ContentType=file.content_type or 'image/jpeg'
        )
        
        # Save metadata to database
        image_metadata = ImageMetadata(
            filename=unique_filename,
            hazard_type=hazard_type,
            location=location,
            timestamp=final_timestamp,
            latitude=final_latitude,
            longitude=final_longitude
        )
        
        db.add(image_metadata)
        db.commit()
        db.refresh(image_metadata)
        
        # Prepare response metadata
        response_metadata = {
            "hazard_type": hazard_type,
            "location": location,
            "timestamp": final_timestamp,
            "latitude": final_latitude,
            "longitude": final_longitude,
            "coordinate_source": "manual" if latitude is not None or longitude is not None else "exif" if final_latitude or final_longitude else "none"
        }
        
        return JSONResponse(
            status_code=200,
            content={
                "message": "Upload successful",
                "filename": unique_filename,
                "metadata": response_metadata
            }
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@router.get("/images/")
async def list_images(
    hazard_type: Optional[str] = None,
    has_coordinates: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    """
    List uploaded images with optional filtering.
    
    - **hazard_type**: Filter by hazard type
    - **has_coordinates**: Filter by presence of coordinates (true/false)
    """
    query = db.query(ImageMetadata)
    
    if hazard_type:
        query = query.filter(ImageMetadata.hazard_type == hazard_type)
    
    if has_coordinates is not None:
        if has_coordinates:
            query = query.filter(
                ImageMetadata.latitude.isnot(None),
                ImageMetadata.longitude.isnot(None)
            )
        else:
            query = query.filter(
                (ImageMetadata.latitude.is_(None)) | 
                (ImageMetadata.longitude.is_(None))
            )
    
    images = query.all()
    
    return {
        "total": len(images),
        "images": [
            {
                "filename": img.filename,
                "hazard_type": img.hazard_type,
                "location": img.location,
                "timestamp": img.timestamp,
                "latitude": img.latitude,
                "longitude": img.longitude,
                "has_coordinates": img.latitude is not None and img.longitude is not None
            }
            for img in images
        ]
    }

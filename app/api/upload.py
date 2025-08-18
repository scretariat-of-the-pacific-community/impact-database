from fastapi import APIRouter, HTTPException, UploadFile, File, Form, status, Depends, Path
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
import shutil
import tempfile
import logging
import io
from datetime import datetime
from typing import Optional, Any, Dict
import json

from services.exif_utils import extract_exif_data, get_image_hash
from services.metadata_validation import validate_metadata
from services.minio_client import get_minio_storage
from services.local_storage import get_local_storage
from models.database import get_db, ImageMetadata
from sqlalchemy.orm import Session
from workers.tasks import process_upload, cleanup_failed_uploads, generate_thumbnail
from api.schemas.image_schemas import ImageMetadataUpdate, ImageResponse, DeleteResponse, UpdateResponse
from core.config import settings
from api.auth import get_current_user
from geoalchemy2 import WKTElement

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_storage_client():
    """Get storage client - try MinIO first, fallback to local storage."""
    try:
        minio_client = get_minio_storage()
        # Test MinIO connection by trying to ensure bucket exists
        minio_client._ensure_bucket_exists()
        logger.info("Using MinIO storage")
        return minio_client
    except Exception as e:
        logger.warning(f"MinIO not available ({e}), falling back to local storage")
        return get_local_storage()

router = APIRouter()

@router.put("/images/{filename}", response_model=UpdateResponse)
async def update_image_metadata(
    filename: str = Path(..., description="Image filename to update"),
    metadata_update: ImageMetadataUpdate = ...,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update metadata fields for an existing image"""
    try:
        # First, check if the image exists
        image = db.query(ImageMetadata).filter(ImageMetadata.filename == filename).first()
        
        if not image:
            raise HTTPException(
                status_code=404,
                detail=f"Image with filename '{filename}' not found"
            )
        
        # Track changes for logging
        updated_fields = []
        
        # Update fields if provided in the request
        update_data = metadata_update.dict(exclude_unset=True)
        
        for field, value in update_data.items():
            if hasattr(image, field):
                old_value = getattr(image, field)
                if old_value != value:
                    setattr(image, field, value)
                    updated_fields.append(field)
        
        if not updated_fields:
            return UpdateResponse(
                success=True,
                message="No changes detected",
                updated_fields=[]
            )
        
        # Commit the changes
        db.commit()
        db.refresh(image)
        
        logging.info(f"Updated metadata for {filename}. Fields changed: {updated_fields}")
        
        return UpdateResponse(
            success=True,
            message=f"Successfully updated {len(updated_fields)} field(s)",
            updated_fields=updated_fields
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error updating metadata for {filename}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update metadata: {str(e)}"
        )

@router.get("/images/{filename}", response_model=ImageResponse)
async def get_image_metadata(
    filename: str = Path(..., description="Image filename to retrieve"),
    db: Session = Depends(get_db)
):
    """Get metadata for a specific image"""
    try:
        image = db.query(ImageMetadata).filter(ImageMetadata.filename == filename).first()
        
        if not image:
            raise HTTPException(
                status_code=404,
                detail=f"Image with filename '{filename}' not found"
            )
        
        return ImageResponse(
            success=True,
            filename=image.filename,
            metadata=image.to_dict()
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error retrieving metadata for {filename}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve metadata: {str(e)}"
        )

@router.delete("/images/{filename}", response_model=DeleteResponse)
async def delete_image(
    filename: str = Path(..., description="Image filename to delete"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete an image and its associated MinIO object"""
    try:
        # First, get the image details
        image = db.query(ImageMetadata).filter(ImageMetadata.filename == filename).first()
        
        if not image:
            raise HTTPException(
                status_code=404,
                detail=f"Image with filename '{filename}' not found"
            )
        
        # Delete from MinIO first
        try:
            object_key = f"images/{filename}"
            minio_client = get_minio_storage()
            minio_client.delete_object(object_key)
            logger.info(f"Deleted object from MinIO: {object_key}")
            
            # Also try to delete thumbnail if it exists
            if image.thumbnail_key:
                try:
                    minio_client.delete_object(image.thumbnail_key)
                    logger.info(f"Deleted thumbnail from MinIO: {image.thumbnail_key}")
                except Exception as e:
                    logger.warning(f"Could not delete thumbnail {image.thumbnail_key}: {e}")
                
        except Exception as e:
            logger.error(f"Failed to delete object from MinIO: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to delete file from storage: {str(e)}"
            )
        
        # Delete from database
        db.delete(image)
        db.commit()
        
        logger.info(f"Deleted image record from database: {filename}")
        
        return DeleteResponse(
            success=True,
            message=f"Successfully deleted image '{filename}'"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete image: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete image: {str(e)}"
        )

@router.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    hazard_type: str = Form(...),
    location: str = Form(...),
    country: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload an image with metadata"""
    try:
        # Basic validation
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")
        
        # Check if file already exists
        existing = db.query(ImageMetadata).filter(ImageMetadata.filename == file.filename).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Image {file.filename} already exists")
        
        # Read file content
        content = await file.read()
        
        # Extract EXIF data
        exif_data = extract_exif_data(io.BytesIO(content))
        
        # Create object key
        object_key = f"images/{file.filename}"
        
        # Upload to MinIO
        minio_client = get_minio_storage()
        minio_client.upload_object(object_key, io.BytesIO(content), len(content))
        
        # Create metadata record
        geom = None
        lat = exif_data.get('latitude')
        lon = exif_data.get('longitude')
        if lat is not None and lon is not None:
            geom = WKTElement(f'POINT({lon} {lat})', srid=4326)
        image_metadata = ImageMetadata(
            filename=file.filename,
            hazard_type=hazard_type,
            location=location,
            country=country,
            geometry=geom,
            timestamp=exif_data.get('datetime'),
            resource_locator=f"images/{file.filename}"
        )
        
        db.add(image_metadata)
        db.commit()
        db.refresh(image_metadata)
        
        logger.info(f"Successfully uploaded image: {file.filename}")
        
        return {
            "success": True,
            "message": f"Successfully uploaded {file.filename}",
            "filename": file.filename
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to upload image: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload image: {str(e)}"
        )

@router.post("/regenerate-thumbnail/{filename}")
async def regenerate_thumbnail(
    filename: str = Path(..., description="Image filename for thumbnail regeneration"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Regenerate thumbnail for an existing image"""
    try:
        image = db.query(ImageMetadata).filter(ImageMetadata.filename == filename).first()
        
        if not image:
            raise HTTPException(
                status_code=404,
                detail=f"Image with filename '{filename}' not found"
            )
        
        # Queue thumbnail generation task
        task = generate_thumbnail.delay(filename)
        
        return {
            "success": True,
            "message": f"Thumbnail generation queued for {filename}",
            "task_id": task.id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to queue thumbnail generation: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to queue thumbnail generation: {str(e)}"
        )

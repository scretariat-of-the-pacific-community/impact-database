from fastapi import APIRouter, HTTPException, UploadFile, File, Form, status, Depends, Path, Request
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
import shutil
import tempfile
import logging
import io
from datetime import datetime, timezone
from typing import Optional, Any, Dict
import json
from enum import Enum
from pydantic import BaseModel, validator, Field, root_validator, ValidationError

from services.exif_utils import extract_exif_data, get_image_hash
from services.metadata_validation import validate_metadata
from services.minio_client import get_minio_storage
from services.local_storage import get_local_storage
from models.database import get_db, ImageMetadata
from models.audit_log import AuditLog
from sqlalchemy.orm import Session
from workers.tasks import process_upload, cleanup_failed_uploads, generate_thumbnail
from api.schemas.image_schemas import ImageMetadataUpdate, ImageResponse, DeleteResponse, UpdateResponse, StatusEnum
from core.config import settings
from api.auth import get_current_user, User
from geoalchemy2 import WKTElement

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Admin user list (in production, this should come from a database)
ADMIN_USERS = ["admin", "johndoe", "dev_user"]  # Add admin usernames here

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

class HazardType(str, Enum):
    flood = "flood"
    cyclone = "cyclone"
    tsunami = "tsunami"
    landslide = "landslide"
    other = "other"

class SourceType(str, Enum):
    citizen = "citizen"
    official = "official"
    other = "other"

class GeometryModel(BaseModel):
    type: str = Field(..., pattern="^Point$")
    coordinates: list[float]

    @validator('coordinates')
    def validate_coordinates(cls, v):
        if len(v) != 2:
            raise ValueError("Coordinates must be a list of two floats [lon, lat]")
        lon, lat = v
        if not (-180 <= lon <= 180):
            raise ValueError("Longitude must be between -180 and 180")
        if not (-90 <= lat <= 90):
            raise ValueError("Latitude must be between -90 and 90")
        return v

class ImageUploadRequest(BaseModel):
    filename: str
    datetime: datetime
    hazard_type: HazardType
    event_id: Optional[str] = None
    geometry: Optional[GeometryModel] = None
    data_license: str = "https://creativecommons.org/licenses/by/4.0/"
    source_type: SourceType
    positional_accuracy: Optional[float] = None

    @validator('datetime', pre=True)
    def ensure_utc(cls, v):
        if isinstance(v, str):
            try:
                dt = datetime.fromisoformat(v.replace('Z', '+00:00'))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt.astimezone(timezone.utc)
            except ValueError:
                raise ValueError("Invalid ISO8601 datetime format")
        if isinstance(v, datetime):
            if v.tzinfo is None:
                return v.replace(tzinfo=timezone.utc)
            return v.astimezone(timezone.utc)
        return v

    @root_validator(pre=True)
    def check_geometry(cls, values):
        """Handle both lat/lon pairs and GeoJSON geometry formats"""
        if 'geometry' in values and ('lat' in values or 'lon' in values):
            raise ValueError("Provide either 'geometry' or 'lat'/'lon', not both.")
        if 'lat' in values and 'lon' in values:
            lon, lat = values.pop('lon'), values.pop('lat')
            if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                raise ValueError("Invalid coordinates.")
            values['geometry'] = {'type': 'Point', 'coordinates': [lon, lat]}
        return values

router = APIRouter()

def is_admin(user: User) -> bool:
    """Check if user is an admin"""
    return user.username in ADMIN_USERS

def create_audit_log(
    db: Session,
    record_id: str,
    action: str,
    user: User,
    change_summary: Optional[Dict] = None,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
    field_name: Optional[str] = None,
    review_notes: Optional[str] = None,
    request: Optional[Request] = None
):
    """Create an audit log entry"""
    audit_entry = AuditLog(
        table_name="image_metadata",
        record_id=record_id,
        action=action,
        field_name=field_name,
        old_value=old_value,
        new_value=new_value,
        change_summary=change_summary,
        user_id=user.username,  # In production, use user.id
        username=user.username,
        review_notes=review_notes,
        ip_address=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        api_endpoint=request.url.path if request else None
    )
    db.add(audit_entry)
    return audit_entry

@router.get("/images/{filename}")
async def serve_image(filename: str):
    """Serve uploaded image files"""
    # Define the upload directory path (absolute path within container)
    upload_dir = "/app/uploads"  
    file_path = os.path.join(upload_dir, filename)
    
    # Check if file exists
    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=404,
            detail=f"Image '{filename}' not found"
        )
    
    # Determine media type based on file extension
    _, ext = os.path.splitext(filename.lower())
    media_type_map = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg', 
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
    }
    media_type = media_type_map.get(ext, 'image/jpeg')
    
    # Return the file
    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=filename
    )

@router.get("/images/{filename}/thumbnail")
async def serve_image_thumbnail(filename: str):
    """Serve thumbnail versions of uploaded images"""
    # Define the upload directory path for thumbnails
    upload_dir = "/app/uploads"
    thumbnail_name = f"thumb_{filename}"
    file_path = os.path.join(upload_dir, thumbnail_name)
    
    # If thumbnail doesn't exist, serve the original image
    if not os.path.exists(file_path):
        return await serve_image(filename)
    
    # Return the thumbnail
    return FileResponse(
        path=file_path,
        media_type="image/jpeg",
        filename=thumbnail_name
    )

@router.put("/images/{filename}", response_model=UpdateResponse)
async def update_image_metadata(
    filename: str = Path(..., description="Image filename to update"),
    metadata_update: ImageMetadataUpdate = ...,
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update metadata fields for an existing image with audit logging and permission checks"""
    try:
        # First, check if the image exists
        image = db.query(ImageMetadata).filter(ImageMetadata.filename == filename).first()
        
        if not image:
            raise HTTPException(
                status_code=404,
                detail=f"Image with filename '{filename}' not found"
            )
        
        # Check ownership and permissions
        user_is_admin = is_admin(current_user)
        user_is_owner = image.uploader_id == current_user.username
        
        # Permission checks
        update_data = metadata_update.dict(exclude_unset=True)
        
        # Only admins can change status
        if 'status' in update_data:
            if not user_is_admin:
                raise HTTPException(
                    status_code=403,
                    detail="Only administrators can change the review status"
                )
        
        # Only admins can add review_notes
        review_notes = update_data.pop('review_notes', None)
        if review_notes and not user_is_admin:
            raise HTTPException(
                status_code=403,
                detail="Only administrators can add review notes"
            )
        
        # Normal users can only edit their own pending_review images
        if not user_is_admin:
            if not user_is_owner:
                raise HTTPException(
                    status_code=403,
                    detail="You can only edit your own images"
                )
            if image.status not in ['pending_review', None]:
                raise HTTPException(
                    status_code=403,
                    detail="You can only edit images that are pending review"
                )
        
        # Track changes for logging
        updated_fields = []
        change_summary = {}
        critical_fields = ['status', 'hazard_type', 'geometry', 'datetime', 'event_id']
        
        # Update fields if provided in the request
        for field, value in update_data.items():
            if hasattr(image, field):
                old_value = getattr(image, field)
                
                # Skip if no change
                if old_value == value:
                    continue
                
                # Handle special conversions
                if field == 'status' and isinstance(value, StatusEnum):
                    value = value.value
                
                # Track change
                updated_fields.append(field)
                
                # Store old and new values for critical fields
                if field in critical_fields:
                    change_summary[field] = {
                        'old': str(old_value) if old_value is not None else None,
                        'new': str(value) if value is not None else None
                    }
                
                # Apply the change
                setattr(image, field, value)
        
        if not updated_fields:
            return UpdateResponse(
                success=True,
                message="No changes detected",
                updated_fields=[]
            )
        
        # Determine action type for audit log
        action = "STATUS_CHANGE" if 'status' in updated_fields else "UPDATE"
        
        # Create audit log entry
        create_audit_log(
            db=db,
            record_id=str(image.id) if hasattr(image, 'id') else image.filename,
            action=action,
            user=current_user,
            change_summary=change_summary if change_summary else {
                'fields_updated': updated_fields
            },
            review_notes=review_notes,
            request=request
        )
        
        # Commit the changes
        db.commit()
        db.refresh(image)
        
        logger.info(
            f"User {current_user.username} updated metadata for {filename}. "
            f"Fields changed: {updated_fields}. Action: {action}"
        )
        
        return UpdateResponse(
            success=True,
            message=f"Successfully updated {len(updated_fields)} field(s)",
            updated_fields=updated_fields
        )
    
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating metadata for {filename}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update metadata: {str(e)}"
        )
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error updating metadata for {filename}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update metadata: {str(e)}"
        )

@router.get("/images/{filename}/metadata", response_model=ImageResponse)
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
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete an image and its associated MinIO object with audit logging"""
    try:
        # First, get the image details
        image = db.query(ImageMetadata).filter(ImageMetadata.filename == filename).first()
        
        if not image:
            raise HTTPException(
                status_code=404,
                detail=f"Image with filename '{filename}' not found"
            )
        
        # Check permissions
        user_is_admin = is_admin(current_user)
        user_is_owner = image.uploader_id == current_user.username
        
        if not user_is_admin and not user_is_owner:
            raise HTTPException(
                status_code=403,
                detail="You can only delete your own images"
            )
        
        # Only allow deletion of pending_review images by non-admins
        if not user_is_admin and image.status not in ['pending_review', None]:
            raise HTTPException(
                status_code=403,
                detail="You can only delete images that are pending review"
            )
        
        # Create audit log before deletion
        record_id = str(image.id) if hasattr(image, 'id') else image.filename
        create_audit_log(
            db=db,
            record_id=record_id,
            action="DELETE",
            user=current_user,
            change_summary={
                'filename': image.filename,
                'hazard_type': image.hazard_type,
                'status': image.status
            },
            request=request
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
        
        logger.info(f"User {current_user.username} deleted image: {filename}")
        
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
    metadata_json: str = Form(...),
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload an image with metadata and audit logging"""
    try:
        try:
            metadata_dict = json.loads(metadata_json)
            upload_data = ImageUploadRequest(**metadata_dict)
        except (json.JSONDecodeError, ValidationError) as e:
            raise HTTPException(status_code=400, detail=f"Invalid metadata: {e}")

        # Basic validation
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")

        # Check if file already exists
        existing = db.query(ImageMetadata).filter(ImageMetadata.filename == file.filename).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Image {file.filename} already exists")

        content = await file.read()

        # Extract EXIF data, but prioritize user-provided metadata
        exif_data = extract_exif_data(io.BytesIO(content))

        object_key = f"images/{file.filename}"

        minio_client = get_minio_storage()
        minio_client.upload_object(object_key, io.BytesIO(content), len(content))

        # Extract geometry from validated upload data OR fall back to EXIF GPS
        geom = None
        if upload_data.geometry is not None:
            # User provided coordinates - use those (highest priority)
            lon, lat = upload_data.geometry.coordinates
            geom = WKTElement(f'POINT({lon} {lat})', srid=4326)
        elif 'latitude' in exif_data and 'longitude' in exif_data:
            # No user coordinates, but image has GPS EXIF - use those
            lat = exif_data['latitude']
            lon = exif_data['longitude']
            geom = WKTElement(f'POINT({lon} {lat})', srid=4326)
            logger.info(f"Using GPS coordinates from EXIF: ({lat}, {lon})")

        image_metadata = ImageMetadata(
            filename=file.filename,
            datetime=upload_data.datetime,
            hazard_type=upload_data.hazard_type.value,
            event_id=upload_data.event_id,
            status='pending_review',
            data_license=upload_data.data_license,
            source_type=upload_data.source_type.value,
            uploader_id=current_user.username,
            positional_accuracy=upload_data.positional_accuracy,
            geometry=geom,
            resource_locator=object_key
        )

        db.add(image_metadata)
        db.flush()  # Get the ID before commit
        
        # Create audit log for upload
        create_audit_log(
            db=db,
            record_id=str(image_metadata.id) if hasattr(image_metadata, 'id') else image_metadata.filename,
            action="CREATE",
            user=current_user,
            change_summary={
                'filename': file.filename,
                'hazard_type': upload_data.hazard_type.value,
                'event_id': upload_data.event_id,
                'status': 'pending_review'
            },
            request=request
        )
        
        db.commit()
        db.refresh(image_metadata)

        logger.info(f"User {current_user.username} uploaded image: {file.filename}")

        return {
            "success": True,
            "message": f"Successfully uploaded {file.filename}",
            "filename": file.filename,
            "id": str(image_metadata.id) if hasattr(image_metadata, 'id') else None
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to upload image: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload image: {str(e)}"
        )

@router.post("/regenerate-thumbnail/{filename}")
async def regenerate_thumbnail(
    filename: str = Path(..., description="Image filename for thumbnail regeneration"),
    current_user: User = Depends(get_current_user),
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

# Audit Log Endpoints
@router.get("/audit-logs/{record_id}")
async def get_audit_logs_for_image(
    record_id: str = Path(..., description="Image ID or filename"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get audit log entries for a specific image"""
    # Anyone can view audit logs for images they have access to
    # Admins can view all audit logs
    
    logs = db.query(AuditLog).filter(
        AuditLog.record_id == record_id,
        AuditLog.table_name == "image_metadata"
    ).order_by(AuditLog.timestamp.desc()).all()
    
    return {
        "record_id": record_id,
        "audit_logs": [log.to_dict() for log in logs]
    }

@router.get("/audit-logs")
async def get_all_audit_logs(
    action: Optional[str] = None,
    user_id: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get audit logs with filtering (admin only for all logs)"""
    # Only admins can view all audit logs
    if not is_admin(current_user):
        # Non-admins can only see their own actions
        user_id = current_user.username
    
    query = db.query(AuditLog).filter(AuditLog.table_name == "image_metadata")
    
    if action:
        query = query.filter(AuditLog.action == action)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    
    logs = query.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit).all()
    
    return {
        "total": query.count(),
        "audit_logs": [log.to_dict() for log in logs]
    }

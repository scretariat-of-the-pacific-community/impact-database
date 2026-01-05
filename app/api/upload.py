from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, Request
from fastapi import Path as ApiPath
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
import shutil
import tempfile
import logging
import io
import imghdr
from pathlib import Path as FilePath
from datetime import datetime, timezone
from typing import Optional, Dict, List
import json
from enum import Enum
from pydantic import BaseModel, validator, Field, root_validator, ValidationError

from services.exif_utils import extract_exif_data, get_image_hash
from services.achievement_service import achievement_service
from services.metadata_validation import validate_metadata
from services.minio_client import get_minio_storage
from services.local_storage import get_local_storage
from models.database import get_db, ImageMetadata
from models.audit_log import AuditLog
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError, OperationalError
from workers.tasks import process_upload, cleanup_failed_uploads, generate_thumbnail
from api.schemas.image_schemas import ImageMetadataUpdate, ImageResponse, DeleteResponse, UpdateResponse, StatusEnum
from core.config import settings
from api.auth import get_current_user, User
from geoalchemy2 import WKTElement
from api.services.iso_vocabulary import generate_iso_title, generate_iso_abstract

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ALLOWED_CONTENT_TYPES = {
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/tiff',
    'image/bmp',
    'image/avif',
    'image/heic',
    'image/heif'
}

IMGHDR_TYPE_TO_MIME = {
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'tiff': 'image/tiff',
    'bmp': 'image/bmp',
    'webp': 'image/webp'
}

ALLOWED_EXTENSIONS = {
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp', '.avif', '.heic', '.heif'
}

AVIF_BRANDS = {b'avif', b'av01', b'mif1', b'msf1'}
HEIC_BRANDS = {b'heic', b'heix', b'hevc', b'hevx', b'heim', b'heis', b'hevm', b'hevs', b'hvc1', b'hvce'}
HEIF_BRANDS = {b'heif', b'heio', b'heof', b'hif1'}

def _humanize_filename(filename: str) -> str:
    """Generate a readable fallback title from a filename."""
    stem = FilePath(filename).stem.replace('_', ' ').replace('-', ' ').strip()
    if not stem:
        return "Untitled upload"
    return " ".join(word.capitalize() for word in stem.split())

async def _read_upload_with_limit(upload_file: UploadFile, max_bytes: int, chunk_size: int = 5 * 1024 * 1024) -> bytes:
    """Read upload in chunks enforcing maximum size. Chunk size is configurable (default 5MB)."""
    data = bytearray()
    while True:
        chunk = await upload_file.read(chunk_size)
        if not chunk:
            break
        data.extend(chunk)
        if len(data) > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds {max_bytes // (1024 * 1024)}MB limit"
            )
    return bytes(data)

def _detect_mime_from_bytes(content: bytes) -> Optional[str]:
    """Detect MIME type using magic bytes (supports avif/heic/heif)."""
    if not content:
        return None
    
    # Check for JPEG first (all variants: JFIF, EXIF, ICC Profile, etc.)
    # JPEG always starts with FFD8 and ends with FFD9
    if len(content) >= 2 and content[0:2] == b'\xff\xd8':
        return 'image/jpeg'
    
    # Try standard imghdr detection for other formats
    detected = imghdr.what(None, h=content[:32])
    if detected:
        mime = IMGHDR_TYPE_TO_MIME.get(detected)
        if mime:
            return mime
    
    # Detect ISO-BMFF based formats (avif/heic/heif)
    if len(content) >= 12 and content[4:8] == b'ftyp':
        brand = content[8:12]
        if brand in AVIF_BRANDS:
            return 'image/avif'
        if brand in HEIC_BRANDS:
            return 'image/heic'
        if brand in HEIF_BRANDS:
            return 'image/heif'
    return None

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
    drought = "drought"
    landslide = "landslide"
    earthquake = "earthquake"
    wildfire = "wildfire"
    volcanic = "volcanic"
    coastal_erosion = "coastal_erosion"
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
        if len(v) not in [2, 3]:
            raise ValueError("Coordinates must be [lon, lat] or [lon, lat, altitude]")
        lon, lat = v[0], v[1]
        if not (-180 <= lon <= 180):
            raise ValueError("Longitude must be between -180 and 180")
        if not (-90 <= lat <= 90):
            raise ValueError("Latitude must be between -90 and 90")
        # Optional altitude (3rd coordinate)
        if len(v) == 3:
            alt = v[2]
            if not (-500 <= alt <= 10000):  # Reasonable altitude range in meters
                raise ValueError("Altitude must be between -500m and 10000m")
        return v

class ImageUploadRequest(BaseModel):
    filename: str
    datetime: datetime
    hazard_type: HazardType
    event_id: Optional[str] = None
    geometry: Optional[GeometryModel] = None
    altitude: Optional[float] = None  # Manual altitude override (meters)
    altitude_ref: Optional[int] = Field(default=0, ge=0, le=1)  # 0=above, 1=below sea level
    data_license: str = "https://creativecommons.org/licenses/by/4.0/"
    source_type: SourceType
    positional_accuracy: Optional[float] = None
    title: Optional[str] = None
    abstract: Optional[str] = None
    location: Optional[str] = None
    country: Optional[str] = None
    keywords: Optional[List[str]] = None

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

    @validator('keywords', pre=True)
    def normalize_keywords(cls, value):
        if value is None or value == "":
            return None
        if isinstance(value, str):
            value = [value]
        if isinstance(value, list):
            cleaned = [str(item).strip() for item in value if str(item).strip()]
            return cleaned or None
        raise ValueError("Invalid keywords format")

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

def _get_user_identifier(user: User) -> str:
    """Return a stable identifier for the user (UUID when available)."""
    if not user:
        return ""
    return str(getattr(user, "id", None) or user.username)

def is_admin(user: User, db: Session) -> bool:
    """Check if user has the admin role via RBAC."""
    if not user or not user.username:
        return False
    try:
        from models.rbac import User as DBUser
        db_user = db.query(DBUser).filter(DBUser.username == user.username).first()
        if db_user and db_user.has_role("admin"):
            return True
    except (AttributeError, ImportError) as exc:
        logger.error(f"CRITICAL: RBAC security check failed for {user.username}: {exc}")
    except Exception as exc:
        logger.error(f"CRITICAL: Unexpected error in admin check for {user.username}: {exc}")
    return False

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
        user_id=_get_user_identifier(user),
        username=user.username,
        review_notes=review_notes,
        ip_address=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        api_endpoint=request.url.path if request else None
    )
    db.add(audit_entry)
    return audit_entry

@router.get("/images/{filename}")
async def serve_image(filename: str, download: bool = False):
    """Serve uploaded image files from MinIO or local storage
    
    Args:
        filename: The image filename
        download: If True, forces download with Content-Disposition: attachment
    """
    from fastapi.responses import StreamingResponse
    from io import BytesIO
    
    # SECURITY: Validate and sanitize filename
    if not filename or '..' in filename or '/' in filename or '\\\\' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    # Validate file extension
    allowed_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.tif'}
    _, ext = os.path.splitext(filename.lower())
    if ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"Invalid file extension: {ext}")
    
    safe_filename = os.path.basename(filename)
    
    # Determine media type
    media_type_map = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png', '.gif': 'image/gif',
        '.webp': 'image/webp', '.tiff': 'image/tiff', '.tif': 'image/tiff'
    }
    media_type = media_type_map.get(ext, 'image/jpeg')
    
    # Determine Content-Disposition based on download parameter
    disposition = "attachment" if download else "inline"
    
    # Try MinIO first
    try:
        minio_storage = get_minio_storage()
        minio_client = minio_storage._get_client()
        object_key = f"images/{safe_filename}"
        
        # Get object from MinIO
        response = minio_client.get_object('impact-images', object_key)
        data = response.read()
        response.close()
        response.release_conn()
        
        # SECURITY: Add security headers to prevent content-type attacks
        streaming_response = StreamingResponse(BytesIO(data), media_type=media_type)
        streaming_response.headers["Content-Disposition"] = f"{disposition}; filename={safe_filename}"
        streaming_response.headers["X-Content-Type-Options"] = "nosniff"
        streaming_response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return streaming_response
    except Exception as e:
        logger.warning(f"MinIO fetch failed for {safe_filename}: {e}")
        
        # Fallback to local storage
        upload_dir = "/app/uploads"
        file_path = os.path.join(upload_dir, safe_filename)
        real_upload_dir = os.path.realpath(upload_dir)
        real_file_path = os.path.realpath(file_path)
        
        if not real_file_path.startswith(real_upload_dir):
            raise HTTPException(status_code=400, detail="Invalid file path")
        
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"Image not found: {safe_filename}")
        
        # For FileResponse, we need to set headers manually for download
        response = FileResponse(path=file_path, media_type=media_type, filename=safe_filename)
        if download:
            response.headers["Content-Disposition"] = f"attachment; filename={safe_filename}"
        return response

@router.get("/images/{filename}/thumbnail")
async def serve_image_thumbnail(filename: str):
    """Serve thumbnail from MinIO or generate on-the-fly"""
    from fastapi.responses import StreamingResponse
    from io import BytesIO
    from PIL import Image
    
    # SECURITY: Validate filename
    if not filename or '..' in filename or '/' in filename or '\\' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    allowed_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.tif'}
    _, ext = os.path.splitext(filename.lower())
    if ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"Invalid file extension: {ext}")
    
    safe_filename = os.path.basename(filename)
    
    # Try MinIO thumbnail first
    try:
        minio_storage = get_minio_storage()
        minio_client = minio_storage._get_client()
        thumb_key = f"thumbnails/thumb_{safe_filename}"
        
        try:
            # Try to get existing thumbnail
            response = minio_client.get_object('impact-images', thumb_key)
            data = response.read()
            response.close()
            response.release_conn()
            
            # SECURITY: Add security headers
            thumb_response = StreamingResponse(BytesIO(data), media_type="image/jpeg")
            thumb_response.headers["Content-Disposition"] = f"inline; filename=thumb_{safe_filename}"
            thumb_response.headers["X-Content-Type-Options"] = "nosniff"
            thumb_response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            return thumb_response
        except:
            # Generate thumbnail on-the-fly
            object_key = f"images/{safe_filename}"
            response = minio_client.get_object('impact-images', object_key)
            image_data = response.read()
            response.close()
            response.release_conn()
            
            # Create thumbnail
            img = Image.open(BytesIO(image_data))
            img.thumbnail((300, 300), Image.Resampling.LANCZOS)
            
            # Convert to JPEG
            thumb_io = BytesIO()
            if img.mode in ('RGBA', 'LA', 'P'):
                img = img.convert('RGB')
            img.save(thumb_io, 'JPEG', quality=85)
            thumb_io.seek(0)
            
            # Save to MinIO for future requests
            try:
                minio_client.put_object(
                    'impact-images',
                    thumb_key,
                    thumb_io,
                    length=thumb_io.getbuffer().nbytes,
                    content_type='image/jpeg'
                )
                thumb_io.seek(0)
            except Exception as e:
                logger.warning(f"Failed to save thumbnail to MinIO: {e}")
                thumb_io.seek(0)
            
            # SECURITY: Add security headers to generated thumbnail
            gen_thumb_response = StreamingResponse(thumb_io, media_type="image/jpeg")
            gen_thumb_response.headers["Content-Disposition"] = f"inline; filename=thumb_{safe_filename}"
            gen_thumb_response.headers["X-Content-Type-Options"] = "nosniff"
            gen_thumb_response.headers["Cache-Control"] = "public, max-age=86400"
            return gen_thumb_response
            
    except Exception as e:
        logger.error(f"Thumbnail generation failed for {safe_filename}: {e}")
        # Fallback to serving original image
        return await serve_image(safe_filename)

@router.put("/images/{filename}", response_model=UpdateResponse)
async def update_image_metadata(
    filename: str = ApiPath(..., description="Image filename to update"),
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
        user_is_admin = is_admin(current_user, db)
        user_identifier = _get_user_identifier(current_user)
        user_is_owner = (
            str(image.uploader_id) == user_identifier
            or image.uploader_id == current_user.username
        )
        
        # Debug logging for permission checks
        logger.info(
            f"Permission check for {filename}: "
            f"user_id={user_identifier}, username={current_user.username}, "
            f"uploader_id={image.uploader_id}, is_admin={user_is_admin}, "
            f"is_owner={user_is_owner}, status={image.status}"
        )
        
        # Permission checks
        update_data = metadata_update.dict(exclude_unset=True)
        
        # Only admins can change status
        if 'status' in update_data:
            if not user_is_admin:
                logger.warning(f"403: Non-admin user {user_identifier} tried to change status")
                raise HTTPException(
                    status_code=403,
                    detail="Only administrators can change the review status"
                )
        
        # Only admins can add review_notes
        review_notes = update_data.pop('review_notes', None)
        if review_notes and not user_is_admin:
            logger.warning(f"403: Non-admin user {user_identifier} tried to add review notes")
            raise HTTPException(
                status_code=403,
                detail="Only administrators can add review notes"
            )
        
        # Normal users can only edit their own pending_review images
        if not user_is_admin:
            if not user_is_owner:
                logger.warning(
                    f"403: User {user_identifier} tried to edit image owned by {image.uploader_id}"
                )
                raise HTTPException(
                    status_code=403,
                    detail="You can only edit your own images"
                )
            if image.status not in ['pending_review', None]:
                logger.warning(
                    f"403: User {user_identifier} tried to edit {image.status} image (not pending_review)"
                )
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
    filename: str = ApiPath(..., description="Image filename to retrieve"),
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
    filename: str = ApiPath(..., description="Image filename to delete"),
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
        user_is_admin = is_admin(current_user, db)
        user_identifier = _get_user_identifier(current_user)
        user_is_owner = (
            str(image.uploader_id) == user_identifier
            or image.uploader_id == current_user.username
        )
        
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
    newly_unlocked_achievements = []
    try:
        # SECURITY: Rate limiting - 10 uploads per hour per user
        from api.auth import check_rate_limit
        client_ip = request.client.host if request else "unknown"
        user_id = _get_user_identifier(current_user)
        
        # Rate limit by user ID and IP address
        check_rate_limit(f"upload:{user_id}")
        check_rate_limit(f"upload_ip:{client_ip}")
        
        try:
            metadata_dict = json.loads(metadata_json)
            upload_data = ImageUploadRequest(**metadata_dict)
        except (json.JSONDecodeError, ValidationError) as e:
            raise HTTPException(status_code=400, detail=f"Invalid metadata: {e}")

        # Basic validation
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")

        # SECURITY: Generate unique filename to prevent collision/overwrite attacks
        import uuid
        original_filename = file.filename
        sanitized_name = os.path.basename(original_filename).replace(' ', '_')
        unique_filename = f"{uuid.uuid4().hex[:12]}_{sanitized_name}"
        
        # Check if file already exists (should be impossible with UUID, but double-check)
        existing = db.query(ImageMetadata).filter(ImageMetadata.filename == unique_filename).first()
        if existing:
            # This should never happen with UUIDs, but handle gracefully
            unique_filename = f"{uuid.uuid4().hex[:12]}_{sanitized_name}"

        # Validate extension
        extension = FilePath(unique_filename).suffix.lower()
        if extension not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file extension '{extension}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
            )

        # Validate declared content type
        declared_content_type = (file.content_type or "").lower()
        if declared_content_type not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported content type '{declared_content_type or 'unknown'}'"
            )

        max_file_size = settings.MAX_FILE_SIZE
        content = await _read_upload_with_limit(file, max_file_size)
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")

        detected_mime = _detect_mime_from_bytes(content)
        if not detected_mime:
            logger.error(
                "Could not detect MIME type for %s (declared: %s, size: %d bytes, first 32 bytes: %s)",
                file.filename,
                declared_content_type,
                len(content),
                content[:32].hex() if len(content) >= 32 else content.hex()
            )
            raise HTTPException(
                status_code=400,
                detail=f"File is not a supported image type. Declared type: {declared_content_type}, filename: {file.filename}"
            )
        if detected_mime != declared_content_type:
            logger.warning(
                "Declared content-type %s does not match detected %s for %s",
                declared_content_type,
                detected_mime,
                file.filename
            )
            raise HTTPException(
                status_code=400,
                detail="Content type mismatch between headers and file bytes"
            )

        # Extract EXIF data, but prioritize user-provided metadata
        exif_data = extract_exif_data(io.BytesIO(content))
        logger.info(f"EXIF extraction result for {unique_filename}: {list(exif_data.keys())}")
        if 'latitude' in exif_data and 'longitude' in exif_data:
            logger.info(f"Found GPS coordinates in EXIF: lat={exif_data['latitude']}, lon={exif_data['longitude']}")
        
        # DEDUPLICATION: Check for duplicate content by hash
        content_hash = get_image_hash(io.BytesIO(content))
        duplicate = db.query(ImageMetadata).filter(
            ImageMetadata.lineage_statement.contains(content_hash)
        ).first()
        duplicate_flagged_for_review = False

        if duplicate:
            logger.warning(
                f"Duplicate content detected: hash {content_hash} matches existing image {duplicate.filename}"
            )
            duplicate_policy = getattr(settings, "UPLOAD_DUPLICATE_POLICY", "allow").lower()
            if duplicate_policy == "reject":
                raise HTTPException(
                    status_code=409,
                    detail="Duplicate image detected"
                )
            if duplicate_policy == "review":
                duplicate_flagged_for_review = True
                logger.info(
                    "Duplicate upload flagged for review per UPLOAD_DUPLICATE_POLICY"
                )

        # TRANSACTION FIX: Determine geometry BEFORE uploading to storage
        # This ensures we reject uploads that would fail DB constraint before storing bytes
        
        # Extract altitude (priority: manual > geometry 3rd coord > EXIF)
        final_altitude = None
        final_altitude_ref = 0
        
        if upload_data.altitude is not None:
            # Manual altitude provided (highest priority)
            final_altitude = upload_data.altitude
            final_altitude_ref = upload_data.altitude_ref or 0
            logger.info(f"Using manual altitude: {final_altitude}m (ref: {final_altitude_ref})")
        elif upload_data.geometry and len(upload_data.geometry.coordinates) == 3:
            # Altitude in geometry coordinates (second priority)
            final_altitude = upload_data.geometry.coordinates[2]
            final_altitude_ref = 0  # Assume above sea level if not specified
            logger.info(f"Using altitude from geometry: {final_altitude}m")
        elif 'altitude' in exif_data:
            # EXIF altitude (fallback)
            final_altitude = exif_data['altitude']
            final_altitude_ref = exif_data.get('altitude_ref', 0)
            logger.info(f"Using altitude from EXIF: {final_altitude}m (ref: {final_altitude_ref})")
        
        # Extract camera metadata from EXIF
        camera_make = exif_data.get('camera_make')
        camera_model = exif_data.get('camera_model')
        camera_bearing = exif_data.get('camera_bearing')
        orientation = exif_data.get('orientation')
        
        # Use EXIF timestamp as fallback if user didn't provide datetime
        if not upload_data.datetime and 'timestamp_exif' in exif_data:
            try:
                from datetime import datetime as dt
                upload_data.datetime = dt.fromisoformat(exif_data['timestamp_exif']).replace(tzinfo=timezone.utc)
                logger.info(f"Using timestamp from EXIF: {upload_data.datetime}")
            except Exception as e:
                logger.warning(f"Failed to parse EXIF timestamp: {e}")
        
        geom = None
        if upload_data.geometry is not None:
            # User provided coordinates - use those (highest priority)
            lon, lat = upload_data.geometry.coordinates[0], upload_data.geometry.coordinates[1]
            
            # Always use POINT Z format (3D) to match database column definition
            # Use altitude if available, otherwise default to 0
            alt = final_altitude if final_altitude is not None else 0
            geom = WKTElement(f'POINT Z({lon} {lat} {alt})', srid=4326)
            
            # SECURITY: Validate EXIF GPS matches user coordinates (detect spoofing)
            if 'latitude' in exif_data and 'longitude' in exif_data:
                exif_lat, exif_lon = exif_data['latitude'], exif_data['longitude']
                from math import radians, sin, cos, sqrt, atan2
                
                # Haversine distance in kilometers
                R = 6371.0
                lat1, lon1 = radians(lat), radians(lon)
                lat2, lon2 = radians(exif_lat), radians(exif_lon)
                dlat, dlon = lat2 - lat1, lon2 - lon1
                a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
                distance = R * 2 * atan2(sqrt(a), sqrt(1-a))
                
                if distance > 100:  # >100km difference
                    logger.warning(
                        f"SECURITY: EXIF GPS mismatch for {unique_filename}: "
                        f"User coords ({lat:.4f},{lon:.4f}) vs EXIF ({exif_lat:.4f},{exif_lon:.4f}) "
                        f"distance: {distance:.1f}km"
                    )
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "The provided location does not match the image's embedded GPS data "
                            "by more than 100 km and has been rejected to prevent GPS spoofing."
                        ),
                    )
        elif 'latitude' in exif_data and 'longitude' in exif_data:
            # No user coordinates, but image has GPS EXIF - use those
            lat = exif_data['latitude']
            lon = exif_data['longitude']
            
            # Always use POINT Z format (3D) to match database column definition
            alt = final_altitude if final_altitude is not None else 0
            geom = WKTElement(f'POINT Z({lon} {lat} {alt})', srid=4326)
            logger.info(f"Using GPS from EXIF: ({lat}, {lon}, {alt})")

        if geom is None:
            logger.warning(
                "Upload %s has no geometry. Image will be stored without spatial data.",
                unique_filename
            )

        # Prepare high-quality metadata fallbacks
        # SECURITY: Sanitize all text inputs to prevent XSS attacks
        import html
        from html.parser import HTMLParser
        
        def sanitize_text(text: str) -> str:
            """Remove all HTML tags and decode entities"""
            if not text:
                return text
            # Strip all HTML tags
            text = html.unescape(text)  # Decode entities first
            text = ''.join(c for c in text if c.isprintable() or c.isspace())  # Remove non-printable
            # Remove any remaining < > characters
            text = text.replace('<', '').replace('>', '')
            return text.strip()
        
        location_value = sanitize_text(upload_data.location or "") or None
        country_value = sanitize_text(upload_data.country or "") or None
        
        # Auto-detect country from EXIF if not provided
        if not country_value and 'country_code' in exif_data:
            country_value = exif_data['country_code']
            logger.info(f"Auto-detected country {country_value} from EXIF GPS data")
        
        location_for_context = location_value or country_value or "Unknown location"
        provided_title = sanitize_text(upload_data.title or "")
        provided_abstract = sanitize_text(upload_data.abstract or "")

        # Sanitize keywords (limit to 20 keywords, max 50 chars each)
        keywords = upload_data.keywords or []
        keywords = [sanitize_text(kw)[:50] for kw in keywords[:20] if kw]
        # If duplicate detection marked this upload for review, tag it so downstream
        # consumers can filter or surface duplicate-flagged items consistently.
        if duplicate_flagged_for_review and "duplicate-flagged" not in keywords:
            keywords.append("duplicate-flagged")

        try:
            iso_title = generate_iso_title(
                upload_data.hazard_type.value,
                location_for_context,
                upload_data.datetime
            )
        except Exception as iso_error:
            logger.warning("Failed to generate ISO title for %s: %s", unique_filename, iso_error)
            iso_title = None

        try:
            iso_abstract = generate_iso_abstract(
                upload_data.hazard_type.value,
                location_for_context,
                upload_data.datetime
            )
        except Exception as iso_error:
            logger.warning("Failed to generate ISO abstract for %s: %s", unique_filename, iso_error)
            iso_abstract = None

        final_title = provided_title or iso_title or _humanize_filename(original_filename)
        final_abstract = provided_abstract or iso_abstract

        object_key = f"images/{unique_filename}"
        minio_client = get_minio_storage()
        
        # TRANSACTION: Upload to storage, but delete if DB insert fails
        try:
            minio_client.upload_object(object_key, io.BytesIO(content), len(content))
            
            # Create database record with EXIF metadata
            image_metadata = ImageMetadata(
                filename=unique_filename,
                datetime=upload_data.datetime,
                hazard_type=upload_data.hazard_type.value,
                event_id=upload_data.event_id,
                status='pending_review',
                data_license=upload_data.data_license,
                source_type=upload_data.source_type.value,
                uploader_id=_get_user_identifier(current_user),
                positional_accuracy=upload_data.positional_accuracy,
                geometry=geom,
                altitude=final_altitude,
                altitude_ref=final_altitude_ref,
                orientation=orientation,
                camera_make=camera_make,
                camera_model=camera_model,
                camera_bearing=camera_bearing,
                exif_metadata=exif_data if exif_data else None,
                resource_locator=object_key,
                title=final_title,
                abstract=final_abstract,
                location=location_value,
                country=country_value,
                keywords=keywords or None,
                lineage_statement=(
                    f"Uploaded via web interface. Content hash: {content_hash}"
                    + (
                        f" Duplicate detected for review: matches existing image {duplicate.filename}."
                        if duplicate_flagged_for_review and duplicate
                        else ""
                    )
                )
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
                    'original_filename': original_filename,
                    'stored_filename': unique_filename,
                    'hazard_type': upload_data.hazard_type.value,
                    'event_id': upload_data.event_id,
                    'status': 'pending_review'
                },
                request=request
            )
            
            db.commit()
            db.refresh(image_metadata)

            # Trigger achievement checks immediately after a successful upload
            try:
                newly_unlocked_achievements = achievement_service.check_and_award_achievements(
                    db, current_user.username
                )
                if newly_unlocked_achievements:
                    logger.info(
                        "User %s unlocked %d achievements on upload",
                        current_user.username,
                        len(newly_unlocked_achievements)
                    )
                # Invalidate cached stats so progress and achievements update immediately
                try:
                    from middleware.cache import get_cache
                    cache = get_cache()
                    cache.delete(f"cache:user_stats:{current_user.username}")
                except Exception as cache_error:
                    logger.debug("Cache invalidation for achievements failed: %s", cache_error)
            except Exception as achievement_error:
                logger.warning(
                    "Achievement check failed for user %s: %s",
                    current_user.username,
                    achievement_error
                )

        except (IntegrityError, OperationalError) as db_error:
            # ROLLBACK: If DB insert fails, delete the uploaded object from storage
            db.rollback()
            try:
                logger.error(f"Database insert failed for {unique_filename}, cleaning up storage: {db_error}")
                minio_client.delete_object(object_key)
            except Exception as cleanup_error:
                logger.error(f"Failed to cleanup storage after DB error: {cleanup_error}")
                # TODO: Add alerting mechanism for orphaned files when cleanup fails
            
            # Re-raise the original database error
            raise HTTPException(
                status_code=500,
                detail=f"Upload failed: {str(db_error)}"
            )

        logger.info(f"User {current_user.username} uploaded image: {original_filename} (stored as {unique_filename})")

        return {
            "success": True,
            "message": f"Successfully uploaded {original_filename}",
            "filename": unique_filename,
            "original_filename": original_filename,
            "id": str(image_metadata.id) if hasattr(image_metadata, 'id') else None,
            "new_achievements": newly_unlocked_achievements
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
    filename: str = ApiPath(..., description="Image filename for thumbnail regeneration"),
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
    record_id: str = ApiPath(..., description="Image ID or filename"),
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
    if not is_admin(current_user, db):
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

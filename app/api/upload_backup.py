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
from services.minio_client import minio_storage
from models.database import get_db, ImageMetadata
from sqlalchemy.orm import Session
from workers.tasks import process_upload, cleanup_failed_uploads, generate_thumbnail
from api.schemas.image_schemas import ImageMetadataUpdate, ImageResponse, DeleteResponse, UpdateResponse
from core.config import settings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Simple token validation - in production use proper JWT validation"""
    token = credentials.credentials
    if token != "valid-token":  # Replace with proper token validation
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return {"user_id": "user123", "username": "testuser"}

class ImageMetadata:
    def __init__(self):
        self.title = ""
        self.abstract = ""
        self.keywords = []
        self.extent_description = ""
        self.topic_category = ""
        self.character_set = "utf8"
        self.language = "en"
        self.metadata_standard = "ISO 19115:2003"
        self.hierarchy_level = "dataset"
        self.file_identifier = ""
        self.metadata_contact = {}
        self.creation_date = ""
        self.revision_date = ""
        self.resource_maintenance = {}
        self.resource_constraints = {}
        self.spatial_representation_type = ""
        self.spatial_resolution = ""
        self.reference_system = "WGS84"
        self.extent = {}
        self.data_quality = {}
        self.lineage = ""
        self.citation = {}
        self.format_name = ""
        self.format_version = ""
        self.transfer_options = {}
        self.resource_locator = ""

    def to_dict(self):
        return {
            "title": self.title,
            "abstract": self.abstract,
            "keywords": self.keywords,
            "extent_description": self.extent_description,
            "topic_category": self.topic_category,
            "character_set": self.character_set,
            "language": self.language,
            "metadata_standard": self.metadata_standard,
            "hierarchy_level": self.hierarchy_level,
            "file_identifier": self.file_identifier,
            "metadata_contact": self.metadata_contact,
            "creation_date": self.creation_date,
            "revision_date": self.revision_date,
            "resource_maintenance": self.resource_maintenance,
            "resource_constraints": self.resource_constraints,
            "spatial_representation_type": self.spatial_representation_type,
            "spatial_resolution": self.spatial_resolution,
            "reference_system": self.reference_system,
            "extent": self.extent,
            "data_quality": self.data_quality,
            "lineage": self.lineage,
            "citation": self.citation,
            "format_name": self.format_name,
            "format_version": self.format_version,
            "transfer_options": self.transfer_options,
            "resource_locator": self.resource_locator
        }

# ...existing upload endpoint code...

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
                updated_iso_metadata[field] = value
                updated_field_names.append(field)
                iso_fields_updated = True

        # Update geographic extent if lat/lon provided
        if metadata_update.latitude is not None and metadata_update.longitude is not None:
            updated_iso_metadata['extent'] = {
                "geographic": {
                    "west_bound_longitude": metadata_update.longitude,
                    "east_bound_longitude": metadata_update.longitude,
                    "south_bound_latitude": metadata_update.latitude,
                    "north_bound_latitude": metadata_update.latitude
                }
            }
            iso_fields_updated = True

        # Add ISO metadata to update if any ISO fields were updated
        if iso_fields_updated:
            updated_iso_metadata['revision_date'] = datetime.utcnow().isoformat()
            update_fields.append("iso_metadata = %s")
            update_values.append(json.dumps(updated_iso_metadata))

        if not update_fields:
            raise HTTPException(
                status_code=400,
                detail="No valid fields provided for update"
            )

        # Add revision date
        update_fields.append("upload_date = %s")
        update_values.append(datetime.utcnow())
        update_values.append(image_id)

        # Execute update query
        update_query = f"""
            UPDATE images
            SET {', '.join(update_fields)}
            WHERE id = %s
        """

        cursor.execute(update_query, update_values)
        connection.commit()

        logger.info(f"Updated image {filename} (ID: {image_id}) with fields: {updated_field_names}")

        return UpdateResponse(
            message=f"Successfully updated image metadata for '{filename}'",
            updated_image_id=image_id,
            updated_fields=updated_field_names,
            success=True
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update image metadata: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update image metadata: {str(e)}"
        )
    finally:
        if 'connection' in locals():
            connection.close()

@router.delete("/images/{filename}", response_model=DeleteResponse)
async def delete_image(
    filename: str = Path(..., description="Image filename to delete"),
    current_user: dict = Depends(get_current_user)
):
    """Delete an image and its associated MinIO object"""
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        # First, get the image details
        cursor.execute(
            "SELECT id, object_key, bucket_name FROM images WHERE filename = %s",
            (filename,)
        )
        result = cursor.fetchone()

        if not result:
            raise HTTPException(
                status_code=404,
                detail=f"Image with filename '{filename}' not found"
            )

        image_id, object_key, bucket_name = result

        # Delete from MinIO first
        try:
            minio_storage.delete_object(object_key)
            logger.info(f"Deleted object from MinIO: {object_key}")

            # Also try to delete thumbnail if it exists
            thumbnail_key = f"thumbnails/{object_key}"
            try:
                minio_storage.delete_object(thumbnail_key)
                logger.info(f"Deleted thumbnail from MinIO: {thumbnail_key}")
            except Exception as e:
                logger.warning(f"Could not delete thumbnail {thumbnail_key}: {e}")

        except Exception as e:
            logger.error(f"Failed to delete object from MinIO: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to delete file from storage: {str(e)}"
            )

        # Delete from database
        cursor.execute("DELETE FROM images WHERE id = %s", (image_id,))

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Image record not found in database"
            )

        connection.commit()
        logger.info(f"Deleted image record from database: {filename} (ID: {image_id})")

        return DeleteResponse(
            message=f"Successfully deleted image '{filename}' and associated files",
            deleted_image_id=image_id,
            deleted_object_key=object_key,
            success=True
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete image: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete image: {str(e)}"
        )
    finally:
        if 'connection' in locals():
            connection.close()

@router.get("/images/{filename}", response_model=ImageResponse)
async def get_image_metadata(
    filename: str = Path(..., description="Image filename to retrieve")
):
    """Get metadata for a specific image"""
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            SELECT id, filename, title, abstract, object_key, bucket_name,
                   resource_locator, upload_date, file_size, latitude, longitude,
                   hazard_type, keywords
            FROM images WHERE filename = %s
        """, (filename,))

        result = cursor.fetchone()

        if not result:
            raise HTTPException(
                status_code=404,
                detail=f"Image with filename '{filename}' not found"
            )

        # Parse keywords if they exist
        keywords = json.loads(result[12]) if result[12] else None

        return ImageResponse(
            id=result[0],
            filename=result[1],
            title=result[2],
            abstract=result[3],
            object_key=result[4],
            bucket_name=result[5],
            resource_locator=result[6],
            upload_date=result[7],
            file_size=result[8],
            latitude=result[9],
            longitude=result[10],
            hazard_type=result[11],
            keywords=keywords
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get image metadata: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get image metadata: {str(e)}"
        )
    finally:
        if 'connection' in locals():
            connection.close()

# ...existing code for other endpoints...

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    title: str = Form(...),
    description: str = Form(...),
    hazard_type: str = Form(...),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    date_taken: Optional[str] = Form(None),
    photographer: Optional[str] = Form(None),
    keywords: Optional[str] = Form(None),
    camera_model: Optional[str] = Form(None),
    resolution: Optional[str] = Form(None),
    current_user: str = Depends(get_current_user)
):
    """Upload file with metadata and trigger thumbnail generation"""
    try:
        # Validate file type
        if not file.content_type.startswith('image/'):
            raise HTTPException(
                status_code=400,
                detail="Only image files are allowed"
            )

        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = os.path.splitext(file.filename)[1]
        object_name = f"{timestamp}_{file.filename}"

        # Upload to MinIO
        file_content = await file.read()
        upload_url = minio_storage.upload_file(
            object_name=object_name,
            file_data=io.BytesIO(file_content),
            content_type=file.content_type
        )

        # Parse keywords
        keywords_list = []
        if keywords:
            keywords_list = [kw.strip() for kw in keywords.split(",") if kw.strip()]

        # Prepare metadata for database
        file_metadata = {
            "title": title,
            "description": description,
            "hazard_type": hazard_type,
            "latitude": latitude,
            "longitude": longitude,
            "date_taken": date_taken,
            "photographer": photographer,
            "keywords": keywords_list,
            "camera_model": camera_model,
            "resolution": resolution,
            "content_type": file.content_type,
            "file_size": len(file_content),
            "uploaded_by": current_user["username"],
            "object_name": object_name,
            "upload_url": upload_url
        }

        # Save metadata to database (using your existing database connection)
        connection = get_db_connection()
        cursor = connection.cursor()

        # Insert basic record (you may need to adjust this based on your actual schema)
        cursor.execute("""
            INSERT INTO images (filename, title, abstract, hazard_type, latitude, longitude,
                              keywords, content_type, file_size, object_key, resource_locator, upload_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            file.filename, title, description, hazard_type, latitude, longitude,
            json.dumps(keywords_list), file.content_type, len(file_content),
            object_name, upload_url, datetime.utcnow()
        ))

        image_id = cursor.fetchone()[0]
        connection.commit()
        connection.close()

        # Queue thumbnail generation task
        thumbnail_task = generate_thumbnail.delay(object_name)
        logger.info(f"Thumbnail generation queued for {object_name}: {thumbnail_task.id}")

        return {
            "message": "File uploaded successfully and thumbnail generation queued",
            "file_id": image_id,
            "filename": file.filename,
            "object_name": object_name,
            "upload_url": upload_url,
            "thumbnail_task_id": thumbnail_task.id,
            "metadata": file_metadata
        }

    except HTTPException:
        raise
    except Exception as e:
        # Clean up on failure
        if 'object_name' in locals():
            cleanup_failed_uploads.delay(settings.MINIO_BUCKET_NAME, [object_name])
        logger.error(f"Upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@router.post("/regenerate-thumbnail/{filename}")
async def regenerate_thumbnail(
    filename: str = Path(..., description="Filename to regenerate thumbnail for"),
    current_user: dict = Depends(get_current_user)
):
    """Manually trigger thumbnail regeneration for an existing image"""
    try:
        # Verify image exists in database
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("SELECT id, filename FROM images WHERE filename = %s", (filename,))
        result = cursor.fetchone()
        connection.close()

        if not result:
            raise HTTPException(
                status_code=404,
                detail=f"Image with filename '{filename}' not found"
            )

        # Queue thumbnail generation
        thumbnail_task = generate_thumbnail.delay(filename)
        logger.info(f"Thumbnail regeneration queued for {filename}: {thumbnail_task.id}")

        return {
            "message": f"Thumbnail regeneration queued for '{filename}'",
            "task_id": thumbnail_task.id,
            "filename": filename
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to queue thumbnail regeneration: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to queue thumbnail regeneration: {str(e)}"
        )

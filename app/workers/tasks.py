import os
import logging
from typing import Dict, Any
from PIL import Image
import io

from celery import Celery
from sqlalchemy.orm import Session
from sqlalchemy import create_engine

from .celery_app import celery_app
from services.minio_client import get_minio_client, get_minio_storage
from models.database import ImageMetadata
from core.config import settings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database setup for tasks
engine = create_engine(settings.DATABASE_URL)

@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def process_upload(self, file_metadata: Dict[str, Any], bucket_name: str, object_key: str):
    """
    Process uploaded file: validate, generate metadata, and update database.
    
    Args:
        file_metadata: Metadata about the uploaded file
        bucket_name: MinIO bucket name
        object_key: MinIO object key
    """
    try:
        logger.info(f"Processing upload for object: {object_key}")
        
        # Get MinIO client
        minio_client = get_minio_client()
        
        # Verify file exists in MinIO
        try:
            stat = minio_client.stat_object(bucket_name, object_key)
            logger.info(f"File verified in MinIO: {stat.size} bytes")
        except Exception as e:
            logger.error(f"File not found in MinIO: {e}")
            raise
        
        # Generate thumbnail if it's an image
        if file_metadata.get('content_type', '').startswith('image/'):
            # Use the filename/object_key for thumbnail generation
            thumbnail_task = generate_thumbnail.delay(object_key)
            logger.info(f"Thumbnail generation queued: {thumbnail_task.id}")
        
        # Update database with processing status
        with Session(engine) as db_session:
            # Here you would update your database model
            # This is a placeholder - adjust based on your actual model
            logger.info(f"Updated database for file: {object_key}")
            db_session.commit()
        
        logger.info(f"Successfully processed upload: {object_key}")
        return {"status": "success", "object_key": object_key}
        
    except Exception as exc:
        logger.error(f"Error processing upload {object_key}: {exc}")
        # Retry the task
        raise self.retry(exc=exc)

@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def generate_thumbnail(self, filename: str, bucket_name: str = None, thumbnail_size: tuple = None):
    """
    Generate thumbnail for uploaded image and update database record.
    
    Args:
        filename: Filename/object key of the original image
        bucket_name: MinIO bucket name (optional, uses default from settings)
        thumbnail_size: Tuple of (width, height) for thumbnail (optional, uses default from settings)
        
    Returns:
        Dict with status and thumbnail information
    """
    if bucket_name is None:
        bucket_name = settings.minio.MINIO_BUCKET_NAME
    if thumbnail_size is None:
        thumbnail_size = settings.THUMBNAIL_SIZE
        
    try:
        logger.info(f"Generating thumbnail for: {filename}")
        
        minio_client = get_minio_client()
        
        # Download original image from MinIO
        try:
            response = minio_client.get_object(bucket_name, filename)
            image_data = response.read()
            response.close()
            response.release_conn()
            logger.info(f"Downloaded original image: {filename} ({len(image_data)} bytes)")
        except Exception as e:
            logger.error(f"Failed to download original image {filename}: {e}")
            raise
        
        # Generate thumbnail using Pillow
        try:
            with Image.open(io.BytesIO(image_data)) as img:
                # Get original dimensions
                original_width, original_height = img.size
                logger.info(f"Original image dimensions: {original_width}x{original_height}")
                
                # Convert to RGB if necessary (handles RGBA, P, etc.)
                if img.mode in ('RGBA', 'LA', 'P'):
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    if img.mode == 'P':
                        img = img.convert('RGBA')
                    background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                    img = background
                elif img.mode != 'RGB':
                    img = img.convert('RGB')
                
                # Create thumbnail maintaining aspect ratio
                img.thumbnail(thumbnail_size, Image.Resampling.LANCZOS)
                thumbnail_width, thumbnail_height = img.size
                logger.info(f"Thumbnail dimensions: {thumbnail_width}x{thumbnail_height}")
                
                # Save thumbnail to bytes buffer
                thumbnail_buffer = io.BytesIO()
                img.save(thumbnail_buffer, format='JPEG', quality=settings.THUMBNAIL_QUALITY, optimize=True)
                thumbnail_buffer.seek(0)
                thumbnail_size_bytes = len(thumbnail_buffer.getvalue())
                logger.info(f"Thumbnail size: {thumbnail_size_bytes} bytes")
                
        except Exception as e:
            logger.error(f"Failed to process image {filename}: {e}")
            raise
        
        # Upload thumbnail to MinIO with thumbnails/ prefix
        thumbnail_key = f"thumbnails/{filename}"
        try:
            minio_client.put_object(
                bucket_name,
                thumbnail_key,
                thumbnail_buffer,
                length=thumbnail_size_bytes,
                content_type='image/jpeg'
            )
            
            # Generate thumbnail URL
            thumbnail_url = f"http://{settings.minio.MINIO_ENDPOINT}/{bucket_name}/{thumbnail_key}"
            logger.info(f"Thumbnail uploaded successfully: {thumbnail_key}")
            
        except Exception as e:
            logger.error(f"Failed to upload thumbnail for {filename}: {e}")
            raise
        
        # Update database record with thumbnail URL
        try:
            with Session(engine) as db_session:
                image_record = db_session.query(ImageMetadata).filter(
                    ImageMetadata.filename == filename
                ).first()
                
                if image_record:
                    image_record.thumbnail_url = thumbnail_url
                    image_record.thumbnail_key = thumbnail_key
                    db_session.commit()
                    logger.info(f"Updated database record with thumbnail URL for: {filename}")
                else:
                    logger.warning(f"No database record found for filename: {filename}")
                    
        except Exception as e:
            logger.error(f"Failed to update database for {filename}: {e}")
            # Don't raise here - thumbnail was created successfully, DB update failure shouldn't fail the task
        
        result = {
            "status": "success",
            "filename": filename,
            "thumbnail_key": thumbnail_key,
            "thumbnail_url": thumbnail_url,
            "original_size": (original_width, original_height),
            "thumbnail_size": (thumbnail_width, thumbnail_height),
            "thumbnail_bytes": thumbnail_size_bytes
        }
        
        logger.info(f"Successfully generated thumbnail for: {filename}")
        return result
        
    except Exception as exc:
        logger.error(f"Error generating thumbnail for {filename}: {exc}")
        raise self.retry(exc=exc)

@celery_app.task
def cleanup_failed_uploads(bucket_name: str, object_keys: list):
    """
    Clean up failed uploads from MinIO.
    
    Args:
        bucket_name: MinIO bucket name
        object_keys: List of object keys to clean up
    """
    try:
        minio_client = get_minio_client()
        
        for object_key in object_keys:
            try:
                minio_client.remove_object(bucket_name, object_key)
                logger.info(f"Cleaned up failed upload: {object_key}")
            except Exception as e:
                logger.error(f"Failed to clean up {object_key}: {e}")
        
        return {"status": "success", "cleaned_objects": len(object_keys)}
        
    except Exception as exc:
        logger.error(f"Error in cleanup task: {exc}")
        raise exc

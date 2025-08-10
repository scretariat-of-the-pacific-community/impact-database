from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import timedelta
from typing import Optional, Dict, Any
import logging
from urllib.parse import urlparse

from services.minio_client import get_minio_client
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
            status_code=401,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return {"user_id": "user123", "username": "testuser"}

@router.get("/upload")
async def generate_presigned_upload_url(
    filename: str = Query(..., description="Name of the file to upload"),
    content_type: Optional[str] = Query(None, description="MIME type of the file"),
    expires_in: int = Query(3600, description="URL expiration time in seconds", ge=60, le=604800),
    current_user: dict = Depends(get_current_user)
):
    """
    Generate a presigned URL for uploading files directly to MinIO.
    
    Args:
        filename: The name of the file to upload
        content_type: MIME type of the file (optional)
        expires_in: URL expiration time in seconds (default: 1 hour, max: 7 days)
        
    Returns:
        Presigned URL and upload metadata
    """
    try:
        # Validate filename
        if not filename or len(filename.strip()) == 0:
            raise HTTPException(
                status_code=400,
                detail="Filename cannot be empty"
            )
        
        # Sanitize filename
        sanitized_filename = filename.strip().replace(" ", "_")
        
        # Check file extension
        file_ext = sanitized_filename.lower().split('.')[-1] if '.' in sanitized_filename else ''
        if f".{file_ext}" not in settings.ALLOWED_FILE_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"File extension '.{file_ext}' not allowed. Allowed extensions: {settings.ALLOWED_FILE_EXTENSIONS}"
            )
        
        # Generate unique object key with user prefix
        user_id = current_user.get("user_id", "unknown")
        object_key = f"uploads/{user_id}/{sanitized_filename}"
        
        # Get MinIO client
        minio_client = get_minio_client()
        
        # Prepare conditions for presigned URL
        conditions = {}
        if content_type:
            conditions["Content-Type"] = content_type
        
        # Add content length limit
        conditions["content-length-range"] = [1, settings.MAX_FILE_SIZE]
        
        # Generate presigned POST URL (more secure for uploads)
        presigned_data = minio_client.presigned_post_policy(
            bucket_name=settings.MINIO_BUCKET_NAME,
            object_name=object_key,
            expires=timedelta(seconds=expires_in),
            conditions=conditions
        )
        
        logger.info(f"Generated presigned upload URL for {object_key}")
        
        return {
            "upload_url": presigned_data["url"],
            "fields": presigned_data["fields"],
            "object_key": object_key,
            "bucket_name": settings.MINIO_BUCKET_NAME,
            "expires_in": expires_in,
            "max_file_size": settings.MAX_FILE_SIZE,
            "instructions": {
                "method": "POST",
                "enctype": "multipart/form-data",
                "note": "Include all fields in the form data along with the file"
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate presigned upload URL: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate presigned upload URL: {str(e)}"
        )

@router.get("/download")
async def generate_presigned_download_url(
    object_key: str = Query(..., description="Object key of the file to download"),
    expires_in: int = Query(3600, description="URL expiration time in seconds", ge=60, le=604800),
    response_content_disposition: Optional[str] = Query(None, description="Content-Disposition header value"),
    current_user: dict = Depends(get_current_user)
):
    """
    Generate a presigned URL for downloading files directly from MinIO.
    
    Args:
        object_key: The object key of the file to download
        expires_in: URL expiration time in seconds (default: 1 hour, max: 7 days)
        response_content_disposition: Optional Content-Disposition header
        
    Returns:
        Presigned download URL and metadata
    """
    try:
        # Validate object key
        if not object_key or len(object_key.strip()) == 0:
            raise HTTPException(
                status_code=400,
                detail="Object key cannot be empty"
            )
        
        # Get MinIO client
        minio_client = get_minio_client()
        
        # Check if object exists
        try:
            object_stat = minio_client.stat_object(settings.MINIO_BUCKET_NAME, object_key)
        except Exception as e:
            logger.error(f"Object not found: {object_key}")
            raise HTTPException(
                status_code=404,
                detail=f"Object '{object_key}' not found"
            )
        
        # Prepare response headers
        response_headers = {}
        if response_content_disposition:
            response_headers["response-content-disposition"] = response_content_disposition
        
        # Generate presigned GET URL
        presigned_url = minio_client.presigned_get_object(
            bucket_name=settings.MINIO_BUCKET_NAME,
            object_name=object_key,
            expires=timedelta(seconds=expires_in),
            response_headers=response_headers
        )
        
        logger.info(f"Generated presigned download URL for {object_key}")
        
        return {
            "download_url": presigned_url,
            "object_key": object_key,
            "bucket_name": settings.MINIO_BUCKET_NAME,
            "expires_in": expires_in,
            "file_size": object_stat.size,
            "content_type": object_stat.content_type,
            "last_modified": object_stat.last_modified.isoformat(),
            "etag": object_stat.etag,
            "instructions": {
                "method": "GET",
                "note": "Use this URL directly for downloading the file"
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate presigned download URL: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate presigned download URL: {str(e)}"
        )

@router.get("/upload/multipart/initiate")
async def initiate_multipart_upload(
    filename: str = Query(..., description="Name of the file for multipart upload"),
    content_type: Optional[str] = Query(None, description="MIME type of the file"),
    current_user: dict = Depends(get_current_user)
):
    """
    Initiate a multipart upload for large files.
    
    This is useful for files larger than 100MB that need to be uploaded in parts.
    """
    try:
        # Validate filename
        if not filename or len(filename.strip()) == 0:
            raise HTTPException(
                status_code=400,
                detail="Filename cannot be empty"
            )
        
        # Sanitize filename
        sanitized_filename = filename.strip().replace(" ", "_")
        
        # Generate unique object key
        user_id = current_user.get("user_id", "unknown")
        object_key = f"uploads/{user_id}/{sanitized_filename}"
        
        # Get MinIO client
        minio_client = get_minio_client()
        
        # Initiate multipart upload
        upload_id = minio_client._create_multipart_upload(
            bucket_name=settings.MINIO_BUCKET_NAME,
            object_name=object_key,
            metadata={} if not content_type else {"Content-Type": content_type}
        )
        
        logger.info(f"Initiated multipart upload for {object_key}, upload_id: {upload_id}")
        
        return {
            "upload_id": upload_id,
            "object_key": object_key,
            "bucket_name": settings.MINIO_BUCKET_NAME,
            "instructions": {
                "note": "Use the upload_id to upload individual parts",
                "next_step": "Use /presign/upload/multipart/part to get URLs for individual parts"
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to initiate multipart upload: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to initiate multipart upload: {str(e)}"
        )

@router.get("/upload/multipart/part")
async def generate_multipart_upload_url(
    object_key: str = Query(..., description="Object key from multipart initiation"),
    upload_id: str = Query(..., description="Upload ID from multipart initiation"),
    part_number: int = Query(..., description="Part number (1-10000)", ge=1, le=10000),
    expires_in: int = Query(3600, description="URL expiration time in seconds", ge=60, le=604800),
    current_user: dict = Depends(get_current_user)
):
    """
    Generate a presigned URL for uploading a specific part of a multipart upload.
    """
    try:
        # Get MinIO client
        minio_client = get_minio_client()
        
        # Generate presigned URL for the part
        presigned_url = minio_client.presigned_put_object(
            bucket_name=settings.MINIO_BUCKET_NAME,
            object_name=object_key,
            expires=timedelta(seconds=expires_in),
            extra_query_params={
                "uploadId": upload_id,
                "partNumber": str(part_number)
            }
        )
        
        logger.info(f"Generated presigned URL for part {part_number} of upload {upload_id}")
        
        return {
            "upload_url": presigned_url,
            "object_key": object_key,
            "upload_id": upload_id,
            "part_number": part_number,
            "expires_in": expires_in,
            "instructions": {
                "method": "PUT",
                "note": "Upload the part data directly to this URL using PUT method"
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to generate multipart upload URL: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate multipart upload URL: {str(e)}"
        )

@router.get("/health")
async def presign_health_check():
    """Health check for presign service"""
    try:
        # Test MinIO connection
        minio_client = get_minio_client()
        bucket_exists = minio_client.bucket_exists(settings.MINIO_BUCKET_NAME)
        
        return {
            "status": "healthy",
            "minio_endpoint": settings.MINIO_ENDPOINT,
            "bucket_name": settings.MINIO_BUCKET_NAME,
            "bucket_exists": bucket_exists,
            "max_file_size": settings.MAX_FILE_SIZE,
            "allowed_extensions": settings.ALLOWED_FILE_EXTENSIONS
        }
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Presign service unhealthy: {str(e)}"
        )

"""MinIO client for object storage operations."""

import os
from minio import Minio
from minio.error import S3Error
import logging

logger = logging.getLogger(__name__)

# MinIO configuration from environment variables
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "impact-images")

def get_minio_client():
    """Get MinIO client instance."""
    return Minio(
        MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=MINIO_SECURE
    )

class MinIOStorage:
    """MinIO storage service for handling file operations."""
    
    def __init__(self):
        self.client = get_minio_client()
        self.bucket_name = MINIO_BUCKET
        self._ensure_bucket_exists()
    
    def _ensure_bucket_exists(self):
        """Ensure the bucket exists, create if it doesn't."""
        try:
            if not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(self.bucket_name)
                logger.info(f"Created bucket: {self.bucket_name}")
        except S3Error as e:
            logger.error(f"Error ensuring bucket exists: {e}")
    
    def upload_file(self, file_path: str, object_name: str, content_type: str = None):
        """Upload a file to MinIO."""
        try:
            self.client.fput_object(
                self.bucket_name,
                object_name,
                file_path,
                content_type=content_type
            )
            logger.info(f"Uploaded {file_path} as {object_name}")
            return True
        except S3Error as e:
            logger.error(f"Error uploading file: {e}")
            return False
    
    def delete_file(self, object_name: str):
        """Delete a file from MinIO."""
        try:
            self.client.remove_object(self.bucket_name, object_name)
            logger.info(f"Deleted {object_name}")
            return True
        except S3Error as e:
            logger.error(f"Error deleting file: {e}")
            return False
    
    def get_presigned_url(self, object_name: str, expires_in_seconds: int = 3600):
        """Get a presigned URL for downloading a file."""
        try:
            from datetime import timedelta
            url = self.client.presigned_get_object(
                self.bucket_name,
                object_name,
                expires=timedelta(seconds=expires_in_seconds)
            )
            return url
        except S3Error as e:
            logger.error(f"Error generating presigned URL: {e}")
            return None
    
    def get_upload_url(self, object_name: str, expires_in_seconds: int = 3600):
        """Get a presigned URL for uploading a file."""
        try:
            from datetime import timedelta
            url = self.client.presigned_put_object(
                self.bucket_name,
                object_name,
                expires=timedelta(seconds=expires_in_seconds)
            )
            return url
        except S3Error as e:
            logger.error(f"Error generating upload URL: {e}")
            return None

# Global instance
minio_storage = MinIOStorage()

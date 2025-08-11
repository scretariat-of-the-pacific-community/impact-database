import os
from minio import Minio
from minio.error import S3Error
from datetime import timedelta
import logging

from core.config import settings

logger = logging.getLogger(__name__)

class MinIOStorage:
    """MinIO storage service using Minio Python SDK"""
    
    def __init__(self):
        """Initialize MinIO client with settings"""
        self.client = None
        self.bucket_name = settings.MINIO_BUCKET_NAME
        logger.info(f"MinIO storage initialized (lazy loading enabled)")
    
    def _get_client(self):
        """Get MinIO client, creating it if needed."""
        if self.client is None:
            self.client = Minio(
                settings.MINIO_ENDPOINT,
                access_key=settings.MINIO_ACCESS_KEY,
                secret_key=settings.MINIO_SECRET_KEY,
                secure=settings.MINIO_SECURE
            )
            self._ensure_bucket_exists()
            logger.info(f"MinIO client initialized successfully for bucket: {self.bucket_name}")
        return self.client
    
    def _ensure_bucket_exists(self):
        """Ensure the bucket exists, create if it doesn't"""
        try:
            if not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(self.bucket_name)
                logger.info(f"Created bucket: {self.bucket_name}")
            else:
                logger.debug(f"Bucket already exists: {self.bucket_name}")
        except S3Error as e:
            logger.error(f"Error ensuring bucket exists: {e}")
            # Don't raise the error to allow the app to start
        except Exception as e:
            logger.error(f"Unexpected error ensuring bucket exists: {e}")
            # Don't raise the error to allow the app to start
    
    def upload_file(self, object_name: str, file_data, content_type: str = None):
        """
        Upload file to MinIO
        
        Args:
            object_name: Object key for the uploaded file
            file_data: Raw file bytes or file-like object
            content_type: MIME type of the file
            
        Returns:
            URL of the uploaded object
        """
        try:
            # Upload to MinIO
            client = self._get_client()
            client.put_object(
                self.bucket_name,
                object_name,
                file_data,
                length=-1,
                part_size=10*1024*1024,  # 10MB
                content_type=content_type
            )
            
            logger.info(f"Uploaded file: {object_name}")
            return f"http://{settings.MINIO_ENDPOINT}/{self.bucket_name}/{object_name}"
        except S3Error as e:
            logger.error(f"Error uploading file {object_name}: {e}")
            raise
    
    def delete_object(self, object_name: str):
        """
        Delete object from MinIO
        
        Args:
            object_name: Object key to delete
            
        Returns:
            True if successful, False otherwise
        """
        try:
            client = self._get_client()
            client.remove_object(self.bucket_name, object_name)
            logger.info(f"Deleted object: {object_name}")
            return True
        except S3Error as e:
            logger.error(f"Error deleting object {object_name}: {e}")
            return False
    
    def generate_presigned_upload_url(self, object_name: str, expires_delta: timedelta = timedelta(hours=1)):
        """
        Generate presigned URL for uploading an object
        
        Args:
            object_name: Object key for the upload
            expires_delta: How long the URL should be valid
            
        Returns:
            Presigned URL string
        """
        try:
            client = self._get_client()
            url = client.presigned_put_object(
                self.bucket_name,
                object_name,
                expires=expires_delta
            )
            logger.info(f"Generated presigned upload URL for: {object_name}")
            return url
        except S3Error as e:
            logger.error(f"Error generating presigned upload URL for {object_name}: {e}")
            raise
    
    def generate_presigned_download_url(self, object_name: str, expires_delta: timedelta = timedelta(hours=1)):
        """
        Generate presigned URL for downloading an object
        
        Args:
            object_name: Object key for the download
            expires_delta: How long the URL should be valid
            
        Returns:
            Presigned URL string
        """
        try:
            client = self._get_client()
            url = client.presigned_get_object(
                self.bucket_name,
                object_name,
                expires=expires_delta
            )
            logger.info(f"Generated presigned download URL for: {object_name}")
            return url
        except S3Error as e:
            logger.error(f"Error generating presigned download URL for {object_name}: {e}")
            raise
    
    def get_object_info(self, object_name: str):
        """
        Get object information/metadata
        
        Args:
            object_name: Object key to get info for
            
        Returns:
            Object stat information
        """
        try:
            client = self._get_client()
            return client.stat_object(self.bucket_name, object_name)
        except S3Error as e:
            logger.error(f"Error getting object info for {object_name}: {e}")
            raise

# Global instance - lazy loaded
_minio_storage = None

def get_minio_storage():
    """Get the global MinIO storage instance."""
    global _minio_storage
    if _minio_storage is None:
        _minio_storage = MinIOStorage()
    return _minio_storage

def get_minio_client():
    """Get MinIO client instance"""
    return get_minio_storage().client
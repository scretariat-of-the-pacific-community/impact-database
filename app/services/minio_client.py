"""MinIO client for object storage operations."""

import logging
import os

from minio import Minio
from minio.error import S3Error

logger = logging.getLogger(__name__)

# MinIO configuration from environment variables
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"
MINIO_BUCKET_NAME = os.getenv("MINIO_BUCKET_NAME") or os.getenv("MINIO_BUCKET") or "impact-images"
MINIO_VIDEO_BUCKET = os.getenv("MINIO_VIDEO_BUCKET", "impact-videos")


def get_minio_client():
    """Get MinIO client instance."""
    return Minio(
        MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=MINIO_SECURE,
    )


class MinIOStorage:
    """MinIO storage service for handling file operations."""

    def __init__(self):
        self.client = None
        self.bucket_name = MINIO_BUCKET_NAME
        self.video_bucket_name = MINIO_VIDEO_BUCKET
        logger.info(
            f"MinIO storage initialized - Images: {self.bucket_name}, Videos: {self.video_bucket_name}"
        )

    def _get_client(self):
        """Get MinIO client instance, creating it if needed."""
        if self.client is None:
            self.client = get_minio_client()
            self._ensure_bucket_exists()
        return self.client

    def _ensure_bucket_exists(self):
        """Ensure both image and video buckets exist, create if they don't."""
        try:
            # Ensure image bucket exists
            if not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(self.bucket_name)
                logger.info(f"Created bucket: {self.bucket_name}")

            # Ensure video bucket exists
            if not self.client.bucket_exists(self.video_bucket_name):
                self.client.make_bucket(self.video_bucket_name)
                logger.info(f"Created video bucket: {self.video_bucket_name}")
                self._set_video_lifecycle_policy()

        except S3Error as e:
            logger.error(f"Error ensuring buckets exist: {e}")

    def _set_video_lifecycle_policy(self):
        """Configure lifecycle rules for video storage (Ticket 1.8)"""
        try:
            from datetime import timedelta
            from minio.lifecycleconfig import Expiration, LifecycleConfig, Rule, Transition

            lifecycle_config = LifecycleConfig(
                [
                    # Delete temp/failed uploads after 7 days
                    Rule(
                        "delete-temp-uploads",
                        status="Enabled",
                        expiration=Expiration(days=7),
                        rule_filter={"prefix": "videos/temp/"},
                    ),
                    # Move originals to cold storage after 30 days
                    Rule(
                        "archive-originals",
                        status="Enabled",
                        transition=Transition(days=30, storage_class="STANDARD_IA"),
                        rule_filter={"prefix": "videos/uploads/"},
                    ),
                ]
            )

            self.client.set_bucket_lifecycle(self.video_bucket_name, lifecycle_config)
            logger.info(f"Set lifecycle policy for {self.video_bucket_name}")
        except Exception as e:
            logger.warning(f"Could not set lifecycle policy (MinIO may not support it): {e}")
            # Don't raise the error to allow the app to start

    def upload_file(self, file_path: str, object_name: str, content_type: str = None):
        """Upload a file to MinIO."""
        try:
            client = self._get_client()
            client.fput_object(self.bucket_name, object_name, file_path, content_type=content_type)
            logger.info(f"Uploaded {file_path} as {object_name}")
            return True
        except S3Error as e:
            logger.error(f"Error uploading file: {e}")
            return False

    def delete_file(self, object_name: str):
        """Delete a file from MinIO."""
        try:
            client = self._get_client()
            client.remove_object(self.bucket_name, object_name)
            logger.info(f"Deleted {object_name}")
            return True
        except S3Error as e:
            logger.error(f"Error deleting file: {e}")
            return False

    def get_presigned_url(self, object_name: str, expires_in_seconds: int = 3600):
        """Get a presigned URL for downloading a file."""
        try:
            from datetime import timedelta

            client = self._get_client()
            url = client.presigned_get_object(
                self.bucket_name, object_name, expires=timedelta(seconds=expires_in_seconds)
            )
            return url
        except S3Error as e:
            logger.error(f"Error generating presigned URL: {e}")
            return None

    def get_upload_url(self, object_name: str, expires_in_seconds: int = 3600):
        """Get a presigned URL for uploading a file."""
        try:
            from datetime import timedelta

            client = self._get_client()
            url = client.presigned_put_object(
                self.bucket_name, object_name, expires=timedelta(seconds=expires_in_seconds)
            )
            return url
        except S3Error as e:
            logger.error(f"Error generating upload URL: {e}")
            return None

    def upload_object(self, object_name: str, data, length: int, content_type: str = None):
        """Upload object data to MinIO."""
        try:
            client = self._get_client()
            client.put_object(
                self.bucket_name, object_name, data, length, content_type=content_type
            )
            logger.info(f"Uploaded object {object_name}")
            return True
        except S3Error as e:
            logger.error(f"Error uploading object: {e}")
            return False

    def get_object_content(self, object_name: str) -> bytes:
        """Get object content as bytes from MinIO."""
        try:
            client = self._get_client()
            response = client.get_object(self.bucket_name, object_name)
            data = response.read()
            response.close()
            response.release_conn()
            logger.info(f"Retrieved object {object_name}")
            return data
        except S3Error as e:
            logger.error(f"Error retrieving object: {e}")
            raise

    def delete_object(self, object_name: str):
        """Delete an object from MinIO."""
        try:
            client = self._get_client()
            client.remove_object(self.bucket_name, object_name)
            logger.info(f"Deleted object {object_name}")
            return True
        except S3Error as e:
            logger.error(f"Error deleting object: {e}")
            return False


# Global instance - lazy loaded
_minio_storage = None


def get_minio_storage():
    """Get the global MinIO storage instance."""
    global _minio_storage
    if _minio_storage is None:
        _minio_storage = MinIOStorage()
    return _minio_storage


# Alias for backward compatibility
minio_service = get_minio_storage()

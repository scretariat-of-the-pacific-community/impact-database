"""Local file storage service as fallback for MinIO."""

import os
import shutil
import logging
from typing import Optional
from urllib.parse import urljoin
from pathlib import Path

logger = logging.getLogger(__name__)

# Local storage configuration
UPLOADS_DIR = os.getenv("UPLOADS_DIR", "/home/kishank/impact-database/app/uploads")
BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")


class LocalFileStorage:
    """Local file storage service for handling file operations."""

    def __init__(self):
        self.uploads_dir = Path(UPLOADS_DIR)
        self.uploads_dir.mkdir(exist_ok=True, parents=True)
        self.bucket_name = "impact-images"  # Keep same interface
        logger.info(f"Local file storage initialized: {self.uploads_dir}")

    def _get_client(self):
        """Compatibility method - returns self for local storage."""
        return self

    def _ensure_bucket_exists(self):
        """Ensure the uploads directory exists."""
        self.uploads_dir.mkdir(exist_ok=True, parents=True)

    def upload_file(self, file_path: str, object_name: str, content_type: str = None):
        """Upload a file to local storage."""
        try:
            src_path = Path(file_path)
            dest_path = self.uploads_dir / object_name

            # Ensure destination directory exists
            dest_path.parent.mkdir(exist_ok=True, parents=True)

            # Copy file
            shutil.copy2(src_path, dest_path)
            logger.info(f"Uploaded {file_path} as {object_name}")
            return True
        except Exception as e:
            logger.error(f"Error uploading file: {e}")
            return False

    def delete_file(self, object_name: str):
        """Delete a file from local storage."""
        try:
            file_path = self.uploads_dir / object_name
            if file_path.exists():
                file_path.unlink()
                logger.info(f"Deleted {object_name}")
                return True
            else:
                logger.warning(f"File not found for deletion: {object_name}")
                return False
        except Exception as e:
            logger.error(f"Error deleting file: {e}")
            return False

    def get_presigned_url(self, object_name: str, expires_in_seconds: int = 3600) -> Optional[str]:
        """Get a URL for downloading a file (simple file serving)."""
        try:
            # For local development, return a simple HTTP URL
            # In production, this would be properly secured
            file_path = self.uploads_dir / object_name
            if file_path.exists():
                return f"{BASE_URL}/uploads/{object_name}"
            else:
                logger.warning(f"File not found for presigned URL: {object_name}")
                return None
        except Exception as e:
            logger.error(f"Error generating presigned URL: {e}")
            return None

    def get_upload_url(self, object_name: str, expires_in_seconds: int = 3600) -> Optional[str]:
        """Get a URL for uploading a file (not used in local storage)."""
        # For local storage, we don't use presigned upload URLs
        # Uploads are handled directly through the API
        return f"{BASE_URL}/api/v1/upload"

    def upload_object(self, object_name: str, data, length: int, content_type: str = None):
        """Upload object data to local storage."""
        try:
            dest_path = self.uploads_dir / object_name

            # Ensure destination directory exists
            dest_path.parent.mkdir(exist_ok=True, parents=True)

            # Write data to file
            with open(dest_path, "wb") as f:
                if hasattr(data, "read"):
                    # If data is file-like, read it
                    content = data.read()
                else:
                    content = data
                f.write(content)

            logger.info(f"Uploaded object {object_name}")
            return True
        except Exception as e:
            logger.error(f"Error uploading object: {e}")
            return False

    def delete_object(self, object_name: str):
        """Delete an object from local storage."""
        return self.delete_file(object_name)


# Global instance - lazy loaded
_local_storage = None


def get_local_storage():
    """Get the global local storage instance."""
    global _local_storage
    if _local_storage is None:
        _local_storage = LocalFileStorage()
    return _local_storage

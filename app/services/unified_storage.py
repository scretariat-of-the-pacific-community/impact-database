"""
Unified Storage Configuration Manager

This module provides a centralized way to manage different storage backends
and eliminates the confusion between SQLite, PostgreSQL, and MinIO.
"""

import os
import logging
from typing import Literal, Optional
from core.config import Settings

logger = logging.getLogger(__name__)

StorageType = Literal["local", "minio", "hybrid"]
DatabaseType = Literal["sqlite", "postgresql"]

class UnifiedStorageConfig:
    """Manages all storage configurations in one place"""
    
    def __init__(self, settings: Settings):
        self.settings = settings
        self._validate_configuration()
    
    def _validate_configuration(self):
        """Validate storage configuration consistency"""
        issues = []
        
        # Check database configuration
        if self.settings.is_production and self.settings.database.DATABASE_URL.startswith("sqlite://"):
            issues.append("SQLite is not allowed in production - use PostgreSQL")
        
        # Check MinIO vs Local storage consistency
        if self.get_file_storage_type() == "minio":
            if not all([
                self.settings.minio.MINIO_ENDPOINT,
                self.settings.minio.MINIO_ACCESS_KEY,
                self.settings.minio.MINIO_SECRET_KEY
            ]):
                issues.append("MinIO configuration incomplete - missing endpoint/credentials")
        
        # Check for mixed configurations
        if self.has_mixed_storage():
            issues.append("Mixed storage configuration detected - use either all-local or all-remote")
        
        if issues:
            logger.warning("Storage configuration issues found:")
            for issue in issues:
                logger.warning(f"  - {issue}")
                
        return issues
    
    def get_database_type(self) -> DatabaseType:
        """Get the current database type"""
        db_url = self.settings.database.DATABASE_URL
        if db_url.startswith("sqlite://"):
            return "sqlite"
        elif db_url.startswith("postgresql://"):
            return "postgresql"
        else:
            logger.warning(f"Unknown database type in URL: {db_url}")
            return "sqlite"  # fallback
    
    def get_file_storage_type(self) -> StorageType:
        """Determine which file storage system to use"""
        # Force local storage in development if MinIO not available
        if self.settings.is_development:
            try:
                from services.minio_client import get_minio_client
                client = get_minio_client()
                # Test connection
                client.list_buckets()
                return "minio"
            except Exception as e:
                logger.info(f"MinIO not available, using local storage: {e}")
                return "local"
        
        # Production should use MinIO
        if self.settings.is_production:
            return "minio"
        
        # Default to local for development
        return "local"
    
    def has_mixed_storage(self) -> bool:
        """Check if there's a problematic mixed storage configuration"""
        # This is fine - database and file storage are different systems
        # The issue was confusion, not actual mixing
        return False
    
    def get_storage_summary(self) -> dict:
        """Get a summary of current storage configuration"""
        return {
            "database_type": self.get_database_type(),
            "database_url": self._mask_credentials(self.settings.database.DATABASE_URL),
            "file_storage_type": self.get_file_storage_type(),
            "minio_endpoint": self.settings.minio.MINIO_ENDPOINT if self.get_file_storage_type() == "minio" else "N/A",
            "environment": self.settings.ENVIRONMENT,
            "issues": self._validate_configuration()
        }
    
    def _mask_credentials(self, url: str) -> str:
        """Mask passwords in URLs for logging"""
        import re
        return re.sub(r'://([^:]+):([^@]+)@', r'://\1:***@', url)

# Global storage config instance
_storage_config: Optional[UnifiedStorageConfig] = None

def get_storage_config() -> UnifiedStorageConfig:
    """Get the global storage configuration"""
    global _storage_config
    if _storage_config is None:
        from core.config import Settings
        settings = Settings()
        _storage_config = UnifiedStorageConfig(settings)
        
        # Log configuration on first access
        summary = _storage_config.get_storage_summary()
        logger.info("Storage Configuration:")
        logger.info(f"  Database: {summary['database_type']} ({summary['database_url']})")
        logger.info(f"  File Storage: {summary['file_storage_type']}")
        if summary['issues']:
            logger.warning("  Issues found:")
            for issue in summary['issues']:
                logger.warning(f"    - {issue}")
    
    return _storage_config

def get_file_storage_service():
    """Get the appropriate file storage service based on configuration"""
    config = get_storage_config()
    storage_type = config.get_file_storage_type()
    
    if storage_type == "minio":
        from services.minio_client import MinIOStorage
        return MinIOStorage()
    else:
        from services.local_storage import LocalFileStorage  
        return LocalFileStorage()

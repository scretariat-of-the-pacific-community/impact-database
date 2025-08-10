import os
from typing import Optional, List
from pydantic import BaseModel, Field

class Settings(BaseModel):
    """Application settings with environment variable support"""
    
    # Database Configuration
    DATABASE_URL: str = Field(
        default=os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/impact_db"),
        description="PostgreSQL database connection URL"
    )
    
    # Redis Configuration
    REDIS_URL: str = Field(
        default=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
        description="Redis connection URL for Celery broker and cache"
    )
    
    # MinIO Configuration
    MINIO_ENDPOINT: str = Field(
        default=os.getenv("MINIO_ENDPOINT", "localhost:9000"),
        description="MinIO server endpoint"
    )
    MINIO_ACCESS_KEY: str = Field(
        default=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
        description="MinIO access key"
    )
    MINIO_SECRET_KEY: str = Field(
        default=os.getenv("MINIO_SECRET_KEY", "minioadmin"),
        description="MinIO secret key"
    )
    MINIO_SECURE: bool = Field(
        default=os.getenv("MINIO_SECURE", "false").lower() == "true",
        description="Use HTTPS for MinIO connections"
    )
    MINIO_BUCKET_NAME: str = Field(
        default=os.getenv("MINIO_BUCKET_NAME", "impact-images"),
        description="Default MinIO bucket name"
    )
    
    # API Configuration
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Impact Database API"
    VERSION: str = "1.0.0"
    DESCRIPTION: str = "API for managing impact assessment images and metadata"
    
    # Security Configuration
    SECRET_KEY: str = Field(
        default=os.getenv("SECRET_KEY", "your-secret-key-change-in-production"),
        description="Secret key for JWT token generation"
    )
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30")),
        description="JWT token expiration time in minutes"
    )
    
    # Celery Configuration - automatically use Redis URL
    @property
    def CELERY_BROKER_URL(self) -> str:
        return self.REDIS_URL
    
    @property
    def CELERY_RESULT_BACKEND(self) -> str:
        return self.REDIS_URL
    
    # File Upload Configuration
    MAX_FILE_SIZE: int = Field(
        default=int(os.getenv("MAX_FILE_SIZE", str(50 * 1024 * 1024))),  # 50MB
        description="Maximum file upload size in bytes"
    )
    ALLOWED_FILE_EXTENSIONS: List[str] = Field(
        default=[".jpg", ".jpeg", ".png", ".tiff", ".tif", ".gif"],
        description="Allowed file extensions for uploads"
    )
    
    # Thumbnail Configuration
    THUMBNAIL_SIZE: tuple = (200, 200)
    THUMBNAIL_QUALITY: int = 85
    
    # Environment
    ENVIRONMENT: str = Field(
        default=os.getenv("ENVIRONMENT", "development"),
        description="Application environment (development, staging, production)"
    )
    DEBUG: bool = Field(
        default=os.getenv("DEBUG", "true").lower() == "true",
        description="Enable debug mode"
    )
    
    # CORS Configuration
    BACKEND_CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:3000", "http://localhost:8000"],
        description="Allowed CORS origins"
    )
    
    @property
    def is_production(self) -> bool:
        """Check if running in production environment"""
        return self.ENVIRONMENT.lower() == "production"
    
    @property
    def is_development(self) -> bool:
        """Check if running in development environment"""
        return self.ENVIRONMENT.lower() == "development"

# Create global settings instance
settings = Settings()

# Export commonly used settings for backward compatibility
REDIS_URL = settings.REDIS_URL
DATABASE_URL = settings.DATABASE_URL
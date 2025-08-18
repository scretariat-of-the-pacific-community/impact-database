import os
from typing import Optional, List
from pydantic import BaseModel, Field, root_validator


def get_env(name: str, default: Optional[str] = None) -> Optional[str]:
    """Retrieve an environment variable or read it from a referenced file."""
    file_var = os.getenv(f"{name}_FILE")
    if file_var and os.path.exists(file_var):
        with open(file_var, "r", encoding="utf-8") as f:
            return f.read().strip()
    return os.getenv(name, default)


class Settings(BaseModel):
    """Application settings with environment variable support"""

    # Database Configuration
    DATABASE_URL: Optional[str] = Field(
        default=get_env("DATABASE_URL", "sqlite:///./app.db"),
        description="Database connection URL (SQLite for local dev)",
    )

    # Redis Configuration
    REDIS_URL: str = Field(
        default=get_env("REDIS_URL", "redis://localhost:6379/0"),
        description="Redis connection URL for Celery broker and cache",
    )

    # MinIO Configuration
    MINIO_ENDPOINT: str = Field(
        default=get_env("MINIO_ENDPOINT", "localhost:9000"),
        description="MinIO server endpoint",
    )
    MINIO_ACCESS_KEY: Optional[str] = Field(
        default=get_env("MINIO_ACCESS_KEY"),
        description="MinIO access key",
    )
    MINIO_SECRET_KEY: Optional[str] = Field(
        default=get_env("MINIO_SECRET_KEY"),
        description="MinIO secret key",
    )
    MINIO_SECURE: bool = Field(
        default=get_env("MINIO_SECURE", "false").lower() == "true",
        description="Use HTTPS for MinIO connections",
    )
    MINIO_BUCKET_NAME: str = Field(
        default=get_env("MINIO_BUCKET_NAME", "impact-images"),
        description="Default MinIO bucket name",
    )

    # API Configuration
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Impact Database API"
    VERSION: str = "1.0.0"
    DESCRIPTION: str = "API for managing impact assessment images and metadata"

    # Security Configuration
    SECRET_KEY: Optional[str] = Field(
        default=get_env("SECRET_KEY"),
        description="Secret key for JWT token generation",
    )
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=int(get_env("ACCESS_TOKEN_EXPIRE_MINUTES", "30")),
        description="JWT token expiration time in minutes",
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
        default=int(get_env("MAX_FILE_SIZE", str(50 * 1024 * 1024))),  # 50MB
        description="Maximum file upload size in bytes",
    )
    ALLOWED_FILE_EXTENSIONS: List[str] = Field(
        default=[".jpg", ".jpeg", ".png", ".tiff", ".tif", ".gif"],
        description="Allowed file extensions for uploads",
    )

    # Thumbnail Configuration
    THUMBNAIL_SIZE: tuple = (200, 200)
    THUMBNAIL_QUALITY: int = 85

    # Environment
    ENVIRONMENT: str = Field(
        default=get_env("ENVIRONMENT", "development"),
        description="Application environment (development, staging, production)",
    )
    DEBUG: bool = Field(
        default=get_env("DEBUG", "true").lower() == "true",
        description="Enable debug mode",
    )

    # CORS Configuration
    BACKEND_CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:3000", "http://localhost:8000"],
        description="Allowed CORS origins",
    )

    @property
    def is_production(self) -> bool:
        """Check if running in production environment"""
        return self.ENVIRONMENT.lower() == "production"

    @property
    def is_development(self) -> bool:
        """Check if running in development environment"""
        return self.ENVIRONMENT.lower() == "development"

    @root_validator(skip_on_failure=True)
    def validate_required_settings(cls, values):
        env = values.get("ENVIRONMENT", "development").lower()
        if env == "production":
            required = [
                "DATABASE_URL",
                "REDIS_URL",
                "MINIO_ENDPOINT",
                "MINIO_ACCESS_KEY",
                "MINIO_SECRET_KEY",
                "SECRET_KEY",
            ]
            missing = [name for name in required if not values.get(name)]
            if missing:
                raise ValueError(
                    f"Missing required environment variables: {', '.join(missing)}"
                )
        else:
            values.setdefault("DATABASE_URL", "sqlite:///./dev.db")
        return values


# Create global settings instance
settings = Settings()

# Export commonly used settings for backward compatibility
REDIS_URL = settings.REDIS_URL
DATABASE_URL = settings.DATABASE_URL

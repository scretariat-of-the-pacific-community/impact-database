import json
import logging
import os
import secrets
import sys
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field, field_validator, model_validator, validator
from pydantic_settings import BaseSettings

# Configure logging for config validation
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_env(
    name: str, default: Optional[str] = None, required_in_production: bool = False
) -> Optional[str]:
    """
    Retrieve an environment variable or read it from a referenced file.

    Args:
        name: Environment variable name
        default: Default value (only used in non-production)
        required_in_production: Whether this env var is required in production
    """
    # Check for Docker secrets file first
    file_var = os.getenv(f"{name}_FILE")
    if file_var and os.path.exists(file_var):
        try:
            with open(file_var, "r", encoding="utf-8") as f:
                value = f.read().strip()
                if value:
                    return value
        except IOError as e:
            logger.error(f"Failed to read secret file {file_var}: {e}")

    # Get from environment
    value = os.getenv(name)
    if value:
        return value

    # Handle production requirements
    environment = os.getenv("ENVIRONMENT", "development").lower()
    if environment == "production" and required_in_production:
        raise ValueError(f"Required environment variable {name} is not set in production")

    return default


class SecuritySettings(BaseModel):
    """Security-specific settings with strict validation"""

    # EXIF/Metadata Settings
    EXIF_LIBRARY: str = Field(
        default="PIL",
        description="EXIF extraction library: 'PIL' (default) or 'exifread' (more comprehensive)",
    )
    ENABLE_XMP_EXTRACTION: bool = Field(
        default=False, description="Enable XMP metadata extraction (requires python-xmp-toolkit)"
    )
    AUTO_CONVERT_HEIF: bool = Field(
        default=True, description="Automatically convert HEIF/HEIC to JPEG"
    )
    HEIF_JPEG_QUALITY: int = Field(
        default=95, ge=1, le=100, description="JPEG quality for HEIF conversion (1-100)"
    )

    # JWT Configuration
    SECRET_KEY: str = Field(
        default_factory=lambda: get_env("SECRET_KEY", required_in_production=True)
        or secrets.token_urlsafe(32),
        min_length=32,
        description="Secret key for JWT token generation (min 32 chars)",
    )
    ALGORITHM: str = Field(
        default=get_env("ALGORITHM", "HS256"),
        pattern=r"^(HS256|HS384|HS512|RS256|RS384|RS512)$",
        description="JWT signing algorithm",
    )
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=int(get_env("ACCESS_TOKEN_EXPIRE_MINUTES", "15")),
        ge=5,
        le=60,
        description="JWT access token expiration (5-60 minutes)",
    )
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(
        default=int(get_env("REFRESH_TOKEN_EXPIRE_DAYS", "7")),
        ge=1,
        le=30,
        description="JWT refresh token expiration (1-30 days)",
    )

    # Rate Limiting
    RATE_LIMIT_REQUESTS: int = Field(
        default=int(get_env("RATE_LIMIT_REQUESTS", "100")),
        ge=10,
        le=10000,
        description="General API rate limit per window",
    )
    RATE_LIMIT_WINDOW: int = Field(
        default=int(get_env("RATE_LIMIT_WINDOW", "3600")),
        ge=60,
        le=86400,
        description="Rate limit window in seconds",
    )
    LOGIN_RATE_LIMIT: int = Field(
        default=int(get_env("LOGIN_RATE_LIMIT", "5")),
        ge=3,
        le=50,
        description="Login attempt rate limit",
    )
    LOGIN_RATE_WINDOW: int = Field(
        default=int(get_env("LOGIN_RATE_WINDOW", "900")),
        ge=300,
        le=3600,
        description="Login rate limit window in seconds",
    )

    # Session Security
    SESSION_SECURE: bool = Field(
        default=get_env("SESSION_SECURE", "true").lower() == "true",
        description="Require HTTPS for session cookies",
    )
    SESSION_SAMESITE: str = Field(
        default=get_env("SESSION_SAMESITE", "strict"),
        pattern=r"^(strict|lax|none)$",
        description="SameSite cookie attribute",
    )
    SESSION_HTTPONLY: bool = Field(
        default=get_env("SESSION_HTTPONLY", "true").lower() == "true",
        description="HttpOnly cookie attribute",
    )

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v):
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters")
        # Warn if using default/weak keys
        weak_patterns = ["secret", "password", "key123", "changeme", "default"]
        if any(pattern in v.lower() for pattern in weak_patterns):
            logger.warning("SECRET_KEY appears to contain weak/default values")
        return v


class DatabaseSettings(BaseModel):
    """Database configuration with security settings"""

    DATABASE_URL: str = Field(
        default=get_env("DATABASE_URL", "sqlite:///./app.db", required_in_production=True),
        description="Database connection URL",
    )
    DATABASE_SSL_MODE: str = Field(
        default=get_env("DATABASE_SSL_MODE", "prefer"),
        pattern=r"^(disable|allow|prefer|require|verify-ca|verify-full)$",
        description="PostgreSQL SSL mode",
    )
    DATABASE_POOL_SIZE: int = Field(
        default=int(get_env("DATABASE_POOL_SIZE", "20")),
        ge=5,
        le=100,
        description="Database connection pool size",
    )
    DATABASE_MAX_OVERFLOW: int = Field(
        default=int(get_env("DATABASE_MAX_OVERFLOW", "10")),
        ge=5,
        le=50,
        description="Database connection pool overflow",
    )

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_database_url(cls, v):
        environment = os.getenv("ENVIRONMENT", "development").lower()
        if environment == "production":
            if v.startswith("sqlite://"):
                raise ValueError("SQLite is not allowed in production")
            if "password" in v.lower() and ("admin" in v.lower() or "root" in v.lower()):
                logger.warning("Database URL contains potentially weak credentials")
        return v


class RedisSettings(BaseModel):
    """Redis configuration with security settings"""

    REDIS_URL: str = Field(
        default=get_env("REDIS_URL", "redis://localhost:6379/0", required_in_production=True),
        description="Redis connection URL",
    )
    REDIS_SSL: bool = Field(
        default=get_env("REDIS_SSL", "false").lower() == "true",
        description="Use SSL for Redis connections",
    )
    REDIS_PASSWORD: Optional[str] = Field(
        default=get_env("REDIS_PASSWORD", required_in_production=False),
        description="Redis password (recommended in production)",
    )

    @field_validator("REDIS_URL")
    @classmethod
    def validate_redis_url(cls, v):
        environment = os.getenv("ENVIRONMENT", "development").lower()
        if environment == "production" and not ("password" in v.lower()):
            logger.warning("Redis URL should include authentication in production for security")
        return v


class MinIOSettings(BaseModel):
    """MinIO configuration with security validation"""

    MINIO_ENDPOINT: str = Field(
        default=get_env("MINIO_ENDPOINT", "localhost:9000", required_in_production=True),
        description="MinIO server endpoint",
    )
    MINIO_ACCESS_KEY: str = Field(
        default=get_env("MINIO_ACCESS_KEY", "minioadmin", required_in_production=True),
        min_length=3,
        description="MinIO access key",
    )
    MINIO_SECRET_KEY: str = Field(
        default=get_env("MINIO_SECRET_KEY", "minioadmin", required_in_production=True),
        min_length=8,
        description="MinIO secret key",
    )
    MINIO_SECURE: bool = Field(
        default=get_env("MINIO_SECURE", "false").lower() == "true",
        description="Use HTTPS for MinIO connections",
    )
    MINIO_BUCKET_NAME: str = Field(
        default=get_env("MINIO_BUCKET_NAME", "impact-images"),
        pattern=r"^[a-z0-9][a-z0-9-]*[a-z0-9]$",
        description="MinIO bucket name (must be DNS-compliant)",
    )
    MINIO_REGION: str = Field(
        default=get_env("MINIO_REGION", "us-east-1"),
        description="MinIO region for bucket operations",
    )

    @field_validator("MINIO_ACCESS_KEY", "MINIO_SECRET_KEY")
    @classmethod
    def validate_minio_credentials(cls, v, info):
        environment = os.getenv("ENVIRONMENT", "development").lower()
        if environment == "production":
            weak_patterns = ["admin", "default", "minio", "password", "123456"]
            if any(pattern in v.lower() for pattern in weak_patterns):
                raise ValueError(
                    f"{info.field_name} contains weak/default credentials in production"
                )
        return v


class EmailSettings(BaseModel):
    """Email service configuration"""

    EMAIL_BACKEND: str = Field(
        default=get_env("EMAIL_BACKEND", "console"),
        pattern=r"^(smtp|sendgrid|msgraph|console)$",
        description="Email backend: 'smtp', 'sendgrid', 'msgraph', or 'console' (development)",
    )
    EMAIL_FROM_ADDRESS: str = Field(
        default=get_env("EMAIL_FROM_ADDRESS", "noreply@oceanportal.io"),
        description="Default from email address",
    )
    EMAIL_FROM_NAME: str = Field(
        default=get_env("EMAIL_FROM_NAME", "Ocean Portal"), description="Default from name"
    )

    # SMTP Settings
    SMTP_HOST: Optional[str] = Field(default=get_env("SMTP_HOST"), description="SMTP server host")
    SMTP_PORT: int = Field(
        default=int(get_env("SMTP_PORT", "587")), ge=1, le=65535, description="SMTP server port"
    )
    SMTP_USER: Optional[str] = Field(default=get_env("SMTP_USER"), description="SMTP username")
    SMTP_PASSWORD: Optional[str] = Field(
        default=get_env("SMTP_PASSWORD"), description="SMTP password"
    )
    SMTP_USE_TLS: bool = Field(
        default=get_env("SMTP_USE_TLS", "true").lower() == "true",
        description="Use TLS for SMTP connections",
    )

    # SendGrid Settings
    SENDGRID_API_KEY: Optional[str] = Field(
        default=get_env("SENDGRID_API_KEY"), description="SendGrid API key"
    )

    # Microsoft Graph Settings
    MSGRAPH_TENANT_ID: Optional[str] = Field(
        default=get_env("MSGRAPH_TENANT_ID"), description="Microsoft Graph tenant ID"
    )
    MSGRAPH_CLIENT_ID: Optional[str] = Field(
        default=get_env("MSGRAPH_CLIENT_ID"), description="Microsoft Graph client ID"
    )
    MSGRAPH_CLIENT_SECRET: Optional[str] = Field(
        default=get_env("MSGRAPH_CLIENT_SECRET"), description="Microsoft Graph client secret"
    )
    MSGRAPH_AUTHORITY_URL: Optional[str] = Field(
        default=get_env("MSGRAPH_AUTHORITY_URL"), description="Microsoft Graph authority URL"
    )
    MSGRAPH_SCOPES: Optional[str] = Field(
        default=get_env("MSGRAPH_SCOPES", "https://graph.microsoft.com/.default"),
        description="Microsoft Graph API scopes"
    )

    @model_validator(mode="after")
    def validate_email_backend(self):
        """Validate email backend configuration"""
        if self.EMAIL_BACKEND == "smtp":
            if not self.SMTP_HOST:
                raise ValueError("SMTP_HOST is required when using smtp backend")
        elif self.EMAIL_BACKEND == "sendgrid":
            if not self.SENDGRID_API_KEY:
                raise ValueError("SENDGRID_API_KEY is required when using sendgrid backend")
        elif self.EMAIL_BACKEND == "msgraph":
            if not all([self.MSGRAPH_TENANT_ID, self.MSGRAPH_CLIENT_ID, self.MSGRAPH_CLIENT_SECRET]):
                raise ValueError("MSGRAPH_TENANT_ID, MSGRAPH_CLIENT_ID, and MSGRAPH_CLIENT_SECRET are required when using msgraph backend")
        return self


class Settings(BaseSettings):
    """
    Main application settings with comprehensive security validation.
    All settings are validated at startup with environment-specific requirements.
    """

    # Environment Configuration
    ENVIRONMENT: str = Field(
        default=get_env("ENVIRONMENT", "development"),
        pattern=r"^(development|staging|production)$",
        description="Application environment",
    )
    DEBUG: bool = Field(
        default=get_env("DEBUG", "false").lower() == "true",
        description="Enable debug mode (auto-disabled in production)",
    )

    # API Configuration
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Impact Database API"
    VERSION: str = "1.0.0"
    DESCRIPTION: str = "Secure API for managing impact assessment images and metadata"

    # Security Settings (nested)
    security: SecuritySettings = SecuritySettings()
    database: DatabaseSettings = DatabaseSettings()
    redis: RedisSettings = RedisSettings()
    minio: MinIOSettings = MinIOSettings()
    email: EmailSettings = EmailSettings()

    # File Upload Security
    MAX_FILE_SIZE: int = Field(
        default=int(get_env("MAX_FILE_SIZE", str(50 * 1024 * 1024))),  # 50MB
        ge=1024 * 1024,
        le=500 * 1024 * 1024,  # 1MB - 500MB
        description="Maximum file upload size in bytes",
    )
    ALLOWED_FILE_EXTENSIONS: Union[str, List[str]] = Field(
        default=get_env("ALLOWED_FILE_EXTENSIONS", "jpg,jpeg,png,gif,bmp,tiff,webp"),
        description="Allowed file extensions for upload",
    )
    SCAN_UPLOADS: bool = Field(
        default=get_env("SCAN_UPLOADS", "false").lower() == "true",
        description="Enable virus/malware scanning for uploads",
    )

    UPLOAD_DUPLICATE_POLICY: str = Field(
        default=get_env("UPLOAD_DUPLICATE_POLICY", "allow"),
        pattern=r"^(allow|reject|review)$",
        description="Policy for handling duplicate image uploads",
    )

    # CORS Configuration
    BACKEND_CORS_ORIGINS: List[str] = Field(
        default_factory=lambda: get_env(
            "ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:8000"
        ).split(","),
        description="Allowed CORS origins",
    )
    ENABLE_CORS: bool = Field(
        default=get_env("ENABLE_CORS", "true").lower() == "true",
        description="Enable CORS middleware",
    )

    # API Documentation Security
    ENABLE_API_DOCS: bool = Field(
        default=get_env("ENABLE_API_DOCS", "false").lower() == "true",
        description="Enable API documentation endpoints (auto-disabled in production)",
    )

    # Thumbnail Configuration
    THUMBNAIL_SIZE: tuple = (200, 200)
    THUMBNAIL_QUALITY: int = Field(
        default=int(get_env("THUMBNAIL_QUALITY", "85")),
        ge=50,
        le=100,
        description="JPEG thumbnail quality",
    )

    # Audit and Logging
    AUDIT_LOG_LEVEL: str = Field(
        default=get_env("AUDIT_LOG_LEVEL", "INFO"),
        pattern=r"^(DEBUG|INFO|WARNING|ERROR|CRITICAL)$",
        description="Audit logging level",
    )
    SENTRY_DSN: Optional[str] = Field(
        default=get_env("SENTRY_DSN"),
        description="Sentry DSN for error and performance monitoring",
    )
    SENTRY_TRACES_SAMPLE_RATE: float = Field(
        default=float(get_env("SENTRY_TRACES_SAMPLE_RATE", "0.05")),
        ge=0.0,
        le=1.0,
        description="Fraction of transactions to trace in Sentry",
    )
    SENTRY_ENABLE_TRACING: bool = Field(
        default=get_env("SENTRY_ENABLE_TRACING", "true").lower() == "true",
        description="Enable Sentry performance tracing when DSN is set",
    )
    LOG_FAILED_LOGINS: bool = Field(
        default=get_env("LOG_FAILED_LOGINS", "true").lower() == "true",
        description="Log failed login attempts",
    )
    LOG_RATE_LIMIT_VIOLATIONS: bool = Field(
        default=get_env("LOG_RATE_LIMIT_VIOLATIONS", "true").lower() == "true",
        description="Log rate limit violations",
    )
    LOG_SECURITY_EVENTS: bool = Field(
        default=get_env("LOG_SECURITY_EVENTS", "true").lower() == "true",
        description="Log security-related events",
    )

    # Content Security Policy
    CSP_DEFAULT_SRC: str = Field(
        default=get_env("CSP_DEFAULT_SRC", "'self'"), description="CSP default-src directive"
    )
    CSP_SCRIPT_SRC: str = Field(
        default=get_env("CSP_SCRIPT_SRC", "'self' 'unsafe-inline'"),
        description="CSP script-src directive",
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        validate_assignment = True

    @property
    def is_production(self) -> bool:
        """Check if running in production environment"""
        return self.ENVIRONMENT.lower() == "production"

    @property
    def is_development(self) -> bool:
        """Check if running in development environment"""
        return self.ENVIRONMENT.lower() == "development"

    @property
    def is_staging(self) -> bool:
        """Check if running in staging environment"""
        return self.ENVIRONMENT.lower() == "staging"

    # Backward compatibility properties
    @property
    def DATABASE_URL(self) -> str:
        return self.database.DATABASE_URL

    @property
    def REDIS_URL(self) -> str:
        return self.redis.REDIS_URL

    @property
    def SECRET_KEY(self) -> str:
        return self.security.SECRET_KEY

    @property
    def CELERY_BROKER_URL(self) -> str:
        return self.redis.REDIS_URL

    @property
    def CELERY_RESULT_BACKEND(self) -> str:
        return self.redis.REDIS_URL

    @property
    def API_BASE_URL(self) -> str:
        """Base URL for API endpoints, used by workers/webhooks"""
        # Check for explicit env var first
        explicit_url = get_env("API_BASE_URL")
        if explicit_url:
            return explicit_url
        # Default based on environment
        if self.is_production:
            return get_env("API_BASE_URL", "https://api.oceanportal.io")
        return get_env("API_BASE_URL", "http://localhost:8000")

    @validator("ALLOWED_FILE_EXTENSIONS", pre=True)
    def parse_file_extensions(cls, v):
        if isinstance(v, str):
            # Handle JSON array format
            if v.startswith("["):
                try:
                    return json.loads(v)
                except json.JSONDecodeError:
                    pass
            # Handle comma-separated format
            return [ext.strip() for ext in v.split(",")]
        return v

    @field_validator("DEBUG")
    @classmethod
    def disable_debug_in_production(cls, v, info):
        """Automatically disable debug mode in production"""
        values = info.data if info.data else {}
        if values.get("ENVIRONMENT") == "production" and v:
            logger.warning("DEBUG mode automatically disabled in production")
            return False
        return v

    @field_validator("ENABLE_API_DOCS")
    @classmethod
    def disable_api_docs_in_production(cls, v, info):
        """Auto-disable API docs in production"""
        values = info.data if info.data else {}
        if values.get("ENVIRONMENT") == "production" and v:
            logger.warning(
                "API documentation automatically disabled in production for security"
            )
            return False
        return v

    @field_validator("BACKEND_CORS_ORIGINS")
    @classmethod
    def validate_cors_origins(cls, v, info):
        """Validate CORS origins for security"""
        values = info.data if info.data else {}
        environment = values.get("ENVIRONMENT", "development").lower()
        if environment == "production":
            for origin in v:
                if origin == "*":
                    raise ValueError("Wildcard CORS origins not allowed in production")
                if origin.startswith("http://") and not origin.startswith("http://localhost"):
                    logger.warning(f"HTTP origin {origin} in production - consider using HTTPS")
        return v

    @model_validator(mode="after")
    def validate_environment_requirements(self):
        """Comprehensive environment-specific validation"""
        values = self.model_dump()
        environment = values.get("ENVIRONMENT", "development").lower()

        if environment == "production":
            # Production security requirements
            required_settings = {
                "security.SECRET_KEY": "JWT signing requires secure secret key",
                "database.DATABASE_URL": "Production database connection required",
                "redis.REDIS_URL": "Redis required for production caching/queuing",
                "minio.MINIO_ENDPOINT": "MinIO required for file storage",
                "minio.MINIO_ACCESS_KEY": "MinIO credentials required",
                "minio.MINIO_SECRET_KEY": "MinIO credentials required",
            }

            missing = []
            for setting_path, description in required_settings.items():
                # Navigate nested settings
                obj = values
                for part in setting_path.split("."):
                    if hasattr(obj, part):
                        obj = getattr(obj, part)
                    elif isinstance(obj, dict) and part in obj:
                        obj = obj[part]
                    else:
                        obj = None
                        break

                if not obj:
                    missing.append(f"{setting_path}: {description}")

            if missing:
                error_msg = "Production environment requires:\n" + "\n".join(
                    f"  - {req}" for req in missing
                )
                raise ValueError(error_msg)

            # Production security warnings
            security_warnings = []

            # Check SSL/TLS settings
            if not values.get("minio", {}).get("MINIO_SECURE"):
                security_warnings.append("MinIO should use HTTPS in production")

            if not values.get("redis", {}).get("REDIS_SSL"):
                security_warnings.append("Redis should use SSL in production")

            # Check database SSL
            db_url = values.get("database", {}).get("DATABASE_URL", "")
            if "sslmode=disable" in db_url.lower():
                security_warnings.append("Database SSL should be enabled in production")

            if security_warnings:
                logger.warning(
                    "Production security recommendations:\n"
                    + "\n".join(f"  - {warning}" for warning in security_warnings)
                )

        return self

    def validate_startup(self):
        """Validate configuration at application startup"""
        logger.info(f"Initializing {self.PROJECT_NAME} v{self.VERSION}")
        logger.info(f"Environment: {self.ENVIRONMENT}")
        logger.info(f"Debug mode: {self.DEBUG}")

        if self.is_production:
            logger.info("Production mode: Enhanced security validations active")

            # Log security settings
            logger.info(f"JWT token expiry: {self.security.ACCESS_TOKEN_EXPIRE_MINUTES} minutes")
            logger.info(
                f"Rate limiting: {self.security.RATE_LIMIT_REQUESTS} requests per {self.security.RATE_LIMIT_WINDOW}s"
            )
            logger.info(f"File upload limit: {self.MAX_FILE_SIZE // (1024*1024)}MB")
            logger.info(f"API docs enabled: {self.ENABLE_API_DOCS}")

        # Test critical connections would go here in a real startup validation
        logger.info("Configuration validation completed successfully")


def create_settings() -> Settings:
    """Factory function to create and validate settings"""
    try:
        settings = Settings()
        settings.validate_startup()
        return settings
    except Exception as e:
        logger.error(f"Configuration validation failed: {e}")
        sys.exit(1)


# Create global settings instance with validation
settings = create_settings()

# Export commonly used settings for backward compatibility
REDIS_URL = settings.REDIS_URL
DATABASE_URL = settings.DATABASE_URL
SECRET_KEY = settings.SECRET_KEY

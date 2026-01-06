"""Upload failure tracking model for diagnostics and debugging."""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    BigInteger,
    Enum as SQLEnum,
    ForeignKey,
)
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime, timezone
from enum import Enum

from models.database import Base


class FailureReason(str, Enum):
    """Enumeration of upload failure reasons."""

    NO_GEOTAG = "NO_GEOTAG"  # Image has no GPS coordinates in EXIF
    CORRUPTED_EXIF = "CORRUPTED_EXIF"  # EXIF data is malformed or unreadable
    UNREADABLE_FILE = "UNREADABLE_FILE"  # File cannot be opened or is corrupted
    INVALID_COORDINATES = "INVALID_COORDINATES"  # Coordinates are out of valid range
    UNSUPPORTED_FORMAT = "UNSUPPORTED_FORMAT"  # File format not supported
    FILE_TOO_LARGE = "FILE_TOO_LARGE"  # File exceeds size limit
    DUPLICATE_CONTENT = "DUPLICATE_CONTENT"  # Content hash matches existing image
    SECURITY_VIOLATION = "SECURITY_VIOLATION"  # GPS spoofing or other security issue
    DATABASE_ERROR = "DATABASE_ERROR"  # Database constraint violation
    STORAGE_ERROR = "STORAGE_ERROR"  # MinIO/storage upload failed
    VALIDATION_ERROR = "VALIDATION_ERROR"  # Metadata validation failed


class UploadFailureLog(Base):
    """Track failed upload attempts for debugging and user feedback."""

    __tablename__ = "upload_failures"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # File information
    filename = Column(String(255), nullable=False)
    file_size = Column(BigInteger, nullable=True)  # bytes
    mime_type = Column(String(100), nullable=True)
    file_hash = Column(String(64), nullable=True, index=True)  # SHA-256 hash

    # Failure details
    failure_reason = Column(SQLEnum(FailureReason), nullable=False, index=True)
    error_details = Column(Text, nullable=True)  # Full error message/stack trace

    # User context
    uploader_id = Column(String, nullable=True)  # User who attempted upload

    # Temporal information
    attempted_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    # Request metadata (for debugging)
    user_agent = Column(String(500), nullable=True)
    ip_address = Column(String(45), nullable=True)  # IPv6 max length

    def __repr__(self):
        return f"<UploadFailureLog(id={self.id}, filename='{self.filename}', reason='{self.failure_reason.value}')>"

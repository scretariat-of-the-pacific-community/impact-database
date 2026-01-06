"""Batch upload model for tracking multi-file upload jobs."""

from sqlalchemy import Column, Integer, String, DateTime, Enum as SQLEnum, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime, timezone
from enum import Enum
import uuid

from models.database import Base


class BatchStatus(str, Enum):
    """Batch upload processing status."""

    PENDING = "pending"  # Created but not yet processing
    PROCESSING = "processing"  # Currently being processed
    COMPLETED = "completed"  # All files processed successfully
    PARTIAL = "partial"  # Some files succeeded, some failed
    FAILED = "failed"  # Batch processing failed entirely
    CANCELLED = "cancelled"  # User cancelled the batch


class UploadBatch(Base):
    """Track batch upload jobs with progress and results."""

    __tablename__ = "upload_batches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # User information
    uploader_id = Column(String, nullable=False, index=True)

    # Batch metadata
    total_files = Column(Integer, nullable=False)
    processed_files = Column(Integer, default=0, nullable=False)
    successful_files = Column(Integer, default=0, nullable=False)
    failed_files = Column(Integer, default=0, nullable=False)

    # Status tracking
    status = Column(SQLEnum(BatchStatus), default=BatchStatus.PENDING, nullable=False, index=True)

    # Temporal information
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Results and metadata
    failure_summary = Column(JSON, nullable=True)  # List of failed files with reasons
    metadata_template = Column(JSON, nullable=True)  # Common metadata for all files

    # Progress details
    current_file = Column(String, nullable=True)  # Currently processing filename
    estimated_completion = Column(DateTime(timezone=True), nullable=True)

    @property
    def progress_percent(self) -> float:
        """Calculate progress percentage."""
        if self.total_files == 0:
            return 0.0
        return (self.processed_files / self.total_files) * 100

    @property
    def is_complete(self) -> bool:
        """Check if batch is complete (success or failure)."""
        return self.status in [
            BatchStatus.COMPLETED,
            BatchStatus.PARTIAL,
            BatchStatus.FAILED,
            BatchStatus.CANCELLED,
        ]

    def __repr__(self):
        return f"<UploadBatch(id={self.id}, status='{self.status.value}', progress={self.progress_percent:.1f}%)>"

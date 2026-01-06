"""Curation workflow models for admin functionality."""

from sqlalchemy import (
    Column,
    String,
    Text,
    DateTime,
    Boolean,
    Integer,
    ForeignKey,
    JSON,
    Enum as SQLEnum,
)
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
import enum
from .database import Base


class CurationStatus(enum.Enum):
    """Status enum for curation workflow."""

    PENDING = "pending"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    NEEDS_CHANGES = "needs_changes"
    DUPLICATE = "duplicate"
    ARCHIVED = "archived"


class Priority(enum.Enum):
    """Priority levels for curation items."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class ActionType(enum.Enum):
    """Types of actions in curation workflow."""

    UPLOADED = "uploaded"
    REVIEWED = "reviewed"
    APPROVED = "approved"
    REJECTED = "rejected"
    FLAGGED = "flagged"
    UNFLAGGED = "unflagged"
    EDITED = "edited"
    MERGED = "merged"
    MARKED_DUPLICATE = "marked_duplicate"
    RESTORED = "restored"
    DELETED = "deleted"
    COMMENTED = "commented"
    BULK_IMPORTED = "bulk_imported"


class CurationQueue(Base):
    """Queue for items requiring curation review."""

    __tablename__ = "curation_queue"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    image_filename = Column(String, ForeignKey("image_metadata.filename"), nullable=False)
    status = Column(SQLEnum(CurationStatus), default=CurationStatus.PENDING, nullable=False)
    priority = Column(SQLEnum(Priority), default=Priority.MEDIUM, nullable=False)

    # Assignment and tracking
    assigned_to = Column(String, nullable=True)  # User ID/email of assigned curator
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    due_date = Column(DateTime, nullable=True)

    # Submission details
    submitted_by = Column(String, nullable=True)  # User who submitted for review
    submission_notes = Column(Text, nullable=True)

    # Review details
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    review_notes = Column(Text, nullable=True)

    # Flags and indicators
    is_flagged = Column(Boolean, default=False)
    flag_reason = Column(String, nullable=True)
    is_duplicate = Column(Boolean, default=False)
    duplicate_of = Column(String, nullable=True)  # filename of original

    # Soft delete
    is_deleted = Column(Boolean, default=False)
    deleted_by = Column(String, nullable=True)
    deleted_at = Column(DateTime, nullable=True)

    # Relationships
    image = relationship("ImageMetadata", foreign_keys=[image_filename])
    comments = relationship(
        "CurationComment", back_populates="queue_item", cascade="all, delete-orphan"
    )
    actions = relationship(
        "CurationAction", back_populates="queue_item", cascade="all, delete-orphan"
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "image_filename": self.image_filename,
            "status": self.status.value,
            "priority": self.priority.value,
            "assigned_to": self.assigned_to,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "submitted_by": self.submitted_by,
            "submission_notes": self.submission_notes,
            "reviewed_by": self.reviewed_by,
            "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None,
            "review_notes": self.review_notes,
            "is_flagged": self.is_flagged,
            "flag_reason": self.flag_reason,
            "is_duplicate": self.is_duplicate,
            "duplicate_of": self.duplicate_of,
            "is_deleted": self.is_deleted,
            "deleted_by": self.deleted_by,
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
        }


class CurationComment(Base):
    """Comments on items in curation queue."""

    __tablename__ = "curation_comments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    queue_item_id = Column(UUID(as_uuid=True), ForeignKey("curation_queue.id"), nullable=False)

    # Comment details
    author = Column(String, nullable=False)  # User ID/email
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Comment type and context
    comment_type = Column(String, default="general")  # general, review, technical, administrative
    is_internal = Column(Boolean, default=False)  # Internal curator notes vs public comments

    # Reply threading
    parent_comment_id = Column(
        UUID(as_uuid=True), ForeignKey("curation_comments.id"), nullable=True
    )

    # Soft delete
    is_deleted = Column(Boolean, default=False)
    deleted_at = Column(DateTime, nullable=True)

    # Relationships
    queue_item = relationship("CurationQueue", back_populates="comments")
    parent = relationship("CurationComment", remote_side=[id])
    replies = relationship("CurationComment", back_populates="parent")

    def to_dict(self):
        return {
            "id": str(self.id),
            "queue_item_id": str(self.queue_item_id),
            "author": self.author,
            "content": self.content,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "comment_type": self.comment_type,
            "is_internal": self.is_internal,
            "parent_comment_id": str(self.parent_comment_id) if self.parent_comment_id else None,
            "is_deleted": self.is_deleted,
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
        }


class CurationAction(Base):
    """Action log for curation workflow."""

    __tablename__ = "curation_actions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    queue_item_id = Column(UUID(as_uuid=True), ForeignKey("curation_queue.id"), nullable=False)

    # Action details
    action_type = Column(SQLEnum(ActionType), nullable=False)
    performed_by = Column(String, nullable=False)  # User ID/email
    performed_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Action context
    description = Column(Text, nullable=True)
    metadata_changes = Column(JSON, nullable=True)  # Before/after for edits
    notes = Column(Text, nullable=True)

    # Related items (for merges, duplicates)
    related_item_id = Column(String, nullable=True)

    # Relationships
    queue_item = relationship("CurationQueue", back_populates="actions")

    def to_dict(self):
        return {
            "id": str(self.id),
            "queue_item_id": str(self.queue_item_id),
            "action_type": self.action_type.value,
            "performed_by": self.performed_by,
            "performed_at": self.performed_at.isoformat(),
            "description": self.description,
            "metadata_changes": self.metadata_changes,
            "notes": self.notes,
            "related_item_id": self.related_item_id,
        }


class BulkImport(Base):
    """Bulk import operations tracking."""

    __tablename__ = "bulk_imports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Import details
    import_type = Column(String, nullable=False)  # zip, csv, folder
    original_filename = Column(String, nullable=True)
    total_items = Column(Integer, default=0)
    processed_items = Column(Integer, default=0)
    successful_items = Column(Integer, default=0)
    failed_items = Column(Integer, default=0)

    # Status and timing
    status = Column(String, default="pending")  # pending, processing, completed, failed
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # User and execution context
    created_by = Column(String, nullable=False)
    is_dry_run = Column(Boolean, default=False)

    # Results and reports
    import_report = Column(JSON, nullable=True)  # Detailed results
    error_log = Column(JSON, nullable=True)  # Errors encountered
    validation_results = Column(JSON, nullable=True)  # Pre-import validation

    # Configuration
    import_settings = Column(JSON, nullable=True)  # Import parameters
    mapping_config = Column(JSON, nullable=True)  # Field mappings for CSV

    def to_dict(self):
        return {
            "id": str(self.id),
            "import_type": self.import_type,
            "original_filename": self.original_filename,
            "total_items": self.total_items,
            "processed_items": self.processed_items,
            "successful_items": self.successful_items,
            "failed_items": self.failed_items,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "created_by": self.created_by,
            "is_dry_run": self.is_dry_run,
            "import_report": self.import_report,
            "error_log": self.error_log,
            "validation_results": self.validation_results,
            "import_settings": self.import_settings,
            "mapping_config": self.mapping_config,
        }


class ExportRequest(Base):
    """Export request tracking."""

    __tablename__ = "export_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Export details
    export_type = Column(String, nullable=False)  # csv, iso19139, json, geojson
    format_options = Column(JSON, nullable=True)  # Format-specific options
    filters = Column(JSON, nullable=True)  # Query filters applied

    # Status and timing
    status = Column(String, default="pending")  # pending, processing, completed, failed
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # User context
    requested_by = Column(String, nullable=False)

    # Results
    total_records = Column(Integer, default=0)
    file_url = Column(String, nullable=True)  # Download URL
    file_size = Column(Integer, nullable=True)  # File size in bytes
    expires_at = Column(DateTime, nullable=True)  # When download link expires

    # Error handling
    error_message = Column(Text, nullable=True)

    def to_dict(self):
        return {
            "id": str(self.id),
            "export_type": self.export_type,
            "format_options": self.format_options,
            "filters": self.filters,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "requested_by": self.requested_by,
            "total_records": self.total_records,
            "file_url": self.file_url,
            "file_size": self.file_size,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "error_message": self.error_message,
        }

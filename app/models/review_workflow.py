"""
Review Workflow Models - Phase 1: Assignment & Audit Trail
Models for review items, assignment tracking, and comprehensive audit logging
"""

from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Float, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from datetime import datetime, timezone
import uuid
import enum

from models.database import Base


class ReviewStatus(str, enum.Enum):
    """Review item status enum"""
    PENDING = "pending"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    NEEDS_CHANGES = "needs_changes"
    DUPLICATE = "duplicate"
    ARCHIVED = "archived"


class ReviewPriority(str, enum.Enum):
    """Review item priority enum"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class AssignmentReason(str, enum.Enum):
    """Assignment reason enum"""
    AUTO = "auto"
    MANUAL = "manual"
    REASSIGNED = "reassigned"
    ESCALATED = "escalated"
    WORKLOAD_BALANCE = "workload_balance"


class ReviewItem(Base):
    """
    Review Item Model
    Represents an image submission that needs review/curation
    Maps to image_metadata but adds workflow state
    """
    __tablename__ = "review_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    image_id = Column(UUID(as_uuid=True), ForeignKey('image_metadata.id', ondelete='CASCADE'), nullable=False, unique=True)
    
    # Status & Priority
    status = Column(String(50), nullable=False, default=ReviewStatus.PENDING.value, index=True)
    priority = Column(String(20), nullable=False, default=ReviewPriority.MEDIUM.value, index=True)
    
    # Assignment
    assigned_to = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=True, index=True)
    assigned_at = Column(DateTime(timezone=True), nullable=True)
    assigned_by = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=True)
    
    # Submission Info
    submitted_by = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False, index=True)
    submitted_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    
    # Review Info
    reviewed_by = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewer_notes = Column(Text, nullable=True)
    
    # Flagging
    is_flagged = Column(Boolean, default=False, index=True)
    flag_reason = Column(Text, nullable=True)
    flagged_by = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=True)
    flagged_at = Column(DateTime(timezone=True), nullable=True)
    
    # Metadata
    title = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    review_metadata = Column(JSONB, default={}, nullable=False)
    
    # Duplicates
    is_duplicate = Column(Boolean, default=False)
    duplicate_of = Column(UUID(as_uuid=True), ForeignKey('review_items.id'), nullable=True)
    
    # Timing
    due_date = Column(DateTime(timezone=True), nullable=True, index=True)
    last_modified = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Workflow tracking
    workflow_state = Column(JSONB, default={}, nullable=False)
    review_duration_minutes = Column(Integer, nullable=True)
    
    # Relationships
    assignee = relationship("User", foreign_keys=[assigned_to], backref="assigned_reviews")
    assigner = relationship("User", foreign_keys=[assigned_by])
    submitter = relationship("User", foreign_keys=[submitted_by], backref="submitted_reviews")
    reviewer = relationship("User", foreign_keys=[reviewed_by])
    flagger = relationship("User", foreign_keys=[flagged_by])
    
    assignments = relationship("ReviewAssignment", back_populates="review_item", cascade="all, delete-orphan")
    audit_trail = relationship("ReviewAuditTrail", back_populates="review_item", cascade="all, delete-orphan")
    
    def to_dict(self):
        """Convert to dictionary for API responses"""
        return {
            'id': str(self.id),
            'image_id': str(self.image_id),
            'status': self.status,
            'priority': self.priority,
            'assigned_to': str(self.assigned_to) if self.assigned_to else None,
            'assigned_at': self.assigned_at.isoformat() if self.assigned_at else None,
            'assigned_by': str(self.assigned_by) if self.assigned_by else None,
            'submitted_by': str(self.submitted_by),
            'submitted_at': self.submitted_at.isoformat() if self.submitted_at else None,
            'reviewed_by': str(self.reviewed_by) if self.reviewed_by else None,
            'reviewed_at': self.reviewed_at.isoformat() if self.reviewed_at else None,
            'reviewer_notes': self.reviewer_notes,
            'is_flagged': self.is_flagged,
            'flag_reason': self.flag_reason,
            'flagged_at': self.flagged_at.isoformat() if self.flagged_at else None,
            'title': self.title,
            'description': self.description,
            'metadata': self.metadata,
            'is_duplicate': self.is_duplicate,
            'duplicate_of': str(self.duplicate_of) if self.duplicate_of else None,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'last_modified': self.last_modified.isoformat() if self.last_modified else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'workflow_state': self.workflow_state,
            'review_duration_minutes': self.review_duration_minutes
        }
    
    def calculate_review_duration(self):
        """Calculate review duration if completed"""
        if self.completed_at and self.assigned_at:
            duration = (self.completed_at - self.assigned_at).total_seconds() / 60
            self.review_duration_minutes = int(duration)


class ReviewAssignment(Base):
    """
    Review Assignment History
    Tracks all assignments/reassignments for audit purposes
    """
    __tablename__ = "review_assignments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    review_item_id = Column(UUID(as_uuid=True), ForeignKey('review_items.id', ondelete='CASCADE'), nullable=False, index=True)
    
    assigned_to = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False, index=True)
    assigned_by = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    assigned_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
    unassigned_at = Column(DateTime(timezone=True), nullable=True)
    
    reason = Column(String(50), nullable=True)  # auto, manual, reassigned, escalated
    notes = Column(Text, nullable=True)
    
    # Relationships
    review_item = relationship("ReviewItem", back_populates="assignments")
    assignee = relationship("User", foreign_keys=[assigned_to])
    assigner = relationship("User", foreign_keys=[assigned_by])
    
    def to_dict(self):
        return {
            'id': self.id,
            'review_item_id': str(self.review_item_id),
            'assigned_to': str(self.assigned_to),
            'assigned_by': str(self.assigned_by),
            'assigned_at': self.assigned_at.isoformat() if self.assigned_at else None,
            'unassigned_at': self.unassigned_at.isoformat() if self.unassigned_at else None,
            'reason': self.reason,
            'notes': self.notes
        }


class AuditAction(str, enum.Enum):
    """Audit action types"""
    CREATED = "created"
    UPDATED = "updated"
    STATUS_CHANGED = "status_changed"
    ASSIGNED = "assigned"
    UNASSIGNED = "unassigned"
    FLAGGED = "flagged"
    UNFLAGGED = "unflagged"
    COMMENTED = "commented"
    APPROVED = "approved"
    REJECTED = "rejected"
    METADATA_UPDATED = "metadata_updated"
    DUPLICATE_MARKED = "duplicate_marked"
    PRIORITY_CHANGED = "priority_changed"


class ReviewAuditTrail(Base):
    """
    Review Audit Trail
    Comprehensive logging of all changes to review items
    """
    __tablename__ = "review_audit_trail"

    id = Column(Integer, primary_key=True, autoincrement=True)
    review_item_id = Column(UUID(as_uuid=True), ForeignKey('review_items.id', ondelete='CASCADE'), nullable=False, index=True)
    
    # Action Details
    action = Column(String(50), nullable=False, index=True)
    actor_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=True)
    actor_name = Column(String(255), nullable=True)
    actor_role = Column(String(50), nullable=True)
    
    # Change Details
    field_changed = Column(String(100), nullable=True)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    change_summary = Column(JSONB, nullable=True)  # Full before/after snapshot
    
    # Context
    reason = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    source = Column(String(50), default='web', nullable=False)  # web, api, background_job, system
    
    # Request metadata
    ip_address = Column(String(45), nullable=True)  # IPv6 max length
    user_agent = Column(Text, nullable=True)
    session_id = Column(String(255), nullable=True)
    request_id = Column(String(255), nullable=True)
    api_endpoint = Column(String(255), nullable=True)
    
    # Timing
    timestamp = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
    processing_duration_ms = Column(Integer, nullable=True)
    
    # Metadata
    audit_metadata = Column(JSONB, default={}, nullable=False)
    
    # Relationships
    review_item = relationship("ReviewItem", back_populates="audit_trail")
    actor = relationship("User", foreign_keys=[actor_id])
    
    def to_dict(self):
        return {
            'id': self.id,
            'review_item_id': str(self.review_item_id),
            'action': self.action,
            'actor_id': str(self.actor_id) if self.actor_id else None,
            'actor_name': self.actor_name,
            'actor_role': self.actor_role,
            'field_changed': self.field_changed,
            'old_value': self.old_value,
            'new_value': self.new_value,
            'change_summary': self.change_summary,
            'reason': self.reason,
            'notes': self.notes,
            'source': self.source,
            'ip_address': self.ip_address,
            'user_agent': self.user_agent,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'metadata': self.audit_metadata
        }
    
    @classmethod
    def log_action(cls, db, review_item_id, action, actor=None, field_changed=None, 
                   old_value=None, new_value=None, reason=None, notes=None, 
                   source='web', metadata=None, request=None):
        """Helper method to log an audit trail entry"""
        entry = cls(
            review_item_id=review_item_id,
            action=action,
            actor_id=actor.id if actor else None,
            actor_name=actor.username if actor else 'system',
            actor_role=actor.role.name if actor and actor.role else None,
            field_changed=field_changed,
            old_value=str(old_value) if old_value is not None else None,
            new_value=str(new_value) if new_value is not None else None,
            reason=reason,
            notes=notes,
            source=source,
            ip_address=request.client.host if request else None,
            user_agent=request.headers.get('user-agent') if request else None,
            audit_metadata=metadata or {}
        )
        db.add(entry)
        return entry

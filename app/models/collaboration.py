"""Collaboration feature models for follows, posts, and invitations."""

from datetime import datetime, timezone
import uuid

from sqlalchemy import Column, DateTime, Integer, String, ForeignKey, UniqueConstraint, Boolean, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB

from models.database import Base


class FollowedArea(Base):
    """User follows for hazards or regions."""

    __tablename__ = "followed_areas"
    __table_args__ = (UniqueConstraint("user_id", "target_type", "target_value", name="uq_follow"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, ForeignKey("users.username", ondelete="CASCADE"), nullable=False, index=True)
    target_type = Column(String(20), nullable=False)  # hazard | region
    target_value = Column(String(200), nullable=False)
    context = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": str(self.id),
            "user_id": self.user_id,
            "target_type": self.target_type,
            "target_value": self.target_value,
            "context": self.context,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ActivityPost(Base):
    """Team posts/updates for feeds."""

    __tablename__ = "activity_posts"
    __table_args__ = (UniqueConstraint("author_id", "created_at", name="uq_activity_post_author_timestamp"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    author_id = Column(String, ForeignKey("users.username", ondelete="SET NULL"), nullable=True, index=True)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="SET NULL"), nullable=True, index=True)
    content = Column(Text, nullable=False)
    post_metadata = Column(JSONB, default=dict, nullable=False)  # Renamed from 'metadata' to avoid SQLAlchemy conflict
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    is_pinned = Column(Boolean, nullable=False, default=False)

    def to_dict(self):
        return {
            "id": str(self.id),
            "author_id": self.author_id,
            "workspace_id": str(self.workspace_id) if self.workspace_id else None,
            "content": self.content,
            "metadata": self.post_metadata or {},  # Keep API response field as 'metadata'
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "is_pinned": self.is_pinned,
        }


class WorkspaceInvitation(Base):
    """Workspace invitations tracked by email or user."""

    __tablename__ = "workspace_invitations"
    __table_args__ = (UniqueConstraint("workspace_id", "invitee_email", name="uq_workspace_invitee"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    invitee_email = Column(String(255), nullable=False, index=True)
    invitee_username = Column(String, ForeignKey("users.username", ondelete="SET NULL"), nullable=True, index=True)
    invited_by = Column(String, ForeignKey("users.username", ondelete="SET NULL"), nullable=True, index=True)
    role = Column(String(20), nullable=False, default="viewer")
    status = Column(String(20), nullable=False, default="pending")  # pending, accepted, declined, expired
    token = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime(timezone=True), nullable=True)

    def to_dict(self):
        return {
            "id": str(self.id),
            "workspace_id": str(self.workspace_id),
            "invitee_email": self.invitee_email,
            "invitee_username": self.invitee_username,
            "invited_by": self.invited_by,
            "role": self.role,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
        }


class SharedFolder(Base):
    """Shared folders for organizing collaborative uploads."""

    __tablename__ = "shared_folders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True)
    owner_id = Column(String, ForeignKey("users.username", ondelete="CASCADE"), nullable=False, index=True)
    description = Column(Text, nullable=True)
    hazard_filter = Column(String(50), nullable=True)  # Optional filter for hazard type
    region_filter = Column(String(200), nullable=True)  # Optional filter for region
    is_public = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "workspace_id": str(self.workspace_id) if self.workspace_id else None,
            "owner_id": self.owner_id,
            "description": self.description,
            "hazard_filter": self.hazard_filter,
            "region_filter": self.region_filter,
            "is_public": self.is_public,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class FolderWatch(Base):
    """User watches on shared folders."""

    __tablename__ = "folder_watches"
    __table_args__ = (UniqueConstraint("folder_id", "user_id", name="uq_folder_watch"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    folder_id = Column(UUID(as_uuid=True), ForeignKey("shared_folders.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.username", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": str(self.id),
            "folder_id": str(self.folder_id),
            "user_id": self.user_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class FolderItem(Base):
    """Items (image uploads) associated with shared folders."""

    __tablename__ = "folder_items"
    __table_args__ = (UniqueConstraint("folder_id", "image_id", name="uq_folder_item"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    folder_id = Column(UUID(as_uuid=True), ForeignKey("shared_folders.id", ondelete="CASCADE"), nullable=False)
    # Reference image_metadata.id (UUID) rather than non-existent images table
    image_id = Column(UUID(as_uuid=True), ForeignKey("image_metadata.id", ondelete="CASCADE"), nullable=False)
    added_by = Column(String, ForeignKey("users.username", ondelete="SET NULL"), nullable=True)
    added_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": str(self.id),
            "folder_id": str(self.folder_id),
            "image_id": str(self.image_id) if self.image_id else None,
            "added_by": self.added_by,
            "added_at": self.added_at.isoformat() if self.added_at else None,
        }

"""Batch template model for saving metadata presets."""

import uuid
from datetime import datetime, timezone

from models.database import Base
from sqlalchemy import JSON, Column, DateTime, String
from sqlalchemy.dialects.postgresql import UUID


class BatchTemplateModel(Base):
    """Save commonly used batch upload metadata as templates."""

    __tablename__ = "batch_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # User information
    user_id = Column(String, nullable=False, index=True)

    # Template identification
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)

    # Metadata template
    template_data = Column(JSON, nullable=False)

    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Usage tracking
    use_count = Column(String, default=0)
    last_used_at = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self):
        return f"<BatchTemplate(id={self.id}, name='{self.name}', user_id='{self.user_id}')>"

from sqlalchemy import Column, String, DateTime, Boolean, Integer, JSON, Text
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime, timezone
import uuid
from .database import Base

class WebhookSubscription(Base):
    """
    Represents a webhook subscription for receiving notifications about approved impact events.
    """
    __tablename__ = "webhook_subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    callback_url = Column(String, nullable=False)
    secret = Column(String, nullable=True)  # For signing webhook payloads (future hardening)
    filters = Column(JSON, nullable=True)  # e.g., {"bbox": [...], "hazard_type": "flood", "event_id": "abc"}
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    last_triggered_at = Column(DateTime(timezone=True), nullable=True)
    failure_count = Column(Integer, default=0, nullable=False)
    last_failure_reason = Column(Text, nullable=True)

    def to_dict(self):
        return {
            "id": str(self.id),
            "callback_url": self.callback_url,
            "filters": self.filters,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "last_triggered_at": self.last_triggered_at.isoformat() if self.last_triggered_at else None,
            "failure_count": self.failure_count,
            "last_failure_reason": self.last_failure_reason,
        }

    def __repr__(self):
        return f"<WebhookSubscription(id='{self.id}', callback_url='{self.callback_url}', is_active={self.is_active})>"

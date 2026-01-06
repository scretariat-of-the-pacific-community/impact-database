from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, HttpUrl, Field
import uuid

from models.database import get_db
from models.webhook import WebhookSubscription

router = APIRouter()


# Pydantic Models for request/response validation
class WebhookSubscriptionCreate(BaseModel):
    callback_url: HttpUrl = Field(..., example="https://example.com/webhook-receiver")
    filters: Optional[Dict[str, Any]] = Field(
        None,
        example={
            "bbox": [-10.0, -10.0, 10.0, 10.0],
            "hazard_type": "flood",
            "event_id": "event-123",
        },
    )


class WebhookSubscriptionResponse(BaseModel):
    id: uuid.UUID
    callback_url: HttpUrl
    filters: Optional[Dict[str, Any]]
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_triggered_at: Optional[datetime]
    failure_count: int

    class Config:
        from_attributes = True  # For Pydantic v2, use from_attributes = True
        # For Pydantic v1, use orm_mode = True


class WebhookSubscriptionUpdate(BaseModel):
    is_active: Optional[bool] = None
    filters: Optional[Dict[str, Any]] = None


# API Endpoints
@router.post("/", response_model=WebhookSubscriptionResponse, status_code=status.HTTP_201_CREATED)
def register_webhook(webhook_data: WebhookSubscriptionCreate, db: Session = Depends(get_db)):
    """Register a new webhook subscription."""
    db_webhook = WebhookSubscription(
        callback_url=str(webhook_data.callback_url), filters=webhook_data.filters, is_active=True
    )
    db.add(db_webhook)
    db.commit()
    db.refresh(db_webhook)
    return db_webhook


@router.get("/", response_model=List[WebhookSubscriptionResponse])
def list_webhooks(
    db: Session = Depends(get_db),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
):
    """List all webhook subscriptions. (Authentication would typically filter by owner)."""
    query = db.query(WebhookSubscription)
    if is_active is not None:
        query = query.filter(WebhookSubscription.is_active == is_active)
    return query.all()


@router.get("/{webhook_id}", response_model=WebhookSubscriptionResponse)
def get_webhook(webhook_id: uuid.UUID, db: Session = Depends(get_db)):
    """Get a single webhook subscription by ID."""
    db_webhook = db.query(WebhookSubscription).filter(WebhookSubscription.id == webhook_id).first()
    if db_webhook is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")
    return db_webhook


@router.patch("/{webhook_id}", response_model=WebhookSubscriptionResponse)
def update_webhook(
    webhook_id: uuid.UUID, webhook_update: WebhookSubscriptionUpdate, db: Session = Depends(get_db)
):
    """Update an existing webhook subscription (e.g., deactivate or change filters)."""
    db_webhook = db.query(WebhookSubscription).filter(WebhookSubscription.id == webhook_id).first()
    if db_webhook is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")

    update_data = webhook_update.model_dump(exclude_unset=True)  # Use model_dump for Pydantic v2
    # For Pydantic v1, use webhook_update.dict(exclude_unset=True)

    for key, value in update_data.items():
        if key == "callback_url":  # HttpUrl needs to be converted to str for DB
            setattr(db_webhook, key, str(value))
        else:
            setattr(db_webhook, key, value)

    db.add(db_webhook)
    db.commit()
    db.refresh(db_webhook)
    return db_webhook


@router.delete("/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_webhook(webhook_id: uuid.UUID, db: Session = Depends(get_db)):
    """Deactivate a webhook subscription. (Soft delete by setting is_active=False)."""
    db_webhook = db.query(WebhookSubscription).filter(WebhookSubscription.id == webhook_id).first()
    if db_webhook is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")

    db_webhook.is_active = False
    db.add(db_webhook)
    db.commit()
    return

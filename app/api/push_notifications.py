"""
Push Notification API
Handles web push subscriptions and sending notifications to users
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from datetime import datetime
from typing import Optional, Dict, Any
import json
import logging

from models.database import get_db, Base
from api.auth_rbac import get_current_user_enhanced, EnhancedUser

logger = logging.getLogger(__name__)

router = APIRouter()


# Database model for push subscriptions
class PushSubscription(Base):
    """Push notification subscription model"""
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    endpoint = Column(String(500), nullable=False, unique=True)
    p256dh = Column(String(200), nullable=False)
    auth = Column(String(50), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.utcnow())
    last_used = Column(DateTime, default=lambda: datetime.utcnow())


# Request/Response models
class PushSubscriptionCreate:
    """Push subscription creation model"""
    def __init__(self, endpoint: str, keys: Dict[str, str]):
        self.endpoint = endpoint
        self.keys = keys


@router.post("/user/push-subscription", tags=["user"])
async def save_push_subscription(
    subscription_data: Dict[str, Any],
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
    db: Session = Depends(get_db)
):
    """
    Save or update push notification subscription for current user
    
    Request body format:
    {
      "endpoint": "https://fcm.googleapis.com/...",
      "keys": {
        "p256dh": "...",
        "auth": "..."
      }
    }
    """
    try:
        endpoint = subscription_data.get("endpoint")
        keys = subscription_data.get("keys", {})
        p256dh = keys.get("p256dh")
        auth = keys.get("auth")

        if not endpoint or not p256dh or not auth:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing required subscription data (endpoint, keys.p256dh, keys.auth)"
            )

        # Check if subscription already exists for this endpoint
        existing_subscription = (
            db.query(PushSubscription)
            .filter(PushSubscription.endpoint == endpoint)
            .first()
        )

        if existing_subscription:
            # Update existing subscription
            existing_subscription.user_id = current_user.user_id
            existing_subscription.p256dh = p256dh
            existing_subscription.auth = auth
            existing_subscription.last_used = datetime.utcnow()
            db.commit()
            logger.info(f"Updated push subscription for user {current_user.user_id}")
        else:
            # Create new subscription
            new_subscription = PushSubscription(
                user_id=current_user.user_id,
                endpoint=endpoint,
                p256dh=p256dh,
                auth=auth
            )
            db.add(new_subscription)
            db.commit()
            logger.info(f"Created push subscription for user {current_user.user_id}")

        return {
            "success": True,
            "message": "Push subscription saved successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving push subscription: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save push subscription"
        )


@router.delete("/user/push-subscription", tags=["user"])
async def delete_push_subscription(
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
    db: Session = Depends(get_db)
):
    """
    Delete all push notification subscriptions for current user
    """
    try:
        deleted_count = (
            db.query(PushSubscription)
            .filter(PushSubscription.user_id == current_user.user_id)
            .delete()
        )
        db.commit()

        logger.info(f"Deleted {deleted_count} push subscriptions for user {current_user.user_id}")

        return {
            "success": True,
            "message": f"Deleted {deleted_count} push subscription(s)",
            "deleted_count": deleted_count
        }

    except Exception as e:
        logger.error(f"Error deleting push subscription: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete push subscription"
        )


@router.get("/user/push-subscription", tags=["user"])
async def get_push_subscription(
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
    db: Session = Depends(get_db)
):
    """
    Get all push notification subscriptions for current user
    """
    try:
        subscriptions = (
            db.query(PushSubscription)
            .filter(PushSubscription.user_id == current_user.user_id)
            .all()
        )

        return {
            "subscriptions": [
                {
                    "id": sub.id,
                    "endpoint": sub.endpoint,
                    "created_at": sub.created_at.isoformat(),
                    "last_used": sub.last_used.isoformat()
                }
                for sub in subscriptions
            ]
        }

    except Exception as e:
        logger.error(f"Error retrieving push subscriptions: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve push subscriptions"
        )


# Helper function to send push notifications (to be called from other parts of the app)
async def send_push_notification(
    user_id: int,
    title: str,
    body: str,
    data: Optional[Dict[str, Any]] = None,
    tag: Optional[str] = None,
    db: Session = None
):
    """
    Send push notification to a specific user
    
    This function requires the pywebpush library to be installed:
    pip install pywebpush
    
    Args:
        user_id: User ID to send notification to
        title: Notification title
        body: Notification body text
        data: Additional data to include (e.g., url to open)
        tag: Notification tag for grouping
        db: Database session
    """
    try:
        # Import pywebpush (will fail gracefully if not installed)
        try:
            from pywebpush import webpush, WebPushException
        except ImportError:
            logger.warning("pywebpush not installed. Push notifications disabled.")
            return False

        # Get user's push subscriptions
        subscriptions = (
            db.query(PushSubscription)
            .filter(PushSubscription.user_id == user_id)
            .all()
        )

        if not subscriptions:
            logger.info(f"No push subscriptions found for user {user_id}")
            return False

        # Prepare notification payload
        notification_data = {
            "title": title,
            "body": body,
            "tag": tag or f"notification-{user_id}-{datetime.utcnow().timestamp()}",
            "data": data or {}
        }

        # Get VAPID keys from environment
        import os
        vapid_private_key = os.getenv("VAPID_PRIVATE_KEY")
        vapid_claims = {
            "sub": "mailto:admin@impactdatabase.com"  # Change to your email
        }

        if not vapid_private_key:
            logger.error("VAPID_PRIVATE_KEY not configured")
            return False

        # Send to all user's subscriptions
        success_count = 0
        for subscription in subscriptions:
            try:
                subscription_info = {
                    "endpoint": subscription.endpoint,
                    "keys": {
                        "p256dh": subscription.p256dh,
                        "auth": subscription.auth
                    }
                }

                webpush(
                    subscription_info=subscription_info,
                    data=json.dumps(notification_data),
                    vapid_private_key=vapid_private_key,
                    vapid_claims=vapid_claims
                )

                # Update last_used timestamp
                subscription.last_used = datetime.utcnow()
                success_count += 1

            except WebPushException as e:
                logger.error(f"Failed to send push to subscription {subscription.id}: {str(e)}")
                
                # If subscription is expired or invalid, delete it
                if e.response and e.response.status_code in [404, 410]:
                    db.delete(subscription)
                    logger.info(f"Deleted expired subscription {subscription.id}")

        db.commit()

        logger.info(f"Sent push notification to {success_count}/{len(subscriptions)} subscriptions for user {user_id}")
        return success_count > 0

    except Exception as e:
        logger.error(f"Error sending push notification: {str(e)}")
        return False


# Example usage endpoints (for testing)
@router.post("/user/push-notification/test", tags=["user"])
async def send_test_notification(
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
    db: Session = Depends(get_db)
):
    """
    Send a test push notification to current user
    """
    success = await send_push_notification(
        user_id=current_user.user_id,
        title="Test Notification",
        body="This is a test push notification from Impact Database",
        data={"url": "/profile"},
        tag="test-notification",
        db=db
    )

    if success:
        return {"success": True, "message": "Test notification sent"}
    else:
        return {"success": False, "message": "Failed to send test notification"}

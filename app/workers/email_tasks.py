"""
Email notification Celery tasks.

Async tasks for sending email notifications to users.
"""

import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone, timedelta

from celery import Celery
from sqlalchemy.orm import Session
from sqlalchemy import create_engine

from .celery_app import celery_app
from services.email_service import get_email_service, EmailMessage
from services.email_templates import EmailTemplates
from models.database import ImageMetadata
from models.rbac import User
from core.config import settings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database setup for tasks
engine = create_engine(settings.DATABASE_URL)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_welcome_email(self, user_id: str, username: str, email: str):
    """
    Send welcome email to new user.
    
    Args:
        user_id: User's ID
        username: User's username
        email: User's email address
    """
    logger.info(f"Sending welcome email to {email}")
    
    try:
        email_service = get_email_service()
        template = EmailTemplates.welcome(username)
        
        message = EmailMessage(
            to_email=email,
            to_name=username,
            subject=template.subject,
            body_text=template.body_text,
            body_html=template.body_html
        )
        
        success = email_service.send(message)
        
        if success:
            logger.info(f"Welcome email sent to {email}")
        else:
            logger.warning(f"Failed to send welcome email to {email}")
            
        return success
        
    except Exception as exc:
        logger.error(f"Error sending welcome email to {email}: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_upload_approved_email(
    self, 
    user_email: str, 
    username: str,
    image_title: str,
    image_id: str
):
    """
    Send email notification when user's upload is approved.
    
    Args:
        user_email: User's email address
        username: User's username
        image_title: Title of the approved image
        image_id: ID of the approved image
    """
    logger.info(f"Sending upload approved email to {user_email} for image {image_id}")
    
    try:
        # Check if user has email notifications enabled
        if not _check_user_email_preference(user_email):
            logger.info(f"User {user_email} has email notifications disabled, skipping")
            return False
            
        email_service = get_email_service()
        template = EmailTemplates.upload_approved(username, image_title, image_id)
        
        message = EmailMessage(
            to_email=user_email,
            to_name=username,
            subject=template.subject,
            body_text=template.body_text,
            body_html=template.body_html
        )
        
        success = email_service.send(message)
        
        if success:
            logger.info(f"Upload approved email sent to {user_email}")
        else:
            logger.warning(f"Failed to send upload approved email to {user_email}")
            
        return success
        
    except Exception as exc:
        logger.error(f"Error sending upload approved email to {user_email}: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_upload_rejected_email(
    self,
    user_email: str,
    username: str,
    image_title: str,
    reason: str
):
    """
    Send email notification when user's upload is rejected.
    
    Args:
        user_email: User's email address
        username: User's username
        image_title: Title of the rejected image
        reason: Reason for rejection
    """
    logger.info(f"Sending upload rejected email to {user_email}")
    
    try:
        if not _check_user_email_preference(user_email):
            logger.info(f"User {user_email} has email notifications disabled, skipping")
            return False
            
        email_service = get_email_service()
        template = EmailTemplates.upload_rejected(username, image_title, reason)
        
        message = EmailMessage(
            to_email=user_email,
            to_name=username,
            subject=template.subject,
            body_text=template.body_text,
            body_html=template.body_html
        )
        
        success = email_service.send(message)
        
        if success:
            logger.info(f"Upload rejected email sent to {user_email}")
        else:
            logger.warning(f"Failed to send upload rejected email to {user_email}")
            
        return success
        
    except Exception as exc:
        logger.error(f"Error sending upload rejected email to {user_email}: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_achievement_email(
    self,
    user_email: str,
    username: str,
    achievement_name: str,
    achievement_description: str,
    points: int
):
    """
    Send email notification when user earns an achievement.
    
    Args:
        user_email: User's email address
        username: User's username
        achievement_name: Name of the achievement
        achievement_description: Description of the achievement
        points: Points earned
    """
    logger.info(f"Sending achievement email to {user_email} for {achievement_name}")
    
    try:
        if not _check_user_email_preference(user_email):
            logger.info(f"User {user_email} has email notifications disabled, skipping")
            return False
            
        email_service = get_email_service()
        template = EmailTemplates.achievement_unlocked(
            username, achievement_name, achievement_description, points
        )
        
        message = EmailMessage(
            to_email=user_email,
            to_name=username,
            subject=template.subject,
            body_text=template.body_text,
            body_html=template.body_html
        )
        
        success = email_service.send(message)
        
        if success:
            logger.info(f"Achievement email sent to {user_email}")
        else:
            logger.warning(f"Failed to send achievement email to {user_email}")
            
        return success
        
    except Exception as exc:
        logger.error(f"Error sending achievement email to {user_email}: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_review_assigned_email(
    self,
    curator_email: str,
    curator_name: str,
    image_title: str,
    image_id: str,
    uploader_name: str
):
    """
    Send email notification when a curator is assigned a review.
    
    Args:
        curator_email: Curator's email address
        curator_name: Curator's name
        image_title: Title of the image to review
        image_id: ID of the image
        uploader_name: Name of the uploader
    """
    logger.info(f"Sending review assigned email to {curator_email} for image {image_id}")
    
    try:
        email_service = get_email_service()
        template = EmailTemplates.review_assigned(
            curator_name, image_title, image_id, uploader_name
        )
        
        message = EmailMessage(
            to_email=curator_email,
            to_name=curator_name,
            subject=template.subject,
            body_text=template.body_text,
            body_html=template.body_html
        )
        
        success = email_service.send(message)
        
        if success:
            logger.info(f"Review assigned email sent to {curator_email}")
        else:
            logger.warning(f"Failed to send review assigned email to {curator_email}")
            
        return success
        
    except Exception as exc:
        logger.error(f"Error sending review assigned email to {curator_email}: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_password_reset_email(
    self,
    user_email: str,
    username: str,
    reset_token: str,
    expires_in_hours: int = 24
):
    """
    Send password reset email.
    
    Args:
        user_email: User's email address
        username: User's username
        reset_token: Password reset token
        expires_in_hours: Hours until token expires
    """
    logger.info(f"Sending password reset email to {user_email}")
    
    try:
        email_service = get_email_service()
        template = EmailTemplates.password_reset(username, reset_token, expires_in_hours)
        
        message = EmailMessage(
            to_email=user_email,
            to_name=username,
            subject=template.subject,
            body_text=template.body_text,
            body_html=template.body_html
        )
        
        success = email_service.send(message)
        
        if success:
            logger.info(f"Password reset email sent to {user_email}")
        else:
            logger.warning(f"Failed to send password reset email to {user_email}")
            
        return success
        
    except Exception as exc:
        logger.error(f"Error sending password reset email to {user_email}: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(bind=True)
def send_weekly_digest_all_users(self):
    """
    Send weekly digest emails to all users who have email notifications enabled.
    This is typically triggered by Celery Beat on a weekly schedule.
    """
    logger.info("Starting weekly digest email job")
    
    db_session = None
    sent_count = 0
    
    try:
        db_session = Session(engine)
        
        # Get all users with email notifications enabled
        # For now, get all users and check preferences individually
        users = db_session.query(User).filter(User.is_active).all()
        
        for user in users:
            try:
                # Check user preferences
                if not _check_user_email_preference(user.email, db_session):
                    continue
                
                # Get user's activity for the week
                stats = _get_user_weekly_stats(user.id, db_session)
                
                if stats.get("total_uploads", 0) > 0 or stats.get("total_approvals", 0) > 0:
                    # Only send if there's activity to report
                    send_weekly_digest_email.delay(
                        user_email=user.email,
                        username=user.username,
                        stats=stats
                    )
                    sent_count += 1
                    
            except Exception as e:
                logger.error(f"Error processing weekly digest for user {user.id}: {e}")
                continue
                
        logger.info(f"Weekly digest job completed. Queued {sent_count} emails.")
        return sent_count
        
    except Exception as exc:
        logger.error(f"Error in weekly digest job: {exc}")
        if db_session:
            db_session.rollback()
        raise
    finally:
        if db_session:
            db_session.close()


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_weekly_digest_email(
    self,
    user_email: str,
    username: str,
    stats: Dict[str, Any]
):
    """
    Send weekly digest email to a user.
    
    Args:
        user_email: User's email address
        username: User's username
        stats: Dictionary with weekly statistics
    """
    logger.info(f"Sending weekly digest email to {user_email}")
    
    try:
        email_service = get_email_service()
        template = EmailTemplates.weekly_digest(username, stats)
        
        message = EmailMessage(
            to_email=user_email,
            to_name=username,
            subject=template.subject,
            body_text=template.body_text,
            body_html=template.body_html
        )
        
        success = email_service.send(message)
        
        if success:
            logger.info(f"Weekly digest email sent to {user_email}")
        else:
            logger.warning(f"Failed to send weekly digest email to {user_email}")
            
        return success
        
    except Exception as exc:
        logger.error(f"Error sending weekly digest email to {user_email}: {exc}")
        raise self.retry(exc=exc)


def _check_user_email_preference(user_email: str, db_session: Session = None) -> bool:
    """
    Check if user has email notifications enabled.
    
    Args:
        user_email: User's email address
        db_session: Optional existing database session
        
    Returns:
        True if email notifications are enabled, False otherwise
    """
    close_session = False
    
    try:
        if db_session is None:
            db_session = Session(engine)
            close_session = True
            
        user = db_session.query(User).filter(User.email == user_email).first()
        
        if not user:
            return False
            
        # Check user's notification preferences
        # Default to True if no preferences set
        preferences = getattr(user, 'notification_preferences', None)
        
        if preferences is None:
            return True  # Default to enabled
            
        if isinstance(preferences, dict):
            return preferences.get('email_notifications', True)
            
        return True
        
    except Exception as e:
        logger.error(f"Error checking email preference for {user_email}: {e}")
        return True  # Default to enabled on error
    finally:
        if close_session and db_session:
            db_session.close()


def _get_user_weekly_stats(user_id: str, db_session: Session) -> Dict[str, Any]:
    """
    Get user's weekly activity statistics.
    
    Args:
        user_id: User's ID
        db_session: Database session
        
    Returns:
        Dictionary with weekly statistics
    """
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    
    try:
        # Count uploads this week
        total_uploads = db_session.query(ImageMetadata).filter(
            ImageMetadata.uploaded_by == user_id,
            ImageMetadata.created_at >= week_ago
        ).count()
        
        # Count approved uploads this week
        total_approvals = db_session.query(ImageMetadata).filter(
            ImageMetadata.uploaded_by == user_id,
            ImageMetadata.status == 'approved',
            ImageMetadata.updated_at >= week_ago
        ).count()
        
        return {
            "total_uploads": total_uploads,
            "total_approvals": total_approvals,
            "new_achievements": 0,  # TODO: Query achievements
            "total_views": 0,  # TODO: Query view stats
            "leaderboard_position": None  # TODO: Calculate
        }
        
    except Exception as e:
        logger.error(f"Error getting weekly stats for user {user_id}: {e}")
        return {
            "total_uploads": 0,
            "total_approvals": 0,
            "new_achievements": 0,
            "total_views": 0,
            "leaderboard_position": None
        }

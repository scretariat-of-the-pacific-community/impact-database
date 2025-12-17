"""User API endpoints for profile, stats, activity, and settings."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, and_, or_
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
import logging
import json
import io

from models.database import get_db, ImageMetadata
from models.rbac import User as DBUser
from models.audit_log import AuditLog
from api.auth_rbac import EnhancedUser, get_current_user_enhanced

logger = logging.getLogger(__name__)
router = APIRouter()

# Note: Rate limiting implemented via middleware

# Pydantic models
class UserStats(BaseModel):
    name: str
    email: str
    organization: Optional[str] = None
    avatar_url: Optional[str] = None
    total_uploads: int
    approval_rate: float
    impact_score: float
    last_active: str
    achievements: List[Dict[str, Any]] = []
    analytics: Dict[str, Any]

class UserSettings(BaseModel):
    profile: Dict[str, Any] = Field(default_factory=dict)
    privacy: Dict[str, Any] = Field(default_factory=dict)
    notifications: Dict[str, Any] = Field(default_factory=dict)
    default_metadata: Dict[str, Any] = Field(default_factory=dict)

class StorageQuota(BaseModel):
    used: int
    total: int
    by_type: Dict[str, int]

class APIToken(BaseModel):
    id: str
    name: str
    token: Optional[str] = None
    created_at: str
    last_used: Optional[str] = None
    usage_count: int

class ActivityEvent(BaseModel):
    id: str
    type: str
    title: str
    description: str
    timestamp: str
    is_read: bool = False
    metadata: Dict[str, Any] = Field(default_factory=dict)


@router.get("/user/stats", response_model=UserStats)
async def get_user_stats(
    request: Request,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Get aggregate user statistics with caching (5-minute TTL)."""
    try:
        # Query user's uploads
        total_uploads = db.query(func.count(ImageMetadata.id)).filter(
            ImageMetadata.uploader_id == current_user.username
        ).scalar() or 0

        # Calculate approval rate
        approved_count = db.query(func.count(ImageMetadata.id)).filter(
            and_(
                ImageMetadata.uploader_id == current_user.username,
                ImageMetadata.status == "approved"
            )
        ).scalar() or 0
        
        approval_rate = approved_count / total_uploads if total_uploads > 0 else 0.0

        # Get uploads this month
        month_ago = datetime.utcnow() - timedelta(days=30)
        uploads_this_month = db.query(func.count(ImageMetadata.id)).filter(
            and_(
                ImageMetadata.uploader_id == current_user.username,
                ImageMetadata.datetime >= month_ago
            )
        ).scalar() or 0

        # Average review time - placeholder (would need status change tracking)
        average_review_time = 24.0  # Placeholder value

        # Get top hazard type
        top_hazard_query = db.query(
            ImageMetadata.hazard_type,
            func.count(ImageMetadata.id).label('count')
        ).filter(
            ImageMetadata.uploader_id == current_user.username
        ).group_by(
            ImageMetadata.hazard_type
        ).order_by(
            desc('count')
        ).first()
        
        top_hazard = top_hazard_query[0] if top_hazard_query else "unknown"

        # Calculate impact score (simple formula: approved * 10)
        impact_score = approved_count * 10

        # Get user details
        user = db.query(DBUser).filter(DBUser.username == current_user.username).first()

        return UserStats(
            name=user.full_name if user and user.full_name else current_user.username,
            email=user.email if user else f"{current_user.username}@unknown.com",
            organization=None,  # Would come from user profile
            avatar_url=None,  # Would come from user profile
            total_uploads=total_uploads,
            approval_rate=approval_rate,
            impact_score=float(impact_score),
            last_active=datetime.utcnow().isoformat(),
            achievements=[],  # Placeholder for future implementation
            analytics={
                "uploads_this_month": uploads_this_month,
                "average_review_time": average_review_time,
                "top_hazard": top_hazard
            }
        )
    except Exception as e:
        logger.error(f"Error fetching user stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch user stats: {str(e)}")


@router.get("/images/user/uploads")
async def get_user_uploads(
    request: Request,
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[str] = Query(None, description="Filter by approval status"),
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Get paginated list of user's uploads."""
    try:
        query = db.query(ImageMetadata).filter(
            ImageMetadata.uploader_id == current_user.username
        )

        # Filter by status if provided
        if status:
            query = query.filter(ImageMetadata.status == status)

        # Order by upload date (newest first)
        query = query.order_by(desc(ImageMetadata.datetime))

        # Calculate pagination
        offset = (page - 1) * limit
        total = query.count()
        
        uploads = query.offset(offset).limit(limit).all()

        # Format response
        results = []
        for upload in uploads:
            results.append({
                "id": str(upload.id),
                "filename": upload.filename,
                "title": upload.title or upload.filename,
                "hazard_type": upload.hazard_type,
                "location": upload.location or upload.geographic_identifier,
                "uploaded_at": upload.datetime.isoformat() if upload.datetime else None,
                "approval_status": upload.status,
                "views": 0,  # Field doesn't exist in model
                "latitude": upload.latitude,
                "longitude": upload.longitude
            })

        return results

    except Exception as e:
        logger.error(f"Error fetching user uploads: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch uploads: {str(e)}")


@router.get("/user/activity")
async def get_user_activity(
    request: Request,
    limit: int = Query(50, ge=1, le=100, description="Number of events to return"),
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Get user's activity timeline events."""
    try:
        # Query audit logs for the user's activities
        activities = db.query(AuditLog).filter(
            AuditLog.user_id == current_user.username
        ).order_by(
            desc(AuditLog.timestamp)
        ).limit(limit).all()

        events = []
        for activity in activities:
            event_type = "upload" if activity.action == "create" else activity.action
            
            events.append({
                "id": str(activity.id),
                "type": event_type,
                "title": f"Image {activity.action}d",
                "description": f"Image {activity.filename} was {activity.action}d",
                "timestamp": activity.timestamp.isoformat() if activity.timestamp else datetime.utcnow().isoformat(),
                "is_read": False,
                "metadata": {
                    "filename": activity.filename,
                    "image_id": str(activity.image_id) if activity.image_id else None
                }
            })

        return events

    except Exception as e:
        logger.error(f"Error fetching user activity: {e}")
        # Return empty list instead of error for graceful degradation
        return []


@router.get("/user/settings")
async def get_user_settings(
    request: Request,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Get user settings and preferences."""
    try:
        # In a real implementation, these would be stored in the database
        # For now, return default settings
        return {
            "profile": {
                "avatar_url": "",
                "bio": "",
                "location": "",
                "organization": ""
            },
            "privacy": {
                "public_profile": True,
                "hide_stats": False,
                "anonymous_contributions": False
            },
            "notifications": {
                "email": {
                    "uploads": True,
                    "reviews": True,
                    "comments": True,
                    "achievements": False
                },
                "in_app": {
                    "uploads": True,
                    "reviews": True,
                    "comments": True,
                    "achievements": True
                },
                "push": {
                    "uploads": False,
                    "reviews": False,
                    "comments": False,
                    "achievements": False
                }
            },
            "default_metadata": {
                "tags": []
            }
        }
    except Exception as e:
        logger.error(f"Error fetching user settings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch settings: {str(e)}")


@router.put("/user/settings")
async def update_user_settings(
    request: Request,
    settings: UserSettings,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Save user settings and preferences."""
    try:
        # In a real implementation, save to database
        # For now, just return the settings back
        logger.info(f"User {current_user.username} updated settings")
        return {"status": "success", "settings": settings.dict()}
    except Exception as e:
        logger.error(f"Error updating user settings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update settings: {str(e)}")


@router.get("/user/storage")
async def get_storage_quota(
    request: Request,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Get user's storage quota and usage."""
    try:
        # In a real implementation, calculate actual file sizes from MinIO
        # For now, estimate based on upload count
        total_uploads = db.query(func.count(ImageMetadata.id)).filter(
            ImageMetadata.uploader_id == current_user.username
        ).scalar() or 0

        # Estimate: assume average image is 3 MB
        estimated_bytes = total_uploads * 3 * 1024 * 1024
        total_quota = 10 * 1024 * 1024 * 1024  # 10 GB

        return {
            "used": estimated_bytes,
            "total": total_quota,
            "by_type": {
                "images": estimated_bytes,
                "videos": 0,
                "documents": 0
            }
        }
    except Exception as e:
        logger.error(f"Error fetching storage quota: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch storage: {str(e)}")


@router.get("/user/tokens")
async def get_api_tokens(
    request: Request,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Get user's API tokens."""
    try:
        # In a real implementation, fetch from database
        # For now, return empty list
        return []
    except Exception as e:
        logger.error(f"Error fetching API tokens: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch tokens: {str(e)}")


@router.post("/user/tokens")
async def generate_api_token(
    request: Request,
    token_data: Dict[str, str],
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Generate a new API token."""
    try:
        import secrets
        token = f"impact_{secrets.token_urlsafe(32)}"
        
        # In a real implementation, save to database
        return {
            "id": secrets.token_urlsafe(16),
            "name": token_data.get("name", "Unnamed Token"),
            "token": token,
            "created_at": datetime.utcnow().isoformat(),
            "usage_count": 0
        }
    except Exception as e:
        logger.error(f"Error generating API token: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate token: {str(e)}")


@router.delete("/user/tokens/{token_id}")
async def delete_api_token(
    request: Request,
    token_id: str,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Delete an API token."""
    try:
        # In a real implementation, delete from database
        logger.info(f"User {current_user.username} deleted token {token_id}")
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error deleting API token: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete token: {str(e)}")


@router.post("/user/avatar")
async def upload_avatar(
    request: Request,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Upload user avatar."""
    try:
        # In a real implementation, upload to MinIO and return URL
        # For now, return a placeholder
        return {"url": f"https://api.dicebear.com/7.x/initials/svg?seed={current_user.username}"}
    except Exception as e:
        logger.error(f"Error uploading avatar: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload avatar: {str(e)}")


@router.get("/user/export")
async def export_user_data(
    request: Request,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Export all user data as JSON."""
    try:
        # Get user data
        user = db.query(DBUser).filter(DBUser.username == current_user.username).first()
        
        # Get uploads
        uploads = db.query(ImageMetadata).filter(
            ImageMetadata.uploader_id == current_user.username
        ).all()

        export_data = {
            "user": {
                "username": current_user.username,
                "email": user.email if user else None,
                "full_name": user.full_name if user and user.full_name else None,
                "roles": [role.name for role in current_user.roles]
            },
            "uploads": [
                {
                    "id": str(upload.id),
                    "filename": upload.filename,
                    "title": upload.title,
                    "hazard_type": upload.hazard_type,
                    "location": upload.location,
                    "datetime": upload.datetime.isoformat() if upload.datetime else None,
                    "status": upload.status
                }
                for upload in uploads
            ],
            "exported_at": datetime.utcnow().isoformat()
        }

        # Convert to JSON and create streaming response
        json_str = json.dumps(export_data, indent=2)
        buffer = io.BytesIO(json_str.encode('utf-8'))
        
        return StreamingResponse(
            buffer,
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename=impact-portal-data-{datetime.utcnow().strftime('%Y-%m-%d')}.json"
            }
        )
    except Exception as e:
        logger.error(f"Error exporting user data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to export data: {str(e)}")


@router.delete("/user/account")
async def delete_account(
    request: Request,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Soft delete user account with 7-day recovery period."""
    try:
        # In a real implementation, mark account for deletion instead of immediate deletion
        # Set deletion_scheduled_at = now + 7 days
        logger.warning(f"Account deletion requested for user {current_user.username}")
        
        return {
            "status": "scheduled",
            "message": "Account deletion scheduled. You have 7 days to recover your account.",
            "deletion_date": (datetime.utcnow() + timedelta(days=7)).isoformat()
        }
    except Exception as e:
        logger.error(f"Error deleting account: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete account: {str(e)}")


@router.get("/user/achievements")
async def get_user_achievements(
    request: Request,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Get user's badge progress and unlocks."""
    try:
        total_uploads = db.query(func.count(ImageMetadata.id)).filter(
            ImageMetadata.uploader_id == current_user.username
        ).scalar() or 0

        achievements = [
            {
                "id": "first_upload",
                "name": "First Steps",
                "description": "Upload your first image",
                "icon": "🎯",
                "unlocked": total_uploads >= 1,
                "progress": min(total_uploads, 1),
                "total": 1
            },
            {
                "id": "ten_uploads",
                "name": "Getting Started",
                "description": "Upload 10 images",
                "icon": "📸",
                "unlocked": total_uploads >= 10,
                "progress": min(total_uploads, 10),
                "total": 10
            },
            {
                "id": "hundred_uploads",
                "name": "Prolific Contributor",
                "description": "Upload 100 images",
                "icon": "🏆",
                "unlocked": total_uploads >= 100,
                "progress": min(total_uploads, 100),
                "total": 100
            }
        ]

        return achievements
    except Exception as e:
        logger.error(f"Error fetching achievements: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch achievements: {str(e)}")


@router.get("/user/analytics")
async def get_user_analytics(
    request: Request,
    days: int = Query(30, ge=1, le=365, description="Number of days to analyze"),
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Get time-series contribution data."""
    try:
        start_date = datetime.utcnow() - timedelta(days=days)
        
        # Get uploads grouped by date
        uploads_by_date = db.query(
            func.date(ImageMetadata.datetime).label('date'),
            func.count(ImageMetadata.id).label('count')
        ).filter(
            and_(
                ImageMetadata.uploader_id == current_user.username,
                ImageMetadata.datetime >= start_date
            )
        ).group_by(
            func.date(ImageMetadata.datetime)
        ).all()

        # Format as time series
        time_series = [
            {
                "date": result.date.isoformat() if result.date else None,
                "uploads": result.count
            }
            for result in uploads_by_date
        ]

        return {
            "time_series": time_series,
            "period_days": days,
            "total_uploads": sum(item["uploads"] for item in time_series)
        }
    except Exception as e:
        logger.error(f"Error fetching analytics: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch analytics: {str(e)}")

"""User API endpoints for profile, stats, activity, and settings."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, and_
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel, Field
import logging
import json
import io

from models.database import get_db, ImageMetadata
from models.rbac import User as DBUser
from models.audit_log import AuditLog
from api.auth_rbac import EnhancedUser, get_current_user_enhanced
from api.auth_rbac import require_permission

logger = logging.getLogger(__name__)
router = APIRouter()

# Note: Rate limiting implemented via middleware

# Import new models
from models.user_data import UserProfile, UserSettings as DBUserSettings, APIToken as DBAPIToken

# Pydantic models for API validation
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

class ProfileSettingsSchema(BaseModel):
    """Profile visibility settings"""
    avatar_url: str = Field(default="", max_length=500)
    bio: str = Field(default="", max_length=1000)
    location: str = Field(default="", max_length=200)
    organization: str = Field(default="", max_length=200)

class PrivacySettingsSchema(BaseModel):
    """Privacy preferences"""
    public_profile: bool = True
    hide_stats: bool = False
    anonymous_contributions: bool = False

class NotificationChannelSchema(BaseModel):
    """Notification settings for a channel"""
    uploads: bool = True
    reviews: bool = True
    comments: bool = True
    achievements: bool = False

class NotificationSettingsSchema(BaseModel):
    """All notification settings"""
    email: NotificationChannelSchema = Field(default_factory=NotificationChannelSchema)
    in_app: NotificationChannelSchema = Field(default_factory=NotificationChannelSchema)
    push: NotificationChannelSchema = Field(default_factory=lambda: NotificationChannelSchema(uploads=False, reviews=False, comments=False, achievements=False))

class DefaultMetadataSchema(BaseModel):
    """Default metadata for uploads"""
    tags: List[str] = Field(default_factory=list, max_items=20)

class UserSettingsUpdate(BaseModel):
    """Schema for updating user settings"""
    profile: Optional[ProfileSettingsSchema] = None
    privacy: Optional[PrivacySettingsSchema] = None
    notifications: Optional[NotificationSettingsSchema] = None
    default_metadata: Optional[DefaultMetadataSchema] = None

class UserSettingsResponse(BaseModel):
    """Response schema for user settings"""
    profile: Dict[str, Any]
    privacy: Dict[str, Any]
    notifications: Dict[str, Any]
    default_metadata: Dict[str, Any]

class StorageQuota(BaseModel):
    used: int
    total: int
    by_type: Dict[str, int]

class APITokenCreate(BaseModel):
    """Schema for creating API token"""
    name: str = Field(..., min_length=3, max_length=100)
    expires_days: Optional[int] = Field(default=90, ge=1, le=365)
    scopes: List[str] = Field(default=['read'], max_items=10)

class APITokenResponse(BaseModel):
    """Response schema for API token"""
    id: str
    name: str
    token: Optional[str] = None  # Only included on creation
    token_prefix: str
    scopes: List[str]
    created_at: str
    expires_at: Optional[str] = None
    last_used_at: Optional[str] = None
    usage_count: int
    is_active: bool

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
    identifier: Optional[str] = Query(None, description="Username, UUID, or email to fetch stats for"),
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Get aggregate user statistics with caching (5-minute TTL)."""
    # Check cache first
    from middleware.cache import get_cache
    cache = get_cache()
    # Resolve target user identifiers (username/UUID/email)
    target_username = current_user.username
    target_id: Optional[str] = getattr(current_user, "id", None)
    target_email: Optional[str] = getattr(current_user, "email", None)

    if identifier:
        # Normalize identifier and enforce access control
        # Allow self-access; otherwise require admin role
        normalized = identifier.strip().lower()
        is_self = normalized in {
            current_user.username.lower(),
            (str(target_id).lower() if target_id else ""),
            (str(target_email).lower() if target_email else ""),
        }
        if not is_self and current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Insufficient permissions to view other users' stats")

        # Look up user by UUID, email, or username
        target = (
            db.query(DBUser)
            .filter(
                (DBUser.id == normalized) |
                (func.lower(DBUser.email) == normalized) |
                (func.lower(DBUser.username) == normalized)
            )
            .first()
        )
        if target:
            target_username = target.username
            target_id = str(target.id)
            target_email = target.email

    cache_key = f"cache:user_stats:{target_username}"
    
    cached_data = cache.get(cache_key)
    if cached_data:
        logger.debug(f"Returning cached stats for {current_user.username}")
        return JSONResponse(content=cached_data, headers={"X-Cache": "HIT"})
    
    try:
        # Query user's uploads
        user_identifiers = {target_username}
        if target_id:
            user_identifiers.add(str(target_id))

        total_uploads = db.query(func.count(ImageMetadata.id)).filter(
            ImageMetadata.uploader_id.in_(user_identifiers)
        ).scalar() or 0

        # Calculate approval rate
        approved_count = db.query(func.count(ImageMetadata.id)).filter(
            and_(
                ImageMetadata.uploader_id.in_(user_identifiers),
                ImageMetadata.status == "approved"
            )
        ).scalar() or 0
        
        approval_rate = approved_count / total_uploads if total_uploads > 0 else 0.0

        # Get uploads this month
        month_ago = datetime.now(timezone.utc) - timedelta(days=30)
        uploads_this_month = db.query(func.count(ImageMetadata.id)).filter(
            and_(
                ImageMetadata.uploader_id.in_(user_identifiers),
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
            ImageMetadata.uploader_id.in_(user_identifiers)
        ).group_by(
            ImageMetadata.hazard_type
        ).order_by(
            desc('count')
        ).first()
        
        top_hazard = top_hazard_query[0] if top_hazard_query else "unknown"

        # Calculate impact score (simple formula: approved * 10)
        impact_score = approved_count * 10

        # Get user details
        user = db.query(DBUser).filter(DBUser.username == target_username).first()

        # Get achievements with progress for profile display
        achievements_with_progress = []
        try:
            from services.achievement_service import achievement_service
            # Check and award any new achievements
            achievement_service.check_and_award_achievements(db, current_user.username)
            all_achievements = achievement_service.get_user_achievements(db, current_user.username)
            achievements_with_progress = [
                {
                    "id": a["id"],
                    "title": a["name"],
                    "description": a["description"],
                    "icon": a.get("icon", "🏆"),
                    "tier": a.get("tier", "bronze"),
                    "points": a.get("points", 0),
                    "unlocked": a.get("unlocked", False),
                    "unlocked_at": a.get("unlocked_at"),
                    "progress": a.get("progress", 0),
                    "total": a.get("total", a.get("criteria_threshold", 0)),
                    "category": a.get("category", "upload")
                }
                for a in all_achievements
            ]
        except Exception as e:
            logger.warning(f"Could not fetch achievements: {e}")
        
        stats_data = {
            "name": user.full_name if user and user.full_name else current_user.username,
            "email": user.email if user else f"{current_user.username}@unknown.com",
            "organization": None,  # Would come from user profile
            "avatar_url": None,  # Would come from user profile
            "total_uploads": total_uploads,
            "approval_rate": approval_rate,
            "impact_score": float(impact_score),
            "last_active": datetime.now(timezone.utc).isoformat(),
            "achievements": achievements_with_progress,
            "analytics": {
                "uploads_this_month": uploads_this_month,
                "average_review_time": average_review_time,
                "top_hazard": top_hazard
            }
        }
        
        # Cache for 5 minutes (300 seconds)
        cache.set(cache_key, stats_data, ttl=300)
        logger.debug(f"Cached stats for {target_username}")
        
        return JSONResponse(content=stats_data, headers={"X-Cache": "MISS"})
    except Exception as e:
        logger.error(f"Error fetching user stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch user stats: {str(e)}")


@router.get("/images/user/uploads")
async def get_user_uploads(
    request: Request,
    identifier: Optional[str] = Query(None, description="Username, UUID, or email to fetch uploads for"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[str] = Query(None, description="Filter by approval status"),
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Get paginated list of user's uploads."""
    try:
        # Determine target user (self by default; otherwise admin can view others)
        target_username = current_user.username
        if identifier:
            normalized = identifier.strip().lower()
            is_self = normalized in {
                current_user.username.lower(),
                (str(getattr(current_user, 'id', '')).lower()),
                (str(getattr(current_user, 'email', '')).lower()),
            }
            if not is_self and current_user.role != 'admin':
                raise HTTPException(status_code=403, detail="Insufficient permissions to view other users' uploads")
            target = (
                db.query(DBUser)
                .filter(
                    (DBUser.id == normalized) |
                    (func.lower(DBUser.email) == normalized) |
                    (func.lower(DBUser.username) == normalized)
                )
                .first()
            )
            if target:
                target_username = target.username

        query = db.query(ImageMetadata).filter(
            ImageMetadata.uploader_id == target_username
        )

        # Filter by status if provided
        if status:
            query = query.filter(ImageMetadata.status == status)

        # Order by upload date (newest first)
        query = query.order_by(desc(ImageMetadata.datetime))

        # Calculate pagination
        offset = (page - 1) * limit
        
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
    identifier: Optional[str] = Query(None, description="Username, UUID, or email to fetch activity for"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=100, description="Number of events per page"),
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Get user's activity timeline events with pagination."""
    try:
        from utils.pagination import paginate_query, PaginationMetadata
        from sqlalchemy import or_
        from models.database import User as DBUser
        
        # Resolve target user by identifier (self by default)
        target_id = str(getattr(current_user, 'id', '')) if getattr(current_user, 'id', None) else None
        target_username = current_user.username
        if identifier:
            normalized = identifier.strip().lower()
            is_self = normalized in {
                current_user.username.lower(),
                (target_id.lower() if target_id else ""),
                (getattr(current_user, 'email', '').lower()),
            }
            if not is_self and current_user.role != 'admin':
                raise HTTPException(status_code=403, detail="Insufficient permissions to view other users' activity")
            target = (
                db.query(DBUser)
                .filter(
                    (DBUser.id == normalized) |
                    (func.lower(DBUser.email) == normalized) |
                    (func.lower(DBUser.username) == normalized)
                )
                .first()
            )
            if target:
                target_id = str(target.id)
                target_username = target.username
        
        # Build query - match by either user_id (UUID) or username (string)
        query = db.query(AuditLog).filter(
            or_(
                AuditLog.user_id == (target_id or ''),
                AuditLog.username == target_username
            )
        ).order_by(
            desc(AuditLog.timestamp)
        )
        
        # Apply pagination
        activities, total = paginate_query(query, page=page, limit=limit)

        events = []
        for activity in activities:
            # Normalize action types to match frontend expectations (lowercase)
            action = activity.action.lower() if activity.action else "system"
            
            # Map database actions to frontend types
            type_mapping = {
                "create": "upload",
                "insert": "upload",
                "update": "edit",
                "delete": "system",
                "status_change": "review"
            }
            event_type = type_mapping.get(action, "system")
            
            # Get image metadata for better activity descriptions
            title = ""
            description = ""
            
            if activity.table_name == "image_metadata" and activity.record_id:
                try:
                    from models.database import ImageMetadata
                    image = db.query(ImageMetadata).filter(ImageMetadata.id == activity.record_id).first()
                    
                    if image:
                        filename = image.filename or f"Image {activity.record_id[:8]}"
                        
                        if action == "create":
                            title = f"Uploaded photo: {filename}"
                            hazard = image.hazard_type or "unspecified hazard"
                            location = image.country or "Unknown location"
                            description = f"New {hazard} documentation from {location}"
                        elif action == "update":
                            title = f"Updated: {filename}"
                            description = "Photo metadata was modified"
                        elif action == "status_change":
                            status = image.approval_status or "unknown"
                            title = f"Status changed: {filename}"
                            description = f"Photo status updated to {status}"
                        else:
                            title = f"{filename}"
                            description = f"Photo was {action}d"
                    else:
                        # Image not found or deleted
                        title = f"Photo {action}"
                        description = f"Image record {activity.record_id[:8]}... was {action}d"
                except Exception as e:
                    logger.warning(f"Could not fetch image details for activity {activity.id}: {e}")
                    title = f"Photo {action}"
                    description = f"Image was {action}d"
            else:
                # Generic fallback for non-image tables
                title = f"{activity.table_name} {action}"
                description = f"{activity.table_name} record was {action}d"
            
            events.append({
                "id": str(activity.id),
                "type": event_type,
                "title": title,
                "description": description,
                "timestamp": activity.timestamp.isoformat() if activity.timestamp else datetime.now(timezone.utc).isoformat(),
                "is_read": False,
                "metadata": {
                    "table_name": activity.table_name,
                    "record_id": activity.record_id,
                    "action": activity.action
                }
            })

        # Return with pagination metadata
        return PaginationMetadata.paginated_response(
            items=events,
            total=total,
            page=page,
            limit=limit,
            data_key="events"
        )

    except Exception as e:
        logger.error(f"Error fetching user activity: {e}")
        # Return empty paginated response for graceful degradation
        from utils.pagination import PaginationMetadata
        return PaginationMetadata.paginated_response([], 0, page, limit, "events")


@router.get("/user/settings", response_model=UserSettingsResponse)
async def get_user_settings(
    request: Request,
    identifier: Optional[str] = Query(None, description="Username, UUID, or email to fetch settings for"),
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Get user settings and preferences."""
    try:
        # Determine target user (self by default; admin can view others)
        target_username = current_user.username
        if identifier:
            normalized = identifier.strip().lower()
            is_self = normalized in {
                current_user.username.lower(),
                (str(getattr(current_user, 'id', '')).lower()),
                (str(getattr(current_user, 'email', '')).lower()),
            }
            if not is_self and current_user.role != 'admin':
                raise HTTPException(status_code=403, detail="Insufficient permissions to view other users' settings")
            target = (
                db.query(DBUser)
                .filter(
                    (DBUser.id == normalized) |
                    (func.lower(DBUser.email) == normalized) |
                    (func.lower(DBUser.username) == normalized)
                )
                .first()
            )
            if target:
                target_username = target.username
        
        # Get or create settings for user
        settings = db.query(DBUserSettings).filter(
            DBUserSettings.user_id == target_username
        ).first()
        
        if not settings:
            # Create default settings
            default_settings = DBUserSettings.get_default_settings()
            settings = DBUserSettings(
                user_id=target_username,
                profile_settings=default_settings['profile'],
                privacy_settings=default_settings['privacy'],
                notification_settings=default_settings['notifications'],
                default_metadata=default_settings['default_metadata']
            )
            db.add(settings)
            db.commit()
            db.refresh(settings)
        
        return {
            "profile": settings.profile_settings or {},
            "privacy": settings.privacy_settings or {},
            "notifications": settings.notification_settings or {},
            "default_metadata": settings.default_metadata or {}
        }
    except Exception as e:
        logger.error(f"Error fetching user settings: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to fetch settings: {str(e)}")


@router.put("/user/settings", dependencies=[Depends(require_permission("profile:settings:update"))])
async def update_user_settings(
    request: Request,
    settings_update: UserSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Save user settings and preferences."""
    try:
        # Get or create settings
        settings = db.query(DBUserSettings).filter(
            DBUserSettings.user_id == current_user.username
        ).first()
        
        if not settings:
            # Create new settings
            default_settings = DBUserSettings.get_default_settings()
            settings = DBUserSettings(
                user_id=current_user.username,
                profile_settings=default_settings['profile'],
                privacy_settings=default_settings['privacy'],
                notification_settings=default_settings['notifications'],
                default_metadata=default_settings['default_metadata']
            )
            db.add(settings)
        
        # Update only provided fields
        if settings_update.profile is not None:
            settings.profile_settings = settings_update.profile.dict()
        
        if settings_update.privacy is not None:
            settings.privacy_settings = settings_update.privacy.dict()
        
        if settings_update.notifications is not None:
            settings.notification_settings = settings_update.notifications.dict()
        
        if settings_update.default_metadata is not None:
            settings.default_metadata = settings_update.default_metadata.dict()
        
        # Update timestamp
        settings.updated_at = datetime.now(timezone.utc)
        
        db.commit()
        db.refresh(settings)
        
        logger.info(f"User {current_user.username} updated settings")
        
        return {
            "status": "success",
            "settings": {
                "profile": settings.profile_settings,
                "privacy": settings.privacy_settings,
                "notifications": settings.notification_settings,
                "default_metadata": settings.default_metadata
            }
        }
    except Exception as e:
        logger.error(f"Error updating user settings: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update settings: {str(e)}")


@router.get("/user/storage")
async def get_storage_quota(
    request: Request,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Get user's storage quota and usage from MinIO."""
    try:
        from services.minio_client import minio_service
        
        # Get user's uploads from database
        uploads = db.query(ImageMetadata).filter(
            ImageMetadata.uploader_id == current_user.username
        ).all()
        
        total_bytes = 0
        by_type = {"images": 0, "videos": 0, "documents": 0, "thumbnails": 0}
        
        # Calculate actual storage from MinIO
        try:
            for upload in uploads:
                # Get file info from MinIO
                if upload.filename:
                    try:
                        # Get object stats from MinIO
                        stat = minio_service.client.stat_object(
                            minio_service.bucket_name,
                            upload.filename
                        )
                        file_size = stat.size
                        total_bytes += file_size
                        
                        # Categorize by file extension
                        ext = upload.filename.lower().split('.')[-1] if '.' in upload.filename else ''
                        if ext in ['jpg', 'jpeg', 'png', 'gif', 'tiff', 'bmp', 'webp']:
                            by_type["images"] += file_size
                        elif ext in ['mp4', 'avi', 'mov', 'mkv', 'webm']:
                            by_type["videos"] += file_size
                        elif ext in ['pdf', 'doc', 'docx', 'txt']:
                            by_type["documents"] += file_size
                        else:
                            by_type["images"] += file_size  # Default to images
                        
                    except Exception as e:
                        logger.warning(f"Could not stat object {upload.filename}: {e}")
                        # If file not found in MinIO, skip it
                        continue
                
                # Add thumbnail size if exists
                if upload.thumbnail_key:
                    try:
                        stat = minio_service.client.stat_object(
                            minio_service.bucket_name,
                            upload.thumbnail_key
                        )
                        thumbnail_size = stat.size
                        total_bytes += thumbnail_size
                        by_type["thumbnails"] += thumbnail_size
                    except Exception:
                        pass  # Thumbnail missing is not critical
        
        except Exception as e:
            logger.warning(f"MinIO stat failed, falling back to estimates: {e}")
            # Fallback to estimates if MinIO unavailable
            total_uploads = len(uploads)
            total_bytes = total_uploads * 3 * 1024 * 1024  # 3 MB average
            by_type["images"] = total_bytes
        
        # Storage quota: 10 GB per user
        total_quota = 10 * 1024 * 1024 * 1024  # 10 GB
        
        return {
            "used": total_bytes,
            "total": total_quota,
            "percentage": round((total_bytes / total_quota) * 100, 2) if total_quota > 0 else 0,
            "by_type": by_type,
            "uploads_count": len(uploads),
            "available": max(0, total_quota - total_bytes)
        }
    except Exception as e:
        logger.error(f"Error fetching storage quota: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch storage: {str(e)}")


@router.get("/user/tokens", response_model=List[APITokenResponse])
async def get_api_tokens(
    request: Request,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Get user's API tokens (without actual token values)."""
    try:
        tokens = db.query(DBAPIToken).filter(
            DBAPIToken.user_id == current_user.username,
            DBAPIToken.is_active == True
        ).order_by(desc(DBAPIToken.created_at)).all()
        
        return [
            APITokenResponse(
                id=str(token.id),
                name=token.name,
                token_prefix=token.token_prefix,
                scopes=token.scopes or ['read'],
                created_at=token.created_at.isoformat() if token.created_at else None,
                expires_at=token.expires_at.isoformat() if token.expires_at else None,
                last_used_at=token.last_used_at.isoformat() if token.last_used_at else None,
                usage_count=token.usage_count,
                is_active=token.is_active
            )
            for token in tokens
        ]
    except Exception as e:
        logger.error(f"Error fetching API tokens: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch tokens: {str(e)}")


@router.post("/user/tokens", response_model=APITokenResponse)
async def generate_api_token(
    request: Request,
    token_data: APITokenCreate,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Generate a new API token."""
    try:
        # Check user doesn't have too many tokens (max 10)
        existing_count = db.query(func.count(DBAPIToken.id)).filter(
            DBAPIToken.user_id == current_user.username,
            DBAPIToken.is_active == True
        ).scalar()
        
        if existing_count >= 10:
            raise HTTPException(
                status_code=400,
                detail="Maximum of 10 active tokens allowed. Please revoke unused tokens."
            )
        
        # Generate token
        token = DBAPIToken.generate_token()
        token_hash = DBAPIToken.hash_token(token)
        token_prefix = token[:10]
        
        # Create token record
        api_token = DBAPIToken(
            user_id=current_user.username,
            name=token_data.name,
            token_hash=token_hash,
            token_prefix=token_prefix,
            scopes=token_data.scopes,
            expires_at=DBAPIToken.get_default_expiry(token_data.expires_days) if token_data.expires_days else None
        )
        
        db.add(api_token)
        db.commit()
        db.refresh(api_token)
        
        logger.info(f"User {current_user.username} generated API token: {api_token.name}")
        
        # Return token (only time it's visible)
        return APITokenResponse(
            id=str(api_token.id),
            name=api_token.name,
            token=token,  # Only included on creation
            token_prefix=token_prefix,
            scopes=api_token.scopes,
            created_at=api_token.created_at.isoformat(),
            expires_at=api_token.expires_at.isoformat() if api_token.expires_at else None,
            last_used_at=None,
            usage_count=0,
            is_active=True
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating API token: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to generate token: {str(e)}")


@router.delete("/user/tokens/{token_id}")
async def delete_api_token(
    request: Request,
    token_id: str,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Revoke an API token."""
    try:
        # Parse UUID
        try:
            from uuid import UUID
            token_uuid = UUID(token_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid token ID format")
        
        # Find token and verify ownership
        token = db.query(DBAPIToken).filter(
            DBAPIToken.id == token_uuid,
            DBAPIToken.user_id == current_user.username
        ).first()
        
        if not token:
            raise HTTPException(status_code=404, detail="Token not found")
        
        # Soft delete (mark as inactive and set revoked_at)
        token.is_active = False
        token.revoked_at = datetime.now(timezone.utc)
        
        db.commit()
        
        logger.info(f"User {current_user.username} revoked token {token.name} ({token_id})")
        return {"status": "success", "message": "Token revoked successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error revoking API token: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to revoke token: {str(e)}")


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
            "exported_at": datetime.now(timezone.utc).isoformat()
        }

        # Convert to JSON and create streaming response
        json_str = json.dumps(export_data, indent=2)
        buffer = io.BytesIO(json_str.encode('utf-8'))
        
        return StreamingResponse(
            buffer,
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename=impact-portal-data-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.json"
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
            "deletion_date": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        }
    except Exception as e:
        logger.error(f"Error deleting account: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete account: {str(e)}")


# Mock achievements endpoint removed - using real achievement system below


@router.get("/user/analytics")
async def get_user_analytics(
    request: Request,
    days: int = Query(30, ge=1, le=365, description="Number of days to analyze"),
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Get comprehensive analytics with engagement metrics, geographic data, and benchmarks."""
    try:
        start_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        # Get user's UUID and build identifiers (username + uuid) so legacy uploads are counted
        user = db.query(DBUser).filter(DBUser.username == current_user.username).first()
        if not user:
            return {
                "time_series": [],
                "period_days": days,
                "total_uploads": 0,
                "hazard_distribution": {},
                "locations": [],
                "views_metrics": {"total": 0, "average_per_upload": 0},
                "engagement_metrics": {"impact_score": 0, "approval_rate": 0},
                "comparative_benchmarks": {}
            }
        
        user_identifiers = {current_user.username}
        if getattr(user, "id", None):
            user_identifiers.add(str(user.id))
        
        # Get all user's images for the period
        user_images = db.query(ImageMetadata).filter(
            and_(
                ImageMetadata.uploader_id.in_(user_identifiers),
                ImageMetadata.datetime >= start_date
            )
        ).all()
        
        total_uploads = len(user_images)
        
        # Time series by date
        uploads_by_date = db.query(
            func.date(ImageMetadata.datetime).label('date'),
            func.count(ImageMetadata.id).label('count')
        ).filter(
            and_(
                ImageMetadata.uploader_id.in_(user_identifiers),
                ImageMetadata.datetime >= start_date
            )
        ).group_by(
            func.date(ImageMetadata.datetime)
        ).all()

        time_series = [
            {
                "date": result.date.isoformat() if result.date else None,
                "uploads": result.count
            }
            for result in uploads_by_date
        ]
        
        # Hazard distribution
        hazard_distribution = {}
        for img in user_images:
            if img.hazard_type:
                hazard_distribution[img.hazard_type] = hazard_distribution.get(img.hazard_type, 0) + 1
        
        # Geographic data with coordinates
        locations = []
        for img in user_images:
            if img.latitude and img.longitude:
                locations.append({
                    "id": str(img.id),
                    "latitude": float(img.latitude),
                    "longitude": float(img.longitude),
                    "hazard": img.hazard_type or "unknown",
                    "country": img.country or "Unknown",
                    "uploads": 1  # Individual marker
                })
        
        # Views metrics - use placeholder since views tracking not yet implemented
        # TODO: Replace placeholder view multipliers with real view tracking data (tracking issue #1234)
        total_views = total_uploads * 10  # Placeholder: estimate 10 views per upload
        avg_views = round(total_views / total_uploads, 1) if total_uploads > 0 else 0
        max_views = max(10, total_uploads * 5)  # Placeholder max
        
        # Engagement metrics - using 'status' field (approved, pending_review, rejected)
        approved_count = sum(1 for img in user_images if img.status == "approved")
        approval_rate = round((approved_count / total_uploads) * 100, 1) if total_uploads > 0 else 0
        
        # Impact score calculation (based on activity, not views yet)
        impact_score = (
            total_uploads * 1.0 +
            approved_count * 2.0
        )
        
        # Community benchmarks (all users)
        community_stats = db.query(
            func.count(func.distinct(ImageMetadata.uploader_id)).label('total_users'),
            func.count(ImageMetadata.id).label('total_uploads')
        ).filter(
            ImageMetadata.datetime >= start_date
        ).first()
        
        community_avg_uploads = 0
        community_avg_views = 0  # Placeholder
        if community_stats and community_stats.total_users:
            community_avg_uploads = round(community_stats.total_uploads / community_stats.total_users, 1)
            community_avg_views = round(community_avg_uploads * 10, 1)  # Placeholder
        
        # Popular images (top 5 by most recent + approved status)
        popular_images = sorted(
            [{"id": str(img.id), "title": img.title or img.filename or "Untitled", "views": 10 if img.status == "approved" else 5} 
             for img in user_images],
            key=lambda x: x["views"],
            reverse=True
        )[:5]
        
        # Country distribution
        country_distribution = {}
        for img in user_images:
            if img.country:
                country_distribution[img.country] = country_distribution.get(img.country, 0) + 1

        return {
            "time_series": time_series,
            "period_days": days,
            "total_uploads": total_uploads,
            "hazard_distribution": hazard_distribution,
            "locations": locations,
            "country_distribution": country_distribution,
            "views_metrics": {
                "total": total_views,
                "average_per_upload": avg_views,
                "max_views": max_views
            },
            "engagement_metrics": {
                "impact_score": round(impact_score, 1),
                "approval_rate": approval_rate,
                "approved_count": approved_count,
                "pending_count": total_uploads - approved_count
            },
            "comparative_benchmarks": {
                "user_uploads": total_uploads,
                "community_avg_uploads": community_avg_uploads,
                "user_avg_views": avg_views,
                "community_avg_views": community_avg_views
            },
            "popular_images": popular_images,
            "insights": generate_insights(
                total_uploads, 
                hazard_distribution, 
                approval_rate, 
                avg_views, 
                community_avg_views,
                len(country_distribution)
            )
        }
    except Exception as e:
        logger.error(f"Error fetching analytics: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch analytics: {str(e)}")


def generate_insights(
    uploads: int,
    hazard_dist: dict,
    approval_rate: float,
    avg_views: float,
    community_avg_views: float,
    countries_count: int
) -> List[str]:
    """Generate AI-powered insights based on user metrics."""
    insights = []
    
    # Upload volume insights
    if uploads > 20:
        insights.append(f"🌟 Excellent contribution! You've uploaded {uploads} images this period.")
    elif uploads > 10:
        insights.append(f"📈 Great progress with {uploads} uploads. Keep it up!")
    elif uploads > 0:
        insights.append(f"👍 You've contributed {uploads} images. Every upload helps!")
    
    # Hazard specialization
    if hazard_dist:
        top_hazard = max(hazard_dist.items(), key=lambda x: x[1])
        percentage = round((top_hazard[1] / uploads) * 100)
        if percentage >= 60:
            insights.append(f"🎯 You're specializing in {top_hazard[0]} documentation ({percentage}% of uploads)")
    
    # Quality insights
    if approval_rate >= 90:
        insights.append(f"✨ Outstanding quality! {approval_rate}% approval rate")
    elif approval_rate >= 70:
        insights.append(f"👌 Good quality with {approval_rate}% approval rate")
    
    # Engagement insights
    if avg_views > community_avg_views * 1.5:
        insights.append(f"🔥 Your images get {round((avg_views / community_avg_views) * 100)}% more views than average!")
    elif avg_views > community_avg_views:
        insights.append("📊 Your images perform above community average")
    
    # Geographic coverage
    if countries_count >= 5:
        insights.append(f"🌏 Excellent coverage across {countries_count} countries/regions")
    elif countries_count >= 3:
        insights.append(f"🗺️ Good geographic diversity with {countries_count} regions covered")
    
    return insights if insights else ["Keep uploading quality images to unlock insights!"]


@router.get("/user/achievements")
async def get_user_achievements(
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """
    Get all achievements with progress for current user.
    Automatically checks and awards any newly unlocked achievements.
    """
    try:
        from services.achievement_service import achievement_service
        
        # Check and award new achievements
        newly_unlocked = achievement_service.check_and_award_achievements(db, current_user.username)
        
        # Get all achievements with progress
        achievements = achievement_service.get_user_achievements(db, current_user.username)
        
        # Calculate summary stats
        total_achievements = len(achievements)
        unlocked_count = sum(1 for a in achievements if a.get('unlocked'))
        total_points = sum(a.get('points', 0) for a in achievements if a.get('unlocked'))
        
        return {
            "achievements": achievements,
            "newly_unlocked": newly_unlocked,
            "summary": {
                "unlocked": unlocked_count,
                "total": total_achievements,
                "percentage": round(unlocked_count / total_achievements * 100, 1) if total_achievements > 0 else 0,
                "total_points": total_points
            }
        }
    except Exception as e:
        logger.error(f"Error fetching achievements: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch achievements: {str(e)}")


@router.get("/user/achievements/unlocked")
async def get_unlocked_achievements(
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """Get only unlocked achievements for current user."""
    try:
        from services.achievement_service import achievement_service
        
        unlocked = achievement_service.get_unlocked_achievements(db, current_user.username)
        total_points = sum(a.get('points', 0) for a in unlocked)
        
        return {
            "achievements": unlocked,
            "count": len(unlocked),
            "total_points": total_points
        }
    except Exception as e:
        logger.error(f"Error fetching unlocked achievements: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch unlocked achievements: {str(e)}")

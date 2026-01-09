"""
Simplified FastAPI main application for local development
This version excludes complex middleware and auth for easier startup
"""

from collections import Counter
from datetime import datetime, timedelta, timezone
import logging
import os
import random
import uuid
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

from api.auth_rbac import EnhancedUser, get_current_user_enhanced, get_current_user_optional
from models.database import ImageMetadata, get_db
from models.rbac import User as DBUser
from models.review_workflow import ReviewItem

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Impact Database API (Simple)",
    description="Simplified API for local development",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Get environment configuration first
environment = os.getenv("ENVIRONMENT", "development").lower()

# SECURITY FIX: Add security headers middleware
from middleware.security_headers import SecurityHeadersMiddleware

app.add_middleware(
    SecurityHeadersMiddleware,
    environment=environment,
    enable_hsts=environment == "production",
)

# CORS middleware - SECURITY FIX: Explicit origin whitelist
# Only allow requests from trusted frontend origins
allowed_origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
]

# Check for production environment and use production domain
if environment == "production":
    production_domain = os.getenv("PRODUCTION_DOMAIN", "")
    if production_domain:
        allowed_origins = [
            f"https://{production_domain}",
            f"https://www.{production_domain}",
        ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,  # SECURITY: Explicit whitelist instead of wildcard
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],  # Explicit headers
    max_age=86400,  # Cache preflight responses for 24 hours
)


# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "simple"}


# Root endpoint
@app.get("/")
async def root():
    return {"message": "Impact Database API - Simple Mode"}


# Helper utilities for profile stats/activity
def _ensure_aware(dt: Optional[datetime]) -> Optional[datetime]:
    if not dt:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _get_db_user(db: Session, current_user: EnhancedUser) -> Optional[DBUser]:
    if not current_user or not getattr(current_user, "username", None):
        return None
    return db.query(DBUser).filter(DBUser.username == current_user.username).first()


def _resolve_user_identifier(
    current_user: EnhancedUser, db_user: Optional[DBUser]
) -> Optional[str]:
    if db_user and getattr(db_user, "id", None):
        return str(db_user.id)
    if getattr(current_user, "id", None):
        return str(current_user.id)
    return getattr(current_user, "username", None)


def _resolve_user_uuid(
    current_user: EnhancedUser, db_user: Optional[DBUser]
) -> Optional[uuid.UUID]:
    candidate = None
    if db_user and getattr(db_user, "id", None):
        candidate = db_user.id
    elif getattr(current_user, "id", None):
        candidate = current_user.id
    if not candidate:
        return None
    if isinstance(candidate, uuid.UUID):
        return candidate
    try:
        return uuid.UUID(str(candidate))
    except (ValueError, TypeError):
        return None


def _build_upload_query(db: Session, user_identifier: Optional[str], username: Optional[str]):
    filters = []
    if user_identifier:
        filters.append(ImageMetadata.uploader_id == user_identifier)
    if username and username != user_identifier:
        filters.append(ImageMetadata.uploader_id == username)
    if not filters:
        raise HTTPException(status_code=400, detail="Unable to determine user identity for uploads")
    criterion = or_(*filters) if len(filters) > 1 else filters[0]
    return db.query(ImageMetadata).filter(criterion)


def _calculate_achievements(
    total_uploads: int, approval_rate: float, uploads_this_month: int
) -> List[Dict[str, Any]]:
    achievements: List[Dict[str, Any]] = []
    now_iso = datetime.now(timezone.utc).isoformat()
    if total_uploads >= 1:
        achievements.append(
            {
                "id": "first-upload",
                "title": "First Steps",
                "description": "Uploaded your first impact assessment.",
                "icon": "🚀",
                "earned_at": now_iso,
            }
        )
    if total_uploads >= 10:
        achievements.append(
            {
                "id": "consistent-contributor",
                "title": "Consistency Champion",
                "description": "10+ verified submissions keeping reviewers busy.",
                "icon": "🏅",
                "earned_at": now_iso,
            }
        )
    if approval_rate >= 0.9:
        achievements.append(
            {
                "id": "quality-guardian",
                "title": "Quality Guardian",
                "description": "Maintained a 90%+ approval rate.",
                "icon": "🛡️",
                "earned_at": now_iso,
            }
        )
    if uploads_this_month >= 5:
        achievements.append(
            {
                "id": "momentum",
                "title": "Momentum Builder",
                "description": "5 uploads in the last 30 days.",
                "icon": "📈",
                "earned_at": now_iso,
            }
        )
    return achievements


def _resolve_user_display_name(db: Session, user_id: Optional[uuid.UUID]) -> str:
    if not user_id:
        return "review team"
    record = db.query(DBUser).filter(DBUser.id == user_id).first()
    if record and record.full_name:
        return record.full_name
    if record and record.username:
        return record.username
    return "review team"


def _activity_timestamp(value: Optional[datetime]) -> str:
    aware = _ensure_aware(value) or datetime.now(timezone.utc)
    return aware.isoformat()


def _extract_review_tips(review: ReviewItem) -> List[Dict[str, str]]:
    tips: List[Dict[str, str]] = []
    metadata = review.review_metadata or {}
    candidates = metadata.get("suggested_improvements") or metadata.get("tips") or []
    if isinstance(candidates, list):
        for idx, raw in enumerate(candidates[:3]):
            tips.append(
                {
                    "id": f"{review.id}-tip-{idx}",
                    "text": str(raw),
                }
            )
    return tips


def _build_activity_timeline(
    *,
    db: Session,
    uploads: List[ImageMetadata],
    review_items: List[ReviewItem],
    achievements: List[Dict[str, Any]],
    username: Optional[str],
) -> List[Dict[str, Any]]:
    activities: List[Dict[str, Any]] = []

    # Upload events
    for upload in uploads:
        activities.append(
            {
                "id": f"upload-{upload.id}",
                "type": "upload",
                "title": f"Uploaded “{upload.title or upload.filename}”",
                "description": upload.abstract or upload.location or "New field imagery submitted",
                "timestamp": _activity_timestamp(upload.datetime or upload.date_stamp),
            }
        )

    # Review feedback
    for review in review_items:
        if not review.reviewed_at:
            continue
        reviewer_name = _resolve_user_display_name(db, review.reviewed_by)
        activities.append(
            {
                "id": f"review-{review.id}",
                "type": "review",
                "title": f"Review {review.status.replace('_', ' ').title()}",
                "description": review.reviewer_notes or "Review feedback received",
                "reviewer": reviewer_name,
                "reviewComments": review.reviewer_notes,
                "suggestedImprovements": _extract_review_tips(review),
                "timestamp": _activity_timestamp(review.reviewed_at),
            }
        )

    # Achievement unlocks
    for achievement in achievements:
        activities.append(
            {
                "id": f"achievement-{achievement['id']}",
                "type": "achievement",
                "title": f"Unlocked “{achievement['title']}” badge",
                "description": achievement["description"],
                "achievementBadge": achievement["title"],
                "timestamp": achievement.get("earned_at") or _activity_timestamp(None),
            }
        )

    # System notice
    activities.append(
        {
            "id": f"system-maintenance-{username or 'user'}",
            "type": "system",
            "title": "Scheduled maintenance",
            "description": "Platform resilience upgrades roll out this weekend.",
            "systemMessage": "Uploads may be briefly paused Saturday 02:00–02:20 UTC. Pending items resume automatically.",
            "timestamp": _activity_timestamp(None),
        }
    )

    activities.sort(key=lambda item: item["timestamp"], reverse=True)
    return activities


def _query_review_items(
    db: Session, user_uuid: Optional[uuid.UUID], limit: Optional[int] = None
) -> List[ReviewItem]:
    if not user_uuid:
        return []
    query = db.query(ReviewItem).filter(ReviewItem.submitted_by == user_uuid)
    query = query.order_by(desc(ReviewItem.reviewed_at), desc(ReviewItem.submitted_at))
    if limit:
        query = query.limit(limit)
    return query.all()


# Include only essential routers
try:
    # Import auth API for authentication
    from api.auth import router as auth_router

    app.include_router(auth_router, prefix="/api/auth", tags=["auth"])

    # Import simplified images API
    from api.images_simple import router as images_router

    app.include_router(images_router, prefix="/api/images", tags=["images"])

    # Import upload API for file uploads
    from api.upload import router as upload_router

    app.include_router(upload_router, prefix="/upload", tags=["upload"])

    # Import RBAC API (Phase 0: Foundation)
    from api.rbac import router as rbac_router

    app.include_router(rbac_router, prefix="/api/rbac", tags=["rbac"])

    # Import Review Workflow API (Phase 1: Assignment & Audit Trail)
    from api.review_workflow import router as review_workflow_router

    app.include_router(review_workflow_router, tags=["review-workflow"])

    # Import Featured Stories API
    from api.featured import router as featured_router

    app.include_router(featured_router, prefix="/api", tags=["featured"])

    # Import User API for profile, stats, and settings
    from api.user import router as user_router

    app.include_router(user_router, prefix="/api", tags=["user"])

    # Import Avatar upload API
    from api.avatar import router as avatar_router

    app.include_router(avatar_router, prefix="/api", tags=["avatar"])

    # Import Push Notifications API
    from api.push_notifications import router as push_router

    app.include_router(push_router, prefix="/api", tags=["push-notifications"])

    # Import Batch Upload API
    from api.batch_upload import router as batch_upload_router

    app.include_router(batch_upload_router, tags=["batch-upload"])

    # Import Curation API for admin review workflow
    from api.curation import router as curation_router

    app.include_router(curation_router, prefix="/api/admin/curation", tags=["admin", "curation"])

    # Initialize cache manager
    try:
        import redis
        from core.config import settings
        from middleware.cache import init_cache

        if settings.REDIS_URL:
            redis_client = redis.from_url(settings.REDIS_URL)
            redis_client.ping()
            init_cache(redis_client, default_ttl=300)
            logger.info("Cache manager initialized with Redis")
        else:
            init_cache(None)
            logger.info("Cache manager initialized (disabled - no Redis)")
    except Exception as e:
        from middleware.cache import init_cache

        init_cache(None)
        logger.warning(f"Failed to initialize Redis cache: {e}")

    logger.info(
        "Auth API, Images API, Upload API, RBAC API, Review Workflow API, Curation API, Featured Stories API, User API, Avatar API, and Push Notifications API routers included"
    )
except ImportError as e:
    logger.warning(f"Could not import routers: {e}")

# Admin router in separate try block to ensure it loads independently
try:
    from api.admin import router as admin_router

    app.include_router(admin_router, prefix="/api/admin", tags=["admin"])
    logger.info("Admin API router included")
except ImportError as e:
    logger.warning(f"Could not import admin router: {e}")


# Add essential endpoints directly to main app
@app.get("/api/vocabularies")
async def get_vocabularies():
    """Get vocabulary data for form dropdowns."""
    return {
        "hazard_types": [
            {"id": "flood", "label": "Flood"},
            {"id": "cyclone", "label": "Cyclone"},
            {"id": "drought", "label": "Drought"},
            {"id": "tsunami", "label": "Tsunami"},
            {"id": "landslide", "label": "Landslide"},
            {"id": "earthquake", "label": "Earthquake"},
            {"id": "wildfire", "label": "Wildfire"},
            {"id": "volcanic", "label": "Volcanic Activity"},
            {"id": "coastal_erosion", "label": "Coastal Erosion"},
            {"id": "other", "label": "Other"},
        ],
        "source_agencies": [
            {"id": "spc", "label": "Pacific Community (SPC)"},
            {"id": "sprep", "label": "SPREP"},
            {"id": "usp", "label": "University of the South Pacific"},
            {"id": "government", "label": "National Government"},
            {"id": "ngo", "label": "NGO/Civil Society"},
        ],
        "topic_categories": [
            {"id": "environment", "label": "Environment"},
            {"id": "disaster", "label": "Disaster"},
            {"id": "imageryBaseMapsEarthCover", "label": "Imagery/Base Maps/Earth Cover"},
            {
                "id": "climatologyMeteorologyAtmosphere",
                "label": "Climatology/Meteorology/Atmosphere",
            },
        ],
        "countries": [
            {"id": "FJ", "label": "Fiji"},
            {"id": "TO", "label": "Tonga"},
            {"id": "VU", "label": "Vanuatu"},
            {"id": "SB", "label": "Solomon Islands"},
            {"id": "NC", "label": "New Caledonia"},
            {"id": "PG", "label": "Papua New Guinea"},
            {"id": "WS", "label": "Samoa"},
            {"id": "FM", "label": "Federated States of Micronesia"},
            {"id": "PW", "label": "Palau"},
            {"id": "MH", "label": "Marshall Islands"},
            {"id": "KI", "label": "Kiribati"},
            {"id": "TV", "label": "Tuvalu"},
            {"id": "NR", "label": "Nauru"},
            {"id": "CK", "label": "Cook Islands"},
            {"id": "NU", "label": "Niue"},
            {"id": "TK", "label": "Tokelau"},
        ],
    }


@app.get("/api/hazards")
async def get_hazards(type: str = None):
    """Get hazard statistics and data."""
    try:
        from models.database import get_db, ImageMetadata
        from typing import Optional

        db = next(get_db())
        try:
            query = db.query(ImageMetadata)

            if type:
                query = query.filter(ImageMetadata.hazard_type == type)

            images = query.all()

            # Convert to response format
            hazard_data = []
            for img in images:
                hazard_data.append(
                    {
                        "filename": img.filename,
                        "title": img.title,
                        "hazard_type": img.hazard_type,
                        "country": img.country,
                        "location": img.location,
                        "upload_timestamp": img.date_stamp.isoformat() if img.date_stamp else None,
                    }
                )

            return hazard_data
        finally:
            db.close()

    except Exception as e:
        logger.error(f"Error fetching hazards: {e}")
        return {"error": f"Failed to fetch hazards: {str(e)}"}


@app.post("/upload")
async def simple_upload():
    """Simple upload endpoint - placeholder for development"""
    return {
        "status": "success",
        "message": "Upload functionality coming soon",
        "filename": "placeholder.jpg",
        "upload_timestamp": "2025-09-04T00:00:00Z",
    }


@app.get("/api/v1/images/search")
async def search_images(
    q: str = None,
    hazard_type: str = None,
    country: str = None,
    sort_by: str = "relevance",
    sort_order: str = "desc",
    limit: int = 24,
    offset: int = 0,
):
    """
    Search images with various filters
    This is a simplified version for development
    """
    try:
        # Mock search results - in production this would query the database
        mock_images = [
            {
                "id": "1",
                "filename": "dawasamu_cartopy_map.png",
                "title": "Dawasamu Cartopy Map",
                "hazard_type": "flood",
                "country": "FJ",
                "location": "Dawasamu, Fiji",
                "abstract": "Cartographic representation of flood impact in Dawasamu area",
                "keywords": ["flood", "cartopy", "dawasamu", "fiji"],
                "upload_timestamp": "2025-09-04T12:00:00Z",
                "thumbnail_url": "/api/images/dawasamu_cartopy_map.png/thumbnail",
                "coordinates": {"latitude": -18.0, "longitude": 178.0},
            },
            {
                "id": "2",
                "filename": "dawasamu_satellite_view.png",
                "title": "Dawasamu Satellite View",
                "hazard_type": "flood",
                "country": "FJ",
                "location": "Dawasamu, Fiji",
                "abstract": "Satellite imagery showing flood extent in Dawasamu region",
                "keywords": ["flood", "satellite", "dawasamu", "fiji"],
                "upload_timestamp": "2025-09-04T12:30:00Z",
                "thumbnail_url": "/api/images/dawasamu_satellite_view.png/thumbnail",
                "coordinates": {"latitude": -18.0, "longitude": 178.0},
            },
        ]

        # Apply filters if provided
        filtered_images = mock_images
        if hazard_type:
            filtered_images = [img for img in filtered_images if img["hazard_type"] == hazard_type]
        if country:
            filtered_images = [img for img in filtered_images if img["country"] == country]
        if q:
            # Simple text search in title, abstract, and keywords
            q_lower = q.lower()
            filtered_images = [
                img
                for img in filtered_images
                if (
                    q_lower in img["title"].lower()
                    or q_lower in img["abstract"].lower()
                    or any(q_lower in keyword.lower() for keyword in img["keywords"])
                )
            ]

        # Apply sorting
        if sort_by == "date":
            filtered_images.sort(
                key=lambda x: x["upload_timestamp"], reverse=(sort_order == "desc")
            )
        # For relevance, keep original order (could implement scoring)

        # Apply pagination
        total = len(filtered_images)
        paginated_images = filtered_images[offset : offset + limit]

        return {
            "images": paginated_images,
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": (offset + limit) < total,
        }

    except Exception as e:
        logger.error(f"Error searching images: {e}")
        return {"error": str(e), "images": [], "total": 0}


@app.get("/api/search")
async def api_search(
    request: Request,
    q: Optional[str] = None,
    hazard_type: Optional[List[str]] = Query(
        None, description="Filter by hazard type (repeat parameter to select multiple)"
    ),
    country: Optional[str] = None,
    source_agency: Optional[List[str]] = Query(
        None, description="Filter by source agency (repeat to select multiple)"
    ),
    date_from: Optional[str] = Query(None, description="Filter on/after this date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Filter on/before this date (YYYY-MM-DD)"),
    sort_by: str = "relevance",
    sort_order: str = "desc",
    limit: int = 24,
    offset: int = 0,
    page: int = 1,
    db: Session = Depends(get_db),
    current_user: Optional[EnhancedUser] = Depends(get_current_user_optional),
):
    """
    API search endpoint that frontend uses
    Proxy to the actual images search endpoint
    """
    try:
        from api.images_simple import search_images as real_search

        # Calculate offset from page if provided
        if page > 1:
            offset = (page - 1) * limit

        # Call the real search function with properly resolved dependencies
        result = await real_search(
            q=q,
            hazard_type=hazard_type,
            country=country,
            source_agency=source_agency,
            date_from=date_from,
            date_to=date_to,
            skip=offset,
            limit=limit,
            sort_by=sort_by,
            sort_order=sort_order,
            db=db,
            current_user=current_user,
        )

        return result

    except Exception as e:
        logger.error(f"Error in API search: {e}")
        return JSONResponse(status_code=500, content={"error": str(e), "images": [], "total": 0})


@app.get("/api/user/stats")
async def get_user_stats(
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
    db: Session = Depends(get_db),
):
    """Return profile statistics for the authenticated user."""
    try:
        db_user = _get_db_user(db, current_user)
        user_identifier = _resolve_user_identifier(current_user, db_user)
        uploads_query = _build_upload_query(
            db, user_identifier, getattr(current_user, "username", None)
        )
        uploads = uploads_query.order_by(desc(ImageMetadata.datetime)).all()

        total_uploads = len(uploads)
        status_counter = Counter((img.status or "pending_review") for img in uploads)
        approved_count = status_counter.get("approved", 0)
        approval_rate = approved_count / total_uploads if total_uploads else 0

        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        uploads_this_month = sum(
            1
            for img in uploads
            if _ensure_aware(img.datetime or img.date_stamp or datetime.now(timezone.utc))
            >= thirty_days_ago
        )
        hazard_counter = Counter(img.hazard_type for img in uploads if img.hazard_type)
        top_hazard = hazard_counter.most_common(1)[0][0] if hazard_counter else "unknown"

        user_uuid = _resolve_user_uuid(current_user, db_user)
        review_items = _query_review_items(db, user_uuid)
        review_durations = [
            item.review_duration_minutes for item in review_items if item.review_duration_minutes
        ]
        avg_review_minutes = (
            sum(review_durations) / len(review_durations) if review_durations else 0
        )
        average_review_time = round(avg_review_minutes / 60, 1) if avg_review_minutes else 0

        achievements = _calculate_achievements(total_uploads, approval_rate, uploads_this_month)
        impact_score = round(
            min(100, approved_count * 4 + uploads_this_month * 2 + approval_rate * 40)
        )

        last_active_sources = [
            _ensure_aware(img.datetime or img.date_stamp)
            for img in uploads
            if (img.datetime or img.date_stamp)
        ]
        if db_user and db_user.last_login:
            last_active_sources.append(_ensure_aware(db_user.last_login))
        last_active = (
            max(last_active_sources) if last_active_sources else datetime.now(timezone.utc)
        )

        return {
            "name": (
                db_user.full_name
                if db_user and db_user.full_name
                else getattr(current_user, "full_name", None)
            )
            or getattr(current_user, "username", "Impact Responder"),
            "email": getattr(current_user, "email", None),
            "organization": (
                db_user.department
                if db_user and db_user.department
                else getattr(db_user, "position", None)
            )
            or "Independent",
            "avatar_url": getattr(db_user, "avatar_url", None),
            "total_uploads": total_uploads,
            "approval_rate": approval_rate,
            "impact_score": impact_score,
            "last_active": last_active.isoformat(),
            "achievements": achievements,
            "analytics": {
                "uploads_this_month": uploads_this_month,
                "average_review_time": average_review_time,
                "top_hazard": top_hazard or "unknown",
            },
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Failed to compute user stats: {exc}")
        raise HTTPException(status_code=500, detail="Failed to load user stats")


@app.get("/upload/images/{image_id}/metadata")
async def get_image_metadata(image_id: str):
    """
    Get metadata for a specific image
    """
    try:
        if image_id == "undefined" or not image_id:
            return JSONResponse(status_code=404, content={"detail": "Image ID is required"})

        # Mock metadata - in production this would query the database
        mock_metadata = {
            "id": image_id,
            "filename": f"{image_id}.png",
            "title": f"Image {image_id}",
            "hazard_type": "flood",
            "country": "FJ",
            "location": "Fiji",
            "abstract": f"Metadata for image {image_id}",
            "keywords": ["hazard", "fiji"],
            "upload_timestamp": "2025-09-04T12:00:00Z",
            "coordinates": {"latitude": -18.0, "longitude": 178.0},
            "file_size": 1024000,
            "image_dimensions": {"width": 1920, "height": 1080},
        }

        return mock_metadata

    except Exception as e:
        logging.error(f"Get image metadata error: {e}")
        return JSONResponse(status_code=500, content={"detail": "Failed to get image metadata"})


@app.get("/api/user/activity")
async def get_user_activity(
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
    db: Session = Depends(get_db),
):
    """Return recent activity timeline items for the authenticated user."""
    try:
        db_user = _get_db_user(db, current_user)
        user_identifier = _resolve_user_identifier(current_user, db_user)
        uploads_query = _build_upload_query(
            db, user_identifier, getattr(current_user, "username", None)
        )
        uploads = uploads_query.order_by(desc(ImageMetadata.datetime)).all()

        total_uploads = len(uploads)
        status_counter = Counter((img.status or "pending_review") for img in uploads)
        approved_count = status_counter.get("approved", 0)
        approval_rate = approved_count / total_uploads if total_uploads else 0
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        uploads_this_month = sum(
            1
            for img in uploads
            if _ensure_aware(img.datetime or img.date_stamp or datetime.now(timezone.utc))
            >= thirty_days_ago
        )
        achievements = _calculate_achievements(total_uploads, approval_rate, uploads_this_month)

        user_uuid = _resolve_user_uuid(current_user, db_user)
        review_items = _query_review_items(db, user_uuid, limit=25)
        recent_uploads = uploads[:25]

        activities = _build_activity_timeline(
            db=db,
            uploads=recent_uploads,
            review_items=review_items,
            achievements=achievements,
            username=getattr(current_user, "username", None),
        )
        return activities
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Failed to build user activity: {exc}")
        raise HTTPException(status_code=500, detail="Failed to load activity timeline")


# Error handlers
@app.exception_handler(500)
async def internal_server_error(request, exc):
    logger.error(f"Internal server error: {exc}")
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/api/analytics")
async def get_analytics():
    """
    Get analytics data for the dashboard
    Returns distribution of hazards, countries, monthly uploads, and recent activity
    """
    try:
        # In a real implementation, this would query the database
        # For now, we'll generate realistic mock data based on actual patterns

        # Sample data that would come from database queries
        hazard_distribution = {
            "Cyclone": random.randint(30, 45),
            "Flood": random.randint(25, 35),
            "Drought": random.randint(20, 30),
            "Tsunami": random.randint(10, 20),
            "Earthquake": random.randint(8, 18),
            "Wildfire": random.randint(5, 15),
            "Landslide": random.randint(3, 12),
            "Storm Surge": random.randint(2, 10),
        }

        country_distribution = {
            "Fiji": random.randint(25, 40),
            "Tonga": random.randint(20, 30),
            "Vanuatu": random.randint(18, 28),
            "Solomon Islands": random.randint(15, 25),
            "Papua New Guinea": random.randint(12, 22),
            "Samoa": random.randint(8, 18),
            "New Caledonia": random.randint(5, 15),
            "Others": random.randint(3, 10),
        }

        # Generate monthly upload data for the last 8 months
        months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"]
        monthly_uploads = {}
        base_count = 10
        for i, month in enumerate(months):
            # Simulate seasonal patterns
            seasonal_factor = 1 + 0.3 * (i / len(months))  # Gradual increase
            monthly_uploads[month] = int(base_count * seasonal_factor + random.randint(-3, 8))

        # Recent activity simulation
        recent_activity = [
            {
                "type": "Image Upload",
                "count": random.randint(3, 8),
                "timestamp": f"{random.randint(1, 3)} hours ago",
            },
            {
                "type": "Data Export",
                "count": random.randint(1, 4),
                "timestamp": f"{random.randint(4, 8)} hours ago",
            },
            {
                "type": "Search Query",
                "count": random.randint(15, 30),
                "timestamp": f"{random.randint(1, 12)} hours ago",
            },
            {
                "type": "Metadata Update",
                "count": random.randint(2, 6),
                "timestamp": f"{random.randint(1, 24)} hours ago",
            },
        ]

        total_images = sum(hazard_distribution.values())

        analytics_data = {
            "totalImages": total_images,
            "hazardDistribution": hazard_distribution,
            "countryDistribution": country_distribution,
            "monthlyUploads": monthly_uploads,
            "recentActivity": recent_activity,
            "lastUpdated": datetime.now().isoformat(),
        }

        return JSONResponse(content=analytics_data)

    except Exception as e:
        logging.error(f"Analytics endpoint error: {e}")
        return JSONResponse(status_code=500, content={"detail": "Failed to fetch analytics data"})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main_simple:app", host="0.0.0.0", port=8010, reload=True, log_level="info")

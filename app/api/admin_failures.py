"""Admin API endpoints for monitoring upload failures."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel

from models.database import get_db
from models.upload_failures import UploadFailureLog, FailureReason
from api.auth_rbac import check_permission
from services.admin_service import AdminUser, Permission

router = APIRouter(prefix="/admin/upload-failures", tags=["admin", "monitoring"])


class FailureStats(BaseModel):
    """Upload failure statistics."""

    total_failures: int
    failures_by_reason: dict[str, int]
    failures_by_day: dict[str, int]
    top_uploaders: List[dict]
    recent_failures: List[dict]


class FailureDetail(BaseModel):
    """Individual failure record."""

    id: int
    filename: str
    file_size: Optional[int]
    mime_type: Optional[str]
    failure_reason: str
    error_details: Optional[str]
    uploader_id: Optional[str]
    attempted_at: datetime
    user_agent: Optional[str]
    ip_address: Optional[str]


class FailurePattern(BaseModel):
    """Common failure pattern."""

    pattern_type: str
    count: int
    examples: List[str]
    recommendation: str


@router.get("/stats", response_model=FailureStats)
async def get_failure_stats(
    days: int = Query(default=7, ge=1, le=90, description="Number of days to analyze"),
    current_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS)),
    db: Session = Depends(get_db),
):
    """
    Get comprehensive upload failure statistics.

    Requires admin privileges.
    """
    since = datetime.utcnow() - timedelta(days=days)

    # Total failures
    total = (
        db.query(func.count(UploadFailureLog.id))
        .filter(UploadFailureLog.attempted_at >= since)
        .scalar()
    )

    # Failures by reason
    by_reason = (
        db.query(UploadFailureLog.failure_reason, func.count(UploadFailureLog.id))
        .filter(UploadFailureLog.attempted_at >= since)
        .group_by(UploadFailureLog.failure_reason)
        .all()
    )

    failures_by_reason = {reason.value: count for reason, count in by_reason}

    # Failures by day
    by_day = (
        db.query(
            func.date_trunc("day", UploadFailureLog.attempted_at).label("day"),
            func.count(UploadFailureLog.id),
        )
        .filter(UploadFailureLog.attempted_at >= since)
        .group_by("day")
        .order_by("day")
        .all()
    )

    failures_by_day = {day.strftime("%Y-%m-%d"): count for day, count in by_day}

    # Top uploaders with failures
    top_uploaders_query = (
        db.query(
            UploadFailureLog.uploader_id, func.count(UploadFailureLog.id).label("failure_count")
        )
        .filter(UploadFailureLog.attempted_at >= since, UploadFailureLog.uploader_id.isnot(None))
        .group_by(UploadFailureLog.uploader_id)
        .order_by(desc("failure_count"))
        .limit(10)
        .all()
    )

    top_uploaders = [
        {"uploader_id": uid, "failure_count": count} for uid, count in top_uploaders_query
    ]

    # Recent failures
    recent = (
        db.query(UploadFailureLog)
        .filter(UploadFailureLog.attempted_at >= since)
        .order_by(desc(UploadFailureLog.attempted_at))
        .limit(20)
        .all()
    )

    recent_failures = [
        {
            "id": f.id,
            "filename": f.filename,
            "reason": f.failure_reason.value,
            "uploader_id": f.uploader_id,
            "attempted_at": f.attempted_at.isoformat(),
        }
        for f in recent
    ]

    return FailureStats(
        total_failures=total,
        failures_by_reason=failures_by_reason,
        failures_by_day=failures_by_day,
        top_uploaders=top_uploaders,
        recent_failures=recent_failures,
    )


@router.get("/patterns", response_model=List[FailurePattern])
async def analyze_failure_patterns(
    days: int = Query(default=7, ge=1, le=90),
    current_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS)),
    db: Session = Depends(get_db),
):
    """
    Analyze common failure patterns and provide recommendations.

    Requires admin privileges.
    """
    since = datetime.utcnow() - timedelta(days=days)
    patterns = []

    # Pattern 1: Missing geotags
    no_geotag_count = (
        db.query(func.count(UploadFailureLog.id))
        .filter(
            UploadFailureLog.failure_reason == FailureReason.NO_GEOTAG,
            UploadFailureLog.attempted_at >= since,
        )
        .scalar()
    )

    if no_geotag_count > 0:
        examples = (
            db.query(UploadFailureLog.filename)
            .filter(UploadFailureLog.failure_reason == FailureReason.NO_GEOTAG)
            .limit(3)
            .all()
        )

        patterns.append(
            FailurePattern(
                pattern_type="Missing Geotags",
                count=no_geotag_count,
                examples=[e[0] for e in examples],
                recommendation="Educate users to enable GPS on their cameras/phones or provide manual coordinates",
            )
        )

    # Pattern 2: Corrupted EXIF
    corrupted_count = (
        db.query(func.count(UploadFailureLog.id))
        .filter(
            UploadFailureLog.failure_reason == FailureReason.CORRUPTED_EXIF,
            UploadFailureLog.attempted_at >= since,
        )
        .scalar()
    )

    if corrupted_count > 0:
        patterns.append(
            FailurePattern(
                pattern_type="Corrupted EXIF Data",
                count=corrupted_count,
                examples=[],
                recommendation="Consider switching to exifread library for more robust EXIF parsing",
            )
        )

    # Pattern 3: Large files
    large_file_count = (
        db.query(func.count(UploadFailureLog.id))
        .filter(
            UploadFailureLog.failure_reason == FailureReason.FILE_TOO_LARGE,
            UploadFailureLog.attempted_at >= since,
        )
        .scalar()
    )

    if large_file_count > 0:
        patterns.append(
            FailurePattern(
                pattern_type="Files Too Large",
                count=large_file_count,
                examples=[],
                recommendation="Consider increasing file size limit or implementing automatic compression",
            )
        )

    # Pattern 4: Security violations
    security_count = (
        db.query(func.count(UploadFailureLog.id))
        .filter(
            UploadFailureLog.failure_reason == FailureReason.SECURITY_VIOLATION,
            UploadFailureLog.attempted_at >= since,
        )
        .scalar()
    )

    if security_count > 0:
        patterns.append(
            FailurePattern(
                pattern_type="Security Violations (GPS Spoofing)",
                count=security_count,
                examples=[],
                recommendation="Investigate potential GPS coordinate manipulation attempts",
            )
        )

    # Pattern 5: Unsupported formats
    format_count = (
        db.query(func.count(UploadFailureLog.id))
        .filter(
            UploadFailureLog.failure_reason == FailureReason.UNSUPPORTED_FORMAT,
            UploadFailureLog.attempted_at >= since,
        )
        .scalar()
    )

    if format_count > 0:
        mime_types = (
            db.query(UploadFailureLog.mime_type, func.count(UploadFailureLog.id))
            .filter(
                UploadFailureLog.failure_reason == FailureReason.UNSUPPORTED_FORMAT,
                UploadFailureLog.mime_type.isnot(None),
            )
            .group_by(UploadFailureLog.mime_type)
            .all()
        )

        common_types = [f"{mime}: {count}" for mime, count in mime_types[:3]]

        patterns.append(
            FailurePattern(
                pattern_type="Unsupported Formats",
                count=format_count,
                examples=common_types,
                recommendation="Consider adding support for HEIC/HEIF formats (common in iOS devices)",
            )
        )

    return patterns


@router.get("/details/{failure_id}", response_model=FailureDetail)
async def get_failure_details(
    failure_id: int, current_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS)), db: Session = Depends(get_db)
):
    """
    Get detailed information about a specific failure.

    Requires admin privileges.
    """
    failure = db.query(UploadFailureLog).filter(UploadFailureLog.id == failure_id).first()

    if not failure:
        raise HTTPException(status_code=404, detail="Failure record not found")

    return FailureDetail(
        id=failure.id,
        filename=failure.filename,
        file_size=failure.file_size,
        mime_type=failure.mime_type,
        failure_reason=failure.failure_reason.value,
        error_details=failure.error_details,
        uploader_id=failure.uploader_id,
        attempted_at=failure.attempted_at,
        user_agent=failure.user_agent,
        ip_address=failure.ip_address,
    )


@router.get("/list", response_model=List[FailureDetail])
async def list_failures(
    reason: Optional[FailureReason] = Query(default=None),
    uploader_id: Optional[str] = Query(default=None),
    days: int = Query(default=7, ge=1, le=90),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS)),
    db: Session = Depends(get_db),
):
    """
    List upload failures with optional filtering.

    Requires admin privileges.
    """
    since = datetime.utcnow() - timedelta(days=days)

    query = db.query(UploadFailureLog).filter(UploadFailureLog.attempted_at >= since)

    if reason:
        query = query.filter(UploadFailureLog.failure_reason == reason)

    if uploader_id:
        query = query.filter(UploadFailureLog.uploader_id == uploader_id)

    failures = query.order_by(desc(UploadFailureLog.attempted_at)).limit(limit).offset(offset).all()

    return [
        FailureDetail(
            id=f.id,
            filename=f.filename,
            file_size=f.file_size,
            mime_type=f.mime_type,
            failure_reason=f.failure_reason.value,
            error_details=f.error_details,
            uploader_id=f.uploader_id,
            attempted_at=f.attempted_at,
            user_agent=f.user_agent,
            ip_address=f.ip_address,
        )
        for f in failures
    ]


@router.delete("/cleanup")
async def cleanup_old_failures(
    days: int = Query(default=90, ge=30, le=365, description="Delete failures older than N days"),
    current_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS)),
    db: Session = Depends(get_db),
):
    """
    Clean up old failure logs to prevent table bloat.

    Requires admin privileges.
    """
    cutoff = datetime.utcnow() - timedelta(days=days)

    deleted = db.query(UploadFailureLog).filter(UploadFailureLog.attempted_at < cutoff).delete()

    db.commit()

    return {
        "message": f"Deleted {deleted} failure records older than {days} days",
        "deleted_count": deleted,
        "cutoff_date": cutoff.isoformat(),
    }

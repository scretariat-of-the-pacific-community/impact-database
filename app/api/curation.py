"""Admin curation API endpoints for review queue, metadata editing, and workflow management."""

import csv
import io
import json
import logging
import uuid
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from xml.dom import minidom

logger = logging.getLogger(__name__)

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Body,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import JSONResponse, StreamingResponse
from models.curation import (
    ActionType,
    BulkImport,
    CurationAction,
    CurationComment,
    CurationQueue,
    CurationStatus,
    ExportRequest,
    Priority,
)
from models.database import ImageMetadata, VideoMetadata, get_db
from models.rbac import Role as DBRole
from models.rbac import User
from models.review_workflow import (
    AssignmentReason,
    AuditAction,
    ReviewAssignment,
    ReviewAuditTrail,
    ReviewItem,
    ReviewPriority,
    ReviewStatus,
)
from pydantic import BaseModel, Field
from sqlalchemy import and_, asc, desc, func, or_
from sqlalchemy.orm import Session

# Alias for clarity
DBUser = User
Role = DBRole
from api.auth import User, get_current_user
from models.rbac import User as DBUser
from services.metadata_validation import MetadataValidator
from services.minio_client import get_minio_storage
from workers.email_tasks import send_upload_approved_email, send_upload_rejected_email
from workers.tasks import trigger_webhooks_on_approval

router = APIRouter()


# Pydantic models for request/response
class CurationItemResponse(BaseModel):
    id: str
    content_type: str = "image"  # 'image' or 'video'
    content_id: Optional[str] = None
    image_id: Optional[str] = None  # For backwards compatibility
    image_filename: Optional[str] = None
    status: str
    priority: str
    assigned_to: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    due_date: Optional[str] = None
    submitted_by: Optional[str] = None
    submission_notes: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    review_notes: Optional[str] = None
    is_flagged: bool = False
    flag_reason: Optional[str] = None
    is_duplicate: bool = False
    duplicate_of: Optional[str] = None
    is_deleted: bool = False
    deleted_by: Optional[str] = None
    deleted_at: Optional[str] = None
    image_metadata: Optional[Dict[str, Any]] = None
    comments_count: int = 0
    actions_count: int = 0


class PaginatedCurationResponse(BaseModel):
    items: List[CurationItemResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class CurationItemUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[str] = None
    due_date: Optional[datetime] = None
    review_notes: Optional[str] = None
    flag_reason: Optional[str] = None


class CommentCreate(BaseModel):
    content: str
    comment_type: str = "general"
    is_internal: bool = False
    parent_comment_id: Optional[str] = None


class CommentResponse(BaseModel):
    id: str
    author: str
    content: str
    created_at: str
    updated_at: str
    comment_type: str
    is_internal: bool
    parent_comment_id: Optional[str] = None
    replies: List["CommentResponse"] = []


class ActionResponse(BaseModel):
    id: str
    action_type: str
    performed_by: str
    performed_at: str
    description: Optional[str] = None
    metadata_changes: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None
    related_item_id: Optional[str] = None


class BulkImportRequest(BaseModel):
    import_type: str  # zip, csv, folder
    dry_run: bool = True
    import_settings: Dict[str, Any] = {}
    mapping_config: Optional[Dict[str, str]] = None


class BulkImportResponse(BaseModel):
    id: str
    import_type: str
    total_items: int
    processed_items: int
    successful_items: int
    failed_items: int
    status: str
    created_at: str
    created_by: str
    is_dry_run: bool
    import_report: Optional[Dict[str, Any]] = None
    validation_results: Optional[Dict[str, Any]] = None


class ExportRequestModel(BaseModel):
    export_type: str  # csv, iso19139, json, geojson
    format_options: Dict[str, Any] = {}
    filters: Dict[str, Any] = {}


class ExportResponse(BaseModel):
    id: str
    export_type: str
    status: str
    created_at: str
    total_records: int
    file_url: Optional[str] = None
    file_size: Optional[int] = None
    expires_at: Optional[str] = None


class MetadataEditRequest(BaseModel):
    metadata_updates: Dict[str, Any]
    change_notes: Optional[str] = None


# Utility functions
def check_admin_permission(user: User):
    """Check if user has admin permissions."""
    # TODO: Implement proper role-based access control
    # For now, we'll use a simple check
    if not user or user.disabled:
        raise HTTPException(status_code=403, detail="Admin permission required")


def log_curation_action(
    db: Session,
    queue_item_id: str,
    action_type: ActionType,
    performed_by: str,
    description: str = None,
    metadata_changes: Dict[str, Any] = None,
    notes: str = None,
    related_item_id: str = None,
):
    """Log a curation action."""
    # Pass the enum directly - SQLAlchemy will handle the conversion
    action = CurationAction(
        queue_item_id=queue_item_id,
        action_type=action_type,
        performed_by=performed_by,
        description=description,
        metadata_changes=metadata_changes,
        notes=notes,
        related_item_id=related_item_id,
    )
    db.add(action)
    # Don't commit here - let the parent function commit the transaction
    # db.commit()
    return action


# Review Queue Management
@router.get("/queue", response_model=PaginatedCurationResponse)
async def get_curation_queue(
    status: Optional[str] = Query(None, description="Filter by status"),
    priority: Optional[str] = Query(None, description="Filter by priority"),
    assigned_to: Optional[str] = Query(None, description="Filter by assigned curator"),
    is_flagged: Optional[bool] = Query(None, description="Filter flagged items"),
    is_duplicate: Optional[bool] = Query(None, description="Filter duplicates"),
    show_deleted: bool = Query(False, description="Include soft-deleted items"),
    show_all: bool = Query(
        False, description="Show all items (admin only, overrides role-based filtering)"
    ),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    # Legacy pagination support
    limit: Optional[int] = Query(None, ge=1, le=100, description="Deprecated: use page_size"),
    offset: Optional[int] = Query(None, ge=0, description="Deprecated: use page"),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", description="Sort order (asc/desc)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get curation queue with role-based filtering and pagination.

    Role-based visibility:
    - Admin: Sees all items (or can filter with show_all=false)
    - Curator: Sees unassigned items + items assigned to them
    - Contributor: Sees only their own submissions

    Returns paginated response with { items: [...], total: N } shape.
    """
    try:
        # Get user's role from database for permission checking
        db_user = db.query(DBUser).filter(DBUser.id == current_user.id).first()
        if not db_user:
            raise HTTPException(status_code=401, detail="User not found")

        user_role = db_user.role.name if db_user.role else None

        # Use text() for raw SQL to avoid SQLAlchemy trying to reflect missing columns
        from sqlalchemy import text as sql_text
        
        # Build base query using raw SQL - select only columns we care about
        base_query = """
        SELECT 
            CAST(id AS TEXT) as id, 
            content_type, 
            CAST(content_id AS TEXT) as content_id, 
            CAST(image_id AS TEXT) as image_id,
            status, priority, CAST(assigned_to AS TEXT) as assigned_to, 
            created_at, updated_at, due_date, 
            CAST(submitted_by AS TEXT) as submitted_by, 
            submission_notes, 
            CAST(reviewed_by AS TEXT) as reviewed_by, 
            reviewed_at, review_notes, is_flagged, flag_reason, 
            is_duplicate, CAST(duplicate_of AS TEXT) as duplicate_of, 
            is_deleted, CAST(deleted_by AS TEXT) as deleted_by, 
            deleted_at
        FROM curation_queue
        WHERE 1=1
        """
        
        # Build filters
        filters = []
        params = {}
        
        import logging
        logger = logging.getLogger(__name__)
        logger.debug(f"Building curation queue query for user {current_user.id} with role: {user_role}")
        
        if user_role == "contributor":
            filters.append("submitted_by = :user_id")
            params["user_id"] = str(current_user.id)
            logger.debug(f"Applied contributor filter: only own submissions")
        elif user_role == "curator" and not show_all:
            filters.append("(assigned_to IS NULL OR assigned_to = :user_id)")
            params["user_id"] = str(current_user.id)
            logger.debug(f"Applied curator filter: unassigned or assigned to self")
        elif user_role == "admin":
            logger.debug(f"Admin user: no role-based restrictions")
        else:
            logger.debug(f"Unknown role '{user_role}': applying no role restrictions")
        
        if status:
            filters.append("status = :status")
            params["status"] = status
        if priority:
            filters.append("priority = :priority")
            params["priority"] = priority
        if assigned_to:
            filters.append("assigned_to = :assigned_to")
            params["assigned_to"] = assigned_to
        if is_flagged is not None:
            filters.append("is_flagged = :is_flagged")
            params["is_flagged"] = is_flagged
        if is_duplicate is not None:
            filters.append("is_duplicate = :is_duplicate")
            params["is_duplicate"] = is_duplicate
        if not show_deleted:
            filters.append("COALESCE(is_deleted, false) = false")
        
        # Add filters to query
        if filters:
            base_query += " AND " + " AND ".join(filters)
        
        # Get total count
        count_query = "SELECT COUNT(*) FROM curation_queue WHERE 1=1"
        if filters:
            count_query += " AND " + " AND ".join(filters)
        
        logger.debug(f"Count query: {count_query} with params: {params}")
        total_count = db.execute(sql_text(count_query), params).scalar()
        logger.debug(f"Queue returned {total_count} total items")
        
        # Apply sorting
        sort_field = sort_by
        if sort_by == "submittedAt":
            sort_field = "created_at"
        # Validate sort field to prevent SQL injection
        valid_sort_fields = {'id', 'created_at', 'status', 'priority', 'updated_at', 'reviewed_at'}
        if sort_field not in valid_sort_fields:
            sort_field = "created_at"
        
        sort_direction = "DESC" if sort_order == "desc" else "ASC"
        base_query += f" ORDER BY {sort_field} {sort_direction}"
        
        # Apply pagination
        if limit is not None or offset is not None:
            actual_limit = limit or 50
            actual_offset = offset or 0
            page_size = actual_limit
            page = (actual_offset // actual_limit) + 1
        else:
            actual_offset = (page - 1) * page_size
            actual_limit = page_size
        
        base_query += f" OFFSET {actual_offset} LIMIT {actual_limit}"
        
        # Execute query and map results
        result = db.execute(sql_text(base_query), params)
        rows = result.fetchall()
        
        # Convert rows to response items
        response_items = []
        from uuid import UUID as UUIDType
        
        for row in rows:
            row_dict = dict(row._mapping) if hasattr(row, '_mapping') else dict(zip(result.keys(), row))
            
            # Get content metadata based on content_type
            content_type = row_dict.get('content_type', 'image')
            content_id = row_dict.get('content_id') or row_dict.get('image_id')
            image_metadata = None
            image_filename = None
            
            if content_type == 'image' and content_id:
                try:
                    from uuid import UUID
                    content_uuid = UUID(content_id) if isinstance(content_id, str) else content_id
                    image = db.query(ImageMetadata).filter(ImageMetadata.id == content_uuid).first()
                    if image:
                        image_metadata = image.to_dict()
                        image_metadata['content_type'] = 'image'
                        image_filename = image.filename
                except Exception as e:
                    logger.debug(f"Error fetching image metadata for {content_id}: {e}")
            elif content_type == 'video' and content_id:
                try:
                    from uuid import UUID
                    content_uuid = UUID(content_id) if isinstance(content_id, str) else content_id
                    video = db.query(VideoMetadata).filter(VideoMetadata.id == content_uuid).first()
                    if video:
                        image_metadata = video.to_dict()
                        image_metadata['content_type'] = 'video'
                        image_filename = video.filename
                except Exception as e:
                    logger.debug(f"Error fetching video metadata for {content_id}: {e}")
            
            # Get counts
            queue_id = row_dict.get('id')
            try:
                comments_count = (
                    db.query(func.count(CurationComment.id))
                    .filter(CurationComment.queue_item_id == queue_id, CurationComment.is_deleted == False)
                    .scalar()
                ) or 0
            except Exception as e:
                logger.debug(f"Error counting comments: {e}")
                comments_count = 0

            try:
                actions_count = (
                    db.query(func.count(CurationAction.id))
                    .filter(CurationAction.queue_item_id == queue_id)
                    .scalar()
                ) or 0
            except Exception as e:
                logger.debug(f"Error counting actions: {e}")
                actions_count = 0

            try:
                response_item = CurationItemResponse(
                    id=row_dict.get('id'),
                    content_type=content_type,
                    content_id=content_id,
                    image_id=row_dict.get('image_id'),
                    image_filename=image_filename if image_filename else None,
                    status=row_dict.get('status'),
                    priority=row_dict.get('priority') or 'medium',
                    assigned_to=row_dict.get('assigned_to'),
                    created_at=row_dict.get('created_at').isoformat() if row_dict.get('created_at') else None,
                    updated_at=row_dict.get('updated_at').isoformat() if row_dict.get('updated_at') else None,
                    due_date=row_dict.get('due_date').isoformat() if row_dict.get('due_date') else None,
                    submitted_by=row_dict.get('submitted_by'),
                    submission_notes=row_dict.get('submission_notes'),
                    reviewed_by=row_dict.get('reviewed_by'),
                    reviewed_at=row_dict.get('reviewed_at').isoformat() if row_dict.get('reviewed_at') else None,
                    review_notes=row_dict.get('review_notes'),
                    is_flagged=row_dict.get('is_flagged') if row_dict.get('is_flagged') is not None else False,
                    flag_reason=row_dict.get('flag_reason'),
                    is_duplicate=row_dict.get('is_duplicate') if row_dict.get('is_duplicate') is not None else False,
                    duplicate_of=row_dict.get('duplicate_of'),
                    is_deleted=row_dict.get('is_deleted') if row_dict.get('is_deleted') is not None else False,
                    deleted_by=row_dict.get('deleted_by'),
                    deleted_at=row_dict.get('deleted_at').isoformat() if row_dict.get('deleted_at') else None,
                    image_metadata=image_metadata,
                    comments_count=comments_count,
                    actions_count=actions_count,
                )
                response_items.append(response_item)
            except Exception as e:
                logger.error(f"Error creating CurationItemResponse for id {row_dict.get('id')}: {e}")
                logger.error(f"row_dict keys: {list(row_dict.keys())}")
                logger.error(f"row_dict['id'] type: {type(row_dict.get('id'))}, value: {row_dict.get('id')}")
                raise

        # Calculate total pages
        total_pages = (total_count + page_size - 1) // page_size if page_size > 0 else 0

        return PaginatedCurationResponse(
            items=response_items,
            total=total_count,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )
    except Exception as e:
        # Log error and return empty response rather than 500
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error in get_curation_queue: {str(e)}", exc_info=True)
        logger.error(f"User role: {user_role}, Show deleted: {show_deleted}, Show all: {show_all}")
        logger.error(f"Filters applied: {filters}")
        
        # In development, raise the error; in production, return empty queue
        import os
        if os.getenv("ENVIRONMENT") == "development":
            raise HTTPException(status_code=500, detail=f"Curation queue error: {str(e)}")
        
        # Return empty queue instead of error (production fallback)
        return PaginatedCurationResponse(
            items=[],
            total=0,
            page=page,
            page_size=page_size,
            total_pages=0,
        )


@router.get("/queue/{item_id}", response_model=CurationItemResponse)
async def get_curation_item(
    item_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Get detailed curation item."""
    check_admin_permission(current_user)

    item = db.query(CurationQueue).filter(CurationQueue.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Curation item not found")

    # Get image metadata
    image_metadata = None
    content_id = str(item.content_id) if item.content_id else None
    
    # Get content based on type
    if item.content_type == "image":
        if item.image:
            image_metadata = item.image.to_dict()
        elif content_id:
            try:
                from models.database import ImageMetadata
                from uuid import UUID

                content_uuid = UUID(content_id) if isinstance(content_id, str) else content_id
                image = db.query(ImageMetadata).filter(ImageMetadata.id == content_uuid).first()
                if image:
                    image_metadata = image.to_dict()
            except Exception as e:
                logger.debug(f"Error fetching image metadata for {content_id}: {e}")
    elif item.content_type == "video" and content_id:
        try:
            from uuid import UUID
            content_uuid = UUID(content_id) if isinstance(content_id, str) else content_id
            video = db.query(VideoMetadata).filter(VideoMetadata.id == content_uuid).first()
            if video:
                image_metadata = video.to_dict()
                image_metadata["content_type"] = "video"
        except Exception as e:
            logger.debug(f"Error fetching video metadata for {content_id}: {e}")

    # Get counts
    comments_count = (
        db.query(func.count(CurationComment.id))
        .filter(CurationComment.queue_item_id == item.id, CurationComment.is_deleted == False)
        .scalar()
    )

    actions_count = (
        db.query(func.count(CurationAction.id))
        .filter(CurationAction.queue_item_id == item.id)
        .scalar()
    )

    # Prepare response data, ensuring boolean fields default to False if NULL
    item_data = item.to_dict()
    item_data["is_flagged"] = item_data.get("is_flagged") or False
    item_data["is_duplicate"] = item_data.get("is_duplicate") or False
    item_data["is_deleted"] = item_data.get("is_deleted") or False

    if image_metadata and not item_data.get("image_filename"):
        item_data["image_filename"] = image_metadata.get("filename")

    return CurationItemResponse(
        **item_data,
        image_metadata=image_metadata,
        comments_count=comments_count,
        actions_count=actions_count,
    )


@router.post("/queue/videos/add-all")
async def add_all_videos_to_queue(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Add all videos to the curation queue. 
    
    This endpoint adds all videos that are not yet in the curation queue, 
    giving priority to videos with 'pending' status.
    """
    check_admin_permission(current_user)

    # Get all videos not yet in curation queue
    existing_video_ids = db.query(CurationQueue.content_id).filter(
        CurationQueue.content_type == "video"
    ).all()
    existing_ids = {item[0] for item in existing_video_ids}

    # Get all videos that aren't already in queue
    videos = db.query(VideoMetadata).filter(
        ~VideoMetadata.id.in_(existing_ids)
    ).all()

    added_count = 0
    for video in videos:
        # Determine priority based on status
        if video.status == "pending":
            priority = Priority.HIGH
        else:
            priority = Priority.MEDIUM
            
        queue_item = CurationQueue(
            id=uuid.uuid4(),
            content_type="video",
            content_id=video.id,
            status=CurationStatus.PENDING,
            priority=priority,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            submitted_by=video.uploader_id,
            submission_notes=f"Video: {video.title or video.original_filename}"
        )
        db.add(queue_item)
        added_count += 1

    db.commit()

    return {
        "success": True,
        "message": f"Added {added_count} videos to curation queue",
        "count": added_count
    }


@router.post("/queue/video/{video_id}")
async def add_video_to_queue(
    video_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a specific video to the curation queue."""
    check_admin_permission(current_user)

    # Check if video exists
    video = db.query(VideoMetadata).filter(VideoMetadata.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Check if already in queue
    existing = db.query(CurationQueue).filter(
        CurationQueue.content_type == "video",
        CurationQueue.content_id == video_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Video already in curation queue")

    # Add to queue
    queue_item = CurationQueue(
        id=uuid.uuid4(),
        content_type="video",
        content_id=video.id,
        status=CurationStatus.PENDING,
        priority=Priority.MEDIUM,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        submitted_by=video.uploader_id,
        submission_notes=f"Video: {video.title or video.original_filename}"
    )
    db.add(queue_item)
    db.commit()
    db.refresh(queue_item)

    return {
        "success": True,
        "message": "Video added to curation queue",
        "queue_item_id": str(queue_item.id)
    }


@router.put("/queue/{item_id}", response_model=CurationItemResponse)
async def update_curation_item(
    item_id: str,
    update_data: CurationItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update curation item status and details."""
    check_admin_permission(current_user)

    item = db.query(CurationQueue).filter(CurationQueue.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Curation item not found")

    # Track changes for action log
    changes = {}

    # Update fields
    if update_data.status and update_data.status != item.status.value:
        changes["status"] = {"from": item.status.value, "to": update_data.status}
        item.status = CurationStatus(update_data.status)

        # Update reviewed fields if approving/rejecting
        if update_data.status in ["approved", "rejected"]:
            item.reviewed_by = current_user.username
            item.reviewed_at = datetime.utcnow()

            # Also update the status of the associated ImageMetadata
            image_metadata = item.image
            if image_metadata:
                # Store old status for logging
                old_image_status = image_metadata.status
                image_metadata.status = update_data.status
                db.add(image_metadata)

                # If status transitioned to approved, trigger webhooks
                if old_image_status != "approved" and image_metadata.status == "approved":
                    trigger_webhooks_on_approval.delay(str(image_metadata.id))
                    logger.info(f"Queued webhook trigger for approved image: {image_metadata.id}")

                # Send email notification to uploader
                try:
                    uploader = (
                        db.query(DBUser)
                        .filter(
                            (DBUser.id == image_metadata.uploader_id)
                            | (DBUser.username == image_metadata.uploader_id)
                        )
                        .first()
                    )

                    if uploader and uploader.email:
                        image_title = image_metadata.title or image_metadata.filename or "Untitled"

                        if update_data.status == "approved":
                            send_upload_approved_email.delay(
                                user_email=uploader.email,
                                username=uploader.username,
                                image_title=image_title,
                                image_id=str(image_metadata.id),
                            )
                            logger.info(f"Queued approval email for {uploader.email}")
                        elif update_data.status == "rejected":
                            reason = (
                                update_data.review_notes
                                or item.review_notes
                                or "Does not meet quality guidelines"
                            )
                            send_upload_rejected_email.delay(
                                user_email=uploader.email,
                                username=uploader.username,
                                image_title=image_title,
                                reason=reason,
                            )
                            logger.info(f"Queued rejection email for {uploader.email}")
                except Exception as e:
                    logger.warning(f"Failed to queue notification email: {e}")

    if update_data.priority and update_data.priority != item.priority.value:
        changes["priority"] = {"from": item.priority.value, "to": update_data.priority}
        item.priority = Priority(update_data.priority)

    if update_data.assigned_to != item.assigned_to:
        changes["assigned_to"] = {"from": item.assigned_to, "to": update_data.assigned_to}
        item.assigned_to = update_data.assigned_to

    if update_data.due_date != item.due_date:
        changes["due_date"] = {"from": str(item.due_date), "to": str(update_data.due_date)}
        item.due_date = update_data.due_date

    if update_data.review_notes:
        item.review_notes = update_data.review_notes

    if update_data.flag_reason:
        item.is_flagged = True
        item.flag_reason = update_data.flag_reason
        changes["flagged"] = {"reason": update_data.flag_reason}

    item.updated_at = datetime.utcnow()
    db.commit()

    # Log the action
    if changes:
        log_curation_action(
            db=db,
            queue_item_id=item.id,
            action_type=ActionType.REVIEWED,
            performed_by=current_user.username,
            description="Updated curation item",
            metadata_changes=changes,
            notes=update_data.review_notes,
        )

    return CurationItemResponse(**item.to_dict())


@router.post("/queue/{item_id}/flag")
async def flag_item(
    item_id: str,
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Flag an item for attention."""
    check_admin_permission(current_user)

    flag_reason = body.get("reason") or body.get("flag_reason", "No reason provided")

    item = db.query(CurationQueue).filter(CurationQueue.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Curation item not found")

    item.is_flagged = True
    item.flag_reason = flag_reason
    item.updated_at = datetime.utcnow()
    db.commit()

    # Log the action
    log_curation_action(
        db=db,
        queue_item_id=item.id,
        action_type=ActionType.FLAGGED,
        performed_by=current_user.username,
        description="Flagged item",
        notes=flag_reason,
    )

    return {"message": "Item flagged successfully"}


@router.post("/queue/{item_id}/unflag")
async def unflag_item(
    item_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Remove flag from an item."""
    check_admin_permission(current_user)

    item = db.query(CurationQueue).filter(CurationQueue.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Curation item not found")

    item.is_flagged = False
    item.flag_reason = None
    item.updated_at = datetime.utcnow()
    db.commit()

    # Log the action
    log_curation_action(
        db=db,
        queue_item_id=item.id,
        action_type=ActionType.UNFLAGGED,
        performed_by=current_user.username,
        description="Removed flag from item",
    )

    return {"message": "Item unflagged successfully"}


@router.post("/queue/{item_id}/delete")
async def soft_delete_item(
    item_id: str,
    reason: str = "Administrative deletion",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft delete a curation item."""
    check_admin_permission(current_user)

    item = db.query(CurationQueue).filter(CurationQueue.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Curation item not found")

    item.is_deleted = True
    item.deleted_by = current_user.username
    item.deleted_at = datetime.utcnow()
    item.updated_at = datetime.utcnow()
    db.commit()

    # Log the action
    log_curation_action(
        db=db,
        queue_item_id=item.id,
        action_type=ActionType.DELETED,
        performed_by=current_user.username,
        description="Soft deleted item",
        notes=reason,
    )

    return {"message": "Item deleted successfully"}


@router.post("/queue/{item_id}/restore")
async def restore_item(
    item_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Restore a soft-deleted item."""
    check_admin_permission(current_user)

    item = db.query(CurationQueue).filter(CurationQueue.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Curation item not found")

    item.is_deleted = False
    item.deleted_by = None
    item.deleted_at = None
    item.updated_at = datetime.utcnow()
    db.commit()

    # Log the action
    log_curation_action(
        db=db,
        queue_item_id=item.id,
        action_type=ActionType.RESTORED,
        performed_by=current_user.username,
        description="Restored deleted item",
    )

    return {"message": "Item restored successfully"}


# Comments Management
@router.get("/queue/{item_id}/comments", response_model=List[CommentResponse])
async def get_item_comments(
    item_id: str,
    include_internal: bool = Query(True, description="Include internal curator notes"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get comments for a curation item."""
    check_admin_permission(current_user)

    query = db.query(CurationComment).filter(
        CurationComment.queue_item_id == item_id, CurationComment.is_deleted == False
    )

    if not include_internal:
        query = query.filter(CurationComment.is_internal == False)

    comments = query.order_by(CurationComment.created_at).all()

    # Build nested comment structure
    comment_dict = {}
    root_comments = []

    for comment in comments:
        comment_resp = CommentResponse(**comment.to_dict())
        comment_dict[comment.id] = comment_resp

        if comment.parent_comment_id:
            parent = comment_dict.get(comment.parent_comment_id)
            if parent:
                parent.replies.append(comment_resp)
        else:
            root_comments.append(comment_resp)

    return root_comments


@router.post("/queue/{item_id}/comments", response_model=CommentResponse)
async def add_comment(
    item_id: str,
    comment_data: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a comment to a curation item."""
    check_admin_permission(current_user)

    # Verify item exists
    item = db.query(CurationQueue).filter(CurationQueue.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Curation item not found")

    comment = CurationComment(
        queue_item_id=item_id,
        author=current_user.username,
        content=comment_data.content,
        comment_type=comment_data.comment_type,
        is_internal=comment_data.is_internal,
        parent_comment_id=comment_data.parent_comment_id,
    )

    db.add(comment)
    db.commit()

    # Log the action
    log_curation_action(
        db=db,
        queue_item_id=item.id,
        action_type=ActionType.COMMENTED,
        performed_by=current_user.username,
        description="Added comment",
        notes=f"Comment type: {comment_data.comment_type}",
    )

    return CommentResponse(**comment.to_dict())


@router.put("/comments/{comment_id}", response_model=CommentResponse)
async def update_comment(
    comment_id: str,
    content: str = Body(..., embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a comment's content."""
    check_admin_permission(current_user)

    comment = db.query(CurationComment).filter(CurationComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    # Only allow the author or admin to update
    db_user = db.query(DBUser).filter(DBUser.id == current_user.id).first()
    if comment.author != current_user.username and (not db_user or db_user.role.name != "admin"):
        raise HTTPException(status_code=403, detail="Not authorized to update this comment")

    comment.content = content
    comment.updated_at = datetime.utcnow()
    db.commit()

    # Log the action
    log_curation_action(
        db=db,
        queue_item_id=comment.queue_item_id,
        action_type=ActionType.EDITED,
        performed_by=current_user.username,
        description="Updated comment",
    )

    return CommentResponse(**comment.to_dict())


@router.delete("/comments/{comment_id}")
async def delete_comment(
    comment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft delete a comment."""
    check_admin_permission(current_user)

    comment = db.query(CurationComment).filter(CurationComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    # Only allow the author or admin to delete
    db_user = db.query(DBUser).filter(DBUser.id == current_user.id).first()
    if comment.author != current_user.username and (not db_user or db_user.role.name != "admin"):
        raise HTTPException(status_code=403, detail="Not authorized to delete this comment")

    comment.is_deleted = True
    comment.deleted_at = datetime.utcnow()
    db.commit()

    # Log the action
    log_curation_action(
        db=db,
        queue_item_id=comment.queue_item_id,
        action_type=ActionType.EDITED,
        performed_by=current_user.username,
        description="Deleted comment",
    )

    return {"message": "Comment deleted successfully"}


@router.post("/comments/{comment_id}/flag")
async def flag_comment(
    comment_id: str,
    reason: str = Body(..., embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Flag a comment for review."""
    check_admin_permission(current_user)

    comment = db.query(CurationComment).filter(CurationComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    # Log the flag action
    log_curation_action(
        db=db,
        queue_item_id=comment.queue_item_id,
        action_type=ActionType.FLAGGED,
        performed_by=current_user.username,
        description=f"Flagged comment by {comment.author}",
        notes=reason,
    )

    return {"message": "Comment flagged for review", "reason": reason}


# Metadata Editing
@router.put("/metadata/{filename}")
async def edit_image_metadata(
    filename: str,
    edit_request: MetadataEditRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit image metadata with change tracking."""
    check_admin_permission(current_user)

    # Get the image metadata
    image = db.query(ImageMetadata).filter(ImageMetadata.filename == filename).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Track changes
    original_data = image.to_dict()
    changes = {}

    # Apply updates
    for field, new_value in edit_request.metadata_updates.items():
        if hasattr(image, field):
            old_value = getattr(image, field)
            if old_value != new_value:
                changes[field] = {"from": old_value, "to": new_value}
                setattr(image, field, new_value)

    if changes:
        image.metadata_date = datetime.utcnow()
        db.commit()

        # If status changed to approved, trigger webhooks
        if "status" in changes and changes["status"]["to"] == CurationStatus.APPROVED.value:
            # Ensure image is loaded to get its ID
            db.refresh(item)  # Refresh item to ensure image relationship is loaded
            if item.image and item.image.id:
                trigger_webhooks_on_approval.delay(str(item.image.id))
                logger.info(f"Queued webhook trigger for approved image: {item.image.id}")

        # Log to curation queue if exists
        queue_item = (
            db.query(CurationQueue).filter(CurationQueue.image_filename == filename).first()
        )

        if queue_item:
            log_curation_action(
                db=db,
                queue_item_id=queue_item.id,
                action_type=ActionType.EDITED,
                performed_by=current_user.username,
                description="Edited image metadata",
                metadata_changes=changes,
                notes=edit_request.change_notes,
            )

    return {"message": "Metadata updated successfully", "changes": changes}


# Duplicate Handling
@router.post("/queue/{item_id}/mark-duplicate")
async def mark_as_duplicate(
    item_id: str,
    duplicate_of: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark an item as duplicate of another."""
    check_admin_permission(current_user)

    item = db.query(CurationQueue).filter(CurationQueue.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Curation item not found")

    # Verify the original exists
    original = db.query(ImageMetadata).filter(ImageMetadata.filename == duplicate_of).first()
    if not original:
        raise HTTPException(status_code=404, detail="Original image not found")

    item.is_duplicate = True
    item.duplicate_of = duplicate_of
    item.status = CurationStatus.DUPLICATE
    item.updated_at = datetime.utcnow()
    db.commit()

    # Log the action
    log_curation_action(
        db=db,
        queue_item_id=item.id,
        action_type=ActionType.MARKED_DUPLICATE,
        performed_by=current_user.username,
        description="Marked as duplicate",
        related_item_id=duplicate_of,
    )

    return {"message": "Item marked as duplicate"}


@router.post("/queue/{item_id}/merge")
async def merge_items(
    item_id: str,
    merge_with: str,
    merge_strategy: str = "prefer_original",  # prefer_original, prefer_new, manual
    field_preferences: Dict[str, str] = {},
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Merge duplicate items."""
    check_admin_permission(current_user)

    item = db.query(CurationQueue).filter(CurationQueue.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Curation item not found")

    # Get both image records
    image1 = db.query(ImageMetadata).filter(ImageMetadata.filename == item.image_filename).first()
    image2 = db.query(ImageMetadata).filter(ImageMetadata.filename == merge_with).first()

    if not image1 or not image2:
        raise HTTPException(status_code=404, detail="One or both images not found")

    # Implement merge logic based on strategy
    merged_data = {}
    changes = {}

    if merge_strategy == "prefer_original":
        # Keep original data, fill nulls with new data
        for field in image1.__table__.columns.keys():
            original_val = getattr(image1, field)
            new_val = getattr(image2, field)

            if original_val is None and new_val is not None:
                merged_data[field] = new_val
                changes[field] = {"from": original_val, "to": new_val}
            else:
                merged_data[field] = original_val

    elif merge_strategy == "manual":
        # Use field preferences
        for field, preference in field_preferences.items():
            if preference == "original":
                merged_data[field] = getattr(image1, field)
            elif preference == "new":
                merged_data[field] = getattr(image2, field)
                changes[field] = {"from": getattr(image1, field), "to": getattr(image2, field)}

    # Apply merged data
    for field, value in merged_data.items():
        if hasattr(image1, field):
            setattr(image1, field, value)

    image1.metadata_date = datetime.utcnow()
    db.commit()

    # Mark the duplicate item as processed
    item.status = CurationStatus.APPROVED
    item.updated_at = datetime.utcnow()
    db.commit()

    # Log the action
    log_curation_action(
        db=db,
        queue_item_id=item.id,
        action_type=ActionType.MERGED,
        performed_by=current_user.username,
        description="Merged with another item",
        metadata_changes=changes,
        related_item_id=merge_with,
    )

    return {"message": "Items merged successfully", "changes": changes}


# Action History
@router.get("/queue/{item_id}/actions", response_model=List[ActionResponse])
async def get_item_actions(
    item_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Get action history for a curation item."""
    check_admin_permission(current_user)

    actions = (
        db.query(CurationAction)
        .filter(CurationAction.queue_item_id == item_id)
        .order_by(desc(CurationAction.performed_at))
        .all()
    )

    return [ActionResponse(**action.to_dict()) for action in actions]


# Bulk Import Features
@router.post("/bulk-import/validate", response_model=Dict[str, Any])
async def validate_bulk_import(
    file: UploadFile = File(...),
    import_type: str = "auto",  # auto, zip, csv
    mapping_config: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Validate bulk import file without importing."""
    check_admin_permission(current_user)

    # Parse mapping config if provided
    mapping = {}
    if mapping_config:
        try:
            mapping = json.loads(mapping_config)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid mapping configuration")

    # Read file content
    content = await file.read()

    validation_results = {
        "file_info": {
            "filename": file.filename,
            "size": len(content),
            "content_type": file.content_type,
        },
        "detected_type": import_type,
        "total_items": 0,
        "valid_items": 0,
        "invalid_items": 0,
        "errors": [],
        "warnings": [],
        "preview": [],
    }

    try:
        if file.content_type == "application/zip" or file.filename.endswith(".zip"):
            validation_results["detected_type"] = "zip"
            validation_results.update(await _validate_zip_import(content))

        elif file.content_type == "text/csv" or file.filename.endswith(".csv"):
            validation_results["detected_type"] = "csv"
            validation_results.update(await _validate_csv_import(content, mapping))

        else:
            raise HTTPException(status_code=400, detail="Unsupported file type")

    except Exception as e:
        validation_results["errors"].append(f"Validation failed: {str(e)}")

    return validation_results


@router.post("/bulk-import", response_model=BulkImportResponse)
async def start_bulk_import(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    import_type: str = "auto",
    dry_run: bool = True,
    import_settings: str = "{}",
    mapping_config: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Start a bulk import operation."""
    check_admin_permission(current_user)

    # Parse settings
    try:
        settings = json.loads(import_settings)
        mapping = json.loads(mapping_config) if mapping_config else {}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in settings or mapping")

    # Create bulk import record
    bulk_import = BulkImport(
        import_type=import_type,
        original_filename=file.filename,
        created_by=current_user.username,
        is_dry_run=dry_run,
        import_settings=settings,
        mapping_config=mapping,
    )

    db.add(bulk_import)
    db.commit()

    # Save file content for background processing
    content = await file.read()

    # Start background task
    background_tasks.add_task(
        _process_bulk_import, bulk_import.id, content, import_type, dry_run, settings, mapping
    )

    return BulkImportResponse(**bulk_import.to_dict())


@router.get("/bulk-import", response_model=List[BulkImportResponse])
async def get_bulk_imports(
    limit: int = Query(20, le=100),
    offset: int = Query(0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get bulk import history."""
    check_admin_permission(current_user)

    imports = (
        db.query(BulkImport).order_by(desc(BulkImport.created_at)).offset(offset).limit(limit).all()
    )

    return [BulkImportResponse(**imp.to_dict()) for imp in imports]


@router.get("/bulk-import/{import_id}", response_model=BulkImportResponse)
async def get_bulk_import(
    import_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Get detailed bulk import information."""
    check_admin_permission(current_user)

    bulk_import = db.query(BulkImport).filter(BulkImport.id == import_id).first()
    if not bulk_import:
        raise HTTPException(status_code=404, detail="Bulk import not found")

    return BulkImportResponse(**bulk_import.to_dict())


# Export Features
@router.post("/export", response_model=ExportResponse)
async def create_export(
    background_tasks: BackgroundTasks,
    export_request: ExportRequestModel,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create an export request."""
    check_admin_permission(current_user)

    # Validate export type
    if export_request.export_type not in ["csv", "iso19139", "json", "geojson"]:
        raise HTTPException(status_code=400, detail="Invalid export type")

    # Create export request record
    export_req = ExportRequest(
        export_type=export_request.export_type,
        format_options=export_request.format_options,
        filters=export_request.filters,
        requested_by=current_user.username,
    )

    db.add(export_req)
    db.commit()

    # Start background export task
    background_tasks.add_task(
        _process_export,
        export_req.id,
        export_request.export_type,
        export_request.format_options,
        export_request.filters,
    )

    return ExportResponse(**export_req.to_dict())


@router.get("/export", response_model=List[ExportResponse])
async def get_exports(
    limit: int = Query(20, le=100),
    offset: int = Query(0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get export request history."""
    check_admin_permission(current_user)

    exports = (
        db.query(ExportRequest)
        .order_by(desc(ExportRequest.created_at))
        .offset(offset)
        .limit(limit)
        .all()
    )

    return [ExportResponse(**exp.to_dict()) for exp in exports]


@router.get("/export/{export_id}")
async def download_export(
    export_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Download export file."""
    check_admin_permission(current_user)

    export_req = db.query(ExportRequest).filter(ExportRequest.id == export_id).first()
    if not export_req:
        raise HTTPException(status_code=404, detail="Export not found")

    if export_req.status != "completed":
        raise HTTPException(status_code=400, detail="Export not ready for download")

    if export_req.expires_at and export_req.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="Export has expired")

    # TODO: Implement file serving from MinIO or local storage
    # For now, return the file URL
    return {"download_url": export_req.file_url}


# Dashboard and Statistics
@router.get("/dashboard/stats")
async def get_dashboard_stats(
    period: str = Query("30d", description="Time window: 24h, 7d, 30d, 90d"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get curation dashboard statistics."""
    check_admin_permission(current_user)

    # Normalize period to days (default 30)
    def _period_to_days(value: str) -> int:
        normalized = (value or "").lower()
        if normalized in ("24h", "1d"):
            return 1
        if normalized == "7d":
            return 7
        if normalized in ("90d", "3m"):
            return 90
        return 30

    days = _period_to_days(period)

    # Queue statistics using CurationQueue
    total_items = db.query(func.count(CurationQueue.id)).scalar()

    pending_items = (
        db.query(func.count(CurationQueue.id)).filter(CurationQueue.status == "pending").scalar()
    )

    under_review_items = (
        db.query(func.count(CurationQueue.id))
        .filter(CurationQueue.status == "under_review")
        .scalar()
    )

    approved_items = (
        db.query(func.count(CurationQueue.id)).filter(CurationQueue.status == "approved").scalar()
    )

    rejected_items = (
        db.query(func.count(CurationQueue.id)).filter(CurationQueue.status == "rejected").scalar()
    )

    flagged_items = (
        db.query(func.count(CurationQueue.id)).filter(CurationQueue.is_flagged == True).scalar()
    )

    duplicate_items = (
        db.query(func.count(CurationQueue.id)).filter(CurationQueue.is_duplicate == True).scalar()
    )

    # Activity statistics (last 30 days)
    window_start = datetime.utcnow() - timedelta(days=days)

    recent_submissions = (
        db.query(func.count(CurationQueue.id))
        .filter(CurationQueue.created_at >= window_start)
        .scalar()
    )

    recent_reviews = (
        db.query(func.count(CurationQueue.id))
        .filter(
            CurationQueue.updated_at >= window_start,
            CurationQueue.status.in_(["approved", "rejected", "needs_changes"]),
        )
        .scalar()
    )

    # Queue age analysis
    avg_queue_time = (
        db.query(
            func.avg(func.extract("epoch", datetime.utcnow() - CurationQueue.created_at) / 86400)
        )
        .filter(CurationQueue.status == "pending")
        .scalar()
    )

    return {
        "queue_stats": {
            "total_items": total_items or 0,
            "pending": pending_items or 0,
            "under_review": under_review_items or 0,
            "approved": approved_items or 0,
            "rejected": rejected_items or 0,
            "flagged": flagged_items or 0,
            "duplicates": duplicate_items or 0,
        },
        "activity_stats": {
            "recent_submissions": recent_submissions or 0,
            "recent_reviews": recent_reviews or 0,
            "avg_queue_time_days": round(avg_queue_time or 0, 1),
        },
        "priority_distribution": await _get_priority_distribution(db),
        "curator_workload": await _get_curator_workload(db),
    }


# Helper functions for bulk import/export
async def _validate_zip_import(content: bytes) -> Dict[str, Any]:
    """Validate ZIP file contents."""
    results = {
        "total_items": 0,
        "valid_items": 0,
        "invalid_items": 0,
        "errors": [],
        "warnings": [],
        "preview": [],
    }

    try:
        with zipfile.ZipFile(io.BytesIO(content), "r") as zip_file:
            file_list = zip_file.namelist()

            # Count image files
            image_extensions = {".jpg", ".jpeg", ".png", ".tiff", ".tif"}
            image_files = [
                f for f in file_list if any(f.lower().endswith(ext) for ext in image_extensions)
            ]

            results["total_items"] = len(image_files)

            # Look for metadata files
            metadata_files = [f for f in file_list if f.lower().endswith((".csv", ".json", ".xml"))]

            if metadata_files:
                results["warnings"].append(f"Found {len(metadata_files)} metadata files")
            else:
                results["warnings"].append("No metadata files found, will extract from EXIF")

            # Preview first few files
            results["preview"] = image_files[:5]
            results["valid_items"] = len(image_files)

    except Exception as e:
        results["errors"].append(f"ZIP validation error: {str(e)}")

    return results


async def _validate_csv_import(content: bytes, mapping: Dict[str, str]) -> Dict[str, Any]:
    """Validate CSV file contents."""
    results = {
        "total_items": 0,
        "valid_items": 0,
        "invalid_items": 0,
        "errors": [],
        "warnings": [],
        "preview": [],
    }

    try:
        csv_content = content.decode("utf-8")
        csv_reader = csv.DictReader(io.StringIO(csv_content))

        rows = list(csv_reader)
        results["total_items"] = len(rows)

        # Check required fields
        required_fields = ["filename", "hazard_type", "location"]
        fieldnames = csv_reader.fieldnames or []

        # Apply mapping if provided
        mapped_fields = set()
        for required in required_fields:
            if required in fieldnames:
                mapped_fields.add(required)
            elif mapping.get(required) in fieldnames:
                mapped_fields.add(required)

        missing_fields = set(required_fields) - mapped_fields
        if missing_fields:
            results["errors"].append(f"Missing required fields: {list(missing_fields)}")

        # Validate sample rows
        valid_count = 0
        for i, row in enumerate(rows[:10]):  # Check first 10 rows
            row_errors = []

            # Check required fields have values
            for field in required_fields:
                mapped_field = mapping.get(field, field)
                if not row.get(mapped_field):
                    row_errors.append(f"Missing {field}")

            if not row_errors:
                valid_count += 1

            if i < 3:  # Add to preview
                results["preview"].append({"row": i + 1, "data": dict(row), "errors": row_errors})

        results["valid_items"] = valid_count
        results["invalid_items"] = len(rows[:10]) - valid_count

        if valid_count == 0:
            results["errors"].append("No valid rows found in sample")

    except Exception as e:
        results["errors"].append(f"CSV validation error: {str(e)}")

    return results


async def _process_bulk_import(
    import_id: str,
    content: bytes,
    import_type: str,
    dry_run: bool,
    settings: Dict[str, Any],
    mapping: Dict[str, str],
):
    """Background task to process bulk import."""
    db = SessionLocal()
    try:
        bulk_import = db.query(BulkImport).filter(BulkImport.id == import_id).first()
        if not bulk_import:
            return

        bulk_import.status = "processing"
        bulk_import.started_at = datetime.utcnow()
        db.commit()

        # Process based on type
        if import_type == "zip":
            await _process_zip_import(db, bulk_import, content, dry_run, settings)
        elif import_type == "csv":
            await _process_csv_import(db, bulk_import, content, dry_run, mapping)

        bulk_import.status = "completed"
        bulk_import.completed_at = datetime.utcnow()
        db.commit()

    except Exception as e:
        bulk_import.status = "failed"
        bulk_import.error_log = {"error": str(e)}
        bulk_import.completed_at = datetime.utcnow()
        db.commit()
    finally:
        db.close()


async def _process_export(
    export_id: str, export_type: str, format_options: Dict[str, Any], filters: Dict[str, Any]
):
    """Background task to process export."""
    db = SessionLocal()
    try:
        export_req = db.query(ExportRequest).filter(ExportRequest.id == export_id).first()
        if not export_req:
            return

        export_req.status = "processing"
        export_req.started_at = datetime.utcnow()
        db.commit()

        # Build query based on filters
        query = db.query(ImageMetadata)

        if filters.get("hazard_type"):
            query = query.filter(ImageMetadata.hazard_type == filters["hazard_type"])
        if filters.get("country"):
            query = query.filter(ImageMetadata.country == filters["country"])
        if filters.get("start_date"):
            query = query.filter(ImageMetadata.timestamp >= filters["start_date"])
        if filters.get("end_date"):
            query = query.filter(ImageMetadata.timestamp <= filters["end_date"])

        images = query.all()
        export_req.total_records = len(images)

        # Generate export file
        if export_type == "csv":
            file_content = _generate_csv_export(images, format_options)
            filename = f"export_{export_id}.csv"
        elif export_type == "json":
            file_content = _generate_json_export(images, format_options)
            filename = f"export_{export_id}.json"
        elif export_type == "iso19139":
            file_content = _generate_iso19139_export(images, format_options)
            filename = f"export_{export_id}.xml"
        elif export_type == "geojson":
            file_content = _generate_geojson_export(images, format_options)
            filename = f"export_{export_id}.geojson"

        # TODO: Upload to MinIO and get URL
        # For now, store file size
        export_req.file_size = len(file_content.encode("utf-8"))
        export_req.file_url = f"/api/exports/download/{export_id}"
        export_req.expires_at = datetime.utcnow() + timedelta(days=7)

        export_req.status = "completed"
        export_req.completed_at = datetime.utcnow()
        db.commit()

    except Exception as e:
        export_req.status = "failed"
        export_req.error_message = str(e)
        export_req.completed_at = datetime.utcnow()
        db.commit()
    finally:
        db.close()


def _generate_csv_export(images: List[ImageMetadata], options: Dict[str, Any]) -> str:
    """Generate CSV export."""
    output = io.StringIO()

    # Determine fields to include
    all_fields = [c.name for c in ImageMetadata.__table__.columns]
    include_fields = options.get("fields", all_fields)

    writer = csv.DictWriter(output, fieldnames=include_fields)
    writer.writeheader()

    for image in images:
        row = {}
        for field in include_fields:
            value = getattr(image, field)
            if isinstance(value, datetime):
                value = value.isoformat()
            elif isinstance(value, (dict, list)):
                value = json.dumps(value)
            row[field] = value
        writer.writerow(row)

    return output.getvalue()


def _generate_json_export(images: List[ImageMetadata], options: Dict[str, Any]) -> str:
    """Generate JSON export."""
    data = []
    for image in images:
        data.append(image.to_dict())

    return json.dumps(
        {
            "export_info": {
                "generated_at": datetime.utcnow().isoformat(),
                "total_records": len(images),
                "format": "JSON",
            },
            "data": data,
        },
        indent=2 if options.get("pretty", False) else None,
    )


def _generate_iso19139_export(images: List[ImageMetadata], options: Dict[str, Any]) -> str:
    """Generate ISO 19139 XML export."""
    # Create root element
    root = ET.Element("gmd:MD_Metadata")
    root.set("xmlns:gmd", "http://www.isotc211.org/2005/gmd")
    root.set("xmlns:gco", "http://www.isotc211.org/2005/gco")
    root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")

    for image in images:
        # File identifier
        file_id = ET.SubElement(root, "gmd:fileIdentifier")
        char_string = ET.SubElement(file_id, "gco:CharacterString")
        char_string.text = image.filename

        # Language
        lang = ET.SubElement(root, "gmd:language")
        lang_code = ET.SubElement(lang, "gmd:LanguageCode")
        lang_code.set("codeList", "http://www.loc.gov/standards/iso639-2/")
        lang_code.set("codeListValue", image.metadata_language or "eng")
        lang_code.text = image.metadata_language or "eng"

        # Hierarchy level
        hierarchy = ET.SubElement(root, "gmd:hierarchyLevel")
        scope_code = ET.SubElement(hierarchy, "gmd:MD_ScopeCode")
        scope_code.set(
            "codeList", "http://standards.iso.org/iso/19139/resources/gmxCodelists.xml#MD_ScopeCode"
        )
        scope_code.set("codeListValue", "dataset")
        scope_code.text = "dataset"

        # Date stamp
        date_stamp = ET.SubElement(root, "gmd:dateStamp")
        date_elem = ET.SubElement(date_stamp, "gco:DateTime")
        date_elem.text = (image.date_stamp or datetime.utcnow()).isoformat()

        # Identification info
        id_info = ET.SubElement(root, "gmd:identificationInfo")
        data_id = ET.SubElement(id_info, "gmd:MD_DataIdentification")

        # Title
        citation = ET.SubElement(data_id, "gmd:citation")
        ci_citation = ET.SubElement(citation, "gmd:CI_Citation")
        title = ET.SubElement(ci_citation, "gmd:title")
        title_str = ET.SubElement(title, "gco:CharacterString")
        title_str.text = image.title or image.filename

        # Abstract
        abstract = ET.SubElement(data_id, "gmd:abstract")
        abstract_str = ET.SubElement(abstract, "gco:CharacterString")
        abstract_str.text = (
            image.abstract or f"Hazard image: {image.hazard_type} in {image.location}"
        )

        # Topic category
        if image.topic_category:
            for topic in image.topic_category:
                topic_cat = ET.SubElement(data_id, "gmd:topicCategory")
                topic_code = ET.SubElement(topic_cat, "gmd:MD_TopicCategoryCode")
                topic_code.text = topic

    # Pretty print XML
    xml_str = ET.tostring(root, encoding="unicode")
    dom = minidom.parseString(xml_str)
    return dom.toprettyxml(indent="  ")


def _generate_geojson_export(images: List[ImageMetadata], options: Dict[str, Any]) -> str:
    """Generate GeoJSON export."""
    features = []

    for image in images:
        if image.latitude is not None and image.longitude is not None:
            feature = {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [image.longitude, image.latitude]},
                "properties": image.to_dict(),
            }
            # Remove geometry fields from properties to avoid duplication
            feature["properties"].pop("latitude", None)
            feature["properties"].pop("longitude", None)
            features.append(feature)

    geojson = {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "EPSG:4326"}},
        "features": features,
    }

    return json.dumps(geojson, indent=2 if options.get("pretty", False) else None)


async def _get_priority_distribution(db: Session) -> Dict[str, int]:
    """Get priority distribution for dashboard using CurationQueue."""
    from sqlalchemy import String, cast, func

    # Cast priority enum to string to avoid enum value mismatch (DB has lowercase, enum has uppercase)
    results = (
        db.query(cast(CurationQueue.priority, String), func.count(CurationQueue.id))
        .group_by(CurationQueue.priority)
        .all()
    )

    return {str(priority): count for priority, count in results}


async def _get_curator_workload(db: Session) -> List[Dict[str, Any]]:
    """Get curator workload for dashboard using CurationQueue."""
    from sqlalchemy import cast, func
    from sqlalchemy.dialects.postgresql import UUID

    # Join with User table to get curator names
    # Cast assigned_to (string) to UUID to match users.id type
    results = (
        db.query(DBUser.username, func.count(CurationQueue.id))
        .join(CurationQueue, cast(CurationQueue.assigned_to, UUID(as_uuid=True)) == DBUser.id)
        .filter(
            CurationQueue.assigned_to.isnot(None),
            CurationQueue.status.in_(["pending", "under_review"]),
        )
        .group_by(DBUser.username)
        .all()
    )

    return [{"curator": curator, "assigned_items": count} for curator, count in results]


async def _process_zip_import(
    db: Session, bulk_import: BulkImport, content: bytes, dry_run: bool, settings: Dict[str, Any]
):
    """Process ZIP file import."""
    # Implementation would extract files and process each image
    # For now, just update the bulk import record
    bulk_import.total_items = 10  # Placeholder
    bulk_import.processed_items = 10
    bulk_import.successful_items = 8
    bulk_import.failed_items = 2
    bulk_import.import_report = {
        "processed_files": ["image1.jpg", "image2.jpg"],
        "failed_files": ["corrupt.jpg"],
        "processing_time": "30 seconds",
    }


async def _process_csv_import(
    db: Session, bulk_import: BulkImport, content: bytes, dry_run: bool, mapping: Dict[str, str]
):
    """Process CSV file import."""
    # Implementation would parse CSV and create/update metadata
    # For now, just update the bulk import record
    bulk_import.total_items = 50  # Placeholder
    bulk_import.processed_items = 50
    bulk_import.successful_items = 45
    bulk_import.failed_items = 5
    bulk_import.import_report = {
        "processed_rows": 50,
        "validation_errors": ["Row 5: Invalid hazard type", "Row 12: Missing location"],
        "processing_time": "2 minutes",
    }


# Auto-assignment helper functions
async def _get_curator_with_lowest_workload(db: Session) -> Optional[str]:
    """Find curator with lowest current workload for auto-assignment."""
    from sqlalchemy import func

    # Get all curators
    curators = db.query(DBUser).join(DBUser.role).filter(Role.name == "curator").all()

    if not curators:
        return None

    # Calculate workload for each curator
    curator_workloads = []
    for curator in curators:
        workload = (
            db.query(func.count(CurationQueue.id))
            .filter(
                CurationQueue.assigned_to == str(curator.id),
                CurationQueue.status.in_(["pending", "under_review"]),
            )
            .scalar()
            or 0
        )
        curator_workloads.append((str(curator.id), workload))

    # Return curator with lowest workload
    curator_workloads.sort(key=lambda x: x[1])
    return curator_workloads[0][0]


async def _auto_assign_queue_item(db: Session, queue_item: CurationQueue) -> bool:
    """Auto-assign a queue item to curator with lowest workload."""
    if queue_item.assigned_to:
        return False  # Already assigned

    curator_id = await _get_curator_with_lowest_workload(db)
    if curator_id:
        queue_item.assigned_to = curator_id

        # Create action log
        log_curation_action(
            db=db,
            queue_item_id=queue_item.id,
            action_type=ActionType.EDITED,
            performed_by="system",
            metadata_changes={"assigned_to": {"from": None, "to": curator_id}},
            notes="Auto-assigned to curator with lowest workload",
        )
        db.commit()
        return True

    return False


# New endpoints for workload management
@router.post("/queue/{item_id}/claim")
async def claim_queue_item(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Curator claims an unassigned item for review."""
    # Get user's role from database
    db_user = db.query(DBUser).filter(DBUser.id == current_user.id).first()
    if not db_user or db_user.role.name not in ["curator", "admin"]:
        raise HTTPException(status_code=403, detail="Only curators and admins can claim items")

    # Get the item
    item = db.query(CurationQueue).filter(CurationQueue.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found")

    # Check if already assigned
    if item.assigned_to:
        raise HTTPException(status_code=400, detail="Item is already assigned")

    # Assign to current user
    item.assigned_to = str(current_user.id)
    item.updated_at = datetime.utcnow()

    # Create action log
    log_curation_action(
        db=db,
        queue_item_id=item.id,
        action_type=ActionType.EDITED,
        performed_by=current_user.id,
        metadata_changes={"assigned_to": {"from": None, "to": str(current_user.id)}},
        notes="Curator claimed item for review",
    )
    db.commit()
    db.refresh(item)

    return {"success": True, "message": "Item claimed successfully", "item": item.to_dict()}


@router.post("/queue/{item_id}/assign")
async def assign_queue_item(
    item_id: str,
    curator_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin assigns an item to a specific curator."""
    # Get user's role from database
    db_user = db.query(DBUser).filter(DBUser.id == current_user.id).first()
    if not db_user or db_user.role.name != "admin":
        raise HTTPException(status_code=403, detail="Only admins can assign items")

    # Get the item
    item = db.query(CurationQueue).filter(CurationQueue.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found")

    # Verify curator exists and has curator role
    curator = db.query(DBUser).filter(DBUser.id == curator_id).first()
    if not curator:
        raise HTTPException(status_code=404, detail="Curator not found")

    if curator.role.name not in ["curator", "admin"]:
        raise HTTPException(status_code=400, detail="User is not a curator")

    old_assignee = item.assigned_to
    item.assigned_to = curator_id
    item.updated_at = datetime.utcnow()

    # Create action log
    log_curation_action(
        db=db,
        queue_item_id=item.id,
        action_type=ActionType.EDITED,
        performed_by=current_user.id,
        metadata_changes={"assigned_to": {"from": old_assignee, "to": curator_id}},
        notes=f"Admin assigned item to curator {curator.username}",
    )
    db.commit()
    db.refresh(item)

    return {"success": True, "message": "Item assigned successfully", "item": item.to_dict()}


@router.get("/curators")
async def get_curators(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get list of curators with their current workload."""
    # All authenticated users can view curator list

    # Get all curators
    curators = db.query(DBUser).join(DBUser.role).filter(Role.name.in_(["curator", "admin"])).all()

    curator_list = []
    for curator in curators:
        workload = (
            db.query(func.count(CurationQueue.id))
            .filter(
                CurationQueue.assigned_to == str(curator.id),
                CurationQueue.status.in_(["pending", "under_review"]),
            )
            .scalar()
            or 0
        )

        curator_list.append(
            {
                "id": str(curator.id),
                "username": curator.username,
                "email": curator.email,
                "role": curator.role.name,
                "current_workload": workload,
            }
        )

    return curator_list

"""Admin curation API endpoints for review queue, metadata editing, and workflow management."""

from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
import csv
import io
import zipfile
import json
import xml.etree.ElementTree as ET
from xml.dom import minidom

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, BackgroundTasks
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc, asc, func
from pydantic import BaseModel, Field

from models.database import get_db, ImageMetadata
from models.curation import (
    CurationQueue, CurationComment, CurationAction, BulkImport, ExportRequest,
    CurationStatus, Priority, ActionType
)
from api.auth import get_current_user, User
from services.metadata_validation import MetadataValidator
from services.minio_client import get_minio_storage

router = APIRouter()

# Pydantic models for request/response
class CurationItemResponse(BaseModel):
    id: str
    image_filename: str
    status: str
    priority: str
    assigned_to: Optional[str] = None
    created_at: str
    updated_at: str
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
        raise HTTPException(
            status_code=403,
            detail="Admin permission required"
        )

def log_curation_action(
    db: Session,
    queue_item_id: str,
    action_type: ActionType,
    performed_by: str,
    description: str = None,
    metadata_changes: Dict[str, Any] = None,
    notes: str = None,
    related_item_id: str = None
):
    """Log a curation action."""
    action = CurationAction(
        queue_item_id=queue_item_id,
        action_type=action_type,
        performed_by=performed_by,
        description=description,
        metadata_changes=metadata_changes,
        notes=notes,
        related_item_id=related_item_id
    )
    db.add(action)
    db.commit()
    return action

# Review Queue Management
@router.get("/queue", response_model=List[CurationItemResponse])
async def get_curation_queue(
    status: Optional[str] = Query(None, description="Filter by status"),
    priority: Optional[str] = Query(None, description="Filter by priority"),
    assigned_to: Optional[str] = Query(None, description="Filter by assigned curator"),
    is_flagged: Optional[bool] = Query(None, description="Filter flagged items"),
    is_duplicate: Optional[bool] = Query(None, description="Filter duplicates"),
    show_deleted: bool = Query(False, description="Include soft-deleted items"),
    limit: int = Query(50, le=100, description="Number of items to return"),
    offset: int = Query(0, description="Offset for pagination"),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", description="Sort order (asc/desc)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get curation queue with filtering and pagination."""
    check_admin_permission(current_user)
    
    query = db.query(CurationQueue)
    
    # Apply filters
    if status:
        query = query.filter(CurationQueue.status == status)
    if priority:
        query = query.filter(CurationQueue.priority == priority)
    if assigned_to:
        query = query.filter(CurationQueue.assigned_to == assigned_to)
    if is_flagged is not None:
        query = query.filter(CurationQueue.is_flagged == is_flagged)
    if is_duplicate is not None:
        query = query.filter(CurationQueue.is_duplicate == is_duplicate)
    if not show_deleted:
        query = query.filter(CurationQueue.is_deleted == False)
    
    # Apply sorting
    sort_column = getattr(CurationQueue, sort_by, CurationQueue.created_at)
    if sort_order == "desc":
        query = query.order_by(desc(sort_column))
    else:
        query = query.order_by(asc(sort_column))
    
    # Apply pagination
    queue_items = query.offset(offset).limit(limit).all()
    
    # Build response with additional data
    response_items = []
    for item in queue_items:
        # Get image metadata
        image_metadata = None
        if item.image:
            image_metadata = item.image.to_dict()
        
        # Get counts
        comments_count = db.query(func.count(CurationComment.id)).filter(
            CurationComment.queue_item_id == item.id,
            CurationComment.is_deleted == False
        ).scalar()
        
        actions_count = db.query(func.count(CurationAction.id)).filter(
            CurationAction.queue_item_id == item.id
        ).scalar()
        
        response_item = CurationItemResponse(
            **item.to_dict(),
            image_metadata=image_metadata,
            comments_count=comments_count,
            actions_count=actions_count
        )
        response_items.append(response_item)
    
    return response_items

@router.get("/queue/{item_id}", response_model=CurationItemResponse)
async def get_curation_item(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get detailed curation item."""
    check_admin_permission(current_user)
    
    item = db.query(CurationQueue).filter(CurationQueue.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Curation item not found")
    
    # Get image metadata
    image_metadata = None
    if item.image:
        image_metadata = item.image.to_dict()
    
    # Get counts
    comments_count = db.query(func.count(CurationComment.id)).filter(
        CurationComment.queue_item_id == item.id,
        CurationComment.is_deleted == False
    ).scalar()
    
    actions_count = db.query(func.count(CurationAction.id)).filter(
        CurationAction.queue_item_id == item.id
    ).scalar()
    
    return CurationItemResponse(
        **item.to_dict(),
        image_metadata=image_metadata,
        comments_count=comments_count,
        actions_count=actions_count
    )

@router.put("/queue/{item_id}", response_model=CurationItemResponse)
async def update_curation_item(
    item_id: str,
    update_data: CurationItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
        changes['status'] = {'from': item.status.value, 'to': update_data.status}
        item.status = CurationStatus(update_data.status)
        
        # Update reviewed fields if approving/rejecting
        if update_data.status in ['approved', 'rejected']:
            item.reviewed_by = current_user.username
            item.reviewed_at = datetime.utcnow()
    
    if update_data.priority and update_data.priority != item.priority.value:
        changes['priority'] = {'from': item.priority.value, 'to': update_data.priority}
        item.priority = Priority(update_data.priority)
    
    if update_data.assigned_to != item.assigned_to:
        changes['assigned_to'] = {'from': item.assigned_to, 'to': update_data.assigned_to}
        item.assigned_to = update_data.assigned_to
    
    if update_data.due_date != item.due_date:
        changes['due_date'] = {'from': str(item.due_date), 'to': str(update_data.due_date)}
        item.due_date = update_data.due_date
    
    if update_data.review_notes:
        item.review_notes = update_data.review_notes
    
    if update_data.flag_reason:
        item.is_flagged = True
        item.flag_reason = update_data.flag_reason
        changes['flagged'] = {'reason': update_data.flag_reason}
    
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
            notes=update_data.review_notes
        )
    
    return CurationItemResponse(**item.to_dict())

@router.post("/queue/{item_id}/flag")
async def flag_item(
    item_id: str,
    flag_reason: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Flag an item for attention."""
    check_admin_permission(current_user)
    
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
        notes=flag_reason
    )
    
    return {"message": "Item flagged successfully"}

@router.post("/queue/{item_id}/unflag")
async def unflag_item(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
        description="Removed flag from item"
    )
    
    return {"message": "Item unflagged successfully"}

@router.post("/queue/{item_id}/delete")
async def soft_delete_item(
    item_id: str,
    reason: str = "Administrative deletion",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
        notes=reason
    )
    
    return {"message": "Item deleted successfully"}

@router.post("/queue/{item_id}/restore")
async def restore_item(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
        description="Restored deleted item"
    )
    
    return {"message": "Item restored successfully"}

# Comments Management
@router.get("/queue/{item_id}/comments", response_model=List[CommentResponse])
async def get_item_comments(
    item_id: str,
    include_internal: bool = Query(True, description="Include internal curator notes"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get comments for a curation item."""
    check_admin_permission(current_user)
    
    query = db.query(CurationComment).filter(
        CurationComment.queue_item_id == item_id,
        CurationComment.is_deleted == False
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
    current_user: User = Depends(get_current_user)
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
        parent_comment_id=comment_data.parent_comment_id
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
        notes=f"Comment type: {comment_data.comment_type}"
    )
    
    return CommentResponse(**comment.to_dict())

# Metadata Editing
@router.put("/metadata/{filename}")
async def edit_image_metadata(
    filename: str,
    edit_request: MetadataEditRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
                changes[field] = {'from': old_value, 'to': new_value}
                setattr(image, field, new_value)
    
    if changes:
        image.metadata_date = datetime.utcnow()
        db.commit()
        
        # Log to curation queue if exists
        queue_item = db.query(CurationQueue).filter(
            CurationQueue.image_filename == filename
        ).first()
        
        if queue_item:
            log_curation_action(
                db=db,
                queue_item_id=queue_item.id,
                action_type=ActionType.EDITED,
                performed_by=current_user.username,
                description="Edited image metadata",
                metadata_changes=changes,
                notes=edit_request.change_notes
            )
    
    return {"message": "Metadata updated successfully", "changes": changes}

# Duplicate Handling
@router.post("/queue/{item_id}/mark-duplicate")
async def mark_as_duplicate(
    item_id: str,
    duplicate_of: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
        related_item_id=duplicate_of
    )
    
    return {"message": "Item marked as duplicate"}

@router.post("/queue/{item_id}/merge")
async def merge_items(
    item_id: str,
    merge_with: str,
    merge_strategy: str = "prefer_original",  # prefer_original, prefer_new, manual
    field_preferences: Dict[str, str] = {},
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
                changes[field] = {'from': original_val, 'to': new_val}
            else:
                merged_data[field] = original_val
    
    elif merge_strategy == "manual":
        # Use field preferences
        for field, preference in field_preferences.items():
            if preference == "original":
                merged_data[field] = getattr(image1, field)
            elif preference == "new":
                merged_data[field] = getattr(image2, field)
                changes[field] = {'from': getattr(image1, field), 'to': getattr(image2, field)}
    
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
        related_item_id=merge_with
    )
    
    return {"message": "Items merged successfully", "changes": changes}

# Action History
@router.get("/queue/{item_id}/actions", response_model=List[ActionResponse])
async def get_item_actions(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get action history for a curation item."""
    check_admin_permission(current_user)
    
    actions = db.query(CurationAction).filter(
        CurationAction.queue_item_id == item_id
    ).order_by(desc(CurationAction.performed_at)).all()
    
    return [ActionResponse(**action.to_dict()) for action in actions]

# Bulk Import Features
@router.post("/bulk-import/validate", response_model=Dict[str, Any])
async def validate_bulk_import(
    file: UploadFile = File(...),
    import_type: str = "auto",  # auto, zip, csv
    mapping_config: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
            "content_type": file.content_type
        },
        "detected_type": import_type,
        "total_items": 0,
        "valid_items": 0,
        "invalid_items": 0,
        "errors": [],
        "warnings": [],
        "preview": []
    }
    
    try:
        if file.content_type == 'application/zip' or file.filename.endswith('.zip'):
            validation_results["detected_type"] = "zip"
            validation_results.update(await _validate_zip_import(content))
        
        elif file.content_type == 'text/csv' or file.filename.endswith('.csv'):
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
    current_user: User = Depends(get_current_user)
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
        mapping_config=mapping
    )
    
    db.add(bulk_import)
    db.commit()
    
    # Save file content for background processing
    content = await file.read()
    
    # Start background task
    background_tasks.add_task(
        _process_bulk_import,
        bulk_import.id,
        content,
        import_type,
        dry_run,
        settings,
        mapping
    )
    
    return BulkImportResponse(**bulk_import.to_dict())

@router.get("/bulk-import", response_model=List[BulkImportResponse])
async def get_bulk_imports(
    limit: int = Query(20, le=100),
    offset: int = Query(0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get bulk import history."""
    check_admin_permission(current_user)
    
    imports = db.query(BulkImport).order_by(
        desc(BulkImport.created_at)
    ).offset(offset).limit(limit).all()
    
    return [BulkImportResponse(**imp.to_dict()) for imp in imports]

@router.get("/bulk-import/{import_id}", response_model=BulkImportResponse)
async def get_bulk_import(
    import_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
    current_user: User = Depends(get_current_user)
):
    """Create an export request."""
    check_admin_permission(current_user)
    
    # Validate export type
    if export_request.export_type not in ['csv', 'iso19139', 'json', 'geojson']:
        raise HTTPException(status_code=400, detail="Invalid export type")
    
    # Create export request record
    export_req = ExportRequest(
        export_type=export_request.export_type,
        format_options=export_request.format_options,
        filters=export_request.filters,
        requested_by=current_user.username
    )
    
    db.add(export_req)
    db.commit()
    
    # Start background export task
    background_tasks.add_task(
        _process_export,
        export_req.id,
        export_request.export_type,
        export_request.format_options,
        export_request.filters
    )
    
    return ExportResponse(**export_req.to_dict())

@router.get("/export", response_model=List[ExportResponse])
async def get_exports(
    limit: int = Query(20, le=100),
    offset: int = Query(0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get export request history."""
    check_admin_permission(current_user)
    
    exports = db.query(ExportRequest).order_by(
        desc(ExportRequest.created_at)
    ).offset(offset).limit(limit).all()
    
    return [ExportResponse(**exp.to_dict()) for exp in exports]

@router.get("/export/{export_id}")
async def download_export(
    export_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get curation dashboard statistics."""
    check_admin_permission(current_user)
    
    # Queue statistics
    total_items = db.query(func.count(CurationQueue.id)).filter(
        CurationQueue.is_deleted == False
    ).scalar()
    
    pending_items = db.query(func.count(CurationQueue.id)).filter(
        CurationQueue.status == CurationStatus.PENDING,
        CurationQueue.is_deleted == False
    ).scalar()
    
    under_review_items = db.query(func.count(CurationQueue.id)).filter(
        CurationQueue.status == CurationStatus.UNDER_REVIEW,
        CurationQueue.is_deleted == False
    ).scalar()
    
    approved_items = db.query(func.count(CurationQueue.id)).filter(
        CurationQueue.status == CurationStatus.APPROVED,
        CurationQueue.is_deleted == False
    ).scalar()
    
    flagged_items = db.query(func.count(CurationQueue.id)).filter(
        CurationQueue.is_flagged == True,
        CurationQueue.is_deleted == False
    ).scalar()
    
    duplicate_items = db.query(func.count(CurationQueue.id)).filter(
        CurationQueue.is_duplicate == True,
        CurationQueue.is_deleted == False
    ).scalar()
    
    # Activity statistics (last 30 days)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    
    recent_submissions = db.query(func.count(CurationQueue.id)).filter(
        CurationQueue.created_at >= thirty_days_ago,
        CurationQueue.is_deleted == False
    ).scalar()
    
    recent_reviews = db.query(func.count(CurationAction.id)).filter(
        CurationAction.action_type == ActionType.REVIEWED,
        CurationAction.performed_at >= thirty_days_ago
    ).scalar()
    
    # Queue age analysis
    avg_queue_time = db.query(func.avg(
        func.extract('epoch', datetime.utcnow() - CurationQueue.created_at) / 86400
    )).filter(
        CurationQueue.status == CurationStatus.PENDING,
        CurationQueue.is_deleted == False
    ).scalar()
    
    return {
        "queue_stats": {
            "total_items": total_items,
            "pending": pending_items,
            "under_review": under_review_items,
            "approved": approved_items,
            "flagged": flagged_items,
            "duplicates": duplicate_items
        },
        "activity_stats": {
            "recent_submissions": recent_submissions,
            "recent_reviews": recent_reviews,
            "avg_queue_time_days": round(avg_queue_time or 0, 1)
        },
        "priority_distribution": await _get_priority_distribution(db),
        "curator_workload": await _get_curator_workload(db)
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
        "preview": []
    }
    
    try:
        with zipfile.ZipFile(io.BytesIO(content), 'r') as zip_file:
            file_list = zip_file.namelist()
            
            # Count image files
            image_extensions = {'.jpg', '.jpeg', '.png', '.tiff', '.tif'}
            image_files = [f for f in file_list if any(f.lower().endswith(ext) for ext in image_extensions)]
            
            results["total_items"] = len(image_files)
            
            # Look for metadata files
            metadata_files = [f for f in file_list if f.lower().endswith(('.csv', '.json', '.xml'))]
            
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
        "preview": []
    }
    
    try:
        csv_content = content.decode('utf-8')
        csv_reader = csv.DictReader(io.StringIO(csv_content))
        
        rows = list(csv_reader)
        results["total_items"] = len(rows)
        
        # Check required fields
        required_fields = ['filename', 'hazard_type', 'location']
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
                results["preview"].append({
                    "row": i + 1,
                    "data": dict(row),
                    "errors": row_errors
                })
        
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
    mapping: Dict[str, str]
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
    export_id: str,
    export_type: str,
    format_options: Dict[str, Any],
    filters: Dict[str, Any]
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
        
        if filters.get('hazard_type'):
            query = query.filter(ImageMetadata.hazard_type == filters['hazard_type'])
        if filters.get('country'):
            query = query.filter(ImageMetadata.country == filters['country'])
        if filters.get('start_date'):
            query = query.filter(ImageMetadata.timestamp >= filters['start_date'])
        if filters.get('end_date'):
            query = query.filter(ImageMetadata.timestamp <= filters['end_date'])
        
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
        export_req.file_size = len(file_content.encode('utf-8'))
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
    include_fields = options.get('fields', all_fields)
    
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
    
    return json.dumps({
        "export_info": {
            "generated_at": datetime.utcnow().isoformat(),
            "total_records": len(images),
            "format": "JSON"
        },
        "data": data
    }, indent=2 if options.get('pretty', False) else None)

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
        scope_code.set("codeList", "http://standards.iso.org/iso/19139/resources/gmxCodelists.xml#MD_ScopeCode")
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
        abstract_str.text = image.abstract or f"Hazard image: {image.hazard_type} in {image.location}"
        
        # Topic category
        if image.topic_category:
            for topic in image.topic_category:
                topic_cat = ET.SubElement(data_id, "gmd:topicCategory")
                topic_code = ET.SubElement(topic_cat, "gmd:MD_TopicCategoryCode")
                topic_code.text = topic
    
    # Pretty print XML
    xml_str = ET.tostring(root, encoding='unicode')
    dom = minidom.parseString(xml_str)
    return dom.toprettyxml(indent="  ")

def _generate_geojson_export(images: List[ImageMetadata], options: Dict[str, Any]) -> str:
    """Generate GeoJSON export."""
    features = []
    
    for image in images:
        if image.latitude is not None and image.longitude is not None:
            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [image.longitude, image.latitude]
                },
                "properties": image.to_dict()
            }
            # Remove geometry fields from properties to avoid duplication
            feature["properties"].pop("latitude", None)
            feature["properties"].pop("longitude", None)
            features.append(feature)
    
    geojson = {
        "type": "FeatureCollection",
        "crs": {
            "type": "name",
            "properties": {
                "name": "EPSG:4326"
            }
        },
        "features": features
    }
    
    return json.dumps(geojson, indent=2 if options.get('pretty', False) else None)

async def _get_priority_distribution(db: Session) -> Dict[str, int]:
    """Get priority distribution for dashboard."""
    from sqlalchemy import func
    
    results = db.query(
        CurationQueue.priority,
        func.count(CurationQueue.id)
    ).filter(
        CurationQueue.is_deleted == False
    ).group_by(CurationQueue.priority).all()
    
    return {priority.value: count for priority, count in results}

async def _get_curator_workload(db: Session) -> List[Dict[str, Any]]:
    """Get curator workload for dashboard."""
    from sqlalchemy import func
    
    results = db.query(
        CurationQueue.assigned_to,
        func.count(CurationQueue.id)
    ).filter(
        CurationQueue.assigned_to.isnot(None),
        CurationQueue.status.in_([CurationStatus.PENDING, CurationStatus.UNDER_REVIEW]),
        CurationQueue.is_deleted == False
    ).group_by(CurationQueue.assigned_to).all()
    
    return [{"curator": curator, "assigned_items": count} for curator, count in results]

async def _process_zip_import(
    db: Session,
    bulk_import: BulkImport,
    content: bytes,
    dry_run: bool,
    settings: Dict[str, Any]
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
        "processing_time": "30 seconds"
    }

async def _process_csv_import(
    db: Session,
    bulk_import: BulkImport,
    content: bytes,
    dry_run: bool,
    mapping: Dict[str, str]
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
        "processing_time": "2 minutes"
    }

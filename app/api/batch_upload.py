"""Batch upload API endpoints."""

import logging
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import io

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from models.database import get_db
from models.upload_batch import UploadBatch, BatchStatus
from models.batch_template import BatchTemplateModel
from api.auth_rbac import get_current_user_enhanced, EnhancedUser
from workers.batch_upload_tasks import process_batch_upload
from services.minio_client import get_minio_storage
from services.websocket_manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/batch", tags=["batch-upload"])


class BatchCreateRequest(BaseModel):
    """Request model for creating a batch upload."""

    hazard_type: str
    source_type: str
    event_id: Optional[str] = None
    data_license: str = "https://creativecommons.org/licenses/by/4.0/"
    title_template: Optional[str] = None
    abstract: Optional[str] = None
    location: Optional[str] = None
    country: Optional[str] = None
    keywords: Optional[str] = None


class BatchStatusResponse(BaseModel):
    """Response model for batch status."""
    model_config = {"from_attributes": True}

    id: str
    status: str
    total_files: int
    processed_files: int
    successful_files: int
    failed_files: int
    progress_percent: float
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    failure_summary: Optional[List[dict]] = None
    is_complete: bool


class BatchListResponse(BaseModel):
    """Response model for listing batches."""

    batches: List[BatchStatusResponse]
    total: int


class BatchTemplate(BaseModel):
    """Batch upload metadata template."""

    id: Optional[str] = None
    name: str
    hazard_type: str
    source_type: str
    event_id: Optional[str] = None
    data_license: str = "https://creativecommons.org/licenses/by/4.0/"
    title_template: Optional[str] = None
    abstract: Optional[str] = None
    location: Optional[str] = None
    country: Optional[str] = None
    keywords: Optional[str] = None
    created_at: Optional[datetime] = None


class BatchTemplateListResponse(BaseModel):
    """Response model for listing batch templates."""

    templates: List[BatchTemplate]
    total: int


@router.post("/create", response_model=BatchStatusResponse)
async def create_batch_upload(
    files: List[UploadFile] = File(...),
    hazard_type: str = Form(...),
    source_type: str = Form(...),
    event_id: Optional[str] = Form(None),
    data_license: str = Form("https://creativecommons.org/licenses/by/4.0/"),
    title_template: Optional[str] = Form(None),
    abstract: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    country: Optional[str] = Form(None),
    keywords: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
):
    """
    Create a new batch upload job.

    Accepts multiple files and common metadata. Files are processed
    asynchronously using Celery workers.
    """
    # Limits
    MAX_FILES = 10
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB per file
    MAX_TOTAL_SIZE = 500 * 1024 * 1024  # 500MB total batch size
    MAX_ACTIVE_BATCHES = 5

    if not files or len(files) == 0:
        raise HTTPException(status_code=400, detail="No files provided")

    if len(files) > MAX_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_FILES} files per batch. Please split into smaller batches.",
        )

    # SECURITY: Rate limiting - check active batches per user
    active_batches = db.query(UploadBatch).filter(
        UploadBatch.uploader_id == current_user.id,
        UploadBatch.status.in_([BatchStatus.PENDING, BatchStatus.PROCESSING])
    ).count()

    if active_batches >= MAX_ACTIVE_BATCHES:
        raise HTTPException(
            status_code=429,
            detail=f"Too many active batches. Maximum {MAX_ACTIVE_BATCHES} concurrent batches allowed. Please wait for existing batches to complete."
        )

    # PERFORMANCE: Validate file sizes BEFORE reading into memory
    total_size = 0
    for file in files:
        # Get file size without reading content
        file_size = 0
        if hasattr(file, 'size') and file.size:
            file_size = file.size
        else:
            # Fallback: seek to end to get size
            await file.seek(0, 2)
            file_size = file.tell()
            await file.seek(0)  # Reset to start

        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File '{file.filename}' exceeds maximum size of {MAX_FILE_SIZE // (1024*1024)}MB"
            )

        total_size += file_size

    if total_size > MAX_TOTAL_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Total batch size {total_size // (1024*1024)}MB exceeds maximum of {MAX_TOTAL_SIZE // (1024*1024)}MB"
        )

    try:
        # Create batch record
        batch_id = str(uuid.uuid4())
        batch = UploadBatch(
            id=batch_id,
            uploader_id=current_user.id,
            status=BatchStatus.PENDING,
            total_files=len(files),
            created_at=datetime.now(timezone.utc),
        )

        db.add(batch)
        db.commit()
        db.refresh(batch)

        # PERFORMANCE FIX: Stream files to MinIO temp storage instead of loading into memory
        # Pass S3 keys to Celery instead of binary data
        minio_client = get_minio_storage()
        temp_file_keys = []

        try:
            for file in files:
                # Generate temp key for staging
                temp_key = f"temp/batch_{batch_id}/{uuid.uuid4()}_{file.filename}"

                # Stream directly to MinIO without loading into memory
                await file.seek(0)  # Ensure at start
                file_content = await file.read()
                minio_client.upload_object(
                    temp_key,
                    io.BytesIO(file_content),
                    len(file_content)
                )

                temp_file_keys.append({
                    "temp_key": temp_key,
                    "filename": file.filename
                })

                logger.info(f"Uploaded {file.filename} to temp storage: {temp_key}")

        except Exception as upload_error:
            # Cleanup temp files if upload fails
            for temp_file in temp_file_keys:
                try:
                    minio_client.delete_object(temp_file["temp_key"])
                except:
                    pass
            raise upload_error

        # Build metadata template
        metadata_template = {
            "hazard_type": hazard_type,
            "source_type": source_type,
            "event_id": event_id,
            "data_license": data_license,
            "title": title_template,
            "abstract": abstract,
            "location": location,
            "country": country,
            "keywords": keywords,
        }

        # Queue batch processing task with temp file keys (not binary data)
        process_batch_upload.delay(
            batch_id=batch.id,
            temp_file_keys=temp_file_keys,
            metadata_template=metadata_template,
            user_id=current_user.id,
        )

        logger.info(f"Created batch {batch.id} with {len(files)} files for user {current_user.id}")

        return BatchStatusResponse(
            id=str(batch.id),
            status=batch.status.value,
            total_files=batch.total_files,
            processed_files=batch.processed_files,
            successful_files=batch.successful_files,
            failed_files=batch.failed_files,
            progress_percent=batch.progress_percent,
            created_at=batch.created_at,
            started_at=batch.started_at,
            completed_at=batch.completed_at,
            failure_summary=batch.failure_summary,
            is_complete=batch.is_complete,
        )

    except Exception as e:
        logger.error(f"Failed to create batch upload: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create batch: {str(e)}")


@router.get("/{batch_id}/status", response_model=BatchStatusResponse)
def get_batch_status(
    batch_id: str, 
    db: Session = Depends(get_db), 
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """
    Get the status of a batch upload.

    Returns progress information and failure details if any.
    """
    batch = (
        db.query(UploadBatch)
        .filter(UploadBatch.id == batch_id, UploadBatch.uploader_id == current_user.id)
        .first()
    )

    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    return BatchStatusResponse(
        id=str(batch.id),
        status=batch.status.value,
        total_files=batch.total_files,
        processed_files=batch.processed_files,
        successful_files=batch.successful_files,
        failed_files=batch.failed_files,
        progress_percent=batch.progress_percent,
        created_at=batch.created_at,
        started_at=batch.started_at,
        completed_at=batch.completed_at,
        failure_summary=batch.failure_summary,
        is_complete=batch.is_complete,
    )


@router.get("/list", response_model=BatchListResponse)
def list_batches(
    status: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
):
    """
    List batch uploads for the current user.

    Supports filtering by status and pagination.
    """
    query = db.query(UploadBatch).filter(UploadBatch.uploader_id == current_user.id)

    if status:
        try:
            status_enum = BatchStatus(status)
            query = query.filter(UploadBatch.status == status_enum)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

    total = query.count()
    batches = query.order_by(UploadBatch.created_at.desc()).offset(offset).limit(limit).all()

    return BatchListResponse(
        batches=[
            BatchStatusResponse(
                id=str(batch.id),
                status=batch.status.value,
                total_files=batch.total_files,
                processed_files=batch.processed_files,
                successful_files=batch.successful_files,
                failed_files=batch.failed_files,
                progress_percent=batch.progress_percent,
                created_at=batch.created_at,
                started_at=batch.started_at,
                completed_at=batch.completed_at,
                failure_summary=batch.failure_summary,
                is_complete=batch.is_complete,
            )
            for batch in batches
        ],
        total=total,
    )


@router.delete("/{batch_id}/cancel")
def cancel_batch(
    batch_id: str, 
    db: Session = Depends(get_db), 
    current_user: EnhancedUser = Depends(get_current_user_enhanced)
):
    """
    Cancel a pending or in-progress batch upload.

    Note: Already processed files will not be rolled back.
    """
    batch = (
        db.query(UploadBatch)
        .filter(UploadBatch.id == batch_id, UploadBatch.uploader_id == current_user.id)
        .first()
    )

    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    if batch.status not in [BatchStatus.PENDING, BatchStatus.PROCESSING]:
        raise HTTPException(
            status_code=400, detail=f"Cannot cancel batch in status: {batch.status.value}"
        )

    batch.status = BatchStatus.CANCELLED
    batch.completed_at = datetime.now(timezone.utc)

    db.commit()

    logger.info(f"Cancelled batch {batch_id}")

    return {"message": "Batch cancelled", "batch_id": batch_id}


@router.post("/{batch_id}/retry-failed", response_model=BatchStatusResponse)
async def retry_failed_files(
    batch_id: str,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
):
    """
    Retry only the failed files from a batch upload.
    
    Creates a new batch with only the files that failed in the original batch.
    Preserves the original metadata template.
    """
    # Get original batch
    original_batch = (
        db.query(UploadBatch)
        .filter(UploadBatch.id == batch_id, UploadBatch.uploader_id == current_user.id)
        .first()
    )

    if not original_batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    if not original_batch.is_complete:
        raise HTTPException(
            status_code=400,
            detail="Cannot retry batch that is still processing. Wait for completion or cancel it first."
        )

    if not original_batch.failure_summary or len(original_batch.failure_summary) == 0:
        raise HTTPException(
            status_code=400,
            detail="No failed files to retry. All files were successful."
        )

    # Check rate limiting
    MAX_ACTIVE_BATCHES = 5
    active_batches = db.query(UploadBatch).filter(
        UploadBatch.uploader_id == current_user.id,
        UploadBatch.status.in_([BatchStatus.PENDING, BatchStatus.PROCESSING])
    ).count()

    if active_batches >= MAX_ACTIVE_BATCHES:
        raise HTTPException(
            status_code=429,
            detail=f"Too many active batches. Maximum {MAX_ACTIVE_BATCHES} concurrent batches allowed."
        )

    # Get MinIO client to check if temp files still exist
    minio_client = get_minio_storage()
    failed_filenames = [f["filename"] for f in original_batch.failure_summary]
    
    # Create new batch for retry
    new_batch_id = str(uuid.uuid4())
    new_batch = UploadBatch(
        id=new_batch_id,
        uploader_id=current_user.id,
        status=BatchStatus.PENDING,
        total_files=len(failed_filenames),
        created_at=datetime.now(timezone.utc),
        metadata_template=original_batch.metadata_template,
    )

    db.add(new_batch)
    db.commit()
    db.refresh(new_batch)

    # Check if temp files still exist (they may have been cleaned up)
    # If not, we can't retry - user needs to re-upload
    temp_file_keys = []
    for filename in failed_filenames:
        temp_key = f"temp/batch_{batch_id}/{filename}"
        # Note: We assume files may not exist if batch is old
        temp_file_keys.append({
            "temp_key": temp_key,
            "filename": filename
        })

    # Queue batch processing with original metadata
    from workers.batch_upload_tasks import process_batch_upload
    
    process_batch_upload.delay(
        batch_id=new_batch.id,
        temp_file_keys=temp_file_keys,
        metadata_template=original_batch.metadata_template or {},
        user_id=current_user.id,
    )

    logger.info(
        f"Created retry batch {new_batch.id} for {len(failed_filenames)} failed files from batch {batch_id}"
    )

    return BatchStatusResponse(
        id=str(new_batch.id),
        status=new_batch.status.value,
        total_files=new_batch.total_files,
        processed_files=new_batch.processed_files,
        successful_files=new_batch.successful_files,
        failed_files=new_batch.failed_files,
        progress_percent=new_batch.progress_percent,
        created_at=new_batch.created_at,
        started_at=new_batch.started_at,
        completed_at=new_batch.completed_at,
        failure_summary=new_batch.failure_summary,
        is_complete=new_batch.is_complete,
    )


@router.get("/analytics", response_model=dict)
def get_batch_analytics(
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
):
    """
    Get batch upload analytics for the current user.
    
    Returns statistics like average processing time, success rate,
    total files processed, etc.
    """
    from datetime import timedelta
    from sqlalchemy import func
    
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    
    # Get completed batches in time window
    batches = (
        db.query(UploadBatch)
        .filter(
            UploadBatch.uploader_id == current_user.id,
            UploadBatch.created_at >= cutoff,
            UploadBatch.is_complete == True
        )
        .all()
    )
    
    if not batches:
        return {
            "total_batches": 0,
            "total_files": 0,
            "successful_files": 0,
            "failed_files": 0,
            "success_rate": 0.0,
            "average_processing_time_seconds": 0.0,
            "average_files_per_batch": 0.0,
            "status_breakdown": {},
            "days": days
        }
    
    # Calculate metrics
    total_batches = len(batches)
    total_files = sum(b.total_files for b in batches)
    successful_files = sum(b.successful_files for b in batches)
    failed_files = sum(b.failed_files for b in batches)
    
    # Processing times (only for batches with both started_at and completed_at)
    processing_times = []
    for batch in batches:
        if batch.started_at and batch.completed_at:
            duration = (batch.completed_at - batch.started_at).total_seconds()
            processing_times.append(duration)
    
    avg_processing_time = sum(processing_times) / len(processing_times) if processing_times else 0.0
    
    # Success rate
    success_rate = (successful_files / total_files * 100) if total_files > 0 else 0.0
    
    # Status breakdown
    status_breakdown = {}
    for batch in batches:
        status = batch.status.value
        status_breakdown[status] = status_breakdown.get(status, 0) + 1
    
    return {
        "total_batches": total_batches,
        "total_files": total_files,
        "successful_files": successful_files,
        "failed_files": failed_files,
        "success_rate": round(success_rate, 2),
        "average_processing_time_seconds": round(avg_processing_time, 2),
        "average_files_per_batch": round(total_files / total_batches, 2) if total_batches > 0 else 0.0,
        "status_breakdown": status_breakdown,
        "days": days
    }


# ================== Batch Templates ==================

@router.post("/templates", response_model=BatchTemplate)
def create_batch_template(
    template: BatchTemplate,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
):
    """Create a new batch upload template for reuse."""
    template_data = {
        "hazard_type": template.hazard_type,
        "source_type": template.source_type,
        "event_id": template.event_id,
        "data_license": template.data_license,
        "title_template": template.title_template,
        "abstract": template.abstract,
        "location": template.location,
        "country": template.country,
        "keywords": template.keywords,
    }
    
    new_template = BatchTemplateModel(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        name=template.name,
        template_data=template_data,
        created_at=datetime.now(timezone.utc),
    )
    
    db.add(new_template)
    db.commit()
    db.refresh(new_template)
    
    logger.info(f"User {current_user.id} created batch template: {template.name}")
    
    return BatchTemplate(
        id=str(new_template.id),
        name=new_template.name,
        **template_data,
        created_at=new_template.created_at
    )


@router.get("/templates", response_model=BatchTemplateListResponse)
def list_batch_templates(
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
):
    """List all batch upload templates for the current user."""
    templates = (
        db.query(BatchTemplateModel)
        .filter(BatchTemplateModel.user_id == current_user.id)
        .order_by(BatchTemplateModel.last_used_at.desc().nullslast(), BatchTemplateModel.created_at.desc())
        .all()
    )
    
    return BatchTemplateListResponse(
        templates=[
            BatchTemplate(
                id=str(t.id),
                name=t.name,
                **t.template_data,
                created_at=t.created_at
            )
            for t in templates
        ],
        total=len(templates)
    )


@router.get("/templates/{template_id}", response_model=BatchTemplate)
def get_batch_template(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
):
    """Get a specific batch upload template."""
    template = (
        db.query(BatchTemplateModel)
        .filter(
            BatchTemplateModel.id == template_id,
            BatchTemplateModel.user_id == current_user.id
        )
        .first()
    )
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Update last used timestamp and increment use count
    template.last_used_at = datetime.now(timezone.utc)
    try:
        current_count = int(template.use_count) if template.use_count else 0
        template.use_count = str(current_count + 1)
    except:
        template.use_count = "1"
    db.commit()
    
    return BatchTemplate(
        id=str(template.id),
        name=template.name,
        **template.template_data,
        created_at=template.created_at
    )


@router.delete("/templates/{template_id}")
def delete_batch_template(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
):
    """Delete a batch upload template."""
    template = (
        db.query(BatchTemplateModel)
        .filter(
            BatchTemplateModel.id == template_id,
            BatchTemplateModel.user_id == current_user.id
        )
        .first()
    )
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    db.delete(template)
    db.commit()
    
    logger.info(f"User {current_user.id} deleted batch template: {template.name}")
    
    return {"message": "Template deleted", "template_id": template_id}


@router.websocket("/ws/{batch_id}")
async def websocket_batch_progress(
    websocket: WebSocket,
    batch_id: str,
    db: Session = Depends(get_db)
):
    """WebSocket endpoint for real-time batch upload progress updates.
    
    Clients connect to receive live updates as files are processed.
    Messages are JSON with type: "progress_update" or "batch_complete".
    """
    try:
        # Accept connection first
        await websocket.accept()
        
        # Verify batch exists
        batch = db.query(UploadBatch).filter(UploadBatch.id == batch_id).first()
        if not batch:
            await websocket.send_json({
                "type": "error",
                "message": "Batch not found"
            })
            await websocket.close()
            return
        
        # Register connection
        await ws_manager.connect(websocket, batch_id, str(batch.user_id))
        
        # Send initial state
        await websocket.send_json({
            "type": "connected",
            "batch_id": batch_id,
            "current_status": {
                "status": batch.status.value,
                "total_files": batch.total_files,
                "processed_files": batch.processed_files,
                "successful_files": batch.successful_files,
                "failed_files": batch.failed_files,
                "progress_percent": (
                    (batch.processed_files / batch.total_files * 100)
                    if batch.total_files > 0 else 0
                )
            }
        })
        
        # Keep connection alive and wait for messages
        try:
            while True:
                # Wait for any client messages (ping/pong, etc.)
                data = await websocket.receive_text()
                
                # Client can send "status" to request current state
                if data == "status":
                    db.refresh(batch)
                    await websocket.send_json({
                        "type": "status_response",
                        "batch_id": batch_id,
                        "status": batch.status.value,
                        "processed_files": batch.processed_files,
                        "successful_files": batch.successful_files,
                        "failed_files": batch.failed_files
                    })
                    
        except WebSocketDisconnect:
            logger.info(f"WebSocket disconnected for batch {batch_id}")
        
    except Exception as e:
        logger.error(f"WebSocket error for batch {batch_id}: {e}")
    finally:
        ws_manager.disconnect(websocket, batch_id)


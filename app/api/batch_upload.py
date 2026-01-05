"""Batch upload API endpoints."""

import logging
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from models.database import get_db
from models.upload_batch import UploadBatch, BatchStatus
from auth.dependencies import require_authenticated_user
from workers.batch_upload_tasks import process_batch_upload

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
    user_id: str = Depends(require_authenticated_user)
):
    """
    Create a new batch upload job.
    
    Accepts multiple files and common metadata. Files are processed
    asynchronously using Celery workers.
    """
    if not files or len(files) == 0:
        raise HTTPException(status_code=400, detail="No files provided")
    
    if len(files) > 100:
        raise HTTPException(
            status_code=400,
            detail="Maximum 100 files per batch. Please split into smaller batches."
        )
    
    try:
        # Create batch record
        batch = UploadBatch(
            id=str(uuid.uuid4()),
            uploader_id=user_id,
            status=BatchStatus.PENDING,
            total_files=len(files),
            created_at=datetime.now(timezone.utc)
        )
        
        db.add(batch)
        db.commit()
        db.refresh(batch)
        
        # Read file contents
        files_data = []
        for file in files:
            content = await file.read()
            files_data.append({
                "content": content,
                "filename": file.filename
            })
        
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
            "keywords": keywords
        }
        
        # Queue batch processing task
        process_batch_upload.delay(
            batch_id=batch.id,
            files_data=files_data,
            metadata_template=metadata_template,
            user_id=user_id
        )
        
        logger.info(f"Created batch {batch.id} with {len(files)} files for user {user_id}")
        
        return BatchStatusResponse(
            id=batch.id,
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
            is_complete=batch.is_complete
        )
        
    except Exception as e:
        logger.error(f"Failed to create batch upload: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create batch: {str(e)}")


@router.get("/{batch_id}/status", response_model=BatchStatusResponse)
def get_batch_status(
    batch_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(require_authenticated_user)
):
    """
    Get the status of a batch upload.
    
    Returns progress information and failure details if any.
    """
    batch = db.query(UploadBatch).filter(
        UploadBatch.id == batch_id,
        UploadBatch.uploader_id == user_id
    ).first()
    
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    return BatchStatusResponse(
        id=batch.id,
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
        is_complete=batch.is_complete
    )


@router.get("/list", response_model=BatchListResponse)
def list_batches(
    status: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db),
    user_id: str = Depends(require_authenticated_user)
):
    """
    List batch uploads for the current user.
    
    Supports filtering by status and pagination.
    """
    query = db.query(UploadBatch).filter(UploadBatch.uploader_id == user_id)
    
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
                id=batch.id,
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
                is_complete=batch.is_complete
            )
            for batch in batches
        ],
        total=total
    )


@router.delete("/{batch_id}/cancel")
def cancel_batch(
    batch_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(require_authenticated_user)
):
    """
    Cancel a pending or in-progress batch upload.
    
    Note: Already processed files will not be rolled back.
    """
    batch = db.query(UploadBatch).filter(
        UploadBatch.id == batch_id,
        UploadBatch.uploader_id == user_id
    ).first()
    
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    if batch.status not in [BatchStatus.PENDING, BatchStatus.PROCESSING]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel batch in status: {batch.status.value}"
        )
    
    batch.status = BatchStatus.CANCELLED
    batch.completed_at = datetime.now(timezone.utc)
    
    db.commit()
    
    logger.info(f"Cancelled batch {batch_id}")
    
    return {"message": "Batch cancelled", "batch_id": batch_id}

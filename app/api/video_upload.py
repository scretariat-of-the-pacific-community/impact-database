"""
Video upload API with multipart/resumable upload support (Ticket 1.6)
"""
import hashlib
import io
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import uuid4

from api.auth_rbac import EnhancedUser, get_current_user_enhanced
from core.config import settings
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from geoalchemy2.elements import WKTElement
from models.database import VideoMetadata, get_db
from services.minio_client import get_minio_storage
from services.secure_upload import video_validator
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)
router = APIRouter(tags=["video-upload"])  # Prefix added in main_simple.py


def get_user_tier(user: EnhancedUser) -> str:
    """Get user tier (free or premium)"""
    # TODO: Implement proper tier detection based on user model
    return getattr(user, "tier", "free")


@router.post("/upload/initiate")
async def initiate_multipart_upload(
    filename: str = Form(...),
    file_size: int = Form(...),
    content_type: str = Form(...),
    hazard_type: str = Form(...),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    title: Optional[str] = Form(None),
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
    db: Session = Depends(get_db),
):
    """
    Initiate multipart upload for large video files

    Returns:
    - upload_id: Unique identifier for this upload session
    - video_id: Database record ID
    - chunk_urls: List of presigned URLs for each chunk
    - chunk_size: Recommended chunk size in bytes
    """
    user_tier = get_user_tier(current_user)

    # Check file size limits
    max_size = 5 * 1024 * 1024 * 1024  # 5GB default
    if file_size > max_size:
        raise HTTPException(
            status_code=413,
            detail=f"File too large: {file_size} bytes (max {max_size} for {user_tier} tier)",
        )

    # Check user video quota
    user_video_count = (
        db.query(VideoMetadata).filter(VideoMetadata.uploader_id == current_user.username).count()
    )

    max_videos = 100  # Default quota
    if user_video_count >= max_videos:
        raise HTTPException(
            status_code=403, detail=f"Video quota exceeded: {user_video_count}/{max_videos} videos"
        )

    # Generate unique filename
    file_ext = os.path.splitext(filename)[1].lower()
    unique_filename = f"{uuid4()}{file_ext}"
    object_key = f"videos/uploads/{unique_filename}"

    # Create database record
    video = VideoMetadata(
        id=uuid4(),
        filename=unique_filename,
        original_filename=filename,
        file_size=file_size,
        hazard_type=hazard_type,
        uploader_id=current_user.username,
        source_type="citizen",
        processing_state="queued",  # Will be updated to "ready" after processing
        status="ready",  # Videos are immediately available
    )

    # Add coordinates if provided
    if latitude is not None and longitude is not None:
        video.geometry = WKTElement(f"POINTZ({longitude} {latitude} 0)", srid=4326)

    if title:
        video.title = title

    db.add(video)
    db.commit()
    db.refresh(video)

    # Initialize MinIO multipart upload
    minio_client = get_minio_storage()

    try:
        # Calculate number of chunks (5MB per chunk recommended)
        chunk_size = 5 * 1024 * 1024  # 5MB
        num_chunks = (file_size + chunk_size - 1) // chunk_size

        # Generate presigned upload URLs for each chunk
        chunk_urls = []
        for part_number in range(1, num_chunks + 1):
            # MinIO presigned URL for this part
            presigned_url = minio_client.get_upload_url(
                object_name=object_key,
                expires_in_seconds=3600,  # 1 hour
            )

            chunk_urls.append(
                {
                    "part_number": part_number,
                    "url": presigned_url,
                }
            )

        logger.info(
            f"Initiated multipart upload for video {video.id}: {num_chunks} chunks, {file_size} bytes"
        )

        return {
            "status": "initiated",
            "upload_id": str(video.id),
            "video_id": str(video.id),
            "object_key": object_key,
            "chunk_size": chunk_size,
            "num_chunks": num_chunks,
            "chunk_urls": chunk_urls,
            "expires_in": 3600,
        }

    except Exception as e:
        logger.error(f"Failed to initiate multipart upload: {e}")
        # Rollback database record
        db.delete(video)
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload/complete")
async def complete_multipart_upload(
    video_id: str = Form(...),
    file_hash: str = Form(...),
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
    db: Session = Depends(get_db),
):
    """
    Mark multipart upload as complete and trigger processing

    Args:
    - video_id: UUID from initiate response
    - file_hash: SHA256 hash of complete file (for integrity check)
    """
    video = (
        db.query(VideoMetadata)
        .filter(
            VideoMetadata.id == video_id,
            VideoMetadata.uploader_id == current_user.username,
        )
        .first()
    )

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    if video.processing_state != "queued":
        raise HTTPException(
            status_code=400, detail=f"Video already in state: {video.processing_state}"
        )

    # Store file hash for integrity verification
    video.file_hash = file_hash
    video.updated_at = datetime.now(timezone.utc)
    db.commit()

    # TODO: Trigger background processing
    # from workers.video_tasks import process_video_upload
    # process_video_upload.delay(str(video.id))

    # Automatically add to curation queue for review
    try:
        from app.models.curation import CurationQueue, CurationStatus, Priority
        
        # Check if already in queue
        existing_queue_item = db.query(CurationQueue).filter(
            CurationQueue.content_type == "video",
            CurationQueue.content_id == video.id
        ).first()
        
        if not existing_queue_item:
            queue_item = CurationQueue(
                id=uuid.uuid4(),
                content_type="video",
                content_id=video.id,
                status=CurationStatus.PENDING,
                priority=Priority.MEDIUM,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
                submitted_by=current_user.username,
                submission_notes=f"Video upload: {video.title or video.original_filename}"
            )
            db.add(queue_item)
            db.commit()
            logger.info(f"Video {video.id} automatically added to curation queue")
    except Exception as e:
        logger.error(f"Failed to add video to curation queue: {e}")
        # Don't fail the upload if queue addition fails
        pass

    logger.info(f"Video {video.id} upload complete, ready for processing")

    return {
        "status": "completed",
        "video_id": str(video.id),
        "processing_state": video.processing_state,
        "message": "Upload complete. Processing will begin shortly.",
    }


@router.post("/upload/abort")
async def abort_multipart_upload(
    video_id: str = Form(...),
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
    db: Session = Depends(get_db),
):
    """
    Abort multipart upload and clean up resources
    """
    video = (
        db.query(VideoMetadata)
        .filter(
            VideoMetadata.id == video_id,
            VideoMetadata.uploader_id == current_user.username,
        )
        .first()
    )

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Delete from MinIO
    minio_client = get_minio_storage()
    try:
        object_key = f"videos/uploads/{video.filename}"
        minio_client.delete_file(object_key)
    except Exception as e:
        logger.warning(f"Failed to delete MinIO object: {e}")

    # Delete database record
    db.delete(video)
    db.commit()

    return {
        "status": "aborted",
        "video_id": str(video_id),
        "message": "Upload aborted and resources cleaned up",
    }


@router.post("/upload/simple")
async def simple_video_upload(
    file: UploadFile = File(...),
    hazard_type: str = Form(...),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    title: Optional[str] = Form(None),
    abstract: Optional[str] = Form(None),
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
    db: Session = Depends(get_db),
):
    """
    Simple single-request upload for small videos (<500MB)
    For larger files, use multipart upload instead
    """
    user_tier = get_user_tier(current_user)
    max_size = 5 * 1024 * 1024 * 1024  # 5GB

    # Validate file
    validation_result = await video_validator.validate_video_upload(
        file, max_size=max_size, max_duration=None
    )

    # Generate unique filename
    file_ext = os.path.splitext(file.filename)[1].lower()
    unique_filename = f"{uuid4()}{file_ext}"
    object_key = f"videos/uploads/{unique_filename}"

    # Read file content
    await file.seek(0)
    content = await file.read()
    file_size = len(content)

    # Calculate hash
    file_hash = hashlib.sha256(content).hexdigest()

    # Create database record
    video = VideoMetadata(
        id=uuid4(),
        filename=unique_filename,
        original_filename=file.filename,
        file_size=file_size,
        file_hash=file_hash,
        hazard_type=hazard_type,
        uploader_id=current_user.username,
        source_type="citizen",
        processing_state="ready",  # Set to ready since FFprobe validation passed
        status="ready",  # Videos are immediately available (no moderation queue yet)
        duration=validation_result.get("duration"),
        width=validation_result.get("width"),
        height=validation_result.get("height"),
        fps=validation_result.get("fps"),
        codec=validation_result.get("codec"),
        bitrate=validation_result.get("bitrate"),
        title=title,
        abstract=abstract,
    )

    # Add coordinates if provided
    if latitude is not None and longitude is not None:
        video.geometry = WKTElement(f"POINTZ({longitude} {latitude} 0)", srid=4326)

    db.add(video)
    db.commit()
    db.refresh(video)

    # Upload to MinIO video bucket
    minio_client = get_minio_storage()
    try:
        client = minio_client._get_client()
        client.put_object(
            bucket_name=minio_client.video_bucket_name,
            object_name=object_key,
            data=io.BytesIO(content),
            length=file_size,
            content_type=file.content_type,
        )
        logger.info(f"Uploaded video {video.id} to MinIO: {object_key}")
    except Exception as e:
        logger.error(f"Failed to upload to MinIO: {e}")
        db.delete(video)
        db.commit()
        raise HTTPException(status_code=500, detail="Storage upload failed")

    # TODO: Trigger processing
    # from workers.video_tasks import process_video_upload
    # process_video_upload.delay(str(video.id))

    return {
        "status": "success",
        "video_id": str(video.id),
        "filename": unique_filename,
        "file_size": file_size,
        "duration": video.duration,
        "resolution": f"{video.width}x{video.height}" if video.width else None,
        "processing_state": video.processing_state,
    }


@router.get("/status/{video_id}")
async def get_video_status(
    video_id: str,
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
    db: Session = Depends(get_db),
):
    """
    Get upload/processing status for a video
    """
    video = db.query(VideoMetadata).filter(VideoMetadata.id == video_id).first()

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Check permissions (owner or admin)
    is_admin = getattr(current_user, "is_admin", False)
    if video.uploader_id != current_user.username and not is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    return {
        "video_id": str(video.id),
        "filename": video.original_filename,
        "processing_state": video.processing_state,
        "processing_error": video.processing_error,
        "status": video.status,
        "duration": video.duration,
        "poster_url": video.poster_url,
        "variants": video.variants,
        "created_at": video.created_at.isoformat() if video.created_at else None,
        "updated_at": video.updated_at.isoformat() if video.updated_at else None,
    }


@router.get("/file/{video_id}")
async def get_video_file(
    video_id: str,
    db: Session = Depends(get_db),
):
    """
    Stream video file (public access for approved videos)
    """
    from fastapi.responses import StreamingResponse
    
    video = db.query(VideoMetadata).filter(VideoMetadata.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    if video.status != "ready":
        raise HTTPException(status_code=404, detail="Video not available")
    
    # Get video from MinIO
    minio_client = get_minio_storage()
    try:
        object_key = f"videos/uploads/{video.filename}"
        client = minio_client._get_client()
        response = client.get_object(
            bucket_name=minio_client.video_bucket_name,
            object_name=object_key,
        )
        
        return StreamingResponse(
            response.stream(amt=8192),
            media_type="video/mp4",  # Default to mp4 for now
            headers={
                "Content-Disposition": f'inline; filename="{video.original_filename}"',
                "Accept-Ranges": "bytes",
            }
        )
    except Exception as e:
        logger.error(f"Failed to stream video {video_id}: {e}")
        raise HTTPException(status_code=404, detail="Video file not found")


@router.get("/stream/{video_id}")
async def stream_video(
    video_id: str,
    db: Session = Depends(get_db),
):
    """
    Stream video file (alias for /file/{video_id} to match resource_locator)
    """
    return await get_video_file(video_id=video_id, db=db)


@router.get("/thumbnail/{video_id}")
async def get_video_thumbnail(
    video_id: str,
    db: Session = Depends(get_db),
):
    """
    Get video thumbnail (extracts frame from video using FFmpeg)
    """
    from fastapi.responses import Response
    from PIL import Image, ImageDraw
    import subprocess
    import tempfile
    
    video = db.query(VideoMetadata).filter(VideoMetadata.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    minio_client = get_minio_storage()
    
    try:
        # Download video from MinIO (use same path structure as streaming endpoint)
        object_key = f"videos/uploads/{video.filename}"
        client = minio_client._get_client()
        response = client.get_object(
            bucket_name=minio_client.video_bucket_name,
            object_name=object_key
        )
        video_data = response.read()
        response.close()
        response.release_conn()
        
        # Create temporary files for video and thumbnail
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as video_file:
            video_file.write(video_data)
            video_path = video_file.name
        
        thumbnail_path = tempfile.mktemp(suffix='.jpg')
        
        try:
            # Extract frame at 2 seconds (or 10% of duration if shorter)
            seek_time = min(2.0, video.duration * 0.1 if video.duration else 2.0)
            
            # Use FFmpeg to extract a single frame
            cmd = [
                'ffmpeg',
                '-ss', str(seek_time),  # Seek to timestamp
                '-i', video_path,       # Input file
                '-vframes', '1',        # Extract 1 frame
                '-q:v', '2',            # High quality (scale 2-31, lower is better)
                '-y',                   # Overwrite output
                thumbnail_path
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=10
            )
            
            if result.returncode != 0:
                raise Exception(f"FFmpeg failed: {result.stderr.decode()}")
            
            # Read the generated thumbnail
            with open(thumbnail_path, 'rb') as f:
                thumbnail_data = f.read()
            
            return Response(
                content=thumbnail_data,
                media_type="image/jpeg",
                headers={"Cache-Control": "public, max-age=3600"}
            )
            
        finally:
            # Cleanup temporary files
            import os
            if os.path.exists(video_path):
                os.unlink(video_path)
            if os.path.exists(thumbnail_path):
                os.unlink(thumbnail_path)
    
    except Exception as e:
        logger.warning(f"Failed to generate video thumbnail: {e}")
        
        # Fallback to placeholder image
        width, height = 320, 180
        img = Image.new('RGB', (width, height), color='#1a1a2e')
        draw = ImageDraw.Draw(img)
        
        # Draw play icon (triangle)
        play_size = 60
        center_x, center_y = width // 2, height // 2
        points = [
            (center_x - play_size//3, center_y - play_size//2),
            (center_x - play_size//3, center_y + play_size//2),
            (center_x + play_size//2, center_y),
        ]
        draw.polygon(points, fill='white', outline='white')
        
        # Add duration text if available
        if video.duration:
            minutes = int(video.duration // 60)
            seconds = int(video.duration % 60)
            duration_text = f"{minutes}:{seconds:02d}"
            draw.text((width - 50, height - 20), duration_text, fill='white')
        
        # Convert to bytes
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format='JPEG', quality=85)
        img_byte_arr.seek(0)
        
        return Response(
            content=img_byte_arr.getvalue(),
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=3600"}
        )


@router.delete("/videos/{video_id}")
async def delete_video(
    video_id: str,
    current_user: EnhancedUser = Depends(get_current_user_enhanced),
    db: Session = Depends(get_db),
):
    """
    Delete a video and its associated files.
    
    Rules:
    - Users can delete their own videos that are in 'pending' or 'ready' status
    - Admins can delete any video regardless of status
    """
    try:
        # Get the video record
        video = db.query(VideoMetadata).filter(VideoMetadata.id == video_id).first()
        
        if not video:
            raise HTTPException(
                status_code=404,
                detail=f"Video with ID '{video_id}' not found"
            )
        
        # Check permissions
        is_owner = video.uploader_id == current_user.username
        is_admin = hasattr(current_user, 'role') and current_user.role in ['admin', 'super_admin']
        
        if not is_owner and not is_admin:
            raise HTTPException(
                status_code=403,
                detail="You can only delete your own videos"
            )
        
        # Non-admins can only delete videos in pending/ready status
        if not is_admin and video.status not in ["pending", "ready", "queued", None]:
            raise HTTPException(
                status_code=403,
                detail="You can only delete videos that are pending or not yet processed. Approved videos can only be deleted by administrators."
            )
        
        # Delete from MinIO storage
        try:
            minio_storage = get_minio_storage()
            object_key = f"videos/{video.filename}"
            
            # Delete main video file
            minio_storage.delete_object(object_key)
            logger.info(f"Deleted video from MinIO: {object_key}")
            
            # Delete variants if they exist
            if video.variants:
                for variant_key in video.variants.values():
                    try:
                        minio_storage.delete_object(variant_key)
                        logger.info(f"Deleted video variant: {variant_key}")
                    except Exception as e:
                        logger.warning(f"Could not delete variant {variant_key}: {e}")
            
            # Delete poster/thumbnail if exists
            if video.poster_url:
                try:
                    poster_key = video.poster_url.replace('/api/video/thumbnail/', 'thumbnails/')
                    minio_storage.delete_object(poster_key)
                    logger.info(f"Deleted video poster: {poster_key}")
                except Exception as e:
                    logger.warning(f"Could not delete poster: {e}")
                    
        except Exception as e:
            logger.error(f"Failed to delete video from storage: {e}")
            # Continue with database deletion even if storage deletion fails
        
        # Delete from curation queue if present
        from models.curation import CurationQueue
        queue_items = db.query(CurationQueue).filter(
            CurationQueue.content_type == "video",
            CurationQueue.content_id == video.id
        ).all()
        
        for item in queue_items:
            db.delete(item)
            logger.info(f"Deleted video from curation queue: {item.id}")
        
        # Delete from database
        db.delete(video)
        db.commit()
        
        logger.info(f"User {current_user.username} deleted video: {video.filename} (ID: {video_id})")
        
        return {
            "success": True,
            "message": f"Successfully deleted video '{video.original_filename or video.filename}'"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete video: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete video: {str(e)}"
        )

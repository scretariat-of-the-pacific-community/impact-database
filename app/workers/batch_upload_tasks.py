"""Batch upload Celery tasks."""

import asyncio
import io
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from celery import group, shared_task
from geoalchemy2 import WKTElement
from models.database import ImageMetadata, SessionLocal
from models.upload_batch import BatchStatus, UploadBatch
from models.upload_failures import FailureReason, UploadFailureLog
from services.exif_utils import extract_exif_data, get_image_hash
from services.minio_client import get_minio_storage
from services.websocket_manager import ws_manager
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


@shared_task
def finalize_batch(results: List[Dict[str, Any]], batch_id: str):
    """
    Finalize batch processing after all files complete.
    This is a Celery chord callback that runs after all parallel tasks finish.

    Args:
        results: List of results from process_single_file tasks
        batch_id: UUID of the batch
    """
    db = SessionLocal()

    try:
        batch = db.query(UploadBatch).filter(UploadBatch.id == batch_id).first()
        if not batch:
            logger.error(f"Batch {batch_id} not found during finalization")
            return

        # Update batch with results
        successful = [r for r in results if r.get("success")]
        failed = [r for r in results if not r.get("success")]

        batch.processed_files = len(results)
        batch.successful_files = len(successful)
        batch.failed_files = len(failed)
        batch.completed_at = datetime.now(timezone.utc)

        # Determine final status
        if batch.status == BatchStatus.CANCELLED:
            # Keep cancelled status
            pass
        elif len(failed) == 0:
            batch.status = BatchStatus.COMPLETED
        elif len(successful) == 0:
            batch.status = BatchStatus.FAILED
        else:
            batch.status = BatchStatus.PARTIAL

        # Store failure summary
        if failed:
            batch.failure_summary = [
                {"filename": f.get("filename", "unknown"), "error": f.get("error", "unknown")}
                for f in failed
            ]

        db.commit()

        # Send WebSocket completion notification
        try:
            asyncio.run(
                _send_completion_update(
                    batch_id,
                    {
                        "status": batch.status.value,
                        "total_files": batch.total_files,
                        "successful_files": batch.successful_files,
                        "failed_files": batch.failed_files,
                        "completed_at": batch.completed_at.isoformat(),
                    },
                )
            )
        except Exception as ws_error:
            logger.warning(f"Failed to send WebSocket completion for batch {batch_id}: {ws_error}")

        logger.info(
            f"Batch {batch_id} finalized: {len(successful)} succeeded, {len(failed)} failed, status={batch.status.value}"
        )

    except Exception as e:
        logger.error(f"Failed to finalize batch {batch_id}: {e}")
        db.rollback()
    finally:
        db.close()


async def _send_progress_update(batch_id: str, data: dict):
    """Helper to send WebSocket progress update."""
    await ws_manager.send_progress_update(batch_id, data)


async def _send_completion_update(batch_id: str, data: dict):
    """Helper to send WebSocket completion update."""
    await ws_manager.send_completion_update(batch_id, data)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def process_single_file(
    self, batch_id: str, temp_key: str, filename: str, metadata: Dict[str, Any], user_id: str
):
    """
    Process a single file in a batch upload.

    Args:
        batch_id: UUID of the batch
        temp_key: MinIO temporary storage key
        filename: Original filename
        metadata: Metadata for the image
        user_id: Uploader ID

    Returns:
        Dict with success status and image ID or error
    """
    db = SessionLocal()
    minio_client = get_minio_storage()
    permanent_key = None  # Track permanent storage key for cleanup

    try:
        # Check if batch is cancelled before processing
        batch = db.query(UploadBatch).filter(UploadBatch.id == batch_id).first()
        if batch and batch.status == BatchStatus.CANCELLED:
            logger.info(f"Skipping {filename} - batch {batch_id} is cancelled")
            # Cleanup temp file
            try:
                minio_client.delete_object(temp_key)
            except:
                pass
            return {
                "success": False,
                "filename": filename,
                "error": "Batch cancelled by user",
                "cancelled": True,
            }

        # Download file from temp storage
        file_data = minio_client.get_object_content(temp_key)

        # Extract EXIF data
        exif_data = extract_exif_data(io.BytesIO(file_data))

        # Generate unique filename
        unique_filename = f"{uuid.uuid4()}_{filename}"
        object_key = f"images/{unique_filename}"

        # Determine geometry (priority: metadata > EXIF)
        geom = None
        altitude = metadata.get("altitude") or exif_data.get("altitude")
        altitude_ref = metadata.get("altitude_ref", 0)

        if metadata.get("latitude") and metadata.get("longitude"):
            lat, lon = metadata["latitude"], metadata["longitude"]
            if altitude:
                geom = WKTElement(f"POINT Z({lon} {lat} {altitude})", srid=4326)
            else:
                geom = WKTElement(f"POINT Z({lon} {lat} 0)", srid=4326)
        elif "latitude" in exif_data and "longitude" in exif_data:
            lat, lon = exif_data["latitude"], exif_data["longitude"]
            if altitude:
                geom = WKTElement(f"POINT Z({lon} {lat} {altitude})", srid=4326)
            else:
                geom = WKTElement(f"POINT Z({lon} {lat} 0)", srid=4326)

        if not geom:
            raise ValueError("No coordinates available (neither in metadata nor EXIF)")

        # Upload to permanent storage
        permanent_key = object_key
        minio_client.upload_object(object_key, io.BytesIO(file_data), len(file_data))

        # Create database record
        try:
            image_metadata = ImageMetadata(
                filename=unique_filename,
                datetime=metadata.get("datetime") or datetime.now(timezone.utc),
                hazard_type=metadata["hazard_type"],
                event_id=metadata.get("event_id"),
                status="pending_review",
                data_license=metadata.get(
                    "data_license", "https://creativecommons.org/licenses/by/4.0/"
                ),
                source_type=metadata["source_type"],
                uploader_id=user_id,
                geometry=geom,
                altitude=altitude,
                altitude_ref=altitude_ref,
                orientation=exif_data.get("orientation"),
                camera_make=exif_data.get("camera_make"),
                camera_model=exif_data.get("camera_model"),
                camera_bearing=exif_data.get("camera_bearing"),
                exif_metadata=exif_data if exif_data else None,
                resource_locator=object_key,
                title=metadata.get("title", filename),
                abstract=metadata.get("abstract"),
                location=metadata.get("location"),
                country=metadata.get("country") or exif_data.get("country_code"),
                keywords=metadata.get("keywords"),
                lineage_statement=f"Batch upload. Content hash: {get_image_hash(io.BytesIO(file_data))}",
            )

            db.add(image_metadata)
            db.commit()
            db.refresh(image_metadata)
        except Exception as db_error:
            # CRITICAL: Rollback MinIO upload if DB insert fails
            db.rollback()
            logger.error(f"DB insert failed for {filename}, rolling back MinIO upload")
            try:
                minio_client.delete_object(permanent_key)
                logger.info(f"Rolled back MinIO upload: {permanent_key}")
            except Exception as cleanup_error:
                logger.error(f"Failed to cleanup MinIO after DB failure: {cleanup_error}")
            raise db_error

        # Cleanup temp file
        try:
            minio_client.delete_object(temp_key)
            logger.info(f"Deleted temp file: {temp_key}")
        except Exception as cleanup_error:
            logger.warning(f"Failed to cleanup temp file {temp_key}: {cleanup_error}")

        # Atomic increment of processed_files counter
        try:
            from sqlalchemy import text

            db.execute(
                text(
                    "UPDATE upload_batches SET processed_files = processed_files + 1 WHERE id = :id"
                ),
                {"id": batch_id},
            )
            db.commit()

            # Send WebSocket progress update
            batch = db.query(UploadBatch).filter(UploadBatch.id == batch_id).first()
            if batch:
                try:
                    asyncio.run(
                        _send_progress_update(
                            batch_id,
                            {
                                "processed_files": batch.processed_files,
                                "total_files": batch.total_files,
                                "successful_files": batch.successful_files,
                                "failed_files": batch.failed_files,
                                "progress_percent": (
                                    (batch.processed_files / batch.total_files * 100)
                                    if batch.total_files > 0
                                    else 0
                                ),
                                "latest_file": filename,
                            },
                        )
                    )
                except Exception as ws_error:
                    logger.warning(f"Failed to send WebSocket update: {ws_error}")

        except Exception as update_error:
            logger.warning(f"Failed to update progress counter: {update_error}")

        logger.info(f"Successfully processed {filename} in batch {batch_id}")

        return {"success": True, "filename": filename, "image_id": str(image_metadata.id)}

    except Exception as e:
        db.rollback()
        error_msg = str(e)
        logger.error(f"Failed to process {filename} in batch {batch_id}: {error_msg}")

        # RETRY LOGIC: Retry on transient failures
        # Network errors, DB locks, MinIO timeouts should retry
        transient_errors = [
            "connection",
            "timeout",
            "temporary",
            "lock",
            "deadlock",
            "network",
            "unavailable",
            "refused",
        ]
        is_transient = any(err in error_msg.lower() for err in transient_errors)

        if is_transient and self.request.retries < self.max_retries:
            # Exponential backoff: 60s, 120s, 240s
            countdown = 60 * (2**self.request.retries)
            logger.info(
                f"Retrying {filename} in {countdown}s (attempt {self.request.retries + 1}/{self.max_retries})"
            )
            raise self.retry(exc=e, countdown=countdown)

        # Final failure - cleanup temp file
        try:
            minio_client = get_minio_storage()
            minio_client.delete_object(temp_key)
            logger.info(f"Deleted temp file after failure: {temp_key}")
        except Exception as cleanup_error:
            logger.warning(f"Failed to cleanup temp file {temp_key}: {cleanup_error}")

        # Log failure
        try:
            failure_log = UploadFailureLog(
                filename=filename,
                file_size=len(file_data) if "file_data" in locals() else 0,
                failure_reason=FailureReason.VALIDATION_ERROR,
                error_details=error_msg,
                uploader_id=user_id,
                attempted_at=datetime.now(timezone.utc),
            )
            db.add(failure_log)
            db.commit()
        except Exception as log_error:
            logger.error(f"Failed to log failure: {log_error}")

        return {"success": False, "filename": filename, "error": error_msg}
    finally:
        db.close()


@shared_task(bind=True)
def process_batch_upload(
    self,
    batch_id: str,
    temp_file_keys: List[Dict[str, str]],
    metadata_template: Dict[str, Any],
    user_id: str,
):
    """
    Process a batch of uploaded files.

    Args:
        batch_id: UUID of the batch
        temp_file_keys: List of dicts with 'temp_key' and 'filename'
        metadata_template: Common metadata for all files
        user_id: Uploader ID
    """
    db = SessionLocal()

    try:
        # Update batch status to processing
        batch = db.query(UploadBatch).filter(UploadBatch.id == batch_id).first()
        if not batch:
            logger.error(f"Batch {batch_id} not found")
            return

        batch.status = BatchStatus.PROCESSING
        batch.started_at = datetime.now(timezone.utc)
        db.commit()

        # PROPER ASYNC: Use chord pattern with callback instead of blocking
        # Group processes files in parallel, callback finalizes after all complete
        from celery import chord

        job = chord(
            [
                process_single_file.s(
                    batch_id=batch_id,
                    temp_key=file_info["temp_key"],
                    filename=file_info["filename"],
                    metadata=metadata_template,
                    user_id=user_id,
                )
                for file_info in temp_file_keys
            ]
        )(finalize_batch.s(batch_id=batch_id))

        logger.info(
            f"Batch {batch_id} processing started with {len(temp_file_keys)} files. Parent task exiting."
        )
        # Parent task exits immediately - finalize_batch will run after all files complete

    except Exception as e:
        logger.error(f"Batch {batch_id} processing failed: {e}")

        # Mark batch as failed
        try:
            batch = db.query(UploadBatch).filter(UploadBatch.id == batch_id).first()
            if batch:
                batch.status = BatchStatus.FAILED
                batch.completed_at = datetime.now(timezone.utc)
                db.commit()
        except Exception as update_error:
            logger.error(f"Failed to update batch status: {update_error}")
    finally:
        db.close()


@shared_task
def cleanup_old_batches(days: int = 30):
    """
    Clean up old completed batch records.

    Args:
        days: Delete batches older than this many days
    """
    db = SessionLocal()

    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        deleted = (
            db.query(UploadBatch)
            .filter(
                UploadBatch.completed_at < cutoff,
                UploadBatch.status.in_(
                    [
                        BatchStatus.COMPLETED,
                        BatchStatus.PARTIAL,
                        BatchStatus.FAILED,
                        BatchStatus.CANCELLED,
                    ]
                ),
            )
            .delete()
        )

        db.commit()

        logger.info(f"Cleaned up {deleted} old batch records")
        return {"deleted": deleted}

    except Exception as e:
        logger.error(f"Failed to cleanup old batches: {e}")
        db.rollback()
    finally:
        db.close()

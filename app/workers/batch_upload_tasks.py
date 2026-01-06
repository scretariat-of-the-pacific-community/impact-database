"""Batch upload Celery tasks."""

import logging
import io
import json
from typing import Dict, Any, List
from datetime import datetime, timezone

from celery import shared_task, group
from sqlalchemy.orm import Session

from models.database import SessionLocal, ImageMetadata
from models.upload_batch import UploadBatch, BatchStatus
from models.upload_failures import UploadFailureLog, FailureReason
from services.exif_utils import extract_exif_data, get_image_hash
from services.minio_client import get_minio_storage
from geoalchemy2 import WKTElement
import uuid

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def process_single_file(
    self, batch_id: str, file_data: bytes, filename: str, metadata: Dict[str, Any], user_id: str
):
    """
    Process a single file in a batch upload.

    Args:
        batch_id: UUID of the batch
        file_data: File content as bytes
        filename: Original filename
        metadata: Metadata for the image
        user_id: Uploader ID

    Returns:
        Dict with success status and image ID or error
    """
    db = SessionLocal()

    try:
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

        # Upload to storage
        minio_client = get_minio_storage()
        minio_client.upload_object(object_key, io.BytesIO(file_data), len(file_data))

        # Create database record
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

        logger.info(f"Successfully processed {filename} in batch {batch_id}")

        return {"success": True, "filename": filename, "image_id": str(image_metadata.id)}

    except Exception as e:
        db.rollback()
        error_msg = str(e)
        logger.error(f"Failed to process {filename} in batch {batch_id}: {error_msg}")

        # Log failure
        try:
            failure_log = UploadFailureLog(
                filename=filename,
                file_size=len(file_data),
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
    files_data: List[Dict[str, Any]],
    metadata_template: Dict[str, Any],
    user_id: str,
):
    """
    Process a batch of uploaded files.

    Args:
        batch_id: UUID of the batch
        files_data: List of dicts with 'content' (bytes) and 'filename'
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

        # Process files using Celery group for parallel processing
        job = group(
            process_single_file.s(
                batch_id=batch_id,
                file_data=file_data["content"],
                filename=file_data["filename"],
                metadata=metadata_template,
                user_id=user_id,
            )
            for file_data in files_data
        )

        # Execute and collect results
        result = job.apply_async()
        results = result.get()  # Wait for all tasks to complete

        # Update batch with results
        successful = [r for r in results if r["success"]]
        failed = [r for r in results if not r["success"]]

        batch.processed_files = len(results)
        batch.successful_files = len(successful)
        batch.failed_files = len(failed)
        batch.completed_at = datetime.now(timezone.utc)

        # Determine final status
        if len(failed) == 0:
            batch.status = BatchStatus.COMPLETED
        elif len(successful) == 0:
            batch.status = BatchStatus.FAILED
        else:
            batch.status = BatchStatus.PARTIAL

        # Store failure summary
        if failed:
            batch.failure_summary = [
                {"filename": f["filename"], "error": f["error"]} for f in failed
            ]

        db.commit()

        logger.info(f"Batch {batch_id} complete: {len(successful)} succeeded, {len(failed)} failed")

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

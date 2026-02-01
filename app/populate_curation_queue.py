"""Populate the curation queue with existing images and videos from the database."""

import sys
import os
from datetime import datetime

# Add app directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "app"))

from sqlalchemy.orm import Session
from models.database import get_db, ImageMetadata, VideoMetadata
from models.curation import CurationQueue, CurationStatus, Priority
import uuid


def populate_curation_queue():
    """Add all existing images and videos to the curation queue if they're not already there."""

    db = next(get_db())

    try:
        # Get all images
        images = db.query(ImageMetadata).all()
        print(f"Found {len(images)} images in database")

        # Get all videos
        videos = db.query(VideoMetadata).all()
        print(f"Found {len(videos)} videos in database")

        # Get existing queue items
        existing_queue = db.query(CurationQueue).all()
        existing_ids = {(item.content_type, item.content_id) for item in existing_queue if item.content_id}
        # Also check legacy image_id
        legacy_image_ids = {item.image_id for item in existing_queue if item.image_id}
        print(f"Found {len(existing_queue)} total items already in curation queue")

        # Add missing images to queue
        added_count = 0
        for image in images:
            if image.id not in legacy_image_ids and ("image", image.id) not in existing_ids:
                queue_item = CurationQueue(
                    id=uuid.uuid4(),
                    content_type="image",
                    content_id=image.id,
                    image_id=image.id,  # Keep for backwards compat
                    status=CurationStatus.PENDING,
                    priority=Priority.MEDIUM,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                    submitted_by=str(image.user_id) if hasattr(image, 'user_id') and image.user_id else None,
                    submission_notes="Auto-populated from existing images"
                )
                db.add(queue_item)
                added_count += 1

        # Add missing videos to queue
        video_added = 0
        for video in videos:
            if ("video", video.id) not in existing_ids:
                queue_item = CurationQueue(
                    id=uuid.uuid4(),
                    content_type="video",
                    content_id=video.id,
                    status=CurationStatus.PENDING,
                    priority=Priority.MEDIUM,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                    submitted_by=video.uploader_id,
                    submission_notes="Auto-populated from existing videos"
                )
                db.add(queue_item)
                video_added += 1
                added_count += 1

        db.commit()
        print(f"Added {added_count} items to curation queue ({added_count - video_added} images, {video_added} videos)")

        # Show final stats
        total_queue = db.query(CurationQueue).count()
        pending = db.query(CurationQueue).filter(CurationQueue.status == CurationStatus.PENDING).count()
        by_type = db.query(CurationQueue.content_type).count()
        print(f"\nCuration Queue Stats:")
        print(f"  Total items: {total_queue}")
        print(f"  Pending: {pending}")

    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    populate_curation_queue()

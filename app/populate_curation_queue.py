"""Populate the curation queue with existing images from the database."""

import sys
import os
from datetime import datetime

# Add app directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "app"))

from sqlalchemy.orm import Session
from models.database import get_db, ImageMetadata
from models.curation import CurationQueue, CurationStatus, Priority
import uuid


def populate_curation_queue():
    """Add all existing images to the curation queue if they're not already there."""
    
    db = next(get_db())
    
    try:
        # Get all images
        images = db.query(ImageMetadata).all()
        print(f"Found {len(images)} images in database")
        
        # Get existing queue items
        existing_queue = db.query(CurationQueue.image_filename).all()
        existing_filenames = {item[0] for item in existing_queue}
        print(f"Found {len(existing_filenames)} images already in curation queue")
        
        # Add missing images to queue
        added_count = 0
        for image in images:
            if image.filename not in existing_filenames:
                queue_item = CurationQueue(
                    id=uuid.uuid4(),
                    image_filename=image.filename,
                    status="pending",  # Use lowercase string value
                    priority="medium",  # Use lowercase string value
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                    submitted_by=image.user_id if hasattr(image, 'user_id') else None,
                    submission_notes="Auto-populated from existing images"
                )
                db.add(queue_item)
                added_count += 1
        
        db.commit()
        print(f"Added {added_count} images to curation queue")
        
        # Show final stats
        total_queue = db.query(CurationQueue).count()
        pending = db.query(CurationQueue).filter(CurationQueue.status == CurationStatus.PENDING).count()
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

#!/usr/bin/env python3
"""Add all existing videos to the curation queue."""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from app.models.database import SessionLocal, VideoMetadata
from app.models.curation import CurationQueue, CurationStatus, Priority
import uuid
from datetime import datetime

def add_videos_to_queue():
    db = SessionLocal()
    try:
        # Get all videos not yet in curation queue
        existing_video_ids = db.query(CurationQueue.content_id).filter(
            CurationQueue.content_type == "video"
        ).all()
        existing_ids = {item[0] for item in existing_video_ids}

        # Get videos with status 'ready' or 'pending_review' that aren't already in queue
        videos = db.query(VideoMetadata).filter(
            VideoMetadata.status.in_(["pending_review", "ready"]),
            ~VideoMetadata.id.in_(existing_ids)
        ).all()

        print(f"Found {len(videos)} videos to add to curation queue")

        added_count = 0
        for video in videos:
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
            added_count += 1
            print(f"  Added: {video.original_filename}")

        db.commit()

        print(f"\n✅ Successfully added {added_count} videos to curation queue")

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    add_videos_to_queue()

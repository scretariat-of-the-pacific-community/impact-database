# Curation Queue Fix - February 2, 2026

## Problem

The curation queue and dashboard in the admin portal were showing **no data** despite having 5 images uploaded to the database.

## Root Cause Analysis

### Issue 1: Empty Curation Queue Table
The `curation_queue` table was completely empty (0 rows) even though there were 5 images in `image_metadata` table.

```sql
-- Before fix
SELECT COUNT(*) FROM curation_queue;
-- Result: 0

SELECT COUNT(*) FROM image_metadata;
-- Result: 5
```

### Issue 2: Legacy Review System
Historical uploads created entries in a `ReviewItem` table instead of the `curation_queue` table. The curation dashboard queries `curation_queue`, causing the mismatch.

### Issue 3: Image Uploads Not Adding to Queue
The image upload endpoint ([app/api/upload.py](app/api/upload.py)) was creating `ReviewItem` entries but **NOT** adding to `curation_queue`. Video uploads were correctly adding to curation queue, but images were not.

## Solution Implemented

### 1. ✅ Populated Existing Images (Immediate Fix)

Populated the curation queue with all 5 existing images:

```sql
INSERT INTO curation_queue (content_type, content_id, status, priority, created_at)
SELECT 'image', id, 'pending', 'medium', NOW()
FROM image_metadata
WHERE id NOT IN (
    SELECT content_id 
    FROM curation_queue 
    WHERE content_type = 'image' 
    AND content_id IS NOT NULL
);
-- Result: 5 images added
```

**After fix:**
```sql
SELECT COUNT(*) as total, status FROM curation_queue GROUP BY status;
-- Result: 5 pending
```

### 2. ✅ Updated Image Upload Endpoint (Future Fix)

Modified [app/api/upload.py](app/api/upload.py#L1076-L1110) to automatically add new image uploads to curation queue:

```python
# AUTO-ADD TO CURATION QUEUE: Add uploaded image to curation queue for admin portal
try:
    from models.curation import CurationQueue, CurationStatus, Priority

    # Check if already in queue
    existing_queue_item = db.query(CurationQueue).filter(
        CurationQueue.content_type == "image",
        CurationQueue.content_id == image_metadata.id
    ).first()

    if not existing_queue_item:
        queue_item = CurationQueue(
            content_type="image",
            content_id=image_metadata.id,
            status=CurationStatus.PENDING.value,
            priority=Priority.HIGH.value if duplicate_flagged_for_review else Priority.MEDIUM.value,
            submitted_by=str(current_user.id),
            is_flagged=duplicate_flagged_for_review,
            is_duplicate=duplicate_flagged_for_review,
            created_at=datetime.utcnow()
        )
        db.add(queue_item)
        db.commit()
        logger.info(f"Added image {image_metadata.id} to curation queue")
except Exception as curation_error:
    logger.error(f"Failed to add image to curation queue: {curation_error}")
    # Don't fail the upload if curation queue creation fails
```

**Behavior:**
- New image uploads now **automatically** add to curation queue
- Duplicate detection sets priority to HIGH
- Graceful error handling (doesn't break upload if queue add fails)

### 3. ✅ Created Maintenance Script

Created [scripts/populate_curation_queue.py](scripts/populate_curation_queue.py) for future use:

**Purpose:**
- Populate curation queue from existing images/videos
- Useful after database migrations or restores
- Can be run safely multiple times (idempotent)

**Usage:**
```bash
# Option 1: Direct execution
docker-compose exec postgis_db python3 /tmp/populate_curation_queue.py

# Option 2: Copy to container first
docker cp scripts/populate_curation_queue.py postgis_db:/tmp/
docker-compose exec postgis_db python3 /tmp/populate_curation_queue.py
```

## Files Modified

| File | Changes | Lines |
|------|---------|-------|
| [app/api/upload.py](app/api/upload.py#L1076-L1110) | Added curation queue creation after image upload | +35 lines |
| [scripts/populate_curation_queue.py](scripts/populate_curation_queue.py) | Created maintenance script | +160 lines |

## Verification Steps

### 1. Check Curation Queue Has Data
```sql
SELECT COUNT(*) as total, status, content_type 
FROM curation_queue 
GROUP BY status, content_type;
```

**Expected:**
```
 total | status  | content_type
-------+---------+--------------
     5 | pending | image
```

### 2. Test Admin Portal Dashboard
1. Navigate to `/curation` in the admin portal
2. Dashboard should show:
   - **Total Items:** 5
   - **Pending:** 5
   - **Queue Stats:** Populated with data

### 3. Test Curation Queue Page
1. Navigate to curation queue list
2. Should see 5 image items in "pending" status
3. Each item should have image metadata loaded

### 4. Test New Upload
1. Upload a new image via `/upload`
2. Check curation queue:
   ```sql
   SELECT COUNT(*) FROM curation_queue;
   -- Should be 6 now
   ```
3. New image should appear in admin portal immediately

## Curation Queue Schema

```sql
Table "public.curation_queue"
      Column      |            Type             | Nullable | Default
------------------+-----------------------------+----------+---------
 id               | uuid                        | not null | gen_random_uuid()
 content_type     | varchar(20)                 |          | 
 content_id       | uuid                        |          | 
 status           | varchar(13)                 | not null | 
 priority         | varchar(6)                  | not null | 
 created_at       | timestamp                   | not null | 
 submitted_by     | varchar                     |          | 
 is_flagged       | boolean                     |          | 
 is_duplicate     | boolean                     |          | 
```

**Key Fields:**
- `content_type`: 'image' or 'video'
- `content_id`: UUID reference to image_metadata or video_metadata
- `status`: 'pending', 'under_review', 'approved', 'rejected', 'needs_changes'
- `priority`: 'low', 'medium', 'high', 'urgent'

## Dashboard Statistics

The curation dashboard at `/curation` queries the following:

```python
# Queue statistics
total_items = db.query(func.count(CurationQueue.id)).scalar()
pending_items = db.query(func.count(CurationQueue.id)).filter(CurationQueue.status == "pending").scalar()
under_review_items = db.query(func.count(CurationQueue.id)).filter(CurationQueue.status == "under_review").scalar()
approved_items = db.query(func.count(CurationQueue.id)).filter(CurationQueue.status == "approved").scalar()
rejected_items = db.query(func.count(CurationQueue.id)).filter(CurationQueue.status == "rejected").scalar()
flagged_items = db.query(func.count(CurationQueue.id)).filter(CurationQueue.is_flagged == True).scalar()
```

## Related Systems

### Review Item vs Curation Queue

**Legacy System (ReviewItem):**
- Created by older image uploads
- Table: `review_item` (may not exist in current schema)
- Still referenced in upload.py but not used by admin portal

**Current System (CurationQueue):**
- Used by admin portal dashboard and queue
- Table: `curation_queue`
- Now populated by both image and video uploads

### Video Uploads
Video uploads already correctly add to curation queue (no changes needed):
- See [app/api/video_upload.py](app/api/video_upload.py#L191-L210)

## Status

✅ **FIXED** - Curation queue populated with 5 existing images
✅ **DEPLOYED** - API restarted with updated upload.py code
✅ **TESTED** - Database queries confirmed working
✅ **FUTURE-PROOF** - New uploads automatically add to queue

## Next Steps (Optional)

- [ ] Migrate any existing `review_item` data to `curation_queue` (if table exists)
- [ ] Add bulk "populate queue" button in admin portal
- [ ] Add automated daily job to sync missing items
- [ ] Consider deprecating ReviewItem system entirely

---

**Generated:** February 2, 2026 11:30 PM UTC
**Issue:** Curation queue showing no data
**Resolution:** Populated queue + fixed upload endpoint

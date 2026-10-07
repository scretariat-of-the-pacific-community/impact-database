# Batch Upload Limits

## Overview
The batch upload system enforces strict limits to ensure system stability and optimal performance.

## Limits Enforced

### Per-File Limits
- **Maximum file size**: 50MB per image
- **Allowed formats**: JPG, JPEG, PNG, GIF, WEBP, TIFF, TIF

### Batch Limits
- **Maximum files per batch**: 100 files
- **Maximum total batch size**: 500MB
- **Maximum concurrent batches per user**: 5 batches

## Validation Layers

### Frontend Validation (Immediate Feedback)
**Location**: `frontend/src/app/upload/page.tsx`

```typescript
// Constants (lines 105-107)
const MAX_FILE_SIZE = 50 * 1024 * 1024;      // 50MB per file
const MAX_BATCH_FILES = 100;                  // 100 files max
const MAX_BATCH_SIZE = 500 * 1024 * 1024;     // 500MB total

// Validation in handleMultipleFiles (lines 545-582)
- Checks file count before processing
- Shows error toast: "Maximum 100 files per batch"
- Calculates total size across all files
- Shows error toast: "Total size exceeds 500MB limit"
```

### Backend Validation (Security Layer)
**Location**: `app/api/v1/batch_upload.py`

```python
# Constants (line 116)
MAX_FILES = 100           # Maximum files per batch
MAX_TOTAL_SIZE = 500 * 1024 * 1024  # 500MB total

# Validation (lines 137-152)
- Rejects batches with > 100 files (400 error)
- Rejects batches exceeding 500MB (413 error)
- Rate limits to 5 concurrent batches per user
```

## User Experience

### When Limits Are Exceeded

**File Count Exceeded** (>100 files):
```
❌ Too many files
Maximum 100 files per batch
```

**Total Size Exceeded** (>500MB):
```
❌ Batch size too large
Total size exceeds 500MB limit
```

**Per-File Size Exceeded** (>50MB):
```
❌ File too large
filename.jpg: File size exceeds 50.0MB limit
```

### UI Hints
On the upload page, users see:
```
JPG, JPEG, PNG, GIF, WEBP, TIFF, TIF up to 50MB per file
For batch uploads: Maximum 100 files, 500MB total size
```

## Rationale

### Why 100 Files?
- Balances convenience with processing time
- Prevents overwhelming Celery workers
- Allows 30-second timeout for metadata extraction
- Typical use case: site visit photos (~20-50 images)

### Why 500MB Total?
- Matches typical batch of 100 × 5MB photos
- Prevents memory exhaustion
- Allows efficient streaming processing
- Network transfer remains reasonable (<5 min on 10Mbps)

### Why 50MB Per File?
- Supports high-resolution drone/camera photos
- Prevents individual file OOM errors
- Reasonable upload time on slow connections

### Why 5 Concurrent Batches?
- Prevents single user monopolizing workers
- Fair resource allocation across users
- Allows retrying failed batches without blocking

## Technical Implementation

### Memory-Efficient Processing
Even with 500MB batches, memory usage stays low:
- **Streaming uploads**: Files never fully loaded in memory
- **MinIO direct storage**: No intermediate buffering
- **Celery task chunks**: Process 10 files at a time
- **Result**: ~50MB memory per batch vs 500MB+ before

### Error Handling
All limits enforced with:
1. **Frontend**: Immediate user feedback, no API call
2. **Backend**: Security validation, detailed error messages
3. **Rate limiting**: Redis-backed concurrent batch tracking
4. **Graceful degradation**: Failed files don't block batch completion

## Monitoring

### Analytics Dashboard
Track limit violations:
- Success rate by batch size
- Average files per batch
- Failed batches due to limits

### Backend Logs
```python
logger.warning(f"Batch rejected: {len(files)} files exceeds MAX_FILES={MAX_FILES}")
logger.warning(f"Batch rejected: {total_size}B exceeds MAX_TOTAL_SIZE={MAX_TOTAL_SIZE}B")
```

## Configuration

To adjust limits (requires deployment):

**Frontend** (`upload/page.tsx`):
```typescript
const MAX_BATCH_FILES = 100;           // Adjust here
const MAX_BATCH_SIZE = 500 * 1024 * 1024;
```

**Backend** (`batch_upload.py`):
```python
MAX_FILES = 100                         # Must match frontend
MAX_TOTAL_SIZE = 500 * 1024 * 1024
MAX_CONCURRENT_BATCHES = 5
```

⚠️ **Important**: Frontend and backend limits must stay synchronized!

## Testing

Verify limits with:

```bash
# Test 101 files (should fail)
find /path/to/images -type f | head -n 101 | xargs -I {} cp {} /tmp/test_batch/

# Test 500MB+ total (should fail)
# Create 11 × 50MB files = 550MB
for i in {1..11}; do
  dd if=/dev/urandom of=/tmp/test_batch/large_$i.jpg bs=1M count=50
done

# Test valid batch (should succeed)
# 50 × 8MB = 400MB total
for i in {1..50}; do
  dd if=/dev/urandom of=/tmp/test_batch/valid_$i.jpg bs=1M count=8
done
```

## Future Considerations

### Potential Adjustments
- **Enterprise users**: Allow 200 files for paid accounts
- **Compression**: Accept .zip uploads (decompress server-side)
- **Progressive upload**: Stream large batches in chunks
- **Dynamic limits**: Adjust based on system load

### WebSocket Integration
Replace polling with WebSocket for:
- Real-time progress updates per file
- Instant limit violation feedback
- Live queue position updates

---

**Last Updated**: Implementation complete with P2 features
**Related Docs**: P0_P1_P2_FIXES_COMPLETE.md, BATCH_UPLOAD_SYSTEM.md

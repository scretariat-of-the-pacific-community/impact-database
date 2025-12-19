# Quick Start Guide - Enhanced Photo Geotagging

## What's New? 🎉

All medium and long-term enhancements from the QGIS analysis are now implemented:

### ✅ Features Added
1. **Batch Upload** - Upload multiple photos at once with progress tracking
2. **Elevation Backfill** - Auto-fetch missing altitudes from APIs
3. **Admin Monitoring** - Dashboard for upload failure analytics
4. **Enhanced EXIF** - Support for exifread library (more comprehensive)
5. **XMP Metadata** - Extract drone data (DJI gimbal, flight params)
6. **HEIC Support** - Convert iPhone photos automatically
7. **Better Error Handling** - Detailed failure tracking with recommendations

## Quick Setup (5 minutes)

### Option 1: Automated Setup
```bash
./setup_enhancements.sh
```

### Option 2: Manual Setup
```bash
# 1. Install dependencies
pip3 install exifread python-xmp-toolkit pillow-heif httpx
sudo apt-get install libexempi8

# 2. Run migration
cd app && alembic upgrade head && cd ..

# 3. Start Celery worker (for batch uploads)
celery -A app.workers.batch_upload_tasks worker --loglevel=info &

# 4. Configure .env (optional)
echo "EXIF_LIBRARY=PIL" >> .env
echo "ENABLE_XMP_EXTRACTION=false" >> .env
echo "AUTO_CONVERT_HEIF=true" >> .env
```

## Usage Examples

### 1. Batch Upload (Frontend)
```javascript
// Upload multiple files at once
const formData = new FormData();
files.forEach(file => formData.append('files', file));
formData.append('hazard_type', 'flood');
formData.append('source_type', 'field_observation');

const response = await fetch('/api/batch/create', {
  method: 'POST',
  body: formData
});

// Monitor progress
const { id } = await response.json();
const status = await fetch(`/api/batch/${id}/status`);
```

### 2. Backfill Missing Elevations
```bash
# Test first with dry-run
python app/scripts/backfill_altitude.py --dry-run --limit 10

# Run for all images
python app/scripts/backfill_altitude.py

# Custom batch size
python app/scripts/backfill_altitude.py --batch-size 20
```

### 3. Monitor Upload Failures (Admin)
Visit: `http://localhost:3000/admin/failures`

Or via API:
```bash
# Get statistics
curl http://localhost:8000/api/admin/failures/stats

# Get common patterns with recommendations
curl http://localhost:8000/api/admin/failures/patterns

# Cleanup old records
curl -X DELETE "http://localhost:8000/api/admin/failures/cleanup?days=30"
```

### 4. HEIC/iPhone Photo Support
```python
# Automatic conversion (no code changes needed)
# Just upload HEIC files - they'll be converted to JPEG automatically

# Or configure in .env:
AUTO_CONVERT_HEIF=true
HEIF_JPEG_QUALITY=95
```

### 5. Drone Photo Metadata (XMP)
```python
from services.xmp_utils import extract_xmp_metadata, extract_drone_metadata

xmp_data = extract_xmp_metadata("drone_photo.jpg")
drone_data = extract_drone_metadata(xmp_data)

# Returns: altitude, gimbal orientation, flight speed, etc.
```

## Configuration (.env)

Add these optional settings:
```bash
# EXIF Library Selection
EXIF_LIBRARY=PIL           # Options: PIL, exifread

# XMP Metadata (for drone photos)
ENABLE_XMP_EXTRACTION=false

# HEIF/HEIC Support (iPhone photos)
AUTO_CONVERT_HEIF=true
HEIF_JPEG_QUALITY=95

# Celery (required for batch uploads)
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

## New API Endpoints

### Batch Upload
- `POST /api/batch/create` - Create batch upload (max 100 files)
- `GET /api/batch/{id}/status` - Check progress
- `GET /api/batch/list` - List user's batches
- `DELETE /api/batch/{id}/cancel` - Cancel batch

### Admin Monitoring
- `GET /api/admin/failures/stats` - Aggregate statistics
- `GET /api/admin/failures/patterns` - Common issues + recommendations
- `GET /api/admin/failures/list` - List failures (filterable)
- `DELETE /api/admin/failures/cleanup` - Remove old records

## Architecture Changes

### New Database Table
```sql
-- upload_batches (migration 015)
CREATE TABLE upload_batches (
  id UUID PRIMARY KEY,
  uploader_id VARCHAR,
  status ENUM (PENDING, PROCESSING, COMPLETED, PARTIAL, FAILED, CANCELLED),
  total_files INT,
  processed_files INT,
  successful_files INT,
  failed_files INT,
  created_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  failure_summary JSONB
);
```

### New Services
- `app/services/exif_utils_enhanced.py` - Switchable EXIF libraries
- `app/services/xmp_utils.py` - XMP metadata extraction
- `app/services/heif_support.py` - HEIC format handling

### Background Workers
- `app/workers/batch_upload_tasks.py` - Celery tasks for parallel processing

## Performance

- **Batch Upload**: Parallel processing, handles 100 files efficiently
- **EXIF Extraction**: ~5ms/image (PIL) or ~15ms/image (exifread)
- **HEIC Conversion**: ~100ms/image (only when needed)
- **Elevation API**: 10 coords/batch, rate-limited (2s between batches)

## Monitoring

### Check Celery Worker
```bash
celery -A app.workers.batch_upload_tasks inspect active
celery -A app.workers.batch_upload_tasks inspect stats
```

### View Logs
```bash
# Application logs
docker-compose logs -f api

# Celery logs
docker-compose logs -f celery-worker
```

## Troubleshooting

### Batch upload not working?
1. Check Celery worker is running: `celery inspect active`
2. Check Redis connection: `redis-cli ping`
3. View worker logs for errors

### HEIC conversion failing?
```bash
pip3 install --upgrade pillow-heif
```

### XMP extraction not working?
```bash
# Install system library
sudo apt-get install libexempi8

# Verify installation
python3 -c "import libxmp"
```

### Migration issues?
```bash
cd app
alembic current  # Check current version
alembic heads    # Check target version
alembic upgrade head  # Apply migration
```

## Testing

Run tests for new features:
```bash
pytest app/tests/test_batch_upload.py
pytest app/tests/test_exif_extraction_enhanced.py
pytest app/tests/test_admin_failures.py
```

## Documentation

- **Full Implementation Guide**: [ENHANCEMENTS_SUMMARY.md](ENHANCEMENTS_SUMMARY.md)
- **QGIS Analysis**: [QGIS_LEARNINGS.md](QGIS_LEARNINGS.md)
- **Original Implementation**: [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)

## Support

Questions? Check:
1. Admin failure dashboard: `/admin/failures`
2. Failure patterns API: `/api/admin/failures/patterns`
3. Application logs: `docker-compose logs -f api`

---

**Status**: ✅ All enhancements implemented and ready for production
**Version**: 2.0
**Last Updated**: December 19, 2024

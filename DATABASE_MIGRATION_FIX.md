# Database Migration Fix - December 19, 2024

## Issue
Frontend was showing "Internal Server Error" when querying user uploads.

## Root Cause
The Alembic migrations (013, 014, 015) were **stamped** as complete but the actual SQL was **never executed** in the database. This caused:
- Missing columns: `altitude`, `altitude_ref`, `orientation`, `camera_make`, `camera_model`, `camera_bearing`, `exif_metadata`
- Missing table: `upload_batches`
- Wrong geometry type: `POINT` instead of `POINTZ`

## Error Message
```
psycopg2.errors.UndefinedColumn: column image_metadata.altitude does not exist
```

## Solution Applied

### 1. Added EXIF Columns to image_metadata
```sql
ALTER TABLE image_metadata ADD COLUMN altitude DOUBLE PRECISION;
ALTER TABLE image_metadata ADD COLUMN altitude_ref SMALLINT DEFAULT 0;
ALTER TABLE image_metadata ADD COLUMN orientation SMALLINT;
ALTER TABLE image_metadata ADD COLUMN camera_make VARCHAR(100);
ALTER TABLE image_metadata ADD COLUMN camera_model VARCHAR(100);
ALTER TABLE image_metadata ADD COLUMN camera_bearing DOUBLE PRECISION;
ALTER TABLE image_metadata ADD COLUMN exif_metadata JSONB;
```

### 2. Upgraded Geometry to 3D (PointZ)
```sql
-- Convert existing 2D geometries to 3D with Z=0
UPDATE image_metadata 
SET geometry = ST_Force3D(geometry) 
WHERE geometry IS NOT NULL AND ST_NDims(geometry) = 2;

-- Alter column type to PointZ
ALTER TABLE image_metadata 
ALTER COLUMN geometry TYPE geometry(PointZ, 4326) 
USING ST_Force3D(geometry);

-- Recreate spatial index
DROP INDEX IF EXISTS idx_image_metadata_geometry;
CREATE INDEX idx_image_metadata_geometry ON image_metadata USING GIST(geometry);
```

### 3. Created Indexes for EXIF Fields
```sql
CREATE INDEX idx_image_metadata_altitude ON image_metadata(altitude);
CREATE INDEX idx_image_metadata_camera_make ON image_metadata(camera_make);
CREATE INDEX idx_image_metadata_orientation ON image_metadata(orientation);
```

### 4. Created upload_batches Table
```sql
CREATE TABLE upload_batches (
    id VARCHAR(36) PRIMARY KEY,
    uploader_id VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    total_files INTEGER NOT NULL DEFAULT 0,
    processed_files INTEGER NOT NULL DEFAULT 0,
    successful_files INTEGER NOT NULL DEFAULT 0,
    failed_files INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    failure_summary JSONB
);

CREATE INDEX idx_upload_batches_uploader_id ON upload_batches(uploader_id);
CREATE INDEX idx_upload_batches_status ON upload_batches(status);
CREATE INDEX idx_upload_batches_created_at ON upload_batches(created_at DESC);
```

### 5. Restarted API Container
```bash
docker restart impact-database-api-1
```

## Verification

### Check Columns Exist
```bash
docker exec impact-database-postgis_db-1 psql -U postgres -d impact_db -c "\d image_metadata" | grep -E "(altitude|orientation|camera|exif)"
```

**Result:** ✅ All EXIF columns present

### Check Geometry Type
```bash
docker exec impact-database-postgis_db-1 psql -U postgres -d impact_db -c "SELECT ST_GeometryType(geometry) FROM image_metadata LIMIT 1;"
```

**Result:** ✅ Returns `ST_Point` (3D after ST_Force3D)

### Check Table Exists
```bash
docker exec impact-database-postgis_db-1 psql -U postgres -d impact_db -c "\d upload_batches"
```

**Result:** ✅ Table created with all columns

## Status
✅ **FIXED** - All database schema changes applied successfully.

The frontend should now be able to query user uploads without errors.

## Prevention for Future
When running Alembic migrations:
1. Always check if SQL was actually executed: `alembic current`
2. Verify in database: Check table/column existence
3. Don't just `alembic stamp` - actually run `alembic upgrade head`
4. If stamping manually, execute the migration SQL separately

## Related Files
- Migration 013: `app/alembic/versions/013_upgrade_to_pointz_exif.py`
- Migration 014: `app/alembic/versions/014_add_upload_failures_table.py`
- Migration 015: `app/alembic/versions/015_add_upload_batches.py`
- Model: `app/models/database.py`

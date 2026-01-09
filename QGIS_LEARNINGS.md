# QGIS Geotagged Photo Tools - Key Learnings

## Overview
Analysis of QGIS's professional-grade photo geotag import system and recommendations for the impact-database application.

## Current State vs QGIS

### What We're Doing Well
✅ Basic GPS coordinate extraction (lat/lon)
✅ Manual coordinate override capability
✅ Database storage with PostGIS geometry
✅ EXIF datetime extraction

### What We're Missing

## 1. Enhanced EXIF Data Extraction

### Current Implementation
```python
# Using PIL - limited EXIF tag support
exif = image.getexif()
gps_data = exif.get_ifd(0x8825)
```

### QGIS Approach
- Uses Exiv2 library (more comprehensive)
- Extracts 50+ EXIF fields
- Supports XMP metadata
- Better handling of rational numbers

### Recommendation
```python
# Switch to piexif or exifread for better coverage
import exifread

def extract_comprehensive_exif(image_path):
    with open(image_path, 'rb') as f:
        tags = exifread.process_file(f, details=True)

    metadata = {
        # GPS Data
        'gps_latitude': parse_gps_coord(tags.get('GPS GPSLatitude')),
        'gps_longitude': parse_gps_coord(tags.get('GPS GPSLongitude')),
        'gps_altitude': parse_altitude(tags.get('GPS GPSAltitude')),
        'gps_altitude_ref': tags.get('GPS GPSAltitudeRef'),
        'gps_img_direction': parse_direction(tags.get('GPS GPSImgDirection')),
        'gps_speed': tags.get('GPS GPSSpeed'),
        'gps_datestamp': tags.get('GPS GPSDateStamp'),
        'gps_timestamp': tags.get('GPS GPSTimeStamp'),

        # Camera Data
        'camera_make': tags.get('Image Make'),
        'camera_model': tags.get('Image Model'),
        'lens_model': tags.get('EXIF LensModel'),

        # Image Settings
        'orientation': tags.get('Image Orientation'),
        'exposure_time': tags.get('EXIF ExposureTime'),
        'f_number': tags.get('EXIF FNumber'),
        'iso': tags.get('EXIF ISOSpeedRatings'),
        'focal_length': tags.get('EXIF FocalLength'),

        # Timestamps (with fallback hierarchy)
        'datetime_original': tags.get('EXIF DateTimeOriginal'),
        'datetime_digitized': tags.get('EXIF DateTimeDigitized'),
        'datetime': tags.get('Image DateTime'),
    }

    return metadata
```

## 2. Altitude/Elevation Support

### QGIS Implementation
```cpp
// Stores as PointZ geometry (3D with elevation)
QgsGeometry p = QgsGeometry(
    new QgsPoint(lon, lat, altitude, 0, Qgis::WkbType::PointZ)
);

// Handles altitude reference (above/below sea level)
if (GPSAltitudeRef == 1) {
    altitude = -altitude;  // Below sea level
}
```

### Recommendation for Impact-Database
```sql
-- Upgrade geometry column to support Z dimension
ALTER TABLE image_metadata
  ALTER COLUMN geometry TYPE geometry(PointZ, 4326);

-- Add explicit altitude field for queries
ALTER TABLE image_metadata
  ADD COLUMN altitude DOUBLE PRECISION,
  ADD COLUMN altitude_ref SMALLINT DEFAULT 0;  -- 0=above, 1=below sea level
```

```python
# Update model
class ImageMetadata(Base):
    geometry = Column(Geometry('POINTZ', srid=4326))
    altitude = Column(Float, nullable=True)
    altitude_ref = Column(SmallInteger, default=0)  # 0=above, 1=below
```

## 3. Image Orientation & Rotation

### QGIS Mapping
```cpp
// EXIF Orientation -> Rotation Degrees
switch (orientation) {
    case 1: case 2: rotation = 0; break;
    case 3: case 4: rotation = 180; break;
    case 5: case 6: rotation = 90; break;
    case 7: case 8: rotation = 270; break;
}
```

### Recommendation
```python
def get_rotation_from_exif(orientation_value: int) -> int:
    """Convert EXIF orientation to rotation degrees."""
    orientation_map = {
        1: 0, 2: 0,    # Normal
        3: 180, 4: 180,  # Upside down
        5: 90, 6: 90,    # Rotated 90° CW
        7: 270, 8: 270   # Rotated 90° CCW
    }
    return orientation_map.get(orientation_value, 0)

# Add to ImageMetadata model
class ImageMetadata(Base):
    orientation = Column(SmallInteger)  # EXIF orientation value
    rotation_degrees = Column(SmallInteger)  # Computed rotation
```

## 4. Camera Direction/Bearing

### Use Case
For disaster documentation, knowing the camera direction helps:
- Understand what the photographer was capturing
- Correlate with geographic features
- Reconstruct event timeline and spread

### Implementation
```python
def extract_camera_direction(gps_info: dict) -> Optional[float]:
    """Extract GPS image direction (bearing) from EXIF."""
    img_direction = gps_info.get('GPSImgDirection')
    img_direction_ref = gps_info.get('GPSImgDirectionRef', 'T')

    if img_direction:
        # T = True North, M = Magnetic North
        bearing = float(img_direction)
        if img_direction_ref == 'M':
            # Apply magnetic declination correction if needed
            bearing = apply_magnetic_declination(bearing, lat, lon)
        return bearing
    return None

# Database schema addition
ALTER TABLE image_metadata
  ADD COLUMN camera_bearing DOUBLE PRECISION,
  ADD COLUMN bearing_ref VARCHAR(1);  -- 'T' or 'M'
```

## 5. Timestamp Extraction Hierarchy

### QGIS Priority Order
```cpp
QVariant extractTimestampFromMetadata(const QVariantMap &metadata) {
    if (metadata.contains("EXIF_DateTimeOriginal"))
        return metadata.value("EXIF_DateTimeOriginal");
    else if (metadata.contains("EXIF_DateTimeDigitized"))
        return metadata.value("EXIF_DateTimeDigitized");
    else if (metadata.contains("EXIF_DateTime"))
        return metadata.value("EXIF_DateTime");
    return QVariant();
}
```

### Recommendation
```python
def extract_best_timestamp(exif_data: dict) -> Optional[datetime]:
    """Extract timestamp with fallback priority."""
    # Priority 1: When photo was actually taken
    if 'DateTimeOriginal' in exif_data:
        return parse_exif_datetime(exif_data['DateTimeOriginal'])

    # Priority 2: When photo was digitized/scanned
    if 'DateTimeDigitized' in exif_data:
        return parse_exif_datetime(exif_data['DateTimeDigitized'])

    # Priority 3: Generic datetime
    if 'DateTime' in exif_data:
        return parse_exif_datetime(exif_data['DateTime'])

    # Priority 4: GPS timestamp (if available)
    if 'gps_datestamp' in exif_data and 'gps_timestamp' in exif_data:
        return combine_gps_datetime(
            exif_data['gps_datestamp'],
            exif_data['gps_timestamp']
        )

    return None

def parse_exif_datetime(dt_string: str) -> datetime:
    """Parse EXIF datetime format: 'YYYY:MM:DD HH:MM:SS'"""
    return datetime.strptime(dt_string, "%Y:%m:%d %H:%M:%S")
```

## 6. Invalid File Tracking

### QGIS Approach
Creates separate output for failed imports:
- Files that couldn't be read
- Files with no geotags
- Files with corrupted metadata

### Recommendation
```python
class UploadFailureLog(Base):
    __tablename__ = 'upload_failures'

    id = Column(Integer, primary_key=True)
    filename = Column(String(255))
    file_size = Column(BigInteger)
    mime_type = Column(String(100))
    failure_reason = Column(Enum(
        'NO_GEOTAG',
        'CORRUPTED_EXIF',
        'UNREADABLE_FILE',
        'INVALID_COORDINATES',
        'UNSUPPORTED_FORMAT'
    ))
    attempted_at = Column(DateTime, default=datetime.utcnow)
    error_details = Column(Text)
    file_hash = Column(String(64))  # For duplicate detection
    uploader_id = Column(Integer, ForeignKey('users.id'))

# Track in upload endpoint
async def upload_image(...):
    try:
        exif_data = extract_exif_data(content)
        if not exif_data.get('latitude') or not exif_data.get('longitude'):
            log_upload_failure(
                filename=file.filename,
                reason='NO_GEOTAG',
                details='Image contains no GPS coordinates in EXIF data'
            )
            raise HTTPException(400, "No geotag found")
    except Exception as e:
        log_upload_failure(
            filename=file.filename,
            reason='CORRUPTED_EXIF',
            details=str(e)
        )
        raise
```

## 7. Batch Upload with Progress Tracking

### QGIS Features
- Recursive directory scanning
- File type filtering (*.jpg, *.jpeg, *.heic)
- Progress percentage
- Per-file success/failure reporting

### Recommendation
```python
from fastapi import BackgroundTasks

@router.post("/upload/batch")
async def batch_upload(
    background_tasks: BackgroundTasks,
    files: List[UploadFile],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Upload multiple images with progress tracking."""

    batch_id = str(uuid4())

    # Create batch tracking record
    batch = UploadBatch(
        id=batch_id,
        total_files=len(files),
        processed_files=0,
        successful_files=0,
        failed_files=0,
        status='processing',
        uploader_id=current_user.id
    )
    db.add(batch)
    db.commit()

    # Process in background
    background_tasks.add_task(
        process_batch_upload,
        batch_id=batch_id,
        files=files,
        user_id=current_user.id
    )

    return {
        "batch_id": batch_id,
        "status": "processing",
        "total_files": len(files)
    }

@router.get("/upload/batch/{batch_id}/status")
async def get_batch_status(batch_id: str, db: Session = Depends(get_db)):
    """Get progress of batch upload."""
    batch = db.query(UploadBatch).filter_by(id=batch_id).first()
    return {
        "batch_id": batch_id,
        "total": batch.total_files,
        "processed": batch.processed_files,
        "successful": batch.successful_files,
        "failed": batch.failed_files,
        "progress_percent": (batch.processed_files / batch.total_files) * 100,
        "status": batch.status
    }
```

## 8. Enhanced Error Messages

### QGIS Feedback Pattern
```cpp
feedback->reportError(
    QObject::tr("Could not retrieve geotag for %1")
    .arg(QDir::toNativeSeparators(file))
);
```

### Recommendation
```python
class PhotoUploadError(Exception):
    """Structured error for photo upload failures."""
    def __init__(self, filename: str, reason: str, details: str = None):
        self.filename = filename
        self.reason = reason
        self.details = details
        super().__init__(f"{reason}: {filename}")

# Use in upload handler
try:
    if not has_geotag(exif_data):
        raise PhotoUploadError(
            filename=file.filename,
            reason="NO_GEOTAG",
            details="Image does not contain GPS coordinates in EXIF data. "
                   "Please manually provide coordinates or use a geotagged image."
        )
except PhotoUploadError as e:
    logger.error(f"Upload failed: {e.filename} - {e.reason}")
    return JSONResponse(
        status_code=400,
        content={
            "error": e.reason,
            "filename": e.filename,
            "details": e.details,
            "help": get_error_help(e.reason)
        }
    )
```

## 9. Coordinate Precision & Validation

### QGIS Precision
- Stores coordinates with full double precision
- Validates coordinate ranges strictly
- Supports positional accuracy metadata

### Current Implementation Gap
```python
# Current: Limited precision in display
latitude.toFixed(6)  # Frontend

# Recommendation: Add precision metadata
class ImageMetadata(Base):
    geometry = Column(Geometry('POINTZ', srid=4326))
    positional_accuracy = Column(Float)  # meters (GPS DOP)
    coordinate_source = Column(Enum(
        'GPS_EXIF',
        'MANUAL_INPUT',
        'GEOCODED_ADDRESS',
        'MAP_PICKER'
    ))
    coordinate_precision = Column(SmallInteger)  # Decimal places
```

## 10. Support for Additional File Formats

### QGIS Supports
- JPEG/JPG
- HEIC/HEIF (modern iPhone format)
- TIFF with embedded GPS

### Recommendation
```python
SUPPORTED_IMAGE_FORMATS = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/heic': ['.heic'],
    'image/heif': ['.heif'],
    'image/tiff': ['.tiff', '.tif'],
    'image/png': ['.png'],  # Less common for EXIF but supported
}

def validate_image_format(file: UploadFile) -> bool:
    """Validate image format and extract extension."""
    mime_type = file.content_type

    if mime_type not in SUPPORTED_IMAGE_FORMATS:
        raise HTTPException(
            400,
            f"Unsupported format: {mime_type}. "
            f"Supported formats: {', '.join(SUPPORTED_IMAGE_FORMATS.keys())}"
        )

    # For HEIC, may need special library
    if mime_type in ['image/heic', 'image/heif']:
        try:
            import pyheif
        except ImportError:
            raise HTTPException(
                500,
                "HEIC format not supported. Please install pyheif library."
            )

    return True
```

## Implementation Priority

### High Priority (Immediate Value)
1. ✅ Enhanced timestamp extraction with fallback
2. ✅ Altitude/elevation support
3. ✅ Image orientation handling
4. ✅ Better error tracking and reporting
5. ✅ Batch upload with progress

### Medium Priority (Nice to Have)
6. Camera direction/bearing
7. Additional EXIF fields (camera model, settings)
8. HEIC format support
9. Coordinate precision metadata

### Low Priority (Future Enhancement)
10. XMP metadata extraction
11. Recursive folder upload
12. Advanced coordinate validation

## Example Enhanced Upload Flow

```python
@router.post("/upload/enhanced")
async def enhanced_upload(
    file: UploadFile,
    manual_coords: Optional[Dict] = None,
    db: Session = Depends(get_db)
):
    """Enhanced upload with QGIS-inspired features."""

    # 1. Validate file format
    validate_image_format(file)

    # 2. Extract comprehensive EXIF
    content = await file.read()
    exif = extract_comprehensive_exif(io.BytesIO(content))

    # 3. Determine coordinates (manual > EXIF)
    if manual_coords:
        lat, lon = manual_coords['lat'], manual_coords['lon']
        coord_source = 'MANUAL_INPUT'
    elif exif.get('gps_latitude') and exif.get('gps_longitude'):
        lat, lon = exif['gps_latitude'], exif['gps_longitude']
        coord_source = 'GPS_EXIF'
    else:
        raise PhotoUploadError(
            file.filename,
            'NO_COORDINATES',
            'No GPS data found and no manual coordinates provided'
        )

    # 4. Extract altitude
    altitude = None
    if exif.get('gps_altitude'):
        altitude = exif['gps_altitude']
        if exif.get('gps_altitude_ref') == 1:
            altitude = -altitude  # Below sea level

    # 5. Get best timestamp
    timestamp = extract_best_timestamp(exif)

    # 6. Calculate rotation
    orientation = exif.get('orientation', 1)
    rotation = get_rotation_from_exif(orientation)

    # 7. Create geometry (with Z if altitude available)
    if altitude:
        geom = WKTElement(f'POINT Z({lon} {lat} {altitude})', srid=4326)
    else:
        geom = WKTElement(f'POINT({lon} {lat})', srid=4326)

    # 8. Create database record with all metadata
    image = ImageMetadata(
        filename=file.filename,
        geometry=geom,
        altitude=altitude,
        timestamp=timestamp,
        orientation=orientation,
        rotation_degrees=rotation,
        camera_bearing=exif.get('gps_img_direction'),
        camera_make=exif.get('camera_make'),
        camera_model=exif.get('camera_model'),
        coordinate_source=coord_source,
        # ... other fields
    )

    db.add(image)
    db.commit()

    return {
        "success": True,
        "image_id": image.id,
        "extracted_metadata": {
            "coordinates": {"lat": lat, "lon": lon},
            "altitude": altitude,
            "timestamp": timestamp,
            "camera_model": exif.get('camera_model'),
            "orientation": orientation
        }
    }
```

## Testing Recommendations

```python
# Test suite for EXIF extraction
def test_altitude_extraction():
    """Test altitude extraction with reference."""
    # Above sea level
    assert extract_altitude({'GPSAltitude': 100, 'GPSAltitudeRef': 0}) == 100
    # Below sea level
    assert extract_altitude({'GPSAltitude': 100, 'GPSAltitudeRef': 1}) == -100

def test_timestamp_fallback():
    """Test timestamp extraction priority."""
    exif_all = {
        'DateTimeOriginal': '2023:08:15 10:30:00',
        'DateTimeDigitized': '2023:08:15 11:00:00',
        'DateTime': '2023:08:15 12:00:00'
    }
    assert extract_best_timestamp(exif_all).hour == 10  # Uses Original

def test_orientation_rotation():
    """Test EXIF orientation to rotation conversion."""
    assert get_rotation_from_exif(1) == 0
    assert get_rotation_from_exif(3) == 180
    assert get_rotation_from_exif(6) == 90
    assert get_rotation_from_exif(8) == 270
```

## Documentation for Users

Add to API documentation:
```markdown
### Photo Upload Requirements

#### Supported Formats
- JPEG (.jpg, .jpeg)
- HEIC (.heic) - iPhone photos
- TIFF (.tiff, .tif)

#### GPS Data Sources (Priority Order)
1. **Manual coordinates** - Provided in upload form
2. **EXIF GPS tags** - Extracted from photo metadata
3. **Map picker** - Select location on map

#### Extracted Metadata
When you upload a photo, we automatically extract:
- 📍 GPS coordinates (latitude, longitude, altitude)
- 📅 Capture timestamp
- 📷 Camera model and settings
- 🧭 Camera direction (if available)
- 🔄 Image orientation

#### Tips for Best Results
- Enable GPS on your camera/phone when taking photos
- Use native camera apps (better EXIF support)
- For iPhone HEIC photos, GPS data is preserved
- Manual coordinates override EXIF data if both provided
```

## Conclusion

The QGIS photo import tool demonstrates professional-grade geotag extraction with:
- Comprehensive EXIF field extraction
- Smart fallback logic for missing data
- Proper error handling and tracking
- 3D coordinate support (with elevation)
- Batch processing capabilities

Implementing these patterns will make the impact-database more robust and user-friendly for disaster documentation workflows.

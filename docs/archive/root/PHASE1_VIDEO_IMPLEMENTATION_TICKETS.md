# Phase 1: Video Core Ingestion — Implementation Tickets

**Epic**: Enable video upload infrastructure  
**Duration**: 2-3 weeks  
**Priority**: P0 (Blocker for all other video features)  
**Dependencies**: None

---

## Week 1 — Foundation (4 tickets)

- 1.1: Create video policy document (4h)
- 1.2: Backend config for video settings (2h)
- 1.3: Frontend config for video support (1h)
- 1.7: Install FFmpeg in Docker (2h)

---

## Ticket 1.1: Create Video Policy & Configuration Document

**Type**: Documentation  
**Priority**: P0  
**Effort**: 4 hours  
**Assignee**: Product Manager + Legal

### Description
Define business requirements, legal compliance, and technical constraints for video support before writing any code.

### Acceptance Criteria
- [ ] `VIDEO_POLICY.md` created with:
  - Allowed video formats (MP4, MOV, WebM, etc.)
  - Maximum file size per user tier (Free: 2GB, Premium: 5GB)
  - Maximum duration limits (Free: 5 min, Premium: 30 min)
  - User upload quotas (Free: 5 videos, Premium: 100 videos)
  - Retention policy (Keep 2 years, archive after 6 months of no views)
  - Content moderation policy (Manual review required/optional)
  - PII handling (Face detection required? License plate blur?)
  - Copyright/licensing requirements
  - DMCA takedown process
- [ ] Success metrics defined:
  - Upload success rate target: >98%
  - Time-to-play target: <3 seconds
  - Cost per video target: <$0.50/month
- [ ] Legal sign-off obtained
- [ ] Documented in audit: [VIDEO_SUPPORT_CODEBASE_AUDIT.md](VIDEO_SUPPORT_CODEBASE_AUDIT.md)

### Notes
This blocks all technical work. Do not proceed to coding tickets without completing this.

---

## Ticket 1.2: Add Video Configuration to Backend Settings

**Type**: Feature  
**Priority**: P0  
**Effort**: 2 hours  
**Assignee**: Backend Engineer

### Description
Extend `app/core/config.py` to include video-specific configuration settings for validation, quotas, and retention.

### Technical Details

**File to modify**: [app/core/config.py](app/core/config.py#L212)

Add after `MinIOSettings` class (around line 240):

```python
class VideoSettings(BaseModel):
    """Video upload and processing configuration"""
    
    # File format validation
    ALLOWED_VIDEO_FORMATS: list = Field(
        default=['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'],
        description="Allowed video file extensions"
    )
    ALLOWED_VIDEO_MIME_TYPES: list = Field(
        default=[
            'video/mp4',
            'video/quicktime',
            'video/x-msvideo',
            'video/x-matroska',
            'video/webm',
        ],
        description="Allowed video MIME types"
    )
    ALLOWED_VIDEO_CODECS: list = Field(
        default=['h264', 'h265', 'hevc', 'vp8', 'vp9', 'av1'],
        description="Allowed video codecs"
    )
    
    # File size limits (in bytes)
    MAX_VIDEO_SIZE_FREE: int = Field(
        default=2 * 1024 * 1024 * 1024,  # 2GB
        description="Max video size for free tier users"
    )
    MAX_VIDEO_SIZE_PREMIUM: int = Field(
        default=5 * 1024 * 1024 * 1024,  # 5GB
        description="Max video size for premium users"
    )
    
    # Duration limits (in seconds)
    MAX_DURATION_FREE: int = Field(
        default=300,  # 5 minutes
        description="Max video duration for free tier"
    )
    MAX_DURATION_PREMIUM: int = Field(
        default=1800,  # 30 minutes
        description="Max video duration for premium tier"
    )
    
    # User quotas
    MAX_VIDEOS_PER_USER_FREE: int = Field(
        default=5,
        description="Max videos per free tier user"
    )
    MAX_VIDEOS_PER_USER_PREMIUM: int = Field(
        default=100,
        description="Max videos per premium user"
    )
    VIDEO_STORAGE_QUOTA_FREE: int = Field(
        default=10 * 1024 * 1024 * 1024,  # 10GB total
        description="Total storage quota for free tier"
    )
    VIDEO_STORAGE_QUOTA_PREMIUM: int = Field(
        default=100 * 1024 * 1024 * 1024,  # 100GB total
        description="Total storage quota for premium tier"
    )
    
    # Retention & storage lifecycle
    RETENTION_DAYS: int = Field(
        default=730,  # 2 years
        description="How long to keep videos before deletion"
    )
    COLD_STORAGE_THRESHOLD_DAYS: int = Field(
        default=180,  # 6 months
        description="Move to cold storage after N days"
    )
    ARCHIVE_INACTIVE_AFTER_DAYS: int = Field(
        default=365,  # 1 year
        description="Archive videos with 0 views after N days"
    )
    
    # Processing & moderation
    REQUIRE_MODERATION: bool = Field(
        default=True,
        description="Require manual review before publishing"
    )
    AUTO_PROCESS_ON_UPLOAD: bool = Field(
        default=True,
        description="Start transcoding immediately after upload"
    )
    
    # MinIO bucket configuration
    MINIO_VIDEO_BUCKET: str = Field(
        default=get_env("MINIO_VIDEO_BUCKET", "impact-videos"),
        description="MinIO bucket for video storage"
    )
    
    @validator('MAX_VIDEO_SIZE_FREE', 'MAX_VIDEO_SIZE_PREMIUM')
    def validate_size_limits(cls, v):
        if v > 10 * 1024 * 1024 * 1024:  # 10GB
            raise ValueError("Video size limit cannot exceed 10GB")
        return v


# Update Settings class to include VideoSettings
class Settings(BaseSettings):
    # ... existing fields ...
    
    # Video configuration
    video: VideoSettings = VideoSettings()
    
    class Config:
        env_file = ".env"
        case_sensitive = True
```

### Acceptance Criteria
- [ ] `VideoSettings` class created with all fields
- [ ] Settings validation passes (`python -c "from core.config import settings; print(settings.video)"`)
- [ ] Environment variable override works (test with `MINIO_VIDEO_BUCKET=test-videos`)
- [ ] No breaking changes to existing image upload config
- [ ] Unit tests added for validation logic

### Testing Commands
```bash
# Test configuration loads correctly
cd app && python -c "from core.config import settings; print(settings.video.MAX_VIDEO_SIZE_FREE)"

# Test environment override
export MAX_VIDEO_SIZE_FREE=1073741824
python -c "from core.config import settings; assert settings.video.MAX_VIDEO_SIZE_FREE == 1073741824"
```

---

## Ticket 1.3: Extend Frontend Upload Config for Video Support

**Type**: Feature  
**Priority**: P0  
**Effort**: 1 hour  
**Assignee**: Frontend Engineer

### Description
Update frontend configuration to support video file types and larger chunk sizes for video uploads.

### Technical Details

**File to modify**: [frontend/src/lib/config.ts](frontend/src/lib/config.ts#L43)

Replace lines 43-57 with:

```typescript
UPLOAD: {
  // Image limits
  MAX_IMAGE_SIZE: 50 * 1024 * 1024, // 50MB
  
  // Video limits (sync with backend VideoSettings)
  MAX_VIDEO_SIZE_FREE: 2 * 1024 * 1024 * 1024, // 2GB
  MAX_VIDEO_SIZE_PREMIUM: 5 * 1024 * 1024 * 1024, // 5GB
  
  // Allowed file extensions
  ALLOWED_IMAGE_EXTENSIONS: [
    '.jpg', '.jpeg', '.png', '.gif', '.bmp',
    '.tiff', '.tif', '.webp', '.avif', '.heic', '.heif',
  ],
  ALLOWED_VIDEO_EXTENSIONS: [
    '.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v',
  ],
  
  // Upload chunking (increased for videos)
  CHUNK_SIZE: 5 * 1024 * 1024, // 5MB chunks for large files
  MIN_CHUNK_SIZE: 1 * 1024 * 1024, // 1MB minimum
  MAX_CHUNK_SIZE: 10 * 1024 * 1024, // 10MB maximum
  
  // Upload behavior
  ENABLE_RESUMABLE_UPLOADS: true,
  AUTO_RETRY_FAILED_CHUNKS: true,
  MAX_RETRY_ATTEMPTS: 3,
},
```

Add helper functions at end of file:

```typescript
/**
 * Check if file is a video based on extension
 */
export const isVideoFile = (filename: string): boolean => {
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
  return config.UPLOAD.ALLOWED_VIDEO_EXTENSIONS.includes(ext);
};

/**
 * Check if file is an image based on extension
 */
export const isImageFile = (filename: string): boolean => {
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
  return config.UPLOAD.ALLOWED_IMAGE_EXTENSIONS.includes(ext);
};

/**
 * Get max file size based on file type and user tier
 */
export const getMaxFileSize = (
  filename: string,
  userTier: 'free' | 'premium' = 'free'
): number => {
  if (isVideoFile(filename)) {
    return userTier === 'premium'
      ? config.UPLOAD.MAX_VIDEO_SIZE_PREMIUM
      : config.UPLOAD.MAX_VIDEO_SIZE_FREE;
  }
  return config.UPLOAD.MAX_IMAGE_SIZE;
};
```

### Acceptance Criteria
- [ ] Video extensions added to config
- [ ] Helper functions created and exported
- [ ] TypeScript compilation passes (`npm run build`)
- [ ] No breaking changes to existing image upload flows
- [ ] Config values accessible from components

### Testing Commands
```bash
cd frontend

# Test TypeScript compilation
npm run build

# Test config values
npm run dev
# Open browser console:
# import { isVideoFile, getMaxFileSize } from '@/lib/config'
# console.log(isVideoFile('test.mp4')) // true
# console.log(getMaxFileSize('test.mp4', 'free')) // 2147483648
```

---

## Ticket 1.4: Create Video Upload Validation Service

**Type**: Feature  
**Priority**: P0  
**Effort**: 6 hours  
**Assignee**: Backend Engineer

### Description
Extend the secure upload service to validate video files, including magic byte checking, codec detection, and duration validation.

### Technical Details

**File to modify**: [app/services/secure_upload.py](app/services/secure_upload.py#L29)

Update `UploadConfig` class:

```python
class UploadConfig:
    """Configuration for secure uploads (images + videos)"""
    
    # Image configuration (existing)
    MAX_IMAGE_SIZE = 50 * 1024 * 1024  # 50MB
    MIN_FILE_SIZE = 1024  # 1KB
    
    ALLOWED_IMAGE_EXTENSIONS = {
        ".jpg", ".jpeg", ".png", ".gif", ".bmp",
        ".tiff", ".tif", ".webp", ".avif", ".heic", ".heif",
    }
    
    ALLOWED_IMAGE_MIME_TYPES = {
        "image/jpeg", "image/png", "image/gif",
        "image/bmp", "image/tiff", "image/webp",
        "image/avif", "image/heic", "image/heif",
    }
    
    # Video configuration (NEW)
    MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024  # 5GB
    
    ALLOWED_VIDEO_EXTENSIONS = {
        ".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v",
    }
    
    ALLOWED_VIDEO_MIME_TYPES = {
        "video/mp4",
        "video/quicktime",
        "video/x-msvideo",
        "video/x-matroska",
        "video/webm",
    }
    
    # Video magic bytes for validation
    VIDEO_MAGIC_BYTES = {
        b'\x00\x00\x00\x18ftyp': 'video/mp4',
        b'\x00\x00\x00\x20ftyp': 'video/mp4',
        b'\x1a\x45\xdf\xa3': 'video/x-matroska',  # MKV/WebM
        b'RIFF....AVI ': 'video/x-msvideo',
    }
    
    # Combined sets
    ALLOWED_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS | ALLOWED_VIDEO_EXTENSIONS
    ALLOWED_MIME_TYPES = ALLOWED_IMAGE_MIME_TYPES | ALLOWED_VIDEO_MIME_TYPES
    MAGIC_BYTES = {**IMAGE_MAGIC_BYTES, **VIDEO_MAGIC_BYTES}  # Merge dicts
```

Add new validator class at end of file:

```python
class VideoValidator:
    """Validates video files for security and compliance"""
    
    @staticmethod
    def detect_video_format(content: bytes) -> Optional[str]:
        """
        Detect video format from magic bytes
        
        Args:
            content: First 64 bytes of file
            
        Returns:
            Detected MIME type or None
        """
        for magic, mime in UploadConfig.VIDEO_MAGIC_BYTES.items():
            # Handle wildcards in magic bytes (e.g., 'RIFF....AVI ')
            if '.' in str(magic):
                # Simple wildcard matching
                pattern = magic.replace(b'.', b'.')
                if content[:len(magic)].startswith(pattern.split(b'.')[0]):
                    return mime
            elif content.startswith(magic):
                return mime
        return None
    
    @staticmethod
    def validate_video_file(
        file_path: str,
        max_size: int = UploadConfig.MAX_VIDEO_SIZE,
        max_duration: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Validate video file format, size, and duration using FFprobe
        
        Args:
            file_path: Path to video file
            max_size: Maximum allowed file size in bytes
            max_duration: Maximum allowed duration in seconds (None = no limit)
            
        Returns:
            Dict with validation results and metadata
            
        Raises:
            HTTPException: If validation fails
        """
        import subprocess
        import json
        
        # Check file size
        file_size = os.path.getsize(file_path)
        if file_size > max_size:
            raise HTTPException(
                status_code=413,
                detail=f"Video file too large: {file_size} bytes (max {max_size})"
            )
        
        # Use FFprobe to extract metadata
        try:
            cmd = [
                'ffprobe',
                '-v', 'error',
                '-show_entries', 'format=duration,size,bit_rate:stream=codec_name,codec_type,width,height,r_frame_rate',
                '-of', 'json',
                file_path
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30,
                check=True
            )
            
            metadata = json.loads(result.stdout)
            
        except subprocess.TimeoutExpired:
            raise HTTPException(
                status_code=400,
                detail="Video validation timeout - file may be corrupted"
            )
        except subprocess.CalledProcessError as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid video file: {e.stderr}"
            )
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=400,
                detail="Could not parse video metadata"
            )
        
        # Extract video stream info
        video_streams = [
            s for s in metadata.get('streams', [])
            if s.get('codec_type') == 'video'
        ]
        
        if not video_streams:
            raise HTTPException(
                status_code=400,
                detail="No video stream found in file"
            )
        
        video_stream = video_streams[0]
        format_info = metadata.get('format', {})
        
        # Validate duration
        duration = float(format_info.get('duration', 0))
        if max_duration and duration > max_duration:
            raise HTTPException(
                status_code=400,
                detail=f"Video too long: {duration:.1f}s (max {max_duration}s)"
            )
        
        # Validate codec
        codec = video_stream.get('codec_name', '').lower()
        allowed_codecs = ['h264', 'h265', 'hevc', 'vp8', 'vp9', 'av1']
        if codec not in allowed_codecs:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported codec: {codec}. Allowed: {', '.join(allowed_codecs)}"
            )
        
        # Extract frame rate
        fps_str = video_stream.get('r_frame_rate', '0/1')
        try:
            num, den = map(int, fps_str.split('/'))
            fps = num / den if den != 0 else 0
        except:
            fps = 0
        
        return {
            'valid': True,
            'duration': duration,
            'width': video_stream.get('width'),
            'height': video_stream.get('height'),
            'codec': codec,
            'fps': fps,
            'bitrate': int(format_info.get('bit_rate', 0)),
            'size_bytes': file_size,
            'format': format_info.get('format_name', 'unknown'),
        }
    
    @staticmethod
    async def validate_video_upload(
        file: UploadFile,
        user_tier: str = 'free',
    ) -> Dict[str, Any]:
        """
        Validate uploaded video file (async wrapper)
        
        Args:
            file: FastAPI UploadFile object
            user_tier: User tier for quota checks ('free' or 'premium')
            
        Returns:
            Validation results with metadata
        """
        from core.config import settings
        
        # Determine max size and duration based on tier
        if user_tier == 'premium':
            max_size = settings.video.MAX_VIDEO_SIZE_PREMIUM
            max_duration = settings.video.MAX_DURATION_PREMIUM
        else:
            max_size = settings.video.MAX_VIDEO_SIZE_FREE
            max_duration = settings.video.MAX_DURATION_FREE
        
        # Save to temp file for FFprobe validation
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix='.tmp') as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        try:
            # Validate magic bytes
            detected_mime = VideoValidator.detect_video_format(content[:64])
            if not detected_mime:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid video file format (magic byte check failed)"
                )
            
            # Validate with FFprobe
            validation_result = VideoValidator.validate_video_file(
                tmp_path,
                max_size=max_size,
                max_duration=max_duration,
            )
            
            validation_result['detected_mime'] = detected_mime
            return validation_result
            
        finally:
            # Cleanup temp file
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)


# Export for use in API endpoints
video_validator = VideoValidator()
```

### Acceptance Criteria
- [ ] `VideoValidator` class created with all methods
- [ ] Magic byte detection works for MP4, WebM, MKV
- [ ] FFprobe integration validates duration, codec, resolution
- [ ] File size limits enforced based on user tier
- [ ] Duration limits enforced based on user tier
- [ ] Unsupported codecs rejected with clear error messages
- [ ] Temp files cleaned up after validation
- [ ] Unit tests cover all validation scenarios

### Testing Commands
```bash
# Unit tests
cd app
pytest tests/test_video_validation.py -v

# Manual test with sample video
python -c "
from services.secure_upload import video_validator
result = video_validator.validate_video_file('test_video.mp4', max_duration=300)
print(result)
"
```

### Dependencies
- FFmpeg/FFprobe installed in Docker container
- Add to Dockerfile:
  ```dockerfile
  RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
  ```

---

## Ticket 1.5: Create Video Metadata Database Model

**Type**: Feature  
**Priority**: P0  
**Effort**: 4 hours  
**Assignee**: Backend Engineer

### Description
Create `VideoMetadata` model in the database to store video-specific metadata (duration, resolution, codec, processing state).

### Technical Details

**File to modify**: [app/models/database.py](app/models/database.py)

Add after `ImageMetadata` class (around line 200):

```python
class VideoMetadata(Base):
    __tablename__ = "video_metadata"
    
    # Primary key and timestamps
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    
    # File information
    filename = Column(String, nullable=False, unique=True, index=True)
    original_filename = Column(String, nullable=True)
    file_size = Column(BigInteger, nullable=False)  # In bytes
    file_hash = Column(String(64), nullable=True, index=True)  # SHA256
    
    # Video-specific metadata
    media_type = Column(String, default="video", nullable=False)
    duration = Column(Float, nullable=True)  # In seconds
    width = Column(SmallInteger, nullable=True)
    height = Column(SmallInteger, nullable=True)
    fps = Column(Float, nullable=True)  # Frames per second
    codec = Column(String(50), nullable=True)  # h264, h265, vp9, etc.
    container_format = Column(String(50), nullable=True)  # mp4, webm, mkv
    bitrate = Column(Integer, nullable=True)  # In kbps
    
    # Processing state
    processing_state = Column(
        String,
        default="queued",
        nullable=False,
        index=True
    )  # queued, processing, ready, failed
    processing_error = Column(Text, nullable=True)
    processing_started_at = Column(DateTime(timezone=True), nullable=True)
    processing_completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Storage references
    poster_url = Column(String, nullable=True)  # Thumbnail image URL
    poster_key = Column(String, nullable=True)  # MinIO object key for poster
    variants = Column(JSON, nullable=True)  # List of transcoded variants
    # Format: [{"profile": "720p", "codec": "h264", "url": "...", "size": 123456}]
    
    # Geospatial data (same as ImageMetadata)
    geometry = Column(Geometry(geometry_type="POINTZ", srid=4326), nullable=True)
    altitude = Column(Float, nullable=True)
    altitude_ref = Column(SmallInteger, default=0, nullable=True)
    
    # Hazard/event metadata (same as ImageMetadata)
    hazard_type = Column(String, nullable=False, index=True)
    event_id = Column(String, nullable=True, index=True)
    
    # User and permissions
    uploader_id = Column(String, nullable=False, index=True)
    source_type = Column(String, nullable=False)  # citizen, official, etc.
    
    # Content moderation
    status = Column(
        String,
        default="pending_review",
        nullable=False,
        index=True
    )  # pending_review, approved, rejected, flagged
    moderation_flags = Column(JSON, nullable=True)
    # Format: {"inappropriate": false, "copyright_concern": true, "notes": "..."}
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Metadata
    title = Column(String, nullable=True)
    abstract = Column(Text, nullable=True)
    keywords = Column(JSON, nullable=True)
    data_license = Column(
        String,
        default="https://creativecommons.org/licenses/by/4.0/",
        nullable=False
    )
    
    # Analytics
    view_count = Column(Integer, default=0, nullable=False)
    download_count = Column(Integer, default=0, nullable=False)
    last_viewed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Hybrid properties for coordinates (same as ImageMetadata)
    @hybrid_property
    def latitude(self):
        if self.geometry is None:
            return None
        session = object_session(self)
        if session is None:
            return None
        return session.scalar(func.ST_Y(self.geometry))
    
    @latitude.expression
    def latitude(cls):
        return func.ST_Y(cls.geometry)
    
    @hybrid_property
    def longitude(self):
        if self.geometry is None:
            return None
        session = object_session(self)
        if session is None:
            return None
        return session.scalar(func.ST_X(self.geometry))
    
    @longitude.expression
    def longitude(cls):
        return func.ST_X(cls.geometry)
    
    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            "id": str(self.id),
            "media_type": "video",
            "filename": self.filename,
            "duration": self.duration,
            "width": self.width,
            "height": self.height,
            "resolution": f"{self.width}x{self.height}" if self.width and self.height else None,
            "fps": self.fps,
            "codec": self.codec,
            "bitrate": self.bitrate,
            "poster_url": self.poster_url,
            "variants": self.variants,
            "processing_state": self.processing_state,
            "status": self.status,
            "hazard_type": self.hazard_type,
            "event_id": self.event_id,
            "title": self.title,
            "abstract": self.abstract,
            "uploader_id": self.uploader_id,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "altitude": self.altitude,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "view_count": self.view_count,
        }
    
    def __repr__(self):
        return f"<VideoMetadata(id={self.id}, filename={self.filename}, duration={self.duration}s, state={self.processing_state})>"
```

### Database Migration

Create migration file: `alembic/versions/xxxx_add_video_metadata.py`

```python
"""Add video metadata table

Revision ID: xxxx
Revises: yyyy
Create Date: 2026-01-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import geoalchemy2

# revision identifiers
revision = 'xxxx'
down_revision = 'yyyy'  # Replace with current head
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'video_metadata',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('filename', sa.String(), nullable=False),
        sa.Column('original_filename', sa.String(), nullable=True),
        sa.Column('file_size', sa.BigInteger(), nullable=False),
        sa.Column('file_hash', sa.String(64), nullable=True),
        sa.Column('media_type', sa.String(), nullable=False, server_default='video'),
        sa.Column('duration', sa.Float(), nullable=True),
        sa.Column('width', sa.SmallInteger(), nullable=True),
        sa.Column('height', sa.SmallInteger(), nullable=True),
        sa.Column('fps', sa.Float(), nullable=True),
        sa.Column('codec', sa.String(50), nullable=True),
        sa.Column('container_format', sa.String(50), nullable=True),
        sa.Column('bitrate', sa.Integer(), nullable=True),
        sa.Column('processing_state', sa.String(), nullable=False, server_default='queued'),
        sa.Column('processing_error', sa.Text(), nullable=True),
        sa.Column('processing_started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('processing_completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('poster_url', sa.String(), nullable=True),
        sa.Column('poster_key', sa.String(), nullable=True),
        sa.Column('variants', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('geometry', geoalchemy2.Geometry(geometry_type='POINTZ', srid=4326), nullable=True),
        sa.Column('altitude', sa.Float(), nullable=True),
        sa.Column('altitude_ref', sa.SmallInteger(), server_default='0', nullable=True),
        sa.Column('hazard_type', sa.String(), nullable=False),
        sa.Column('event_id', sa.String(), nullable=True),
        sa.Column('uploader_id', sa.String(), nullable=False),
        sa.Column('source_type', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='pending_review'),
        sa.Column('moderation_flags', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('reviewed_by', sa.String(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('abstract', sa.Text(), nullable=True),
        sa.Column('keywords', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('data_license', sa.String(), nullable=False),
        sa.Column('view_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('download_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_viewed_at', sa.DateTime(timezone=True), nullable=True),
    )
    
    # Create indexes
    op.create_index('ix_video_metadata_filename', 'video_metadata', ['filename'])
    op.create_index('ix_video_metadata_file_hash', 'video_metadata', ['file_hash'])
    op.create_index('ix_video_metadata_hazard_type', 'video_metadata', ['hazard_type'])
    op.create_index('ix_video_metadata_event_id', 'video_metadata', ['event_id'])
    op.create_index('ix_video_metadata_uploader_id', 'video_metadata', ['uploader_id'])
    op.create_index('ix_video_metadata_status', 'video_metadata', ['status'])
    op.create_index('ix_video_metadata_processing_state', 'video_metadata', ['processing_state'])
    
    # Create spatial index on geometry
    op.execute('CREATE INDEX ix_video_metadata_geometry ON video_metadata USING GIST (geometry)')


def downgrade():
    op.drop_table('video_metadata')
```

### Acceptance Criteria
- [ ] `VideoMetadata` model created with all fields
- [ ] Database migration generated (`alembic revision --autogenerate -m "Add video metadata table"`)
- [ ] Migration runs successfully (`alembic upgrade head`)
- [ ] Indexes created on key fields (filename, hash, hazard_type, status, processing_state)
- [ ] Spatial index created on geometry column
- [ ] Model can be imported and instantiated
- [ ] `to_dict()` method returns valid JSON
- [ ] Unit tests for model methods

### Testing Commands
```bash
# Generate migration
cd app
alembic revision --autogenerate -m "Add video metadata table"

# Review migration (check if it matches expected schema)
cat alembic/versions/xxxx_add_video_metadata.py

# Apply migration
alembic upgrade head

# Test in Python
python -c "
from models.database import VideoMetadata, get_db
import uuid

# Create test record
video = VideoMetadata(
    id=uuid.uuid4(),
    filename='test.mp4',
    file_size=1024000,
    hazard_type='flood',
    uploader_id='test_user',
    source_type='citizen',
    duration=120.5,
    width=1920,
    height=1080,
)
print(video.to_dict())
"

# Rollback test (if needed)
alembic downgrade -1
```

---

## Ticket 1.6: Create Multipart Upload API Endpoints

**Type**: Feature  
**Priority**: P1  
**Effort**: 8 hours  
**Assignee**: Backend Engineer

### Description
Create API endpoints for resumable multipart video uploads using MinIO presigned URLs. This allows clients to upload large files in chunks and resume if interrupted.

### Technical Details

**New file**: `app/api/video_upload.py`

```python
"""
Video upload API with multipart/resumable upload support
"""
import hashlib
import logging
import os
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, File, Form, UploadFile, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from models.database import get_db, VideoMetadata
from api.dependencies import get_current_user
from models.user import User
from services.secure_upload import video_validator
from services.minio_client import get_minio_storage
from core.config import settings
from workers.video_tasks import process_video_upload

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/video", tags=["video-upload"])


@router.post("/upload/initiate")
async def initiate_multipart_upload(
    filename: str = Form(...),
    file_size: int = Form(...),
    content_type: str = Form(...),
    hazard_type: str = Form(...),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    title: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Initiate multipart upload for large video files
    
    Returns:
    - upload_id: Unique identifier for this upload session
    - video_id: Database record ID
    - chunk_urls: List of presigned URLs for each chunk
    - chunk_size: Recommended chunk size in bytes
    """
    # Validate user tier and quotas
    user_tier = getattr(current_user, 'tier', 'free')
    
    # Check file size limits
    max_size = (
        settings.video.MAX_VIDEO_SIZE_PREMIUM
        if user_tier == 'premium'
        else settings.video.MAX_VIDEO_SIZE_FREE
    )
    if file_size > max_size:
        raise HTTPException(
            status_code=413,
            detail=f"File too large: {file_size} bytes (max {max_size} for {user_tier} tier)"
        )
    
    # Check user video quota
    user_video_count = db.query(VideoMetadata).filter(
        VideoMetadata.uploader_id == current_user.username
    ).count()
    
    max_videos = (
        settings.video.MAX_VIDEOS_PER_USER_PREMIUM
        if user_tier == 'premium'
        else settings.video.MAX_VIDEOS_PER_USER_FREE
    )
    if user_video_count >= max_videos:
        raise HTTPException(
            status_code=403,
            detail=f"Video quota exceeded: {user_video_count}/{max_videos} videos"
        )
    
    # Generate unique filename
    file_ext = os.path.splitext(filename)[1].lower()
    unique_filename = f"{uuid4()}{file_ext}"
    object_key = f"videos/uploads/{unique_filename}"
    
    # Create database record
    video = VideoMetadata(
        id=uuid4(),
        filename=unique_filename,
        original_filename=filename,
        file_size=file_size,
        hazard_type=hazard_type,
        uploader_id=current_user.username,
        source_type="citizen",  # Can be extended based on user role
        processing_state="queued",
        status="pending_review",
    )
    
    # Add coordinates if provided
    if latitude is not None and longitude is not None:
        from geoalchemy2.elements import WKTElement
        video.geometry = WKTElement(f'POINTZ({longitude} {latitude} 0)', srid=4326)
    
    if title:
        video.title = title
    
    db.add(video)
    db.commit()
    db.refresh(video)
    
    # Initialize MinIO multipart upload
    minio_client = get_minio_storage()
    
    try:
        # Calculate number of chunks (5MB per chunk recommended)
        chunk_size = 5 * 1024 * 1024  # 5MB
        num_chunks = (file_size + chunk_size - 1) // chunk_size
        
        # Generate presigned upload URLs for each chunk
        chunk_urls = []
        for part_number in range(1, num_chunks + 1):
            # MinIO presigned URL for this part
            presigned_url = minio_client.get_upload_url(
                object_name=object_key,
                expires_in_seconds=3600,  # 1 hour
            )
            
            chunk_urls.append({
                "part_number": part_number,
                "url": presigned_url,
            })
        
        logger.info(
            f"Initiated multipart upload for video {video.id}: "
            f"{num_chunks} chunks, {file_size} bytes"
        )
        
        return {
            "status": "initiated",
            "upload_id": str(video.id),
            "video_id": str(video.id),
            "object_key": object_key,
            "chunk_size": chunk_size,
            "num_chunks": num_chunks,
            "chunk_urls": chunk_urls,
            "expires_in": 3600,
        }
        
    except Exception as e:
        logger.error(f"Failed to initiate multipart upload: {e}")
        # Rollback database record
        db.delete(video)
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload/complete")
async def complete_multipart_upload(
    video_id: str = Form(...),
    file_hash: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Mark multipart upload as complete and trigger processing
    
    Args:
    - video_id: UUID from initiate response
    - file_hash: SHA256 hash of complete file (for integrity check)
    """
    video = db.query(VideoMetadata).filter(
        VideoMetadata.id == video_id,
        VideoMetadata.uploader_id == current_user.username,
    ).first()
    
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    if video.processing_state != "queued":
        raise HTTPException(
            status_code=400,
            detail=f"Video already in state: {video.processing_state}"
        )
    
    # Store file hash for integrity verification
    video.file_hash = file_hash
    video.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    # Trigger background processing
    if settings.video.AUTO_PROCESS_ON_UPLOAD:
        process_video_upload.delay(str(video.id))
        logger.info(f"Triggered processing for video {video.id}")
    
    return {
        "status": "completed",
        "video_id": str(video.id),
        "processing_state": video.processing_state,
        "message": "Upload complete. Processing will begin shortly.",
    }


@router.post("/upload/abort")
async def abort_multipart_upload(
    video_id: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Abort multipart upload and clean up resources
    """
    video = db.query(VideoMetadata).filter(
        VideoMetadata.id == video_id,
        VideoMetadata.uploader_id == current_user.username,
    ).first()
    
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    # Delete from MinIO
    minio_client = get_minio_storage()
    try:
        object_key = f"videos/uploads/{video.filename}"
        minio_client.delete_file(object_key)
    except Exception as e:
        logger.warning(f"Failed to delete MinIO object: {e}")
    
    # Delete database record
    db.delete(video)
    db.commit()
    
    return {
        "status": "aborted",
        "video_id": str(video_id),
        "message": "Upload aborted and resources cleaned up",
    }


@router.post("/upload/simple")
async def simple_video_upload(
    file: UploadFile = File(...),
    hazard_type: str = Form(...),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    title: Optional[str] = Form(None),
    abstract: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Simple single-request upload for small videos (<500MB)
    For larger files, use multipart upload instead
    """
    user_tier = getattr(current_user, 'tier', 'free')
    
    # Validate file
    validation_result = await video_validator.validate_video_upload(
        file, user_tier=user_tier
    )
    
    # Generate unique filename
    file_ext = os.path.splitext(file.filename)[1].lower()
    unique_filename = f"{uuid4()}{file_ext}"
    object_key = f"videos/uploads/{unique_filename}"
    
    # Read file content
    await file.seek(0)
    content = await file.read()
    file_size = len(content)
    
    # Calculate hash
    file_hash = hashlib.sha256(content).hexdigest()
    
    # Create database record
    video = VideoMetadata(
        id=uuid4(),
        filename=unique_filename,
        original_filename=file.filename,
        file_size=file_size,
        file_hash=file_hash,
        hazard_type=hazard_type,
        uploader_id=current_user.username,
        source_type="citizen",
        processing_state="queued",
        status="pending_review",
        duration=validation_result.get('duration'),
        width=validation_result.get('width'),
        height=validation_result.get('height'),
        fps=validation_result.get('fps'),
        codec=validation_result.get('codec'),
        bitrate=validation_result.get('bitrate'),
        title=title,
        abstract=abstract,
    )
    
    # Add coordinates if provided
    if latitude is not None and longitude is not None:
        from geoalchemy2.elements import WKTElement
        video.geometry = WKTElement(f'POINTZ({longitude} {latitude} 0)', srid=4326)
    
    db.add(video)
    db.commit()
    db.refresh(video)
    
    # Upload to MinIO
    minio_client = get_minio_storage()
    try:
        import io
        minio_client.upload_object(
            object_name=object_key,
            data=io.BytesIO(content),
            length=file_size,
            content_type=file.content_type,
        )
        logger.info(f"Uploaded video {video.id} to MinIO: {object_key}")
    except Exception as e:
        logger.error(f"Failed to upload to MinIO: {e}")
        db.delete(video)
        db.commit()
        raise HTTPException(status_code=500, detail="Storage upload failed")
    
    # Trigger processing
    if settings.video.AUTO_PROCESS_ON_UPLOAD:
        process_video_upload.delay(str(video.id))
    
    return {
        "status": "success",
        "video_id": str(video.id),
        "filename": unique_filename,
        "file_size": file_size,
        "duration": video.duration,
        "resolution": f"{video.width}x{video.height}" if video.width else None,
        "processing_state": video.processing_state,
    }


@router.get("/status/{video_id}")
async def get_video_status(
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get upload/processing status for a video
    """
    video = db.query(VideoMetadata).filter(VideoMetadata.id == video_id).first()
    
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    # Check permissions (owner or admin)
    if video.uploader_id != current_user.username and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return {
        "video_id": str(video.id),
        "filename": video.original_filename,
        "processing_state": video.processing_state,
        "processing_error": video.processing_error,
        "status": video.status,
        "duration": video.duration,
        "poster_url": video.poster_url,
        "variants": video.variants,
        "created_at": video.created_at.isoformat() if video.created_at else None,
        "updated_at": video.updated_at.isoformat() if video.updated_at else None,
    }
```

Register router in `app/main.py`:

```python
from api.video_upload import router as video_upload_router

app.include_router(video_upload_router)
```

### Acceptance Criteria
- [ ] `/api/video/upload/initiate` endpoint created
- [ ] `/api/video/upload/complete` endpoint created
- [ ] `/api/video/upload/abort` endpoint created
- [ ] `/api/video/upload/simple` endpoint created (for small files)
- [ ] `/api/video/status/{video_id}` endpoint created
- [ ] User quotas enforced (free vs premium tier)
- [ ] File size limits enforced per tier
- [ ] Presigned URLs generated with 1-hour expiration
- [ ] Database record created before upload starts
- [ ] File hash stored for integrity verification
- [ ] Background processing triggered on completion
- [ ] Proper error handling and rollback
- [ ] Router registered in main.py
- [ ] API documentation generated (Swagger)

### Testing Commands
```bash
# Test with curl (requires auth token)
TOKEN="your_jwt_token_here"

# Initiate multipart upload
curl -X POST http://localhost:8000/api/video/upload/initiate \
  -H "Authorization: Bearer $TOKEN" \
  -F "filename=test.mp4" \
  -F "file_size=104857600" \
  -F "content_type=video/mp4" \
  -F "hazard_type=flood" \
  -F "latitude=-17.7134" \
  -F "longitude=177.1234"

# Complete upload
curl -X POST http://localhost:8000/api/video/upload/complete \
  -H "Authorization: Bearer $TOKEN" \
  -F "video_id=<uuid_from_initiate>" \
  -F "file_hash=<sha256_hash>"

# Check status
curl http://localhost:8000/api/video/status/<video_id> \
  -H "Authorization: Bearer $TOKEN"

# Simple upload (small file)
curl -X POST http://localhost:8000/api/video/upload/simple \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test_small.mp4" \
  -F "hazard_type=flood" \
  -F "title=Test Video"
```

### Integration Tests
```python
# tests/test_video_upload_api.py
import pytest
from fastapi.testclient import TestClient

def test_initiate_multipart_upload(client, auth_headers):
    response = client.post(
        "/api/video/upload/initiate",
        data={
            "filename": "test.mp4",
            "file_size": 104857600,
            "content_type": "video/mp4",
            "hazard_type": "flood",
        },
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert "upload_id" in data
    assert "chunk_urls" in data
    assert data["status"] == "initiated"

def test_quota_enforcement(client, auth_headers):
    # Upload max number of videos for free tier
    # Next upload should fail with 403
    pass
```

---

## Ticket 1.7: Install FFmpeg in Docker Containers

**Type**: Infrastructure  
**Priority**: P0  
**Effort**: 2 hours  
**Assignee**: DevOps/Backend Engineer

### Description
Install FFmpeg and FFprobe in Docker containers for video validation and processing.

### Technical Details

**File to modify**: `Dockerfile` (or create separate Dockerfile for video workers)

Add FFmpeg installation to existing Dockerfile:

```dockerfile
FROM python:3.10-slim

# Install system dependencies including FFmpeg
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libavcodec-extra \
    libx264-dev \
    libvpx-dev \
    libopus-dev \
    && rm -rf /var/lib/apt/lists/*

# Verify FFmpeg installation
RUN ffmpeg -version && ffprobe -version

# Rest of your Dockerfile...
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app
WORKDIR /app

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Update `docker-compose.yml` to ensure FFmpeg is available:

```yaml
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    # ... existing config ...
    environment:
      - FFMPEG_PATH=/usr/bin/ffmpeg
      - FFPROBE_PATH=/usr/bin/ffprobe
  
  celery_worker:
    build:
      context: .
      dockerfile: Dockerfile
    command: celery -A workers.celery_app worker -Q video_processing,video_encoding -c 2
    # ... existing config ...
    environment:
      - FFMPEG_PATH=/usr/bin/ffmpeg
      - FFPROBE_PATH=/usr/bin/ffprobe
```

### Acceptance Criteria
- [ ] FFmpeg installed in API container
- [ ] FFmpeg installed in Celery worker container
- [ ] FFprobe available and working
- [ ] Codecs verified: H.264, H.265, VP9, Opus
- [ ] Container build size increase documented
- [ ] Build time increase documented
- [ ] Version pinned for reproducibility

### Testing Commands
```bash
# Build containers
docker-compose build

# Test FFmpeg in API container
docker-compose run api ffmpeg -version
docker-compose run api ffprobe -version

# Test codecs available
docker-compose run api ffmpeg -codecs | grep h264
docker-compose run api ffmpeg -codecs | grep vp9

# Test in worker container
docker-compose run celery_worker ffmpeg -version
```

### Verification Script
Create `scripts/verify_ffmpeg.sh`:

```bash
#!/bin/bash
set -e

echo "Verifying FFmpeg installation..."

# Check FFmpeg version
docker-compose run --rm api ffmpeg -version | grep "ffmpeg version"

# Check required codecs
REQUIRED_CODECS=("libx264" "libvpx-vp9" "libopus" "aac")
for codec in "${REQUIRED_CODECS[@]}"; do
    if docker-compose run --rm api ffmpeg -codecs 2>&1 | grep -q "$codec"; then
        echo "✓ Codec $codec found"
    else
        echo "✗ Codec $codec NOT found"
        exit 1
    fi
done

echo "✓ FFmpeg verification complete"
```

---

## Ticket 1.8: Update MinIO Bucket Configuration for Videos

**Type**: Infrastructure  
**Priority**: P1  
**Effort**: 2 hours  
**Assignee**: Backend Engineer

### Description
Configure separate MinIO bucket for video storage with appropriate policies and lifecycle rules.

### Technical Details

**File to modify**: [app/services/minio_client.py](app/services/minio_client.py)

Add video bucket initialization:

```python
class MinIOStorage:
    def __init__(self):
        self.client = None
        self.image_bucket = settings.MINIO_BUCKET_NAME
        self.video_bucket = settings.video.MINIO_VIDEO_BUCKET
        logger.info("MinIO storage initialized (lazy loading enabled)")
    
    def _ensure_bucket_exists(self):
        """Ensure both image and video buckets exist"""
        client = self._get_client()
        
        # Image bucket
        if not client.bucket_exists(self.image_bucket):
            client.make_bucket(self.image_bucket)
            logger.info(f"Created bucket: {self.image_bucket}")
        
        # Video bucket
        if not client.bucket_exists(self.video_bucket):
            client.make_bucket(self.video_bucket)
            logger.info(f"Created bucket: {self.video_bucket}")
            
            # Set lifecycle policy for videos
            self._set_video_lifecycle_policy()
    
    def _set_video_lifecycle_policy(self):
        """Configure lifecycle rules for video storage"""
        from minio.lifecycleconfig import LifecycleConfig, Rule, Transition
        from datetime import timedelta
        
        lifecycle_config = LifecycleConfig([
            # Move temp/failed uploads to deletion after 7 days
            Rule(
                rule_id="delete-temp-uploads",
                prefix="videos/temp/",
                status="Enabled",
                expiration=timedelta(days=7),
            ),
            # Move originals to cold storage after 30 days
            Rule(
                rule_id="archive-originals",
                prefix="videos/uploads/",
                status="Enabled",
                transition=Transition(days=30, storage_class="COLD"),
            ),
        ])
        
        self._get_client().set_bucket_lifecycle(
            self.video_bucket, lifecycle_config
        )
        logger.info(f"Set lifecycle policy for {self.video_bucket}")
```

Update `.env.example`:

```bash
# Video Storage
MINIO_VIDEO_BUCKET=impact-videos
```

### Acceptance Criteria
- [ ] Separate video bucket created automatically
- [ ] Lifecycle policies configured
- [ ] Bucket permissions set correctly
- [ ] CORS policy allows uploads (if needed)
- [ ] Environment variable documented
- [ ] Bucket created on first run
- [ ] No breaking changes to image bucket

### Testing Commands
```bash
# Start services
docker-compose up -d

# Verify buckets created
docker-compose exec minio mc ls minio/impact-images
docker-compose exec minio mc ls minio/impact-videos

# Test lifecycle policy
docker-compose exec minio mc ilm list minio/impact-videos

# Test upload to video bucket
docker-compose exec api python -c "
from services.minio_client import get_minio_storage
import io

client = get_minio_storage()
client.upload_object(
    'videos/test/test.txt',
    io.BytesIO(b'test'),
    4,
    bucket_name='impact-videos'
)
print('Upload successful')
"
```

---

## Phase 1 Completion Checklist

### Definition of Done

- [ ] **All tickets completed** (1.1 through 1.8)
- [ ] **Documentation created**: VIDEO_POLICY.md
- [ ] **Configuration updated**: Backend and frontend configs include video settings
- [ ] **Database migration applied**: video_metadata table exists
- [ ] **API endpoints deployed**: /api/video/upload/* routes working
- [ ] **FFmpeg installed**: Available in all containers
- [ ] **MinIO configured**: Video bucket created with lifecycle policies
- [ ] **Tests passing**: Unit + integration tests for video upload
- [ ] **Manual smoke test**: Can upload a 100MB video via multipart endpoint

### Smoke Test Procedure

```bash
# 1. Start all services
docker-compose up -d

# 2. Verify FFmpeg
docker-compose exec api ffmpeg -version

# 3. Verify database migration
docker-compose exec api alembic current
# Should show: xxxx_add_video_metadata (head)

# 4. Test simple upload (small file)
curl -X POST http://localhost:8000/api/video/upload/simple \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test_video_small.mp4" \
  -F "hazard_type=flood" \
  -F "title=Smoke Test Video"

# Expected: 200 OK with video_id in response

# 5. Test multipart initiation (large file)
curl -X POST http://localhost:8000/api/video/upload/initiate \
  -H "Authorization: Bearer $TOKEN" \
  -F "filename=large_video.mp4" \
  -F "file_size=104857600" \
  -F "content_type=video/mp4" \
  -F "hazard_type=cyclone"

# Expected: 200 OK with upload_id and chunk_urls

# 6. Check video status
curl http://localhost:8000/api/video/status/<video_id> \
  -H "Authorization: Bearer $TOKEN"

# Expected: processing_state="queued"
```

---

## Dependencies & Blockers

### External Dependencies
- **FFmpeg**: Must be installed before validation works
- **MinIO**: Must be running before uploads work
- **Redis**: Must be running for Celery tasks
- **PostgreSQL**: Must have PostGIS extension for geometry columns

### Blocker Chain
```
VIDEO_POLICY.md (1.1)
    ↓
Config Updates (1.2, 1.3)
    ↓
Database Model (1.5) ←→ FFmpeg Install (1.7)
    ↓
Validation Service (1.4)
    ↓
Upload API (1.6)
    ↓
MinIO Config (1.8)
```

---

## Estimated Timeline

| Week | Tasks | Milestone |
|------|-------|-----------|
| **Week 1** | Tickets 1.1, 1.2, 1.3, 1.7 | Config & Infrastructure Ready |
| **Week 2** | Tickets 1.4, 1.5 | Validation & Database Ready |
| **Week 3** | Tickets 1.6, 1.8 | Upload API Complete |

**Total Duration**: 3 weeks for full Phase 1 completion

---

## Success Metrics

Track these metrics to validate Phase 1 success:

- **Upload Success Rate**: >95% (target: 98%)
- **Average Upload Time** (100MB file): <60 seconds
- **Multipart Upload Resume Rate**: 100% after interruption
- **Validation Accuracy**: 0 false positives, <1% false negatives
- **Database Performance**: <100ms query time for video_metadata
- **Storage Cost**: <$0.10/video for first month

---

## Risk Mitigation

| Risk | Probability | Mitigation |
|------|-------------|------------|
| FFmpeg installation fails | Medium | Test on multiple base images, pin versions |
| MinIO quota exceeded | Low | Implement quota checks before upload |
| Large file upload timeout | Medium | Use multipart with 1-hour expiration |
| Database migration breaks existing data | Low | Test migration on staging first, create backup |

---

## Next Steps After Phase 1

Once Phase 1 is complete, move to **Phase 2: Processing Pipeline**:
- Create Celery tasks for video transcoding
- Implement poster thumbnail generation
- Build transcoding queue monitoring
- Add processing state webhooks

See [VIDEO_SUPPORT_CODEBASE_AUDIT.md](VIDEO_SUPPORT_CODEBASE_AUDIT.md#phase-2--processing-pipeline-3-5-weeks) for Phase 2 details.

---

**Questions?** Contact the project lead or reference the main audit document.

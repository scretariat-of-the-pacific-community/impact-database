# Video Support Implementation Audit — Impact Database

**Repository**: kishkumar96/impact-database  
**Branch**: upgrade/nextjs-16-remove-sentry  
**Audit Date**: January 27, 2026  
**Current Status**: Image-only platform with robust infrastructure ready for video extension

---

## Executive Summary

Your codebase has **excellent foundations** for video support. You already have:
- ✅ MinIO object storage with multipart upload support
- ✅ Celery background processing pipeline
- ✅ Secure upload validation framework
- ✅ Database models with EXIF/metadata handling
- ✅ Frontend upload components
- ✅ CDN-ready architecture

**Estimated Implementation Effort**: 18-24 weeks for full world-class video support  
**Primary Gaps**: Video-specific validation, transcoding pipeline, streaming infrastructure

---

## Phase 0 — Product & Compliance (1-2 weeks)

### Current State: ⚠️ **NEEDS DEFINITION**

**What You Have:**
- Image licensing model (Creative Commons)
- User quotas tracked in `/api/user/storage`
- Basic file type validation

**What You Need:**

#### 📋 Configuration Files to Create/Update

| File | Action | Purpose |
|------|--------|---------|
| `VIDEO_POLICY.md` | **CREATE** | Document video retention, moderation policy, consent requirements |
| `docs/VIDEO_COMPLIANCE.md` | **CREATE** | Legal framework: PII detection, DMCA, licensing |
| `app/core/config.py` | **UPDATE** | Add video quotas, retention policies |

#### 🔧 Code Changes Required

**1. Update Configuration** — [app/core/config.py](app/core/config.py#L212)

```python
# Add after MinIOSettings class
class VideoSettings(BaseModel):
    """Video configuration"""
    
    # Formats & Limits
    ALLOWED_VIDEO_FORMATS: list = ['mp4', 'mov', 'avi', 'mkv', 'webm']
    ALLOWED_VIDEO_CODECS: list = ['h264', 'h265', 'vp9', 'av1']
    MAX_VIDEO_SIZE: int = 5 * 1024 * 1024 * 1024  # 5GB
    MAX_VIDEO_DURATION: int = 600  # 10 minutes
    
    # User Quotas
    VIDEO_QUOTA_FREE_TIER: int = 5 * 1024 * 1024 * 1024  # 5GB
    VIDEO_QUOTA_PREMIUM: int = 50 * 1024 * 1024 * 1024  # 50GB
    MAX_VIDEOS_PER_USER: int = 100
    
    # Retention & Moderation
    VIDEO_RETENTION_DAYS: int = 730  # 2 years
    COLD_STORAGE_THRESHOLD_DAYS: int = 180  # Move to cold after 6 months
    REQUIRE_MODERATION: bool = True
    ENABLE_AUTO_FLAGGING: bool = False  # For Phase 5
    
    # Streaming
    ENABLE_HLS_STREAMING: bool = True
    ENABLE_DASH_STREAMING: bool = False
```

**2. Update Storage Quotas** — [app/api/user.py](app/api/user.py#L590)

Currently tracks videos but doesn't enforce quotas:

```python
# EXISTING (Line 626-630)
elif ext in ["mp4", "avi", "mov", "mkv", "webm"]:
    by_type["videos"] += file_size
```

**ACTION**: Add quota enforcement in upload endpoints.

**3. Success Metrics Framework**

Create `/app/services/video_metrics.py`:
- Upload success rate tracking
- Time-to-play measurement
- Cost per GB calculation
- User engagement metrics

---

## Phase 1 — Core Ingestion (2-3 weeks)

### Current State: 🟡 **PARTIAL FOUNDATION**

**What You Have:**

#### ✅ Strong Upload Infrastructure

| Component | File | Status |
|-----------|------|--------|
| **Multipart Upload** | [app/services/minio_client.py](app/services/minio_client.py#L89) | ✅ Supported via presigned URLs |
| **Secure Validation** | [app/services/secure_upload.py](app/services/secure_upload.py#L29) | ✅ Extensible framework |
| **Checksum/ETag** | [app/services/minio_robust.py](app/services/minio_robust.py) | ✅ Included in MinIO uploads |
| **File Storage** | [app/services/minio_client.py](app/services/minio_client.py#L32) | ✅ MinIO with bucket management |

#### 🔧 What Needs Changes

**1. Extend File Validation** — [frontend/src/lib/config.ts](frontend/src/lib/config.ts#L43)

```typescript
// CURRENT (Line 43-56)
UPLOAD: {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  ALLOWED_EXTENSIONS: [
    '.jpg', '.jpeg', '.png', '.gif', '.bmp',
    '.tiff', '.tif', '.webp', '.avif', '.heic', '.heif',
  ],
  CHUNK_SIZE: 1024 * 1024, // 1MB chunks
}

// ADD VIDEO SUPPORT
UPLOAD: {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // Images: 50MB
  MAX_VIDEO_SIZE: 5 * 1024 * 1024 * 1024, // Videos: 5GB
  ALLOWED_EXTENSIONS: [
    // Images
    '.jpg', '.jpeg', '.png', '.gif', '.bmp',
    '.tiff', '.tif', '.webp', '.avif', '.heic', '.heif',
    // Videos
    '.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v',
  ],
  CHUNK_SIZE: 5 * 1024 * 1024, // Increase to 5MB for videos
}
```

**2. Backend Validation** — [app/services/secure_upload.py](app/services/secure_upload.py#L29)

```python
# CURRENT (Line 29-52)
class UploadConfig:
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
    ALLOWED_EXTENSIONS = {
        ".jpg", ".jpeg", ".png", ".gif", ".bmp",
        ".tiff", ".tif", ".webp", ".avif", ".heic", ".heif",
    }
    ALLOWED_MIME_TYPES = {
        "image/jpeg", "image/png", "image/gif",
        "image/bmp", "image/tiff", "image/webp",
        "image/avif", "image/heic", "image/heif",
    }

# ADD VIDEO SUPPORT
class UploadConfig:
    # Separate limits for images vs videos
    MAX_IMAGE_SIZE = 50 * 1024 * 1024  # 50MB
    MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024  # 5GB
    
    ALLOWED_IMAGE_EXTENSIONS = {
        ".jpg", ".jpeg", ".png", ".gif", ".bmp",
        ".tiff", ".tif", ".webp", ".avif", ".heic", ".heif",
    }
    
    ALLOWED_VIDEO_EXTENSIONS = {
        ".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v",
    }
    
    ALLOWED_VIDEO_MIME_TYPES = {
        "video/mp4", "video/quicktime", "video/x-msvideo",
        "video/x-matroska", "video/webm",
    }
    
    # Video validation magic bytes
    VIDEO_MAGIC_BYTES = {
        b'\x00\x00\x00\x18ftypmp4': 'video/mp4',
        b'\x00\x00\x00\x20ftypisom': 'video/mp4',
        b'\x1a\x45\xdf\xa3': 'video/x-matroska',  # MKV
        # Add more as needed
    }
```

**3. Create Video Upload Endpoint** — [app/api/upload.py](app/api/upload.py#L1001)

Currently handles only images. Create `/app/api/video_upload.py`:

```python
from fastapi import APIRouter, UploadFile, File, Form, Depends
from services.secure_upload import secure_upload_service
from models.database import VideoMetadata
from workers.video_tasks import process_video_upload

router = APIRouter()

@router.post("/upload/video")
async def upload_video(
    file: UploadFile = File(...),
    metadata_json: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload video with metadata placeholders"""
    
    # 1. Validate video format
    # 2. Generate unique filename
    # 3. Initiate multipart upload to MinIO
    # 4. Create DB record with processing_state='queued'
    # 5. Trigger background processing task
    # 6. Return upload confirmation with processing status
```

**4. Multipart Upload Enhancement**

Your MinIO client already supports multipart via presigned URLs ([minio_client.py#L89](app/services/minio_client.py#L89)).

**ACTION**: Create resumable upload endpoint using presigned multipart URLs:

```python
# Add to app/api/video_upload.py
@router.post("/upload/video/initiate")
async def initiate_multipart_upload(
    filename: str,
    content_type: str,
    file_size: int,
    current_user: User = Depends(get_current_user),
):
    """
    Start multipart upload session for large videos
    Returns upload_id and presigned URLs for each part
    """
    # Implementation using MinIO multipart APIs
```

---

## Phase 2 — Processing Pipeline (3-5 weeks)

### Current State: 🟡 **CELERY READY, NEEDS VIDEO TASKS**

**What You Have:**

#### ✅ Background Processing Infrastructure

| Component | File | Status |
|-----------|------|--------|
| **Celery Workers** | [app/workers/celery_app.py](app/workers/celery_app.py#L1) | ✅ Configured with Redis |
| **Task Queues** | [app/workers/celery_app.py](app/workers/celery_app.py#L40) | ✅ Multiple queues defined |
| **Image Processing** | [app/workers/tasks.py](app/workers/tasks.py#L1) | ✅ Thumbnail generation exists |
| **Task Retries** | [app/workers/tasks.py](app/workers/tasks.py#L28) | ✅ 5 retries with backoff |

#### 🔧 What Needs Building

**1. Create Video Processing Tasks** — New file: `/app/workers/video_tasks.py`

```python
from celery import shared_task
import subprocess
import json
from pathlib import Path

@shared_task(bind=True, max_retries=3, default_retry_delay=600)
def process_video_upload(self, video_id: str):
    """
    Main orchestration task for video processing
    
    Steps:
    1. Download original from MinIO
    2. Extract metadata (duration, resolution, codec)
    3. Generate poster thumbnail
    4. Transcode to standard formats
    5. Upload variants to MinIO
    6. Update DB with processing results
    7. Trigger webhooks on completion
    """
    try:
        db = get_db_session()
        video = db.query(VideoMetadata).filter_by(id=video_id).first()
        
        # Update state to 'processing'
        video.processing_state = 'processing'
        db.commit()
        
        # Download from MinIO to temp file
        temp_path = download_video_from_storage(video.filename)
        
        # Chain subtasks
        metadata = extract_video_metadata.delay(video_id, temp_path).get()
        thumbnail = generate_video_thumbnail.delay(video_id, temp_path).get()
        transcoded = transcode_video.delay(video_id, temp_path, metadata).get()
        
        # Update DB with results
        video.processing_state = 'ready'
        video.duration = metadata['duration']
        video.width = metadata['width']
        video.height = metadata['height']
        video.poster_url = thumbnail['url']
        video.variants = json.dumps(transcoded['variants'])
        db.commit()
        
        # Cleanup temp files
        cleanup_temp_files([temp_path] + transcoded['temp_files'])
        
        return {"status": "success", "video_id": video_id}
        
    except Exception as e:
        video.processing_state = 'failed'
        video.processing_error = str(e)
        db.commit()
        raise self.retry(exc=e)

@shared_task
def extract_video_metadata(video_id: str, file_path: str):
    """
    Use FFprobe to extract video metadata
    """
    cmd = [
        'ffprobe', '-v', 'error',
        '-show_entries', 'format=duration:stream=width,height,codec_name,bit_rate',
        '-of', 'json',
        file_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    metadata = json.loads(result.stdout)
    
    return {
        'duration': float(metadata['format']['duration']),
        'width': metadata['streams'][0]['width'],
        'height': metadata['streams'][0]['height'],
        'codec': metadata['streams'][0]['codec_name'],
        'bitrate': int(metadata['streams'][0].get('bit_rate', 0)),
    }

@shared_task
def generate_video_thumbnail(video_id: str, file_path: str):
    """
    Generate poster image from video at 2-second mark
    """
    output_path = f"/tmp/{video_id}_poster.jpg"
    cmd = [
        'ffmpeg', '-i', file_path,
        '-ss', '00:00:02',  # 2 seconds in
        '-vframes', '1',
        '-vf', 'scale=1280:-1',  # 1280px wide
        '-q:v', '2',  # High quality
        output_path
    ]
    subprocess.run(cmd, check=True)
    
    # Upload to MinIO
    poster_key = f"videos/posters/{video_id}.jpg"
    upload_to_minio(output_path, poster_key)
    
    return {"url": f"/api/files/{poster_key}"}

@shared_task
def transcode_video(video_id: str, file_path: str, metadata: dict):
    """
    Transcode to H.264 (MP4) and WebM variants
    
    Profiles:
    - 1080p H.264 (high quality)
    - 720p H.264 (medium quality)
    - 480p H.264 (low quality, mobile)
    - 720p WebM (for browsers without H.264)
    """
    variants = []
    
    # H.264 MP4 variants
    for profile in ['1080p', '720p', '480p']:
        output_key = f"videos/variants/{video_id}_{profile}.mp4"
        output_path = f"/tmp/{video_id}_{profile}.mp4"
        
        scale, bitrate = {
            '1080p': ('1920:-1', '5000k'),
            '720p': ('1280:-1', '2500k'),
            '480p': ('854:-1', '1000k'),
        }[profile]
        
        cmd = [
            'ffmpeg', '-i', file_path,
            '-vf', f'scale={scale}',
            '-c:v', 'libx264', '-preset', 'medium',
            '-b:v', bitrate, '-maxrate', bitrate,
            '-bufsize', f"{int(bitrate[:-1]) * 2}k",
            '-c:a', 'aac', '-b:a', '128k',
            '-movflags', '+faststart',  # Enable progressive download
            output_path
        ]
        subprocess.run(cmd, check=True)
        
        # Upload to MinIO
        upload_to_minio(output_path, output_key)
        
        variants.append({
            'profile': profile,
            'codec': 'h264',
            'url': f"/api/files/{output_key}",
            'width': int(scale.split(':')[0]),
        })
    
    # WebM variant (720p only)
    webm_key = f"videos/variants/{video_id}_720p.webm"
    webm_path = f"/tmp/{video_id}_720p.webm"
    
    cmd = [
        'ffmpeg', '-i', file_path,
        '-vf', 'scale=1280:-1',
        '-c:v', 'libvpx-vp9', '-b:v', '1500k',
        '-c:a', 'libopus', '-b:a', '96k',
        webm_path
    ]
    subprocess.run(cmd, check=True)
    upload_to_minio(webm_path, webm_key)
    
    variants.append({
        'profile': '720p',
        'codec': 'vp9',
        'url': f"/api/files/{webm_key}",
        'width': 1280,
    })
    
    return {
        'variants': variants,
        'temp_files': [output_path, webm_path]
    }
```

**2. Add Task Queue Configuration** — [app/workers/celery_app.py](app/workers/celery_app.py#L40)

```python
# EXISTING (Line 40-47)
task_routes={
    "workers.tasks.process_upload": {"queue": "upload_processing"},
    "workers.tasks.generate_thumbnail": {"queue": "image_processing"},
    "workers.tasks.cleanup_failed_uploads": {"queue": "cleanup"},
}

# ADD VIDEO QUEUES
task_routes={
    "workers.tasks.process_upload": {"queue": "upload_processing"},
    "workers.tasks.generate_thumbnail": {"queue": "image_processing"},
    "workers.tasks.cleanup_failed_uploads": {"queue": "cleanup"},
    # Video processing tasks
    "workers.video_tasks.process_video_upload": {"queue": "video_processing"},
    "workers.video_tasks.transcode_video": {"queue": "video_encoding"},
    "workers.video_tasks.generate_video_thumbnail": {"queue": "image_processing"},
}
```

**3. Install FFmpeg in Docker**

Update `docker-compose.yml` to include FFmpeg in the worker container:

```dockerfile
# Add to Dockerfile for workers
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libavcodec-extra \
    && rm -rf /var/lib/apt/lists/*
```

---

## Phase 3 — Playback & Delivery (2-4 weeks)

### Current State: 🟡 **BYTE-RANGE READY, NEEDS VIDEO PLAYER**

**What You Have:**

| Component | File | Status |
|-----------|------|--------|
| **Image Serving** | [app/api/upload.py](app/api/upload.py#L322) | ✅ Byte-range via MinIO |
| **Signed URLs** | [app/services/minio_client.py](app/services/minio_client.py#L75) | ✅ Presigned URLs supported |
| **Security Headers** | [app/api/upload.py](app/api/upload.py#L377) | ✅ Content-Disposition, CORS |

#### 🔧 What Needs Building

**1. Video Serving Endpoint** — Add to `/app/api/upload.py`

```python
@router.get("/videos/{filename}")
async def serve_video(
    filename: str,
    range: Optional[str] = Header(None),
    download: bool = False,
):
    """
    Serve video files with byte-range support for streaming
    
    Supports:
    - Progressive download (Range requests)
    - Direct MP4 playback
    - CDN-ready signed URLs
    """
    if not filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    # Validate video extension
    allowed_exts = {".mp4", ".webm", ".mov"}
    ext = os.path.splitext(filename.lower())[1]
    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail="Invalid video format")
    
    minio_client = get_minio_storage()
    object_key = f"videos/{filename}"
    
    try:
        # Get object metadata for content length
        stat = minio_client.client.stat_object("impact-videos", object_key)
        file_size = stat.size
        
        # Parse Range header
        if range:
            # Format: "bytes=0-1023"
            byte_range = range.replace("bytes=", "")
            start, end = byte_range.split("-")
            start = int(start) if start else 0
            end = int(end) if end else file_size - 1
            
            # Fetch partial content
            response = minio_client.client.get_object(
                "impact-videos", object_key,
                offset=start, length=end - start + 1
            )
            
            return StreamingResponse(
                response.stream(),
                status_code=206,  # Partial Content
                headers={
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(end - start + 1),
                    "Content-Type": stat.content_type,
                }
            )
        else:
            # Full file streaming
            response = minio_client.client.get_object("impact-videos", object_key)
            return StreamingResponse(
                response.stream(),
                media_type=stat.content_type,
                headers={
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(file_size),
                }
            )
    except Exception as e:
        logger.error(f"Error serving video {filename}: {e}")
        raise HTTPException(status_code=404, detail="Video not found")
```

**2. Frontend Video Player** — Create `/frontend/src/components/VideoPlayer.tsx`

```typescript
'use client';

import { useRef, useState, useEffect } from 'react';

interface VideoPlayerProps {
  videoUrl: string;
  posterUrl?: string;
  title?: string;
  duration?: number;
  variants?: VideoVariant[];
}

interface VideoVariant {
  profile: string;
  url: string;
  width: number;
  codec: string;
}

export default function VideoPlayer({
  videoUrl,
  posterUrl,
  title,
  duration,
  variants = [],
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentQuality, setCurrentQuality] = useState('720p');
  const [isPlaying, setIsPlaying] = useState(false);

  // Auto-select quality based on bandwidth (optional)
  useEffect(() => {
    // Implement adaptive quality selection
  }, []);

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
      {/* Video element */}
      <video
        ref={videoRef}
        className="w-full h-full"
        poster={posterUrl}
        controls
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      >
        {/* H.264 sources */}
        {variants
          .filter((v) => v.codec === 'h264')
          .sort((a, b) => b.width - a.width)
          .map((variant) => (
            <source
              key={variant.profile}
              src={variant.url}
              type="video/mp4"
              data-quality={variant.profile}
            />
          ))}
        
        {/* WebM fallback */}
        {variants
          .filter((v) => v.codec === 'vp9')
          .map((variant) => (
            <source
              key={variant.profile}
              src={variant.url}
              type="video/webm"
            />
          ))}
        
        Your browser does not support the video tag.
      </video>

      {/* Quality selector */}
      {variants.length > 1 && (
        <div className="absolute bottom-4 right-4 bg-black/70 rounded px-3 py-2">
          <select
            value={currentQuality}
            onChange={(e) => setCurrentQuality(e.target.value)}
            className="bg-transparent text-white text-sm"
          >
            {variants.map((v) => (
              <option key={v.profile} value={v.profile}>
                {v.profile}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Duration badge */}
      {duration && (
        <div className="absolute top-4 right-4 bg-black/70 rounded px-2 py-1 text-white text-xs">
          {formatDuration(duration)}
        </div>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
```

**3. CDN Integration**

Your MinIO setup is CDN-ready. Add CloudFlare/AWS CloudFront config:

- Set cache headers for video variants (long TTL)
- Use signed URLs for access control
- Enable byte-range caching

---

## Phase 4 — Model & Search (2-3 weeks)

### Current State: 🔴 **NEEDS NEW VIDEO MODEL**

**What You Have:**

| Component | File | Status |
|-----------|------|--------|
| **Image Model** | [app/models/database.py](app/models/database.py#L60) | ✅ Rich metadata with EXIF |
| **Search API** | [app/api/images.py](app/api/images.py) | ✅ Filter by hazard, date, location |
| **PostGIS** | Database | ✅ Spatial queries ready |

#### 🔧 What Needs Building

**1. Create Video Model** — Add to [app/models/database.py](app/models/database.py)

```python
class VideoMetadata(Base):
    __tablename__ = "video_metadata"

    # Core fields
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    datetime = Column(DateTime(timezone=True), nullable=False)
    geometry = Column(Geometry(geometry_type="POINTZ", srid=4326), nullable=True)
    
    # Video-specific fields
    media_type = Column(String, default="video", nullable=False)
    duration = Column(Float, nullable=True)  # In seconds
    width = Column(SmallInteger, nullable=True)
    height = Column(SmallInteger, nullable=True)
    fps = Column(Float, nullable=True)
    codec = Column(String(50), nullable=True)  # h264, h265, vp9
    bitrate = Column(Integer, nullable=True)  # In kbps
    
    # File references
    filename = Column(String, nullable=False)  # Original file
    poster_url = Column(String, nullable=True)  # Thumbnail image
    variants = Column(JSON, nullable=True)  # [{profile, url, size}]
    
    # Processing state
    processing_state = Column(
        String, 
        default="queued", 
        nullable=False
    )  # queued, processing, ready, failed
    processing_error = Column(Text, nullable=True)
    
    # Common metadata (same as ImageMetadata)
    hazard_type = Column(String, nullable=False)
    event_id = Column(String, nullable=True)
    status = Column(String, default="pending_review", nullable=False)
    source_type = Column(String, nullable=False)
    uploader_id = Column(String, nullable=False)
    
    # Curation
    is_featured = Column(Boolean, default=False)
    moderation_flags = Column(JSON, nullable=True)  # For Phase 5
    
    # Relationships
    # comments = relationship("Comment", back_populates="video")
```

**2. Update Search Filters** — [app/api/images.py](app/api/images.py)

Add unified media search endpoint:

```python
@router.get("/media/search")
async def search_media(
    media_type: Optional[str] = Query(None, regex="^(image|video|all)$"),
    min_duration: Optional[int] = Query(None, ge=0),
    max_duration: Optional[int] = Query(None, le=3600),
    resolution: Optional[str] = Query(None, regex="^(480p|720p|1080p|4k)$"),
    # ... existing filters (hazard_type, date range, bbox)
):
    """
    Unified search across images and videos
    """
    query = db.query(ImageMetadata, VideoMetadata)
    
    if media_type == "image":
        query = db.query(ImageMetadata)
    elif media_type == "video":
        query = db.query(VideoMetadata)
        
        # Video-specific filters
        if min_duration:
            query = query.filter(VideoMetadata.duration >= min_duration)
        if max_duration:
            query = query.filter(VideoMetadata.duration <= max_duration)
        if resolution:
            resolution_map = {
                '480p': (640, 480),
                '720p': (1280, 720),
                '1080p': (1920, 1080),
                '4k': (3840, 2160),
            }
            min_w, min_h = resolution_map[resolution]
            query = query.filter(
                VideoMetadata.width >= min_w,
                VideoMetadata.height >= min_h
            )
    
    # Apply common filters
    # ... (hazard type, date, location)
    
    results = query.limit(100).all()
    return {"items": results, "count": len(results)}
```

**3. Frontend Media Grid** — Update image grid components

Create unified media card that detects type:

```typescript
// frontend/src/components/MediaCard.tsx
export function MediaCard({ item }: { item: ImageMetadata | VideoMetadata }) {
  const isVideo = 'duration' in item;
  
  return (
    <div className="media-card">
      {isVideo ? (
        <VideoPlayer
          videoUrl={item.variants[0].url}
          posterUrl={item.poster_url}
          duration={item.duration}
        />
      ) : (
        <img src={item.thumbnail_url} alt={item.title} />
      )}
      
      {/* Common metadata display */}
      <div className="metadata">
        <h3>{item.title}</h3>
        <p>{item.hazard_type}</p>
        {isVideo && (
          <span className="duration-badge">
            {formatDuration(item.duration)}
          </span>
        )}
      </div>
    </div>
  );
}
```

---

## Phase 5 — Curation & Moderation (2-3 weeks)

### Current State: 🟢 **READY TO EXTEND**

**What You Have:**

| Component | File | Status |
|-----------|------|--------|
| **Curation Queue** | [app/api/curation.py](app/api/curation.py) | ✅ Image review workflow |
| **Review Workflow** | [app/api/review_workflow.py](app/api/review_workflow.py) | ✅ Approve/reject/flag |
| **Audit Logging** | [app/api/upload.py](app/api/upload.py#L206) | ✅ Change tracking |
| **Admin Panel** | [frontend/src/components/CurationDashboard.tsx](frontend/src/components/CurationDashboard.tsx) | ✅ Curator UI |

#### 🔧 What Needs Building

**1. Video Preview in Curation** — Update [frontend/src/components/CurationQueue.tsx](frontend/src/components/CurationQueue.tsx)

```typescript
// Add video preview support
{item.media_type === 'video' ? (
  <VideoPlayer
    videoUrl={item.variants?.find(v => v.profile === '480p')?.url}
    posterUrl={item.poster_url}
    duration={item.duration}
  />
) : (
  <img src={item.thumbnail_url} />
)}
```

**2. Video-Specific Moderation Flags**

Add to `VideoMetadata.moderation_flags` JSON:
- `inappropriate_content`: boolean
- `poor_quality`: boolean (low resolution, corrupted)
- `duplicate`: boolean
- `copyright_concern`: boolean
- `auto_flagged_reason`: string (for Phase 6 AI scanning)

**3. Curator Video Controls**

Add playback speed control, frame-by-frame stepping for detailed review.

---

## Phase 6 — Accessibility & Analytics (2-4 weeks)

### Current State: 🟡 **ANALYTICS EXISTS, NEEDS VIDEO EXTENSION**

**What You Have:**

| Component | File | Status |
|-----------|------|--------|
| **Analytics API** | [app/api/analytics.py](app/api/analytics.py) | ✅ User stats, upload trends |
| **Activity Feed** | [app/api/images.py](app/api/images.py) | ✅ User activity tracking |

#### 🔧 What Needs Building

**1. Caption/Subtitle Support**

Add to `VideoMetadata`:
```python
subtitle_tracks = Column(JSON, nullable=True)
# Format: [{"lang": "en", "url": "/api/files/videos/subs/video_id_en.vtt"}]
```

Create upload endpoint for WebVTT files.

**2. Video Analytics Events**

Track in separate `video_analytics` table:
```python
class VideoAnalyticsEvent(Base):
    __tablename__ = "video_analytics_events"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    video_id = Column(UUID, ForeignKey("video_metadata.id"), nullable=False)
    user_id = Column(String, nullable=True)  # Null for anonymous
    event_type = Column(String, nullable=False)  # play_start, play_end, pause, seek
    timestamp = Column(DateTime(timezone=True), default=datetime.utcnow)
    playback_position = Column(Float, nullable=True)  # In seconds
    quality = Column(String, nullable=True)  # 480p, 720p, 1080p
    device_type = Column(String, nullable=True)  # mobile, desktop, tablet
```

**3. Frontend Analytics Integration**

Add to VideoPlayer component:

```typescript
useEffect(() => {
  const video = videoRef.current;
  if (!video) return;
  
  // Track play start
  const handlePlay = () => {
    logVideoEvent('play_start', { position: video.currentTime });
  };
  
  // Track watch time every 10 seconds
  const watchInterval = setInterval(() => {
    if (!video.paused) {
      logVideoEvent('heartbeat', { position: video.currentTime });
    }
  }, 10000);
  
  video.addEventListener('play', handlePlay);
  return () => {
    video.removeEventListener('play', handlePlay);
    clearInterval(watchInterval);
  };
}, []);
```

---

## Phase 7 — Reliability & Cost Controls (ongoing)

### Current State: 🟢 **STRONG FOUNDATION**

**What You Have:**

| Component | File | Status |
|-----------|------|--------|
| **Health Checks** | [health_check.sh](health_check.sh) | ✅ Service monitoring |
| **Task Retries** | [app/workers/tasks.py](app/workers/tasks.py#L28) | ✅ 5 retries with backoff |
| **Storage Lifecycle** | [app/services/minio_lifecycle.py](app/services/minio_lifecycle.py#L16) | ✅ Cold storage policies |
| **Error Handling** | [app/services/secure_upload.py](app/services/secure_upload.py#L421) | ✅ Robust retry logic |

#### 🔧 What Needs Enhancement

**1. Dead Letter Queue for Failed Videos**

```python
# Add to workers/video_tasks.py
@shared_task
def handle_failed_video_processing(video_id: str, error: dict):
    """
    Move failed videos to DLQ for manual review
    """
    db = get_db_session()
    video = db.query(VideoMetadata).filter_by(id=video_id).first()
    
    # Log to dead letter queue
    dlq_record = ProcessingFailure(
        video_id=video_id,
        error_type=error['type'],
        error_message=error['message'],
        retry_count=error['retry_count'],
        timestamp=datetime.utcnow(),
    )
    db.add(dlq_record)
    
    # Notify admins
    send_admin_alert(f"Video processing failed: {video_id}")
```

**2. Storage Lifecycle for Videos**

Update [app/services/minio_lifecycle.py](app/services/minio_lifecycle.py):

```python
def configure_video_lifecycle():
    """
    Video-specific lifecycle policies:
    - Original: Keep 30 days, move to cold storage
    - Transcoded variants: Keep indefinitely in hot storage
    - Unused videos (0 views in 6 months): Archive
    """
    policies = [
        {
            "id": "archive_originals",
            "prefix": "videos/originals/",
            "transition_days": 30,
            "storage_class": "COLD",
        },
        {
            "id": "delete_failed_uploads",
            "prefix": "videos/temp/",
            "expiration_days": 7,
        },
    ]
    apply_policies(policies)
```

**3. Cost Dashboard**

Create `/app/api/admin/cost_monitoring.py`:

```python
@router.get("/admin/costs/storage")
async def get_storage_costs():
    """
    Calculate storage costs for videos vs images
    """
    minio = get_minio_storage()
    
    image_size = sum_bucket_size("impact-images")
    video_size = sum_bucket_size("impact-videos")
    
    # Cost calculation (example rates)
    image_cost = image_size * 0.023 / (1024**3)  # $0.023/GB
    video_cost = video_size * 0.023 / (1024**3)
    
    return {
        "storage": {
            "images_gb": image_size / (1024**3),
            "videos_gb": video_size / (1024**3),
            "total_cost_monthly": image_cost + video_cost,
        },
        "projections": {
            # Based on upload trends
        }
    }
```

---

## Implementation Priority Matrix

| Phase | Complexity | Dependencies | Business Value | Recommended Priority |
|-------|-----------|--------------|----------------|---------------------|
| Phase 0 | Low | None | High (blocks others) | **MUST DO FIRST** |
| Phase 1 | Medium | None | High (enables upload) | **Week 1-3** |
| Phase 2 | High | FFmpeg, Celery | Critical (enables playback) | **Week 4-8** |
| Phase 3 | Medium | Phase 2 | High (user experience) | **Week 9-12** |
| Phase 4 | Medium | Phase 3 | Medium (discovery) | **Week 13-15** |
| Phase 5 | Low | Phase 3 | Medium (quality control) | **Week 16-18** |
| Phase 6 | Low | Phase 3 | Low (nice-to-have) | **Week 19-22** |
| Phase 7 | Ongoing | All phases | High (cost control) | **Start Week 1** |

---

## Critical Files to Create

### New Backend Files
1. `/app/models/video.py` — VideoMetadata model
2. `/app/workers/video_tasks.py` — Transcoding pipeline
3. `/app/api/video_upload.py` — Video upload endpoints
4. `/app/services/video_processor.py` — FFmpeg wrapper
5. `/app/services/hls_packager.py` — HLS/DASH support (optional)

### New Frontend Files
1. `/frontend/src/components/VideoPlayer.tsx` — Player component
2. `/frontend/src/components/MediaCard.tsx` — Unified media card
3. `/frontend/src/lib/videoApi.ts` — Video API client
4. `/frontend/src/hooks/useVideoUpload.ts` — Upload hook with progress

### Configuration Files
1. `VIDEO_POLICY.md` — Product requirements
2. `docs/VIDEO_COMPLIANCE.md` — Legal framework
3. `.env.example` — Add video-specific env vars

---

## Infrastructure Requirements

### Docker Compose Updates

```yaml
# docker-compose.yml additions

services:
  video_worker:
    build: .
    command: celery -A workers.celery_app worker -Q video_processing,video_encoding -c 2
    environment:
      - CELERY_BROKER_URL=${REDIS_URL}
    volumes:
      - video_cache:/tmp/video_processing
    depends_on:
      - redis
      - minio
    deploy:
      resources:
        limits:
          cpus: '4'  # Video encoding is CPU-intensive
          memory: 8G

  minio_videos:
    # Separate MinIO bucket or expand existing
    environment:
      - MINIO_BUCKET_VIDEOS=impact-videos
```

### FFmpeg Docker Image

```dockerfile
# Add to your API Dockerfile
FROM python:3.10-slim

# Install FFmpeg with H.264 support
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libavcodec-extra \
    libx264-dev \
    && rm -rf /var/lib/apt/lists/*

# Verify FFmpeg installation
RUN ffmpeg -version
RUN ffprobe -version
```

---

## Migration Scripts

### Database Migration

```python
# alembic/versions/xxxx_add_video_support.py

def upgrade():
    # Create video_metadata table
    op.create_table(
        'video_metadata',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('duration', sa.Float, nullable=True),
        sa.Column('width', sa.SmallInteger, nullable=True),
        sa.Column('height', sa.SmallInteger, nullable=True),
        sa.Column('codec', sa.String(50), nullable=True),
        sa.Column('processing_state', sa.String, nullable=False, server_default='queued'),
        # ... other columns
    )
    
    # Add media_type to existing image_metadata (backward compat)
    op.add_column('image_metadata', 
        sa.Column('media_type', sa.String, server_default='image'))
```

---

## Testing Strategy

### Unit Tests
- `/tests/test_video_upload.py` — Upload validation
- `/tests/test_video_processing.py` — Transcoding logic
- `/tests/test_video_serving.py` — Byte-range requests

### Integration Tests
- Upload 1GB video → Verify transcoding completes
- Simulate network interruption → Verify resumable upload
- Test CDN cache hits/misses

### Load Tests
- 100 concurrent video uploads
- Transcoding queue under heavy load
- Storage bandwidth limits

---

## Cost Projections

### Assumptions
- 1000 videos uploaded/month
- Average video: 500MB original, 300MB transcoded
- Storage retention: 2 years
- CDN bandwidth: 10GB/video over lifetime

### Monthly Costs (AWS S3 Pricing Example)

| Component | Usage | Rate | Monthly Cost |
|-----------|-------|------|--------------|
| **Storage (Hot)** | 300GB | $0.023/GB | $6.90 |
| **Storage (Cold)** | 200GB | $0.0125/GB | $2.50 |
| **Bandwidth (CDN)** | 10TB | $0.085/GB | $850.00 |
| **Transcoding** | 500 hours | $0.03/min | $900.00 |
| **Database** | PostGIS + metadata | | $50.00 |
| **Total** | | | **$1,809.40** |

**Optimization Strategies**:
1. Use CloudFlare for free bandwidth (vs AWS)
2. Batch transcoding during off-peak hours
3. Implement aggressive cold storage policies
4. Offer user-paid premium tiers for 4K/longer videos

---

## Risk Mitigation

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| **Transcoding failures** | High | High | Robust retry logic, DLQ monitoring |
| **Storage cost explosion** | Medium | Critical | Lifecycle policies from day 1 |
| **CDN bandwidth overages** | Medium | High | Use CloudFlare, implement rate limiting |
| **FFmpeg security vulnerabilities** | Low | High | Container isolation, regular updates |

### Product Risks

| Risk | Mitigation |
|------|------------|
| **Low adoption** | Start with beta users, iterate based on feedback |
| **Moderation challenges** | Require manual review for first 6 months |
| **Copyright issues** | Clear ToS, DMCA compliance from day 1 |

---

## Success Metrics (KPIs)

### Technical Metrics
- ✅ Upload success rate: >98%
- ✅ Transcoding completion time: <5 min for 10-min video
- ✅ Time-to-first-frame: <2 seconds
- ✅ Storage cost per video: <$0.50/month

### Product Metrics
- 📊 Videos uploaded per week
- 📊 Video views vs image views
- 📊 User engagement (watch time)
- 📊 Feature adoption rate

---

## Next Steps

### Immediate Actions (This Week)

1. ✅ **Create `VIDEO_POLICY.md`** defining requirements
2. ✅ **Set up FFmpeg in local Docker** for testing
3. ✅ **Prototype video upload endpoint** with basic validation
4. ✅ **Test multipart upload** with 1GB dummy file

### Week 2-4 (Phase 1)

1. Implement video upload API with validation
2. Create `VideoMetadata` database model + migration
3. Build resumable upload frontend component
4. Deploy to staging for testing

### Month 2-3 (Phase 2)

1. Build transcoding pipeline with FFmpeg
2. Implement poster thumbnail generation
3. Test with various video formats
4. Monitor Celery queue performance

### Month 4+ (Phases 3-7)

1. Roll out video player to beta users
2. Iterate based on feedback
3. Implement analytics and cost monitoring
4. Add advanced features (HLS, captions)

---

## Questions to Answer Before Starting

1. **Product**:
   - What's your target video use case? (Short clips vs long documentaries?)
   - Will videos be public or need access control?
   - Do you need live streaming or just VOD?

2. **Budget**:
   - What's your monthly budget for video infrastructure?
   - Can you afford $0.50-2.00 per uploaded video for storage+bandwidth?

3. **Legal**:
   - Do you have a lawyer review your video ToS?
   - How will you handle DMCA takedown requests?
   - Do you need PII detection (faces, license plates)?

4. **Team**:
   - Who will monitor the transcoding queue?
   - Who handles video moderation?
   - Do you have DevOps for FFmpeg tuning?

---

## Recommended Approach

Given your current codebase maturity, I recommend:

### 🎯 MVP Strategy (8-10 weeks)

**Skip HLS/DASH initially** — Use direct MP4 progressive download. It's simpler and works for 90% of use cases.

**Focus on**:
1. Phase 0 (policy)
2. Phase 1 (upload)
3. Phase 2 (transcoding to single MP4 + poster)
4. Phase 3 (basic video player)

**Defer**:
- Adaptive bitrate streaming
- Auto-captions
- Advanced analytics
- Live streaming

This gets you **working video support in 10 weeks** with budget <$500/month for moderate traffic.

---

## Final Recommendations

✅ **Your codebase is READY** — You have 70% of the infrastructure already  
✅ **Start small** — Don't build HLS until you need it  
✅ **Watch costs** — Implement lifecycle policies from day 1  
✅ **Plan moderation** — Video abuse is harder to detect than images  

**Want me to**:
1. Generate Phase 1 implementation tickets?
2. Create the video upload API boilerplate?
3. Build cost estimation spreadsheet?

Let me know which phase you want to tackle first!

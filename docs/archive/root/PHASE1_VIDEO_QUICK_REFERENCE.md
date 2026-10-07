# Phase 1 Video Support - Quick Reference

## ✅ What Was Implemented

| Ticket | Component | Status |
|--------|-----------|--------|
| 1.4 | Video Validation Service | ✅ Complete |
| 1.5 | VideoMetadata Model + Migration | ✅ Complete |
| 1.6 | Multipart Upload API | ✅ Complete |
| 1.8 | MinIO Video Bucket | ✅ Complete |

## 📁 Files Changed

```
app/
├── services/
│   ├── secure_upload.py       (+200 lines - VideoValidator class)
│   └── minio_client.py         (+50 lines - Video bucket support)
├── models/
│   └── database.py             (+145 lines - VideoMetadata model)
├── api/
│   └── video_upload.py         (NEW - 390 lines - Upload API)
├── core/
│   └── main.py                 (+4 lines - Router registration)
└── alembic/versions/
    └── 009_video_metadata.py   (NEW - Database migration)
```

## 🚀 Quick Start

```bash
# 1. Run migration
docker-compose exec api bash -c "cd app && alembic upgrade head"

# 2. Verify table created
docker-compose exec postgres psql -U postgres -d impact_db -c "\d video_metadata"

# 3. Restart API
docker-compose restart api

# 4. Test endpoint
curl http://localhost:8000/docs | grep -i video
```

## 🎯 API Endpoints

### Upload Small Video (<500MB)
```bash
POST /api/video/upload/simple
  -F "file=@video.mp4"
  -F "hazard_type=flood"
  -F "title=Disaster Footage"
```

### Upload Large Video (Multipart)
```bash
# Step 1: Initiate
POST /api/video/upload/initiate
  -F "filename=large.mp4"
  -F "file_size=2147483648"
  -F "hazard_type=cyclone"

# Step 2: Upload chunks (use presigned URLs)

# Step 3: Complete
POST /api/video/upload/complete
  -F "video_id={uuid}"
  -F "file_hash={sha256}"
```

### Check Status
```bash
GET /api/video/status/{video_id}
```

### Abort Upload
```bash
POST /api/video/upload/abort
  -F "video_id={uuid}"
```

## 📊 VideoMetadata Model

```python
VideoMetadata(
    id=UUID,
    filename="video.mp4",
    file_size=52428800,              # bytes
    duration=120.5,                  # seconds
    width=1920, height=1080,
    fps=30.0,
    codec="h264",
    processing_state="queued",       # queued|processing|ready|failed
    status="pending_review",         # pending_review|approved|rejected
    hazard_type="flood",
    uploader_id="user123",
    geometry=POINTZ(...),            # PostGIS
    variants=[...],                  # Transcoded versions (Phase 2)
)
```

## 🔧 Configuration

### Environment Variables
```bash
MINIO_VIDEO_BUCKET=impact-videos
```

### MinIO Buckets
- **impact-images**: Image files (existing)
- **impact-videos**: Video files (new)

### Lifecycle Policies
- `videos/temp/`: Auto-delete after 7 days
- `videos/uploads/`: Move to cold storage after 30 days

## 🧪 Testing

```bash
# Run test script
./test_phase1_video.sh

# Or test manually
cd app
python3 -c "from services.secure_upload import VideoValidator; print('OK')"
python3 -c "from models.database import VideoMetadata; print('OK')"
python3 -c "from api.video_upload import router; print('OK')"
```

## 📦 Dependencies

### Required (Install in Docker)
```dockerfile
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libavcodec-extra \
    && rm -rf /var/lib/apt/lists/*
```

### Python Packages (Already Installed)
- fastapi
- sqlalchemy
- geoalchemy2
- minio
- pydantic

## 🔐 Security Features

- ✅ Magic byte validation (prevents spoofing)
- ✅ File size limits per tier
- ✅ SHA256 integrity checks
- ✅ JWT authentication required
- ✅ User quotas (5 videos free, 100 premium)
- ✅ Presigned URLs (1-hour expiry)

## 📈 Quotas & Limits

| Tier | Max File Size | Max Videos | Max Duration |
|------|---------------|------------|--------------|
| Free | 2 GB | 5 | 5 min |
| Premium | 5 GB | 100 | 30 min |

## ⚠️ Known Limitations

- ❌ No transcoding yet (Phase 2)
- ❌ No poster thumbnails yet (Phase 2)
- ❌ No HLS streaming yet (Phase 3)
- ❌ Direct MP4 download only

## 🎬 What's Next (Phase 2)

1. **Transcoding Pipeline**: Convert to H.264/WebM
2. **Poster Generation**: Extract thumbnail at 2s
3. **Processing Queue**: Celery background tasks
4. **Quality Variants**: 480p, 720p, 1080p

## 📚 Documentation

- Full implementation: [PHASE1_VIDEO_IMPLEMENTATION_COMPLETE.md](PHASE1_VIDEO_IMPLEMENTATION_COMPLETE.md)
- Ticket details: [PHASE1_VIDEO_IMPLEMENTATION_TICKETS.md](PHASE1_VIDEO_IMPLEMENTATION_TICKETS.md)
- Architecture audit: [VIDEO_SUPPORT_CODEBASE_AUDIT.md](VIDEO_SUPPORT_CODEBASE_AUDIT.md)

## 🆘 Troubleshooting

### FFmpeg not found
```bash
docker-compose exec api ffmpeg -version
# If fails: Rebuild Docker image with FFmpeg
```

### Migration fails
```bash
# Check current version
docker-compose exec api bash -c "cd app && alembic current"

# Rollback if needed
docker-compose exec api bash -c "cd app && alembic downgrade -1"
```

### Upload fails
```bash
# Check logs
docker-compose logs api | grep video

# Verify MinIO bucket
docker-compose exec minio mc ls minio/impact-videos
```

---

**Status**: ✅ Phase 1 Complete - Ready for Production Testing  
**Date**: January 27, 2026

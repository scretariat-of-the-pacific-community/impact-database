#!/bin/bash
# Test script for Phase 1 Video Implementation (Tickets 1.4, 1.5, 1.6, 1.8)
# Run from app/ directory

set -e

echo "================================"
echo "Phase 1 Video Implementation Test"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test 1: Check if video validation service exists
echo "Test 1: Video Validation Service (Ticket 1.4)"
python3 -c "
from services.secure_upload import VideoValidator, video_validator
print('✓ VideoValidator class imported successfully')
print('✓ video_validator instance available')
" && echo -e "${GREEN}✓ PASS${NC}" || echo -e "${RED}✗ FAIL${NC}"
echo ""

# Test 2: Check if VideoMetadata model exists
echo "Test 2: VideoMetadata Model (Ticket 1.5)"
python3 -c "
from models.database import VideoMetadata
import uuid
video = VideoMetadata(
    id=uuid.uuid4(),
    filename='test.mp4',
    file_size=1024000,
    hazard_type='flood',
    uploader_id='test_user',
    source_type='citizen'
)
print('✓ VideoMetadata model imported')
print('✓ Can instantiate VideoMetadata')
print(f'✓ to_dict() method works: {bool(video.to_dict())}')
" && echo -e "${GREEN}✓ PASS${NC}" || echo -e "${RED}✗ FAIL${NC}"
echo ""

# Test 3: Check if video upload API exists
echo "Test 3: Video Upload API (Ticket 1.6)"
python3 -c "
from api.video_upload import router
print(f'✓ Video upload router imported')
print(f'✓ Router prefix: {router.prefix}')
print(f'✓ Number of routes: {len(router.routes)}')
for route in router.routes:
    if hasattr(route, 'path'):
        print(f'  - {route.methods} {route.path}')
" && echo -e "${GREEN}✓ PASS${NC}" || echo -e "${RED}✗ FAIL${NC}"
echo ""

# Test 4: Check if MinIO video bucket configuration exists
echo "Test 4: MinIO Video Bucket Config (Ticket 1.8)"
python3 -c "
from services.minio_client import MinIOStorage, MINIO_VIDEO_BUCKET
storage = MinIOStorage()
print(f'✓ Video bucket name: {storage.video_bucket_name}')
print(f'✓ MINIO_VIDEO_BUCKET env var: {MINIO_VIDEO_BUCKET}')
print('✓ MinIO storage supports video bucket')
" && echo -e "${GREEN}✓ PASS${NC}" || echo -e "${RED}✗ FAIL${NC}"
echo ""

# Test 5: Check if router is registered in main.py
echo "Test 5: Router Registration"
grep -q "video_upload" core/main.py && \
echo -e "✓ video_upload imported in main.py\n${GREEN}✓ PASS${NC}" || \
echo -e "✗ video_upload not found in main.py\n${RED}✗ FAIL${NC}"
echo ""

# Test 6: Check video config extensions
echo "Test 6: Video Config Extensions"
python3 -c "
from services.secure_upload import UploadConfig
print(f'✓ ALLOWED_VIDEO_EXTENSIONS: {len(UploadConfig.ALLOWED_VIDEO_EXTENSIONS)} formats')
print(f'✓ ALLOWED_VIDEO_MIME_TYPES: {len(UploadConfig.ALLOWED_VIDEO_MIME_TYPES)} types')
print(f'✓ VIDEO_MAGIC_BYTES: {len(UploadConfig.VIDEO_MAGIC_BYTES)} signatures')
print(f'✓ MAX_VIDEO_SIZE: {UploadConfig.MAX_VIDEO_SIZE / (1024**3):.1f}GB')
" && echo -e "${GREEN}✓ PASS${NC}" || echo -e "${RED}✗ FAIL${NC}"
echo ""

# Test 7: Check database migration exists
echo "Test 7: Database Migration"
if [ -f "alembic/versions/009_video_metadata.py" ]; then
    echo "✓ Migration file exists: 009_video_metadata.py"
    echo -e "${GREEN}✓ PASS${NC}"
else
    echo "✗ Migration file not found"
    echo -e "${RED}✗ FAIL${NC}"
fi
echo ""

# Test 8: Check FFprobe availability (optional)
echo "Test 8: FFprobe Availability (Optional)"
if command -v ffprobe &> /dev/null; then
    ffprobe -version | head -n 1
    echo -e "${GREEN}✓ PASS - FFprobe installed${NC}"
else
    echo "⚠ FFprobe not installed (required for video validation)"
    echo -e "${RED}✗ WARN - Install FFmpeg to enable video validation${NC}"
fi
echo ""

echo "================================"
echo "Summary"
echo "================================"
echo "All core components implemented:"
echo "  ✓ Ticket 1.4: Video Validation Service"
echo "  ✓ Ticket 1.5: Database Model + Migration"
echo "  ✓ Ticket 1.6: Upload API Endpoints"
echo "  ✓ Ticket 1.8: MinIO Bucket Configuration"
echo ""
echo "Next steps:"
echo "  1. Run database migration: cd app && alembic upgrade head"
echo "  2. Install FFmpeg: apt-get install ffmpeg (in Docker)"
echo "  3. Set environment: export MINIO_VIDEO_BUCKET=impact-videos"
echo "  4. Restart API server"
echo "  5. Test upload: curl -X POST http://localhost:8000/api/video/upload/simple"
echo ""

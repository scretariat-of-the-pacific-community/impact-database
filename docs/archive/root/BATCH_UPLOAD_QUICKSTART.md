# Batch Upload System - Quick Start Guide

## 🚀 For End Users

### How to Upload a Batch of Images

1. **Navigate** to `/upload` page
2. **Toggle** "Batch Mode" switch
3. **Select Files**:
   - Click "Choose Files" or drag & drop
   - Select up to 100 images
   - Max 50MB per file, 500MB total
4. **Apply Template** (optional):
   - Select saved template from dropdown
   - Or fill metadata manually
5. **Fill Required Fields**:
   - Hazard Type (required)
   - Source Type (required)
   - Country (optional but recommended)
6. **Fill Optional Metadata**:
   - Event ID, Title, Abstract, Location, Keywords
7. **Click** "Upload X Images" button
8. **Watch Progress**:
   - Real-time progress bar
   - File count updates
   - Cancel button available
9. **Handle Completion**:
   - Success: All files uploaded ✅
   - Partial: Some failed → Click "Retry Failed Files"
   - Failed: All failed → Check error details

### How to Use Templates

**Save a Template:**
1. Fill out metadata fields as you want
2. Click "Save Current Settings as Template"
3. Enter template name (e.g., "Hurricane Reports")
4. Optionally add description
5. Click "Save Template"

**Load a Template:**
1. Start batch upload (select files)
2. Template picker appears
3. Select template from dropdown
4. Form auto-fills with template metadata
5. Modify as needed
6. Submit batch

**Manage Templates:**
1. Click "Manage Templates" button
2. View all saved templates
3. Actions:
   - **Load**: Apply to current form
   - **Delete**: Remove template (with confirmation)

### How to Retry Failed Uploads

1. Batch completes with failures
2. Amber warning card appears
3. Click "Retry Failed Files" button
4. New batch starts with only failed files
5. Watch progress for retry batch

### How to View Analytics

1. Scroll to bottom of upload page
2. Analytics card shows (if you have batch history):
   - Total batches processed
   - Success rate percentage
   - Total files processed
   - Average processing time
   - Status breakdown (completed/partial/failed)

---

## 🛠️ For Developers

### Quick Test Commands

```bash
# Check services are running
cd /home/kishank/impact-database
docker compose ps

# View API logs
docker compose logs api --tail=100 -f

# View Celery worker logs
docker compose logs celery_worker --tail=100 -f

# View Celery beat logs (scheduled tasks)
docker compose logs celery_beat --tail=100 -f

# Run integration tests
docker compose exec api pytest tests/test_batch_upload.py -v

# Check database migration status
docker compose exec api alembic current

# Access Celery Flower dashboard
open http://localhost:5555
```

### API Endpoints Quick Reference

```bash
# Create batch upload
curl -X POST http://localhost:8000/api/batch/create \
  -H "Content-Type: multipart/form-data" \
  -F "files=@image1.jpg" \
  -F "files=@image2.jpg" \
  -F "hazard_type=flood" \
  -F "source_type=field" \
  --cookie "session=YOUR_TOKEN"

# Get batch status
curl http://localhost:8000/api/batch/{batch_id}/status \
  --cookie "session=YOUR_TOKEN"

# Cancel batch
curl -X DELETE http://localhost:8000/api/batch/{batch_id}/cancel \
  --cookie "session=YOUR_TOKEN"

# Retry failed files
curl -X POST http://localhost:8000/api/batch/{batch_id}/retry-failed \
  --cookie "session=YOUR_TOKEN"

# Get analytics
curl http://localhost:8000/api/batch/analytics?days=30 \
  --cookie "session=YOUR_TOKEN"

# List templates
curl http://localhost:8000/api/batch/templates \
  --cookie "session=YOUR_TOKEN"

# Create template
curl -X POST http://localhost:8000/api/batch/templates \
  -H "Content-Type: application/json" \
  -d '{"name":"My Template","template_data":{"hazard_type":"flood"}}' \
  --cookie "session=YOUR_TOKEN"
```

### WebSocket Connection (JavaScript)

```javascript
const ws = new WebSocket('ws://localhost:8000/api/batch/ws/{batch_id}');

ws.onopen = () => {
  console.log('Connected to batch progress');
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === 'connected') {
    console.log('Initial status:', msg.current_status);
  } else if (msg.type === 'progress_update') {
    console.log('Progress:', msg.data.progress_percent + '%');
    console.log('Latest file:', msg.data.latest_file);
  } else if (msg.type === 'batch_complete') {
    console.log('Batch finished:', msg.data.status);
  }
};

// Request current status
ws.send('status');
```

### Database Queries

```sql
-- View recent batches
SELECT id, status, total_files, successful_files, failed_files, created_at
FROM upload_batches
ORDER BY created_at DESC
LIMIT 10;

-- View templates
SELECT id, user_id, name, use_count, last_used_at
FROM batch_templates
ORDER BY use_count DESC;

-- View batch failures
SELECT batch_id, filename, error_message, failure_reason
FROM upload_failures
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- Analytics query
SELECT
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_seconds
FROM upload_batches
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY status;
```

---

## 🔧 Configuration

### Environment Variables

Add to `.env` file:

```bash
# Batch Upload Limits
BATCH_RATE_LIMIT=5              # Max concurrent batches per user
BATCH_FILE_LIMIT=100            # Max files per batch
BATCH_SIZE_LIMIT=524288000      # Max total size (500MB)

# Cleanup Settings
BATCH_RETENTION_DAYS=30         # Days to keep old batches
CLEANUP_SCHEDULE_HOUR=3         # UTC hour for daily cleanup

# Celery Settings
CELERY_TASK_MAX_RETRIES=3
CELERY_TASK_RETRY_BACKOFF=True
CELERY_BROKER_URL=redis://redis:6379/0
```

### Celery Beat Schedule

Edit `app/workers/celery_app.py`:

```python
beat_schedule = {
    'cleanup-old-batches-daily': {
        'task': 'workers.batch_upload_tasks.cleanup_old_batches',
        'schedule': crontab(hour=3, minute=0),  # 3 AM UTC
        'args': (30,)  # 30 days retention
    }
}
```

---

## 🐛 Troubleshooting

### Batch Not Processing

**Check Celery worker is running:**
```bash
docker compose ps celery_worker
```

**View worker logs:**
```bash
docker compose logs celery_worker --tail=50
```

**Restart worker:**
```bash
docker compose restart celery_worker
```

### Files Not Uploading to MinIO

**Check MinIO is accessible:**
```bash
curl http://localhost:9020/minio/health/live
```

**View MinIO logs:**
```bash
docker compose logs minio --tail=50
```

**Access MinIO console:**
Open http://localhost:9021 (admin/password)

### Templates Not Loading

**Check database connection:**
```bash
docker compose exec api python -c "from models.database import SessionLocal; db = SessionLocal(); print('DB OK')"
```

**Verify table exists:**
```bash
docker compose exec postgis_db psql -U postgres -d impact_db -c "\d batch_templates"
```

### Progress Not Updating

**Check Redis is running:**
```bash
docker compose ps redis
```

**Test Celery task execution:**
```bash
docker compose exec celery_worker celery -A workers.celery_app inspect active
```

---

## 📊 Monitoring

### Key Metrics to Watch

1. **Success Rate**: Should be >95%
2. **Processing Time**: Should be <2 minutes for 100 files
3. **Worker Utilization**: Should be <80%
4. **Redis Memory**: Should be <1GB
5. **MinIO Storage**: Monitor growth rate

### Flower Dashboard

Access: http://localhost:5555

**Features:**
- Active tasks
- Worker status
- Task history
- Success/failure rates
- Processing times

### Database Monitoring

```sql
-- Batch success rate
SELECT
  COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / COUNT(*) as success_rate
FROM upload_batches
WHERE created_at > NOW() - INTERVAL '7 days';

-- Average processing time
SELECT
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_seconds
FROM upload_batches
WHERE completed_at IS NOT NULL
  AND created_at > NOW() - INTERVAL '7 days';

-- Template usage
SELECT name, use_count
FROM batch_templates
ORDER BY use_count DESC
LIMIT 10;
```

---

## 🎯 Best Practices

### For Users
1. **Use templates** for repeated workflows (saves time)
2. **Check file sizes** before upload (max 50MB each)
3. **Fill metadata completely** for better organization
4. **Use retry** for partial failures (no need to re-upload all)
5. **Monitor analytics** to track your upload patterns

### For Developers
1. **Always test in dev** before production deploy
2. **Monitor Celery queue** for backlogs
3. **Set up alerts** for high failure rates
4. **Review logs regularly** for errors
5. **Keep tests updated** when adding features
6. **Document API changes** in openapi.yaml
7. **Use migrations** for schema changes (never manual SQL)

### For Operators
1. **Monitor disk space** (MinIO storage)
2. **Check Celery beat** is running (scheduled cleanup)
3. **Review analytics weekly** for trends
4. **Back up database** before migrations
5. **Scale workers** if queue grows
6. **Update retention policy** based on storage

---

## 🆘 Support

### Common Issues

**"Too many requests" error**
- Wait for other batches to complete
- Rate limit is 5 concurrent batches

**"File too large" error**
- Compress images before upload
- Max 50MB per file

**"Batch failed" status**
- Check failure details in UI
- Review error logs
- Use retry button

**Template not applying**
- Verify all required fields in template
- Check template is not corrupted
- Try deleting and recreating

---

## 📞 Quick Links

- **Upload Page**: http://localhost:3000/upload
- **Flower Dashboard**: http://localhost:5555
- **MinIO Console**: http://localhost:9021
- **API Docs**: http://localhost:8000/docs
- **GitHub Repo**: https://github.com/kishkumar96/impact-database

---

**Last Updated**: January 7, 2026
**Version**: 2.0.0
**Status**: Production Ready ✅

# Smoke Test Checklist

This checklist validates that both **development** and **production** Docker stacks work correctly after the Docker/DevOps refactoring.

---

## Prerequisites

1. Ensure `.env` file exists in the project root:
   ```bash
   cd /workspaces/impact-database
   cp .env.example .env
   ```

2. Stop any running containers:
   ```bash
   ./docker-stop.sh
   ```

---

## 🔧 Development Mode Tests

### Step 1: Start Dev Stack

```bash
./docker-start.sh --dev
```

**What to look for:**
- Script should print: `🚀 Starting Impact Database in DEVELOPMENT mode...`
- All services should start with status `Up` or `healthy`

### Step 2: Verify Container Status

```bash
docker compose ps
```

**What to look for:**
- `web` (API): Should show `Up` and healthy, exposed on port `8001`
- `frontend`: Should show `Up`, exposed on port `3001`
- `worker`: Should show `Up` and healthy
- `beat`: Should show `Up` and healthy
- `postgis_db`: Should show `Up (healthy)`, exposed on port `5433`
- `redis`: Should show `Up (healthy)`, exposed on port `6380`
- `minio`: Should show `Up (healthy)`, exposed on ports `9000` and `9001`
- `flower`: Should show `Up`, exposed on port `5555`

**Common error symptoms:**
- ❌ **Restarting/flapping**: Check logs with `docker compose logs [service]`
- ❌ **Unhealthy**: Database connection or MinIO bucket issues
- ❌ **Exited**: Configuration error or missing environment variable

### Step 3: Check API Configuration

```bash
docker compose logs web | grep -i reload
```

**What to look for:**
- Should see `--reload` flag indicating hot-reload is enabled in dev mode
- Example: `Uvicorn running with reload enabled`

### Step 4: Verify Service Logs (No Errors)

```bash
docker compose logs --tail=50 web
docker compose logs --tail=50 worker
docker compose logs --tail=50 beat
```

**What to look for:**
- ✅ `web`: Should show API server started successfully
- ✅ `worker`: Should show "Connected to Redis" and "ready to process tasks"
- ✅ `beat`: Should show "Scheduler: Starting..." and no migration errors
- ❌ **Red flags**: Connection failures, permission errors, migration failures

---

## 🏭 Production Mode Tests

### Step 5: Stop Dev Stack and Start Prod Stack

```bash
./docker-stop.sh
./docker-start.sh --prod
```

**What to look for:**
- Script should print: `🚀 Starting Impact Database in PRODUCTION mode...`
- All services should start with status `Up` or `healthy`

### Step 6: Verify Container Status

```bash
docker compose ps
```

**What to look for:**
- `web` (API): Should show `Up` and healthy, exposed on port `8000`
- `frontend`: Should show `Up`, exposed on port `3000`
- `worker`: Should show `Up` and healthy
- `beat`: Should show `Up` and healthy
- `postgis_db`: Should show `Up (healthy)`, exposed on port `5432`
- `redis`: Should show `Up (healthy)`, exposed on port `6379`
- `minio`: Should show `Up (healthy)`
- `flower`: Should show `Up`, exposed on port `5555`

### Step 7: Check API Configuration (No Reload)

```bash
docker compose logs web | grep -i reload
```

**What to look for:**
- Should **NOT** see `--reload` flag in production
- API should run without hot-reload for performance

### Step 8: Verify Frontend Build (Production)

```bash
docker compose logs frontend | grep -E "(compiled|ready|started)"
```

**What to look for:**
- Should see production build serving optimized static files
- Example: `Server started on http://0.0.0.0:3000` or similar

### Step 9: Check Workers Don't Rerun Migrations

```bash
docker compose logs worker | grep -i migrat
docker compose logs beat | grep -i migrat
```

**What to look for:**
- ✅ Workers should **NOT** re-run database migrations in production
- ❌ **Red flag**: If you see migration messages, check `entrypoint.sh` logic

---

## 🌐 Browser / HTTP Endpoint Tests

### Test 1: Backend Health Check

**Dev Mode:**
```bash
curl -s http://localhost:8001/health | jq
```

**Prod Mode:**
```bash
curl -s http://localhost:8000/health | jq
```

**Expected Response:**
```json
{
  "status": "healthy",
  "environment": "development",  // or "production"
  "redis_configured": true,
  "database_configured": true
}
```

**What to look for:**
- ✅ HTTP 200 status
- ✅ `status: "healthy"`
- ❌ **Red flags**: HTTP 500, connection errors, false for redis/database

---

### Test 2: API Documentation (Dev Only)

**Dev Mode Only:**
- Open: http://localhost:3001 (wait for Next.js to compile)
- Open: http://localhost:8001/docs

**Prod Mode:**
- Documentation should be **disabled** at http://localhost:8000/docs (returns 404)

**What to look for:**
- ✅ Dev: Swagger UI loads successfully
- ✅ Prod: `/docs` returns 404 or redirect (security best practice)

---

### Test 3: Frontend Homepage

**Dev Mode:**
- Open: http://localhost:3001

**Prod Mode:**
- Open: http://localhost:3000

**What to look for:**
- ✅ Homepage loads without errors
- ✅ No console errors in browser DevTools
- ❌ **Red flags**: 502 Bad Gateway, connection refused, blank page

---

### Test 4: Upload Endpoint (API)

**Dev Mode:**
```bash
curl -X POST http://localhost:8001/upload/upload \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/path/to/test/image.jpg" \
  -F "title=Smoke Test Image" \
  -F "event_type=cyclone" | jq
```

**Prod Mode:**
```bash
curl -X POST http://localhost:8000/upload/upload \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/path/to/test/image.jpg" \
  -F "title=Smoke Test Image" \
  -F "event_type=cyclone" | jq
```

**What to look for:**
- ✅ HTTP 200 or 201 status
- ✅ JSON response with image metadata and `filename`
- ❌ **Red flags**: HTTP 500, MinIO connection errors, validation errors

**Note:** Replace `/path/to/test/image.jpg` with an actual test image path, or create a dummy test image:
```bash
# Create a test image if you don't have one
convert -size 100x100 xc:blue /tmp/test_image.jpg  # Requires ImageMagick
# OR use Python:
python3 -c "from PIL import Image; Image.new('RGB', (100, 100), 'blue').save('/tmp/test_image.jpg')"
```

---

### Test 5: Upload via Frontend (UI Flow)

**Dev Mode:**
1. Navigate to: http://localhost:3001/upload
2. Fill in the upload form:
   - Select a test image file
   - Enter title, event type, location, etc.
3. Click **Submit**
4. Verify success message appears

**Prod Mode:**
1. Navigate to: http://localhost:3000/upload
2. Repeat the same upload flow

**What to look for:**
- ✅ Form loads without errors
- ✅ File upload succeeds with success message
- ✅ Image appears in the image list/gallery
- ❌ **Red flags**: CORS errors in console, upload hangs, 500 errors

---

### Test 6: List Uploaded Images

**Dev Mode:**
- Navigate to: http://localhost:3001/images
- OR API: `curl http://localhost:8001/upload/images/recent | jq`

**Prod Mode:**
- Navigate to: http://localhost:3000/images
- OR API: `curl http://localhost:8000/upload/images/recent | jq`

**What to look for:**
- ✅ Previously uploaded image(s) appear in the list
- ✅ Thumbnails load correctly
- ✅ Image metadata displays properly
- ❌ **Red flags**: Empty list (if images were uploaded), 404 errors, broken thumbnails

---

### Test 7: MinIO Console (Object Storage)

**Both Modes:**
- Open: http://localhost:9001
- Login with credentials from `.env`:
  - Username: `minioadmin` (MINIO_ROOT_USER)
  - Password: `minioadmin` (MINIO_ROOT_PASSWORD)

**What to look for:**
- ✅ Login succeeds
- ✅ Bucket `impact-images` exists (or your custom MINIO_BUCKET_NAME)
- ✅ Uploaded images and thumbnails appear in the bucket
- ❌ **Red flags**: Bucket doesn't exist, empty bucket after uploads, permission errors

---

### Test 8: Flower (Celery Monitoring)

**Both Modes:**
- Open: http://localhost:5555

**What to look for:**
- ✅ Flower dashboard loads
- ✅ Shows active workers (should be at least 1)
- ✅ Tasks appear in the task list (if any were triggered)
- ❌ **Red flags**: No workers registered, connection errors

---

### Test 9: Database Connection (Optional)

**Dev Mode:**
```bash
docker exec -it impact-database-postgis_db-1 psql -U postgres -d impact_db -c "SELECT COUNT(*) FROM images;"
```

**Prod Mode:**
```bash
docker exec -it impact-database-postgis_db-1 psql -U postgres -d impact_db -c "SELECT COUNT(*) FROM images;"
```

**What to look for:**
- ✅ Query succeeds and returns row count
- ❌ **Red flags**: Connection refused, relation does not exist (migrations didn't run)

---

## 🔄 Workflow Integration Test ("Hello World" Flow)

This end-to-end test validates the entire stack in either mode.

### Complete Flow:

1. **Start the stack** (dev or prod mode)
2. **Check health endpoint** (Step 1 in Browser Tests)
3. **Upload a test image** via frontend (Step 5 in Browser Tests)
4. **Verify image appears** in the list (Step 6 in Browser Tests)
5. **Check MinIO** to confirm object was stored (Step 7 in Browser Tests)
6. **Check Flower** to confirm Celery tasks ran (Step 8 in Browser Tests)

**Success Criteria:**
- ✅ All services start cleanly
- ✅ Image uploads successfully
- ✅ Image appears in frontend gallery
- ✅ Image and thumbnail exist in MinIO
- ✅ No errors in any service logs

---

## 📝 Summary Checklist

Use this quick checklist to validate both modes:

### Dev Mode (--dev)

- [ ] All containers start and reach `Up (healthy)` status
- [ ] API runs with `--reload` enabled (hot reload)
- [ ] Frontend accessible at `http://localhost:3001`
- [ ] Backend accessible at `http://localhost:8001`
- [ ] `/health` endpoint returns `{"status": "healthy"}`
- [ ] API docs available at `http://localhost:8001/docs`
- [ ] Image upload succeeds via API and frontend
- [ ] Uploaded image appears in MinIO bucket
- [ ] Workers and beat scheduler are running
- [ ] No errors in service logs

### Prod Mode (--prod)

- [ ] All containers start and reach `Up (healthy)` status
- [ ] API runs **without** `--reload` (no hot reload)
- [ ] Frontend accessible at `http://localhost:3000`
- [ ] Backend accessible at `http://localhost:8000`
- [ ] `/health` endpoint returns `{"status": "healthy"}`
- [ ] API docs **disabled** at `http://localhost:8000/docs` (404)
- [ ] Image upload succeeds via API and frontend
- [ ] Uploaded image appears in MinIO bucket
- [ ] Workers don't re-run migrations
- [ ] No errors in service logs

---

## 🛠️ Troubleshooting Tips

### Problem: Containers keep restarting
**Solution:** Check logs with `docker compose logs [service]` to identify the root cause (usually DB connection, MinIO, or missing env vars).

### Problem: "Connection refused" errors
**Solution:** 
- Ensure services are fully started (wait 30-60 seconds after `docker compose up`)
- Check `docker compose ps` to verify all services are `Up`
- Verify ports aren't already in use: `netstat -tuln | grep -E "3000|3001|8000|8001"`

### Problem: Upload fails with MinIO errors
**Solution:**
- Check MinIO is running: `docker compose logs minio`
- Verify bucket exists in MinIO console (http://localhost:9001)
- Check MINIO_BUCKET_NAME in `.env` matches bucket name

### Problem: Frontend shows CORS errors
**Solution:**
- Verify `BACKEND_CORS_ORIGINS` in `.env` includes frontend URLs
- Check `docker compose logs web` for CORS-related logs
- Ensure frontend uses correct backend URL (check `NEXT_PUBLIC_API_URL` if defined)

### Problem: Workers not processing tasks
**Solution:**
- Check Redis is running: `docker compose logs redis`
- Verify `REDIS_URL` in `.env` is correct
- Check worker logs: `docker compose logs worker`

---

## 🎯 Final Validation

After running all tests successfully in **both dev and prod modes**, you can be confident that:

1. ✅ Docker Compose orchestration works correctly
2. ✅ Port mappings are correct for both modes
3. ✅ Environment separation (dev/prod) is functioning
4. ✅ API hot-reload works in dev, disabled in prod
5. ✅ All services communicate properly (API, DB, Redis, MinIO, Workers)
6. ✅ End-to-end workflows (upload → storage → display) work
7. ✅ Health checks and monitoring are operational

**Your Docker refactoring is production-ready! 🚀**

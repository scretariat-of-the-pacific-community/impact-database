# MVP Readiness Plan

## Current Status: 80% Complete ✅

### What's Working:
- ✅ Backend API (FastAPI)
- ✅ Authentication & JWT tokens  
- ✅ RBAC system (roles & permissions)
- ✅ Review workflow (80% tests passing)
- ✅ Database schema & migrations
- ✅ Docker configuration
- ✅ Redis & MinIO configured

### Critical Issues (Blocking MVP):

## 🚨 PRIORITY 1: Start All Services

**Problem**: All containers are stopped
**Impact**: Nothing works
**Fix**:
```bash
cd /home/kishank/impact-database

# Start infrastructure first
docker compose up -d postgis_db redis minio

# Wait 30 seconds, then start application
docker compose up -d api frontend celery_worker celery_beat flower
```

**Verification**:
```bash
docker compose ps
# All services should show "Up" or "healthy"

curl http://localhost:8000/health
curl http://localhost:3000
```

---

## 🔧 PRIORITY 2: Fix Database Schema

**Problem**: `image_metadata` table missing `file_size` column
**Impact**: Review workflow tests fail, image uploads may break
**Fix**:
```bash
# Option 1: Add column directly
docker compose exec -T postgis_db psql -U postgres -d impact_db << 'EOF'
ALTER TABLE image_metadata 
ADD COLUMN IF NOT EXISTS file_size INTEGER;
EOF

# Option 2: Create proper migration
cd app
alembic revision -m "add_file_size_to_image_metadata"
# Edit the migration file to add the column
alembic upgrade head
```

**Verification**:
```bash
docker compose exec -T postgis_db psql -U postgres -d impact_db \
  -c "\d image_metadata" | grep file_size
```

---

## 🌐 PRIORITY 3: Verify Frontend Works

**Problem**: Frontend not tested/accessible
**Impact**: No UI for users
**Fix**:
```bash
# Ensure frontend is running
docker compose up -d frontend

# Check frontend logs
docker compose logs frontend --tail 50

# Test access
curl -I http://localhost:3000
```

**Verification**:
- Open http://localhost:3000 in browser
- Should see homepage without errors
- Check browser console for errors

---

## 📤 PRIORITY 4: End-to-End Upload Test

**Problem**: Need to verify complete upload workflow
**Impact**: Core functionality validation
**Test**:
```bash
# 1. Upload via API
curl -X POST http://localhost:8000/upload/upload \
  -H "Content-Type: multipart/form-data" \
  -F "file=@app/hazard_test_images/flood_1.jpg" \
  -F "hazard_type=flood" \
  -F "location=Test Location" \
  -F "country=FJ"

# 2. Verify in MinIO
# Open http://localhost:9020 (minioadmin/minioadmin)
# Check bucket "impact-images"

# 3. Verify in database
docker compose exec -T postgis_db psql -U postgres -d impact_db \
  -c "SELECT id, filename, hazard_type FROM image_metadata ORDER BY datetime DESC LIMIT 5;"
```

---

## 🧪 PRIORITY 5: Run MVP Smoke Tests

**Test Suite**:
```bash
# 1. Health checks
curl http://localhost:8000/health
curl http://localhost:8000/api/v1/review-items/health

# 2. Authentication
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 3. Review workflow
./verify_review_workflow.sh

# 4. RBAC
./verify_rbac.sh

# 5. Run pytest
cd tests
pytest test_mvp.py -v
```

---

## 📊 MVP Success Criteria

### Core Functionality (Must Have):
- [ ] All Docker services running and healthy
- [ ] Database schema complete (no missing columns)
- [ ] Authentication works (login returns JWT)
- [ ] Image upload succeeds (API + UI)
- [ ] Images stored in MinIO
- [ ] Images listed in database
- [ ] Frontend accessible and functional
- [ ] Review workflow operational (95%+ tests pass)
- [ ] RBAC permissions enforced

### User Workflows (Must Have):
- [ ] User can login
- [ ] User can upload image via UI
- [ ] User can view uploaded images
- [ ] Admin can assign reviews
- [ ] Reviewer can approve/reject images
- [ ] Audit trail logs all actions

### Nice to Have (Can defer):
- [ ] STAC API endpoints
- [ ] Advanced search/filtering
- [ ] Email notifications
- [ ] Analytics dashboard
- [ ] Mobile app integration

---

## 🚀 MVP Launch Steps

### Step 1: Fix Critical Issues (30 min)
```bash
# 1. Start services
docker compose up -d

# 2. Fix database schema
docker compose exec -T postgis_db psql -U postgres -d impact_db \
  -c "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS file_size INTEGER;"

# 3. Restart API to load changes
docker compose restart api
```

### Step 2: Verify Core Functionality (15 min)
```bash
# Run verification scripts
./verify_review_workflow.sh
./verify_rbac.sh

# Check all services
docker compose ps
```

### Step 3: Test User Workflows (15 min)
1. Open http://localhost:3000
2. Login as admin
3. Upload test image
4. Verify image appears
5. Create review item
6. Assign and complete review

### Step 4: Documentation Check (10 min)
- [ ] README has clear setup instructions
- [ ] Environment variables documented
- [ ] API endpoints documented
- [ ] User guide available

---

## 📝 Post-MVP Improvements

### Phase 2 (Next Sprint):
- Complete STAC API implementation
- Advanced filtering and search
- Batch upload capability
- Export functionality
- Performance optimization

### Phase 3 (Future):
- Mobile app
- Real-time collaboration
- Advanced analytics
- Machine learning integration
- Third-party integrations

---

## 🆘 Known Issues & Workarounds

### Issue 1: Port conflicts
**Symptom**: Services won't start
**Fix**: 
```bash
sudo netstat -tulpn | grep -E "3000|8000"
# Kill conflicting processes
```

### Issue 2: Database connection errors
**Symptom**: "connection refused"
**Fix**: 
```bash
docker compose restart postgis_db
# Wait 30 seconds
docker compose restart api
```

### Issue 3: MinIO bucket not found
**Symptom**: Upload fails with S3 error
**Fix**: 
```bash
# Access MinIO console: http://localhost:9020
# Create bucket "impact-images" manually
# Or restart MinIO: docker compose restart minio
```

---

## 📞 Support Checklist

Before claiming MVP is complete:
- [ ] All services start without errors
- [ ] All verification scripts pass
- [ ] At least one complete user workflow tested
- [ ] Documentation reviewed and accurate
- [ ] Known issues documented
- [ ] Rollback plan in place

---

## ✅ MVP Sign-Off

**Date**: _______
**Tester**: _______
**Status**: [ ] PASS  [ ] FAIL
**Notes**: 
_________________________________

**Next Actions**:
_________________________________

# Curation Queue Empty Diagnostics & Troubleshooting Guide

## Overview
The `/api/admin/curation/queue` endpoint can legitimately return empty results even when content exists in the database. This guide explains the four main causes and how to diagnose them.

## Four Main Root Causes

### 1️⃣ Empty `curation_queue` Table
**Symptom**: Queue endpoint returns `{ items: [], total: 0 }`  
**Root Cause**: The `curation_queue` table was never populated after schema fixes or database migrations

**Diagnosis**:
```bash
# Run the diagnostic script
bash diagnose_curation_queue.sh

# Or check manually
docker-compose exec -T postgis_db psql -U postgres -d impact_db -c \
  "SELECT COUNT(*) FROM curation_queue;"
```

**Solution**:
```bash
# Option 1: Use the populate script (idempotent, safe to run multiple times)
python3 scripts/populate_curation_queue.py

# Option 2: Run full database fixes
bash fix_database.sh

# Option 3: Manually insert from image metadata
docker-compose exec -T postgis_db psql -U postgres -d impact_db -c """
INSERT INTO curation_queue (id, content_type, content_id, status, submitted_by, created_at, updated_at, is_deleted)
SELECT uuid_generate_v4(), 'image', id, 'pending', uploader_id, created_at, updated_at, false
FROM image_metadata
WHERE id NOT IN (SELECT content_id FROM curation_queue WHERE content_type = 'image');
"""
```

---

### 2️⃣ Role-Based Filtering Excludes Everything
**Symptom**: Queue endpoint returns empty, but you can verify data exists in the database  
**Root Cause**: User's role restricts visibility, silently filtering all items

#### Role Visibility Rules:
- **Admin**: Sees all items (or can use `?show_all=true`)
- **Curator**: Sees only:
  - Unassigned items (`assigned_to IS NULL`)
  - Items assigned to themselves (`assigned_to = :user_id`)
- **Contributor**: Sees only their own submissions (`submitted_by = :user_id`)

**Diagnosis**:
```bash
# Check your user role
docker-compose exec -T postgis_db psql -U postgres -d impact_db -c """
SELECT u.email, r.name as role FROM users u
LEFT JOIN roles r ON u.role_id = r.id
WHERE u.email = 'your@email.com';
"""

# Check queue distribution by role
docker-compose exec -T postgis_db psql -U postgres -d impact_db -c """
SELECT r.name as role, COUNT(cq.id) as queue_count
FROM curation_queue cq
LEFT JOIN users u ON cq.submitted_by = u.id
LEFT JOIN roles r ON u.role_id = r.id
WHERE COALESCE(cq.is_deleted, false) = false
GROUP BY r.name;
"""

# Check unassigned items (visible to curators)
docker-compose exec -T postgis_db psql -U postgres -d impact_db -c """
SELECT COUNT(*) FROM curation_queue
WHERE COALESCE(is_deleted, false) = false AND assigned_to IS NULL;
"""
```

**Solution**:
- If you're a curator/contributor, ensure items are unassigned or assigned to you
- If you're an admin, use `?show_all=true` parameter:
  ```
  GET /api/admin/curation/queue?show_all=true
  ```
- Change user role to admin for full visibility (in database):
  ```bash
  docker-compose exec -T postgis_db psql -U postgres -d impact_db -c """
  UPDATE users SET role_id = 1 WHERE email = 'your@email.com';
  """
  ```

---

### 3️⃣ All Items Soft-Deleted
**Symptom**: Queue endpoint returns empty  
**Root Cause**: All items have `is_deleted = true` and endpoint defaults to `show_deleted=false`

**Diagnosis**:
```bash
# Check delete status distribution
docker-compose exec -T postgis_db psql -U postgres -d impact_db -c """
SELECT 
    CASE WHEN COALESCE(is_deleted, false) THEN 'DELETED' ELSE 'ACTIVE' END as status,
    COUNT(*) as count
FROM curation_queue
GROUP BY COALESCE(is_deleted, false);
"""

# Check for null is_deleted values (common issue)
docker-compose exec -T postgis_db psql -U postgres -d impact_db -c """
SELECT COUNT(*) FROM curation_queue WHERE is_deleted IS NULL;
"""
```

**Solution**:
- Show deleted items by adding `?show_deleted=true`:
  ```
  GET /api/admin/curation/queue?show_deleted=true
  ```
- Or undelete items if they were soft-deleted by mistake:
  ```bash
  docker-compose exec -T postgis_db psql -U postgres -d impact_db -c """
  UPDATE curation_queue SET is_deleted = false WHERE is_deleted = true;
  """
  ```
- Fix NULL `is_deleted` values (defaults to false in filter):
  ```bash
  docker-compose exec -T postgis_db psql -U postgres -d impact_db -c """
  UPDATE curation_queue SET is_deleted = false WHERE is_deleted IS NULL;
  """
  ```

---

### 4️⃣ SQL Error in Handler (Silent Catch-All)
**Symptom**: Queue returns empty with no error in response  
**Root Cause**: Handler catches all exceptions and returns empty queue as fallback

**Diagnosis**:
Check the API logs for actual error messages:

```bash
# View recent API logs (production safe)
docker-compose logs api | grep -i "error in get_curation_queue" | tail -20

# View more detailed logs with context
docker-compose logs api | grep -A 5 "get_curation_queue" | tail -50

# Follow logs in real-time
docker-compose logs -f api 2>&1 | grep -i "curation"
```

**Error Handling Code** (in `app/api/curation.py`):
```python
try:
    # ... queue query logic
except Exception as e:
    logger.error(f"Error in get_curation_queue: {str(e)}", exc_info=True)
    logger.error(f"User role: {user_role}, Show deleted: {show_deleted}")
    
    # Development: raise error; Production: return empty
    if os.getenv("ENVIRONMENT") == "development":
        raise HTTPException(status_code=500, detail=f"Curation queue error: {str(e)}")
    return PaginatedCurationResponse(items=[], total=0, ...)
```

**Solution**:
1. Enable development mode to see actual errors:
   ```bash
   export ENVIRONMENT=development
   docker-compose restart api
   ```
2. Check API startup logs:
   ```bash
   docker-compose logs api | head -100
   ```
3. Look for SQL syntax errors, missing columns, connection issues
4. Verify database migrations have run:
   ```bash
   bash fix_database.sh
   docker-compose restart api
   ```

---

## Comprehensive Troubleshooting Flowchart

```
Queue returns empty
    ↓
1. Run: bash diagnose_curation_queue.sh
    ↓
    ├─ Total records = 0?
    │  └─ YES: RUN populate_curation_queue.py → fix_database.sh → restart api
    │  └─ NO: Check next step
    ↓
2. Is user logged in as ADMIN?
    ├─ NO: Either:
    │   • Login as admin, OR
    │   • Check if items are unassigned/assigned-to-you (curator), OR
    │   • Check if items are your submissions (contributor)
    │  └─ NO APPLICABLE ITEMS: Empty is correct behavior
    ├─ YES: Continue
    ↓
3. All items soft-deleted (is_deleted = true)?
    ├─ YES: Use ?show_deleted=true to view, OR run:
    │       UPDATE curation_queue SET is_deleted = false
    ├─ NO: Continue
    ↓
4. Check API error logs
    ├─ docker-compose logs api | grep "error in get_curation_queue"
    ├─ If errors found: Fix them, restart API
    ├─ No errors: Database query should succeed
    ↓
5. Still failing?
    ├─ Run: bash fix_database.sh
    ├─ Restart: docker-compose restart
    ├─ Verify tables exist: \d curation_queue
    ├─ Test connection: docker-compose exec postgis_db psql -U postgres -d impact_db -c "SELECT 1"
```

---

## Quick Fixes

### One-Liner Diagnostic
```bash
bash diagnose_curation_queue.sh
```

### Quick Populate (if empty)
```bash
python3 scripts/populate_curation_queue.py
docker-compose restart api
```

### Quick Fixes (run all)
```bash
bash fix_database.sh
python3 scripts/populate_curation_queue.py
docker-compose restart api
bash diagnose_curation_queue.sh
```

### Check What User Sees
Replace `YOUR_EMAIL` with your email:
```bash
docker-compose exec -T postgis_db psql -U postgres -d impact_db -c """
WITH user_info AS (
  SELECT id, email, role_id FROM users WHERE email = 'YOUR_EMAIL'
)
SELECT 
  cq.id,
  cq.content_type,
  cq.status,
  CASE 
    WHEN (SELECT role_id FROM user_info) = 1 THEN 'VISIBLE (admin)'
    WHEN (SELECT role_id FROM user_info) IN (2, 3) 
      AND (cq.assigned_to IS NULL OR cq.assigned_to = (SELECT id FROM user_info))
      THEN 'VISIBLE (curator - unassigned or self-assigned)'
    WHEN (SELECT role_id FROM user_info) = 4 AND cq.submitted_by = (SELECT id FROM user_info)
      THEN 'VISIBLE (contributor - own submission)'
    ELSE 'HIDDEN (role restrictions)'
  END as visibility
FROM curation_queue cq
WHERE COALESCE(cq.is_deleted, false) = false
LIMIT 10;
"""
```

---

## API Testing

### Test with Admin Override
```bash
curl -H "Authorization: Bearer YOUR_JWT" \
  "http://localhost:8000/api/admin/curation/queue?show_all=true"
```

### Test with Deleted Items Shown
```bash
curl -H "Authorization: Bearer YOUR_JWT" \
  "http://localhost:8000/api/admin/curation/queue?show_deleted=true"
```

### Test with Pagination
```bash
curl -H "Authorization: Bearer YOUR_JWT" \
  "http://localhost:8000/api/admin/curation/queue?page=1&page_size=50"
```

### Test with Filters
```bash
curl -H "Authorization: Bearer YOUR_JWT" \
  "http://localhost:8000/api/admin/curation/queue?status=pending&priority=high"
```

---

## References

- **Database Script**: `scripts/populate_curation_queue.py`
- **Diagnostic Script**: `diagnose_curation_queue.sh`
- **API Handler**: `app/api/curation.py` (function: `get_curation_queue()`)
- **Frontend Component**: `frontend/src/components/CurationQueue.tsx`
- **Database Fixes**: `fix_database.sh`, `create_user_data_tables.sql`

---

## Common Issues & Solutions

| Issue | Root Cause | Solution |
|-------|-----------|----------|
| "No items in queue" (UI) | Queue table empty | `python3 scripts/populate_curation_queue.py` |
| Empty queue as curator | No unassigned items | Ask admin to unassign some items |
| Empty queue as contributor | No own submissions | Upload content first |
| Queue was full, now empty | Items soft-deleted | Use `?show_deleted=true` or restore with SQL |
| API returns 500 error | SQL error in handler | Check logs: `docker-compose logs api` |
| NULL values in is_deleted | Missing backfill | `UPDATE curation_queue SET is_deleted = false WHERE is_deleted IS NULL` |

---

## Next Steps

1. **Run Diagnostics**: `bash diagnose_curation_queue.sh`
2. **Review Logs**: `docker-compose logs api | grep -i queue`
3. **Apply Fixes**: Follow solution in troubleshooting flowchart
4. **Verify**: Re-run diagnostics to confirm
5. **Document**: Note any issues for team


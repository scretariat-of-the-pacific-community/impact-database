# Profile Page Empty Data Investigation

## Issue
User "kishank" sees no data on profile page despite claiming to have made one upload.

## Root Cause Analysis

### Database Investigation
```sql
-- Check current user
SELECT id, username, email FROM users WHERE username = 'kishank';
-- Result: id=4137abd4-6c17-45fb-b94d-ce84cd4e785b, username=kishank

-- Check all uploads
SELECT uploader_id, COUNT(*) FROM image_metadata GROUP BY uploader_id;
-- Result: dev-user-id = 3 uploads

-- Check kishank's uploads  
SELECT * FROM image_metadata WHERE uploader_id = 'kishank';
-- Result: 0 rows

-- Check kishank's uploads by UUID
SELECT * FROM image_metadata WHERE uploader_id = '4137abd4-6c17-45fb-b94d-ce84cd4e785b';
-- Result: 0 rows
```

## Findings

✅ **User stats query is correct**: 
```python
# app/api/user.py:138
total_uploads = db.query(func.count(ImageMetadata.id)).filter(
    ImageMetadata.uploader_id == current_user.username  # 'kishank'
).scalar() or 0
```

✅ **Existing uploads are test data**:
- 3 uploads with `uploader_id = 'dev-user-id'`
- All dated Dec 14-17, 2025
- Filenames: DJI_0191.JPG, DJI_0192.JPG, DJI_0203.JPG

❌ **User "kishank" has NO actual uploads**:
- 0 uploads in database
- Profile correctly shows 0 total_uploads
- No data to display

## Possible Explanations

1. **User never actually uploaded** - They may have started but not completed
2. **Upload failed silently** - Error occurred but wasn't visible
3. **Upload went to wrong user** - Session/auth issue during upload
4. **Upload was deleted** - Successfully uploaded but later removed

## Verification Steps

### 1. Check if upload endpoint is working
```bash
# Test upload with current user
curl -X POST http://localhost:8000/api/upload \
  -H "Authorization: Bearer <kishank-token>" \
  -F "file=@test-image.jpg" \
  -F 'metadata_json={"hazard_type":"earthquake","location":"Test","datetime":"2025-12-19T00:00:00Z"}'
```

### 2. Check audit logs for upload attempts
```sql
SELECT * FROM audit_logs 
WHERE user_id = 'kishank' 
  AND table_name = 'image_metadata' 
  AND action = 'CREATE' 
ORDER BY timestamp DESC 
LIMIT 10;
```

### 3. Check recent activity
```sql
SELECT * FROM audit_logs 
WHERE user_id = 'kishank' 
ORDER BY timestamp DESC 
LIMIT 20;
```

## Solution Options

### Option 1: User needs to upload (Most Likely)
**If user never actually uploaded:**
1. User goes to upload page
2. Selects image file
3. Fills in metadata
4. Submits form
5. Wait for confirmation
6. Refresh profile page

### Option 2: Fix test data attribution
**If test uploads should belong to kishank:**
```sql
UPDATE image_metadata 
SET uploader_id = 'kishank' 
WHERE uploader_id = 'dev-user-id';
```

### Option 3: Check for failed uploads
**If upload failed silently:**
1. Check browser console for errors
2. Check network tab for failed requests
3. Check API logs for exceptions:
   ```bash
   docker compose logs api | grep -i error | tail -50
   ```

### Option 4: Investigate ID mismatch
**If there's an auth/session issue:**
- Check JWT token payload
- Verify `current_user.username` in upload handler
- Check if upload used UUID instead of username

## Testing Upload Flow

### Complete Upload Test
```bash
# 1. Login and get token
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"kishank","password":"kishank"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 2. Create test image
convert -size 800x600 xc:blue test-upload.jpg

# 3. Upload image
curl -X POST http://localhost:8000/api/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test-upload.jpg" \
  -F 'metadata_json={
    "hazard_type":"flood",
    "location":"Test Location",
    "datetime":"2025-12-19T10:00:00Z",
    "source_type":"field_observation"
  }'

# 4. Verify upload
curl -s http://localhost:8000/api/user/stats \
  -H "Authorization: Bearer $TOKEN" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Total uploads: {d[\"total_uploads\"]}')"

# 5. Check database
docker compose exec postgis_db psql -U postgres -d impact_db \
  -c "SELECT filename, uploader_id, status FROM image_metadata WHERE uploader_id = 'kishank';"
```

## Conclusion

**Status**: ✅ **Working as designed**

The profile page is correctly showing no data because user "kishank" has **0 uploads** in the database. The existing 3 uploads belong to 'dev-user-id' (test data).

**Next Steps**:
1. Verify user actually completed an upload (check browser/network logs)
2. If no upload exists, guide user to upload page
3. If upload should exist, check audit logs for what happened
4. If test data should be attributed to kishank, run UPDATE query

**Most Likely**: User started upload but didn't complete it, or never actually uploaded despite intending to.

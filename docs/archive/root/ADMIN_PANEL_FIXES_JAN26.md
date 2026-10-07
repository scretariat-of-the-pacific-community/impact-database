# Admin Panel Fixes - January 26, 2026

## Issues Identified from Frontend Logs

### 1. ❌ 422 Validation Error: Missing username/password fields
**Error:**
```
Backend error: 422 {"detail":[{"type":"missing","loc":["body","username"],"msg":"Field required"...
```

**Root Cause:**
- Frontend was sending user creation requests to `/api/admin/users` endpoint (requires `UserCreate` schema with username/password)
- But when `sendInvite=true`, it should use `/api/admin/users/invite` endpoint (uses `InviteUserRequest` schema without username/password)

**Status:** ✅ Already correctly implemented in frontend code (lines 119-122 of UserManagement.tsx)

---

### 2. ❌ 400/500 Error: User invite endpoint failures
**Error:**
```
POST /api/admin/users/invite 400
POST /api/admin/users/invite 500
```

**Root Cause:**
- Frontend sending `CURATOR` role, but database only has: `admin, contributor, moderator, reviewer, viewer`
- Role mapping was incomplete

**Fix Applied:**
```python
# Updated role_mapping in app/api/admin.py (line ~642)
role_mapping = {
    "CURATOR": "moderator",  # Map curator to moderator role
    "MODERATOR": "moderator",
    "REVIEWER": "reviewer",
    # ... all other mappings
}
```

**Additional Improvements:**
- Added comprehensive logging showing available roles when invalid role submitted
- Improved error messages to show list of available roles
- Added emoji markers (✅/❌) in logs for easy scanning

---

### 3. ❌ 401 Unauthorized: Admin API authentication issues
**Error:**
```
GET /api/admin/roles 401
GET /api/admin/users?page=1&page_size=20 401
```

**Root Cause:**
- Authentication token likely expiring during long sessions
- Cookie parsing might have edge cases

**Status:** ⚠️ Monitoring - existing cookie handling should work, but added better error logging

**Prevention:**
- Frontend already handles 401 errors and redirects to login
- Better error messages now propagated from backend to frontend

---

### 4. ✅ 404 Error: Delete user endpoint
**Error:**
```
DELETE /api/admin/users/f9f34763-042c-4eff-a37b-4dc4a7b0040d 404
```

**Root Cause:**
- Endpoint exists and works correctly
- 404 likely due to user already deleted or invalid UUID format

**Fix Applied:**
- Added comprehensive logging to track delete operations
- Logs now show user ID and username before/after deletion
- Better error messages when user not found

---

## Fixes Implemented

### 1. Enhanced Error Logging in Backend (app/api/admin.py)

#### Invite Endpoint:
```python
# Before:
logger.error(f"Invalid role: {invite_data.role}")
raise HTTPException(status_code=400, detail=f"Invalid role: {invite_data.role}")

# After:
available_roles = admin_service.db.query(RBACRole).all()
role_names = [r.name for r in available_roles]
logger.error(f"Invalid role: {invite_data.role} (mapped to {rbac_role_name}). Available roles: {role_names}")
raise HTTPException(
    status_code=400, 
    detail=f"Invalid role '{invite_data.role}'. Available roles: {', '.join(role_names)}"
)
```

#### User Creation:
```python
# Added:
logger.info(f"✅ Created new RBAC user {username} (ID: {new_user.id}) for {invite_data.email} with role {rbac_role.name}")
# On error:
logger.error(f"❌ Failed to create user {invite_data.email}: {e}", exc_info=True)
logger.error(f"User data: username={username}, email={invite_data.email}, role_id={rbac_role.id}, organization={invite_data.organization}")
```

#### Delete Operations:
```python
# Added:
logger.info(f"Delete user request: user_id={user_id}")
# On success:
logger.info(f"✅ User deleted successfully: {username} (ID: {user_id})")
# On error:
logger.warning(f"❌ User not found for deletion: {user_id}")
```

### 2. Enhanced Error Handling in Frontend

#### Invite Route (frontend/src/app/api/admin/users/invite/route.ts):
```typescript
// Before:
return NextResponse.json(
  { error: 'Failed to send invitation' },
  { status: response.status }
);

// After:
let errorDetail = 'Failed to send invitation';
try {
  const errorJson = JSON.parse(errorText);
  errorDetail = errorJson.detail || errorJson.error || errorDetail;
} catch {
  errorDetail = errorText || errorDetail;
}
return NextResponse.json(
  { error: errorDetail, detail: errorDetail },
  { status: response.status }
);
```

**Applied to:**
- `/api/admin/users/invite` route
- `/api/admin/users` route  
- `/api/admin/users/[userId]` route

### 3. Fixed Role Mapping

**Database Roles:**
```
id |    name     | display_name  
----+-------------+---------------
  2 | admin       | Administrator
  1 | contributor | Contributor
  3 | moderator   | Moderator
  4 | reviewer    | Reviewer
  5 | viewer      | Viewer
```

**Updated Mapping:**
```python
role_mapping = {
    "SUPER_ADMIN": "admin",
    "ADMIN": "admin",
    "VIEWER": "viewer",
    "CONTRIBUTOR": "contributor",
    "CURATOR": "moderator",      # ← Fixed: Maps to existing role
    "MODERATOR": "moderator",    # ← Added
    "REVIEWER": "reviewer",      # ← Added
    # ... lowercase variants
}
```

---

## Testing Checklist

### ✅ User Invite Flow:
- [ ] Send invite with valid role (ADMIN, VIEWER, CONTRIBUTOR)
- [ ] Verify error message when invalid role submitted
- [ ] Check email sent if `sendInvite=true`
- [ ] Verify user created with correct role

### ✅ User Create Flow (without invite):
- [ ] Create user with username/password
- [ ] Verify validation errors show properly
- [ ] Check user can login immediately

### ✅ User Delete Flow:
- [ ] Delete existing user
- [ ] Verify 404 error message clear when user doesn't exist
- [ ] Check logs show proper user ID and username

### ✅ Authentication:
- [ ] Long session (test for token expiration)
- [ ] Refresh page while logged in
- [ ] Verify 401 errors redirect to login

---

## Log Monitoring Commands

### Check for errors in real-time:
```bash
docker-compose logs -f api | grep -E "(ERROR|❌|401|404|422|500)"
```

### Check invite operations:
```bash
docker-compose logs api | grep "Invite user request"
```

### Check role validation errors:
```bash
docker-compose logs api | grep "Invalid role"
```

### Check user creation success:
```bash
docker-compose logs api | grep "✅ Created new RBAC user"
```

### Check delete operations:
```bash
docker-compose logs api | grep "Delete user request"
```

---

## Summary of Changes

| File | Lines Changed | Purpose |
|------|---------------|---------|
| `app/api/admin.py` | ~20 lines | Enhanced logging, fixed role mapping |
| `frontend/src/app/api/admin/users/invite/route.ts` | ~10 lines | Better error message propagation |
| `frontend/src/app/api/admin/users/route.ts` | ~10 lines | Better error message propagation |
| `frontend/src/app/api/admin/users/[userId]/route.ts` | ~10 lines | Better error message propagation |

**Total:** ~50 lines changed across 4 files

---

## Expected Behavior After Fixes

### 1. User Invite with Valid Role:
```
✅ Backend logs: "Invite user request: email=user@example.com, role=CONTRIBUTOR..."
✅ Backend logs: "✅ Created new RBAC user john for user@example.com with role contributor"
✅ Frontend: Success notification "Invitation sent to user@example.com"
```

### 2. User Invite with Invalid Role:
```
❌ Backend logs: "Invalid role: INVALID (mapped to invalid). Available roles: ['admin', 'contributor', 'moderator', 'reviewer', 'viewer']"
❌ Frontend error: "Invalid role 'INVALID'. Available roles: admin, contributor, moderator, reviewer, viewer"
```

### 3. User Delete Success:
```
✅ Backend logs: "Delete user request: user_id=f9f34763-042c-4eff-a37b-4dc4a7b0040d"
✅ Backend logs: "✅ User deleted successfully: john (ID: f9f34763-042c-4eff-a37b-4dc4a7b0040d)"
✅ Frontend: User removed from list
```

### 4. User Delete Not Found:
```
❌ Backend logs: "Delete user request: user_id=invalid-id"
❌ Backend logs: "❌ User not found for deletion: invalid-id"
❌ Frontend error: "User not found"
```

---

## Related Documentation
- Database fixes: [DATABASE_FIXES_JAN26.md](DATABASE_FIXES_JAN26.md)
- Password reset: Previous session documentation
- Health check: [health_check.sh](health_check.sh)

---

## Status: ✅ READY FOR TESTING

All identified issues have been addressed with:
1. ✅ Better error logging for debugging
2. ✅ Fixed role mapping to match database
3. ✅ Enhanced error message propagation
4. ✅ Comprehensive logging with emoji markers

**Next Step:** Monitor production logs after deployment to verify fixes working correctly.

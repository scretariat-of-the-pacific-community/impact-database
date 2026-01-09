# Curator Role & Workload Management Implementation

## Summary
Implemented a world-class content curation system with role-based access control, workload management, and auto-assignment capabilities.

## Changes Made

### 1. Database Schema ✅
**File**: `app/migrations/add_curator_role.sql`

- Added **curator** role (level 60) between admin and contributor
- Created curation-specific permissions:
  - `curation_queue:read` - View queue items
  - `curation_queue:claim` - Self-assign unassigned items
  - `curation_queue:update` - Update item status
  - `curation_queue:approve` - Approve items
  - `curation_queue:reject` - Reject items
  - `curation_queue:assign` - Assign to curators (admin only)
- Added performance indexes:
  - `idx_curation_queue_assigned_to` - For workload queries
  - `idx_curation_queue_status_priority` - For filtering
  - `idx_curation_queue_unassigned` - For finding claimable items

### 2. Role-Based Queue Filtering ✅
**File**: `app/api/curation.py` - Line 196

**Logic**:
- **Admin**: Sees all queue items (full oversight)
- **Curator**: Sees unassigned items + items assigned to them
- **Contributor**: Sees only their own submissions

**New Query Parameters**:
- `show_all=true` - Admin override to bypass role filtering

### 3. Workload Management ✅

#### Auto-Assignment System
**Function**: `_auto_assign_queue_item()`
- Finds curator with lowest current workload
- Balances work distribution automatically
- Logs assignment actions for audit

**Helper**: `_get_curator_with_lowest_workload()`
- Counts pending/under_review items per curator
- Returns curator with minimum workload

#### Manual Assignment Endpoints

**POST** `/api/admin/curation/queue/{item_id}/claim`
- **Permission**: `curation_queue:claim`
- **Who**: Curators
- **Action**: Self-assign unassigned item
- **Response**: Updated item with assignment

**POST** `/api/admin/curation/queue/{item_id}/assign`
- **Permission**: `curation_queue:assign`
- **Who**: Admins only
- **Params**: `curator_id`
- **Action**: Assign item to specific curator
- **Validation**: Verifies curator exists and has correct role

#### Curator List Endpoint

**GET** `/api/admin/curation/curators`
- Lists all curators with current workload
- Shows: `id`, `username`, `email`, `role`, `current_workload`
- Used for admin assignment UI

### 4. Model Updates ✅
**File**: `app/models/curation.py` - Line 107

Added `submittedAt` field alias in `CurationQueue.to_dict()`:
```python
"submittedAt": self.created_at.isoformat()  # Frontend compatibility
```

**File**: `app/api/curation.py` - Line 233
Added mapping for frontend sort parameter:
```python
if sort_by == "submittedAt":
    sort_field = "created_at"
```

### 5. Test Data ✅
**Script**: `create_curator_user.py`

Created test curator:
- Email: `curator@spc.int`
- Password: `curator123`
- Role: curator
- Assigned: 10 items for testing

## Usage Examples

### As Curator

**Login**:
```bash
POST /api/auth/login
{
  "email": "curator@spc.int",
  "password": "curator123"
}
```

**View My Queue** (unassigned + my items):
```bash
GET /api/admin/curation/queue
# Returns items where assigned_to is NULL or current user
```

**Claim an Item**:
```bash
POST /api/admin/curation/queue/{item_id}/claim
```

### As Admin

**View All Items**:
```bash
GET /api/admin/curation/queue?show_all=true
```

**Assign to Curator**:
```bash
POST /api/admin/curation/queue/{item_id}/assign
{
  "curator_id": "025eee6e-92ee-4999-932c-45d223e14f4f"
}
```

**List Curators with Workload**:
```bash
GET /api/admin/curation/curators
# Response:
[
  {
    "id": "...",
    "username": "curator_test",
    "email": "curator@spc.int",
    "role": "curator",
    "current_workload": 10
  }
]
```

## Database State

**Roles**:
- admin (level 90)
- curator (level 60) ← NEW
- contributor (level 30)
- reviewer (level 50) - kept for backwards compatibility

**Curation Queue**:
- Total items: 39
- Assigned to curator: 10
- Unassigned: 29

## Future Enhancements

### Priority 1
- [ ] Auto-assignment on image upload
- [ ] Specialization tags (hazard type, region)
- [ ] Workload capacity limits per curator

### Priority 2
- [ ] Quality control (senior curator spot-checks)
- [ ] Accuracy metrics tracking
- [ ] SLA monitoring (items aging >48hrs)

### Priority 3
- [ ] Consensus mode (multi-curator approval)
- [ ] Escalation workflow
- [ ] Burnout prevention (difficult content distribution)

## Testing

1. **Role-Based Filtering**:
   ```bash
   # Login as curator
   curl -X POST http://localhost:8000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"curator@spc.int","password":"curator123"}'

   # Get queue (should see 10 assigned + 29 unassigned = 39 total)
   curl http://localhost:8000/api/admin/curation/queue \
     -H "Cookie: ocean_portal_token=TOKEN"
   ```

2. **Workload Management**:
   ```bash
   # Get curators list
   curl http://localhost:8000/api/admin/curation/curators \
     -H "Cookie: ocean_portal_token=ADMIN_TOKEN"
   ```

3. **Claim Functionality**:
   ```bash
   # Find unassigned item
   curl http://localhost:8000/api/admin/curation/queue?assigned_to=null

   # Claim it
   curl -X POST http://localhost:8000/api/admin/curation/queue/{id}/claim \
     -H "Cookie: ocean_portal_token=CURATOR_TOKEN"
   ```

## Permissions Matrix

| Role | View All | View Assigned | View Unassigned | Claim | Assign | Approve/Reject |
|------|----------|---------------|-----------------|-------|--------|----------------|
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Curator | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Contributor | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

*Contributor can only see their own submissions*

## Migration Steps (Production)

1. **Backup database**
2. **Run migration**: `app/migrations/add_curator_role.sql`
3. **Restart API**: `docker restart impact-database-api-1`
4. **Update existing reviewers** (optional):
   ```sql
   UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'curator')
   WHERE role_id = (SELECT id FROM roles WHERE name = 'reviewer');
   ```
5. **Assign initial workload** to curators
6. **Test permissions** with each role

## Files Modified

- ✅ `app/api/curation.py` - Queue filtering, claim/assign endpoints, curator list
- ✅ `app/models/curation.py` - Added submittedAt alias
- ✅ `app/migrations/add_curator_role.sql` - New role and permissions
- ✅ `create_curator_user.py` - Test user creation script

## Verification Queries

```sql
-- Check roles
SELECT name, display_name, level FROM roles ORDER BY level DESC;

-- Check curator permissions
SELECT r.name, p.resource, p.action
FROM role_permissions rp
JOIN roles r ON rp.role_id = r.id
JOIN permissions p ON rp.permission_id = p.id
WHERE r.name = 'curator';

-- Check workload distribution
SELECT u.username, COUNT(cq.id) as assigned_items
FROM users u
LEFT JOIN curation_queue cq ON cq.assigned_to::uuid = u.id
WHERE u.role_id = (SELECT id FROM roles WHERE name = 'curator')
GROUP BY u.username;

-- Check unassigned items
SELECT COUNT(*) FROM curation_queue WHERE assigned_to IS NULL;
```

---
**Status**: ✅ Fully Implemented and Tested
**Date**: 2026-01-08

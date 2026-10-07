# Admin Panel API - Quick Reference (Post Phase 5)

## Authentication & Authorization

### User Types
1. **Native RBAC Users** - Created directly in RBAC system
2. **Migrated Users** - Originally from admin_users, now in RBAC

### Permission Levels
- `super_admin` - Full access to everything
- `admin` - Access to all admin panel features
- Other roles - No admin panel access

## API Endpoints

### Authentication
```bash
# Login
POST /api/auth/login
Body: {"username": "user", "password": "pass"}
Response: {"access_token": "...", "token_type": "bearer"}

# Get current user info
GET /api/rbac/auth/me
Headers: Authorization: Bearer {token}
```

### User Management

```bash
# List all admin users
GET /api/admin/users?page=1&page_size=50&search=query&role=admin
Headers: Authorization: Bearer {token}

# Get specific user
GET /api/admin/users/{user_id}
Headers: Authorization: Bearer {token}

# Update user
PUT /api/admin/users/{user_id}
Headers: Authorization: Bearer {token}
Body: {
  "full_name": "New Name",
  "email": "new@email.com",
  "organization": "Org Name",
  "is_active": true,
  "role": "admin"
}

# Lock user (deactivate)
POST /api/admin/users/{user_id}/lock
Headers: Authorization: Bearer {token}

# Unlock user (activate)
POST /api/admin/users/{user_id}/unlock
Headers: Authorization: Bearer {token}

# Delete user
DELETE /api/admin/users/{user_id}
Headers: Authorization: Bearer {token}

# Bulk actions
POST /api/admin/users/bulk-action
Headers: Authorization: Bearer {token}
Body: {
  "user_ids": ["uuid1", "uuid2"],
  "action": "lock" | "unlock" | "activate" | "deactivate" | "delete"
}
```

### Profile Management

```bash
# Get own profile
GET /api/admin/profile
Headers: Authorization: Bearer {token}

# Update own profile
PUT /api/admin/profile
Headers: Authorization: Bearer {token}
Body: {
  "full_name": "My Name",
  "organization": "My Org"
}

# Change password
POST /api/admin/change-password
Headers: Authorization: Bearer {token}
Body: {
  "current_password": "old",
  "new_password": "new"
}
```

### User Invitation

```bash
# Invite new user
POST /api/admin/users/invite
Headers: Authorization: Bearer {token}
Body: {
  "email": "user@example.com",
  "role": "admin",
  "sendInvite": true,
  "firstName": "First",
  "lastName": "Last",
  "organization": "Org"
}
```

## Database Schema (RBAC Users)

### Core Fields
```sql
users (
  id UUID PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  hashed_password VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role_id INTEGER REFERENCES roles(id),
  organization VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,
  can_access_admin_panel BOOLEAN DEFAULT false,
  is_super_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP
)
```

### Migration Tracking Fields
```sql
  migrated_from_admin BOOLEAN DEFAULT false,
  migration_date TIMESTAMP,
  legacy_admin_id VARCHAR(100),
  failed_login_attempts INTEGER DEFAULT 0,
  lockout_until TIMESTAMP,
  last_password_change TIMESTAMP,
  email_verification_token VARCHAR(255)
```

## Response Models

### UserResponse
```json
{
  "id": "uuid",
  "username": "string",
  "email": "string",
  "firstName": "string",
  "lastName": "string",
  "full_name": "string",
  "role": "admin",
  "permissions": ["permission1", "permission2"],
  "custom_permissions": [],
  "organization": "string",
  "isActive": true,
  "is_active": true,
  "isLocked": false,
  "is_locked": false,
  "lastLogin": "2026-01-26T00:00:00+00:00",
  "last_login": "2026-01-26T00:00:00+00:00",
  "createdAt": "2026-01-26T00:00:00+00:00",
  "created_at": "2026-01-26T00:00:00+00:00",
  "updated_at": "2026-01-26T00:00:00+00:00",
  "loginAttempts": 0,
  "is_verified": true,
  "position": null,
  "profilePicture": null
}
```

## Common Operations

### Creating Admin User (SQL)
```sql
-- 1. Create user in users table
INSERT INTO users (
  id, username, email, hashed_password, full_name,
  role_id, can_access_admin_panel, is_super_admin, is_active
) VALUES (
  gen_random_uuid(),
  'admin_user',
  'admin@example.com',
  '$2b$12$...', -- bcrypt hash
  'Admin User',
  (SELECT id FROM roles WHERE name = 'admin'),
  true,
  false,
  true
);
```

### Checking Migration Status
```sql
-- Users by type
SELECT 
  COUNT(*) FILTER (WHERE migrated_from_admin = true) as migrated_users,
  COUNT(*) FILTER (WHERE migrated_from_admin = false OR migrated_from_admin IS NULL) as native_users,
  COUNT(*) as total_users
FROM users
WHERE can_access_admin_panel = true;

-- Password rehashing progress
SELECT 
  username,
  migrated_from_admin,
  migration_date,
  last_login,
  CASE 
    WHEN last_login > migration_date THEN 'Rehashed'
    WHEN last_login IS NULL THEN 'Not logged in'
    ELSE 'Pending'
  END as password_status
FROM users
WHERE migrated_from_admin = true;
```

### Granting Admin Panel Access
```sql
UPDATE users 
SET can_access_admin_panel = true,
    is_super_admin = false,
    role_id = (SELECT id FROM roles WHERE name = 'admin')
WHERE username = 'username';
```

## Testing Examples

### cURL Examples
```bash
# Login and get token
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "pass"}' \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

# List users
curl -s http://localhost:8000/api/admin/users \
  -H "Authorization: Bearer $TOKEN"

# Update profile
curl -s -X PUT http://localhost:8000/api/admin/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"full_name": "New Name", "organization": "Org"}'

# Change password
curl -s -X POST http://localhost:8000/api/admin/change-password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"current_password": "old", "new_password": "new"}'
```

## Troubleshooting

### Common Issues

**Issue: "Admin panel access required"**
```sql
-- Grant admin panel access
UPDATE users SET can_access_admin_panel = true WHERE username = 'user';
```

**Issue: "Permission required: manage_users"**
```sql
-- Check user role
SELECT username, role_id, can_access_admin_panel, is_super_admin 
FROM users WHERE username = 'user';

-- Upgrade to admin role
UPDATE users 
SET role_id = (SELECT id FROM roles WHERE name = 'admin')
WHERE username = 'user';
```

**Issue: Password not working after migration**
- First login uses legacy admin_users verification
- Password is automatically rehashed to native RBAC format
- Subsequent logins use native authentication
- If stuck, use reset_admin_password.py script

**Issue: User locked out**
```sql
-- Reset lockout
UPDATE users 
SET failed_login_attempts = 0,
    lockout_until = NULL,
    is_active = true
WHERE username = 'user';
```

## Migration Notes

### Migrated User Behavior
1. **First login after migration:**
   - Authenticates using admin_users salt verification
   - Password automatically rehashed to native RBAC format
   - `last_password_change` updated

2. **Subsequent logins:**
   - Uses native RBAC authentication (passlib bcrypt)
   - No dependency on admin_users table

### Checking If User Has Migrated Password
```sql
SELECT 
  username,
  last_login > last_password_change as password_migrated,
  last_password_change
FROM users
WHERE username = 'user';
```

## Best Practices

1. **Always use can_access_admin_panel flag** for admin panel authorization
2. **Check is_active** before allowing any operations
3. **Use role_id** for permission levels (super_admin > admin > others)
4. **Monitor migration_date and last_login** to track password rehashing
5. **Keep audit logs** for all admin operations
6. **Use bulk operations** for managing multiple users efficiently
7. **Validate email addresses** when creating/updating users
8. **Enforce strong passwords** for admin accounts

## Security Recommendations

- [ ] Enable 2FA for super admin accounts (future enhancement)
- [ ] Review admin_users who haven't logged in (stuck on old passwords)
- [ ] Audit trail for all admin panel operations
- [ ] Regular security reviews of admin user list
- [ ] Implement session timeout (currently 30 min JWT)
- [ ] Monitor failed login attempts
- [ ] Implement account lockout after 5 failed attempts
- [ ] Review and revoke inactive admin accounts

## Support

For issues or questions:
1. Check logs: `docker-compose logs api | grep ERROR`
2. Verify database state: See SQL queries above
3. Run validation: `./scripts/validate_phase5.sh`
4. Review documentation: `UNIFIED_AUTH_MIGRATION_COMPLETE.md`

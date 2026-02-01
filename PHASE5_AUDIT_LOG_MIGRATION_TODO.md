# Phase 5 - Audit Log Migration TODO

## Problem Summary

The `user_audit_logs` table has a foreign key constraint referencing `admin_users.id`:
```sql
user_id UUID REFERENCES admin_users(id)
```

This causes failures when trying to log actions performed by RBAC users, since RBAC users are in the `users` table, not `admin_users`.

## Current State (Temporary Fix)

All `admin_service._log_action()` calls in `/app/api/admin.py` have been commented out with TODO markers:

- Line ~509: lock_user audit log
- Line ~552: unlock_user audit log  
- Line ~591: delete_user audit log
- Line ~698: reinvite_user audit log
- Line ~786: invite_user audit log
- Line ~903: bulk_action audit log
- Line ~1236: change_password audit log

## Affected Endpoints

1. POST `/api/admin/users/{user_id}/lock` - User locking
2. POST `/api/admin/users/{user_id}/unlock` - User unlocking
3. DELETE `/api/admin/users/{user_id}` - User deletion
4. POST `/api/admin/users/invite` - User invitation
5. POST `/api/admin/users/bulk-action` - Bulk operations
6. POST `/api/admin/change-password` - Password changes

All endpoints work correctly but don't log audit trails.

## Migration Options

### Option 1: Remove Foreign Key Constraint (Quick)
```sql
ALTER TABLE user_audit_logs 
DROP CONSTRAINT user_audit_logs_user_id_fkey;

-- Make user_id nullable or keep as UUID without constraint
ALTER TABLE user_audit_logs 
ALTER COLUMN user_id DROP NOT NULL;
```

**Pros**: Quick fix, backward compatible
**Cons**: Loses referential integrity

### Option 2: Change Foreign Key to RBAC Users Table (Recommended)
```sql
-- Step 1: Drop old constraint
ALTER TABLE user_audit_logs 
DROP CONSTRAINT user_audit_logs_user_id_fkey;

-- Step 2: Migrate existing user_ids from admin_users to users
-- (Need data migration script to map admin_users.id -> users.id)

-- Step 3: Add new constraint
ALTER TABLE user_audit_logs 
ADD CONSTRAINT user_audit_logs_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
```

**Pros**: Maintains referential integrity, future-proof
**Cons**: Requires data migration

### Option 3: Create New RBAC Audit Log Table
```sql
CREATE TABLE rbac_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR NOT NULL,
    resource_type VARCHAR,
    resource_id VARCHAR,
    timestamp TIMESTAMP DEFAULT NOW(),
    ip_address VARCHAR,
    user_agent VARCHAR,
    details JSONB,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT
);

CREATE INDEX idx_rbac_audit_logs_user_id ON rbac_audit_logs(user_id);
CREATE INDEX idx_rbac_audit_logs_timestamp ON rbac_audit_logs(timestamp);
CREATE INDEX idx_rbac_audit_logs_action ON rbac_audit_logs(action);
```

**Pros**: Clean separation, no impact on legacy data
**Cons**: Dual audit log system during transition

## Recommended Solution

**Option 2** (Change Foreign Key to RBAC Users) is recommended because:

1. Aligns with Phase 5 goal of making RBAC the primary system
2. Maintains data integrity
3. Single source of truth for audit logs
4. Simplifies future development

## Implementation Steps

1. **Create Migration Script** (`alembic/versions/XXX_migrate_audit_logs_to_rbac.py`)
   ```python
   def upgrade():
       # Step 1: Drop foreign key
       op.drop_constraint('user_audit_logs_user_id_fkey', 'user_audit_logs')
       
       # Step 2: Migrate user_ids (map admin_users -> users)
       # Use a JOIN to update user_ids where usernames match
       op.execute("""
           UPDATE user_audit_logs ual
           SET user_id = u.id
           FROM admin_users au
           JOIN users u ON u.username = au.username
           WHERE ual.user_id = au.id
       """)
       
       # Step 3: Make user_id nullable for orphaned records
       op.alter_column('user_audit_logs', 'user_id', nullable=True)
       
       # Step 4: Add new foreign key
       op.create_foreign_key(
           'user_audit_logs_user_id_fkey',
           'user_audit_logs', 'users',
           ['user_id'], ['id'],
           ondelete='SET NULL'
       )
   ```

2. **Update AdminService Model**
   ```python
   # In app/services/admin_service.py
   class UserAuditLog(Base):
       user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
       user = relationship("User", back_populates="audit_logs")  # Change to RBAC User
   ```

3. **Update RBAC User Model**
   ```python
   # In app/models/rbac.py
   class User(Base):
       # ... existing fields ...
       audit_logs = relationship("UserAuditLog", back_populates="user")
   ```

4. **Uncomment Audit Logs**
   - Remove TODO comments from admin.py
   - Restore all `admin_service._log_action()` calls

5. **Test Migration**
   ```bash
   # Run migration
   alembic upgrade head
   
   # Test audit logging works
   curl -X POST .../api/admin/users/invite ...
   
   # Verify audit log entry created
   psql -d impact_db -c "SELECT * FROM user_audit_logs ORDER BY timestamp DESC LIMIT 1;"
   ```

## Testing Checklist

After migration:
- [ ] All admin endpoints create audit log entries
- [ ] Audit logs reference RBAC users correctly
- [ ] Historical audit logs preserved
- [ ] Foreign key constraint working
- [ ] Orphaned records handled gracefully
- [ ] Admin panel audit log viewer works

## Timeline

- **Priority**: P2 (Important but not blocking)
- **Effort**: 2-4 hours (including testing)
- **Dependencies**: None (all Phase 5 work complete)

## Notes

- Current system is functional without audit logs
- Security/compliance might require audit trails
- Consider GDPR requirements for log retention

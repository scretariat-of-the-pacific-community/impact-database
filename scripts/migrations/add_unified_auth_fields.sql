-- Phase 1: Add unified authentication fields to users table
-- Execute this migration to prepare for admin_users → users migration

-- 1. Add migration tracking columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS migrated_from_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS migration_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS legacy_admin_id UUID;

-- 2. Add admin-specific fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_access_admin_panel BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lockout_until TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_password_change TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255);

-- 3. Create migration audit table
CREATE TABLE IF NOT EXISTS auth_migration_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID,
    rbac_user_id UUID,
    migration_type VARCHAR(50), -- 'initial', 'update', 'conflict_resolved'
    status VARCHAR(50), -- 'success', 'failed', 'skipped'
    conflicts JSONB,
    details JSONB,
    migrated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    migrated_by VARCHAR(255)
);

-- 4. Add indexes for migration queries
CREATE INDEX IF NOT EXISTS idx_users_migrated_from_admin ON users(migrated_from_admin);
CREATE INDEX IF NOT EXISTS idx_users_legacy_admin_id ON users(legacy_admin_id);
CREATE INDEX IF NOT EXISTS idx_users_can_access_admin ON users(can_access_admin_panel);
CREATE INDEX IF NOT EXISTS idx_migration_log_admin_user_id ON auth_migration_log(admin_user_id);

-- 5. Add comments for documentation
COMMENT ON COLUMN users.migrated_from_admin IS 'TRUE if this user was migrated from admin_users table';
COMMENT ON COLUMN users.legacy_admin_id IS 'Original admin_users.id for audit trail';
COMMENT ON COLUMN users.is_super_admin IS 'Replaces admin_users SUPER_ADMIN role';
COMMENT ON COLUMN users.can_access_admin_panel IS 'Controls access to /admin panel';
COMMENT ON TABLE auth_migration_log IS 'Audit log for admin_users to users migration';

-- Verify migration
DO $$
BEGIN
    RAISE NOTICE 'Phase 1 migration completed successfully';
    RAISE NOTICE 'Users table now has % rows', (SELECT COUNT(*) FROM users);
    RAISE NOTICE 'Admin users table has % rows', (SELECT COUNT(*) FROM admin_users);
END $$;

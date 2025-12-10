-- Phase 0: Add RBAC foundation tables (manual SQL version)
-- Run this directly via psql if Alembic has connection issues

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    level INTEGER NOT NULL,
    is_system_role BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_roles_name ON roles(name);
CREATE INDEX IF NOT EXISTS ix_roles_level ON roles(level);

-- Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    resource VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT
);

CREATE INDEX IF NOT EXISTS ix_permissions_name ON permissions(name);
CREATE INDEX IF NOT EXISTS ix_permissions_resource ON permissions(resource);
CREATE INDEX IF NOT EXISTS ix_permissions_action ON permissions(action);

-- Create role_permissions junction table
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id)
);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    hashed_password VARCHAR(255),
    role_id INTEGER REFERENCES roles(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    avatar_url VARCHAR(500),
    bio TEXT,
    department VARCHAR(100),
    position VARCHAR(100),
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    notification_preferences JSONB NOT NULL DEFAULT '{"email": true, "slack": false, "in_app": true}',
    review_preferences JSONB NOT NULL DEFAULT '{}',
    reviews_completed INTEGER NOT NULL DEFAULT 0,
    avg_review_time_minutes INTEGER
);

CREATE INDEX IF NOT EXISTS ix_users_email ON users(email);
CREATE INDEX IF NOT EXISTS ix_users_username ON users(username);
CREATE INDEX IF NOT EXISTS ix_users_role_id ON users(role_id);

-- Seed default roles
INSERT INTO roles (name, display_name, description, level, is_system_role) VALUES
('admin', 'Administrator', 'Full system access including user management and system configuration', 1, true),
('senior_reviewer', 'Senior Reviewer', 'Can review, assign, and approve all items', 2, true),
('reviewer', 'Reviewer', 'Can review assigned items and update metadata', 3, true),
('contributor', 'Contributor', 'Can submit items for review', 4, true),
('viewer', 'Viewer', 'Read-only access to approved content', 5, true)
ON CONFLICT (name) DO NOTHING;

-- Seed permissions
INSERT INTO permissions (name, resource, action, description) VALUES
('review:read', 'review_item', 'read', 'View review items'),
('review:create', 'review_item', 'create', 'Create review items'),
('review:update', 'review_item', 'update', 'Edit review items'),
('review:delete', 'review_item', 'delete', 'Delete review items'),
('review:approve', 'review_item', 'approve', 'Approve review items'),
('review:reject', 'review_item', 'reject', 'Reject review items'),
('review:assign', 'review_item', 'assign', 'Assign items to reviewers'),
('review:flag', 'review_item', 'flag', 'Flag items for attention'),
('metadata:read', 'metadata', 'read', 'View metadata'),
('metadata:update', 'metadata', 'update', 'Edit metadata'),
('user:read', 'user', 'read', 'View users'),
('user:manage', 'user', 'manage', 'Manage users and roles'),
('audit:view', 'audit', 'read', 'View audit logs'),
('notification:send', 'notification', 'send', 'Send notifications to users')
ON CONFLICT (name) DO NOTHING;

-- Assign permissions to admin role (all permissions)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

-- Assign permissions to senior_reviewer role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'senior_reviewer'
AND p.name IN (
    'review:read', 'review:create', 'review:update', 'review:approve', 
    'review:reject', 'review:assign', 'review:flag',
    'metadata:read', 'metadata:update',
    'audit:view', 'notification:send'
)
ON CONFLICT DO NOTHING;

-- Assign permissions to reviewer role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'reviewer'
AND p.name IN (
    'review:read', 'review:update', 'review:flag',
    'metadata:read', 'metadata:update'
)
ON CONFLICT DO NOTHING;

-- Assign permissions to contributor role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'contributor'
AND p.name IN (
    'review:read', 'review:create',
    'metadata:read', 'metadata:update'
)
ON CONFLICT DO NOTHING;

-- Assign permissions to viewer role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'viewer'
AND p.name IN ('review:read', 'metadata:read')
ON CONFLICT DO NOTHING;

-- Create default admin user
-- Password: "admin123" (hashed with bcrypt, cost=12)
INSERT INTO users (id, email, username, full_name, hashed_password, role_id, is_active, is_verified)
SELECT 
    gen_random_uuid(),
    'admin@impactdb.local',
    'admin',
    'System Administrator',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5oe2b3QZQWQ.K',
    r.id,
    true,
    true
FROM roles r
WHERE r.name = 'admin'
ON CONFLICT (username) DO NOTHING;

-- Create development user
INSERT INTO users (id, email, username, full_name, role_id, is_active, is_verified)
SELECT 
    gen_random_uuid(),
    'dev@example.com',
    'dev_user',
    'Development User',
    r.id,
    true,
    true
FROM roles r
WHERE r.name = 'contributor'
ON CONFLICT (username) DO NOTHING;

-- Update alembic_version table
INSERT INTO alembic_version (version_num) VALUES ('006_add_rbac_foundation')
ON CONFLICT (version_num) DO NOTHING;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Phase 0 Migration Complete:';
    RAISE NOTICE '   - Created roles, permissions, users tables';
    RAISE NOTICE '   - Seeded 5 default roles';
    RAISE NOTICE '   - Seeded 14 permissions';
    RAISE NOTICE '   - Assigned permissions to roles';
    RAISE NOTICE '   - Created default admin user (admin@impactdb.local / admin123)';
    RAISE NOTICE '   - Created development user (dev_user)';
END $$;

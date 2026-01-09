-- Migration: Add curator role and update permissions
-- Description: Restructure roles to have Admin, Curator, and Contributor
-- Date: 2026-01-08

BEGIN;

-- 1. Add curator role if it doesn't exist
INSERT INTO roles (name, display_name, description, level, is_system_role)
VALUES ('curator', 'Curator', 'Can review content and manage curation queue', 60, true)
ON CONFLICT (name) DO NOTHING;

-- 2. Get role IDs
DO $$
DECLARE
    curator_role_id INT;
    reviewer_role_id INT;
    admin_role_id INT;
BEGIN
    SELECT id INTO curator_role_id FROM roles WHERE name = 'curator';
    SELECT id INTO reviewer_role_id FROM roles WHERE name = 'reviewer';
    SELECT id INTO admin_role_id FROM roles WHERE name = 'admin';

    -- 3. Copy reviewer permissions to curator (if curator was just created)
    IF curator_role_id IS NOT NULL AND reviewer_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT curator_role_id, permission_id
        FROM role_permissions
        WHERE role_id = reviewer_role_id
        ON CONFLICT DO NOTHING;
    END IF;

    -- 4. Add curation-specific permissions for curator
    -- Ensure these permissions exist first
    INSERT INTO permissions (name, resource, action, description)
    VALUES 
        ('curation_queue:read', 'curation_queue', 'read', 'View curation queue items'),
        ('curation_queue:claim', 'curation_queue', 'claim', 'Claim unassigned items'),
        ('curation_queue:update', 'curation_queue', 'update', 'Update queue item status'),
        ('curation_queue:approve', 'curation_queue', 'approve', 'Approve queue items'),
        ('curation_queue:reject', 'curation_queue', 'reject', 'Reject queue items')
    ON CONFLICT (name) DO NOTHING;

    -- Assign curation permissions to curator
    IF curator_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT curator_role_id, p.id
        FROM permissions p
        WHERE p.resource = 'curation_queue' 
          AND p.action IN ('read', 'claim', 'update', 'approve', 'reject')
        ON CONFLICT DO NOTHING;
    END IF;

    -- Admin gets all curation permissions
    IF admin_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT admin_role_id, p.id
        FROM permissions p
        WHERE p.resource = 'curation_queue'
        ON CONFLICT DO NOTHING;
        
        -- Admin can also assign items
        INSERT INTO permissions (name, resource, action, description)
        VALUES ('curation_queue:assign', 'curation_queue', 'assign', 'Assign items to curators')
        ON CONFLICT (name) DO NOTHING;
        
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT admin_role_id, p.id
        FROM permissions p
        WHERE p.resource = 'curation_queue' AND p.action = 'assign'
        ON CONFLICT DO NOTHING;
    END IF;

END $$;

-- 5. Update existing "reviewer" users to "curator" role (optional - comment out if you want to keep both)
-- UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'curator')
-- WHERE role_id = (SELECT id FROM roles WHERE name = 'reviewer');

-- 6. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_curation_queue_assigned_to ON curation_queue(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_curation_queue_status_priority ON curation_queue(status, priority) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_curation_queue_unassigned ON curation_queue(created_at) WHERE assigned_to IS NULL AND is_deleted = false;

COMMIT;

-- Verify the changes
SELECT r.name as role, p.resource, p.action 
FROM role_permissions rp 
JOIN roles r ON rp.role_id = r.id 
JOIN permissions p ON rp.permission_id = p.id 
WHERE r.name IN ('admin', 'curator', 'contributor')
ORDER BY r.name, p.resource, p.action;

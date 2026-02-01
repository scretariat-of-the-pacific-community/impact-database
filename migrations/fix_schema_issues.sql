-- ============================================
-- Database Schema Fix Migration
-- Fixes missing columns, roles, and constraints
-- ============================================

BEGIN;

-- [1] Create missing database roles
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'impact_user') THEN
        CREATE ROLE impact_user WITH LOGIN PASSWORD 'impact_user_password' NOINHERIT;
        RAISE NOTICE 'Created role: impact_user';
    ELSE
        RAISE NOTICE 'Role impact_user already exists';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'oceanportal') THEN
        CREATE ROLE oceanportal WITH LOGIN PASSWORD 'oceanportal_password' NOINHERIT;
        RAISE NOTICE 'Created role: oceanportal';
    ELSE
        RAISE NOTICE 'Role oceanportal already exists';
    END IF;
END $$;

-- [2] Fix video_metadata table - add missing columns
ALTER TABLE IF EXISTS video_metadata 
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(500),
    ADD COLUMN IF NOT EXISTS title VARCHAR(500),
    ADD COLUMN IF NOT EXISTS abstract TEXT;

-- Update existing records to have non-null values
UPDATE video_metadata 
SET description = COALESCE(description, 'Video documentation of disaster impact')
WHERE description IS NULL;

UPDATE video_metadata 
SET title = COALESCE(title, filename)
WHERE title IS NULL;

-- [3] Fix curation_queue table - ensure ID has default value
DO $$
BEGIN
    -- Check if id column exists and doesn't have a default
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'curation_queue' 
        AND column_name = 'id'
        AND column_default IS NULL
    ) THEN
        -- Add default UUID generation
        ALTER TABLE curation_queue 
        ALTER COLUMN id SET DEFAULT gen_random_uuid();
        
        RAISE NOTICE 'Added UUID default to curation_queue.id';
    END IF;
END $$;

-- [4] Ensure curation_queue has required columns
ALTER TABLE IF EXISTS curation_queue 
    ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) DEFAULT 'image',
    ADD COLUMN IF NOT EXISTS content_id UUID,
    ADD COLUMN IF NOT EXISTS image_id UUID,
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium',
    ADD COLUMN IF NOT EXISTS assigned_to UUID,
    ADD COLUMN IF NOT EXISTS reviewed_by UUID,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS notes TEXT;

-- [5] Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_curation_queue_content_type ON curation_queue(content_type);
CREATE INDEX IF NOT EXISTS idx_curation_queue_content_id ON curation_queue(content_id);
CREATE INDEX IF NOT EXISTS idx_curation_queue_status ON curation_queue(status);
CREATE INDEX IF NOT EXISTS idx_curation_queue_priority ON curation_queue(priority);
CREATE INDEX IF NOT EXISTS idx_video_metadata_title ON video_metadata(title);
CREATE INDEX IF NOT EXISTS idx_video_metadata_hazard_type ON video_metadata(hazard_type);

-- [6] Drop and recreate curation_comments table with correct schema
DROP TABLE IF EXISTS curation_comments CASCADE;
CREATE TABLE curation_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    curation_queue_id UUID NOT NULL,
    user_id UUID NOT NULL,
    comment_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_curation_comments_queue 
        FOREIGN KEY (curation_queue_id) 
        REFERENCES curation_queue(id) 
        ON DELETE CASCADE
);

CREATE INDEX idx_curation_comments_queue_id ON curation_comments(curation_queue_id);
CREATE INDEX idx_curation_comments_user_id ON curation_comments(user_id);

-- [7] Drop and recreate curation_actions table with correct schema
DROP TABLE IF EXISTS curation_actions CASCADE;
CREATE TABLE curation_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    curation_queue_id UUID NOT NULL,
    user_id UUID NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    old_status VARCHAR(50),
    new_status VARCHAR(50),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_curation_actions_queue 
        FOREIGN KEY (curation_queue_id) 
        REFERENCES curation_queue(id) 
        ON DELETE CASCADE
);

CREATE INDEX idx_curation_actions_queue_id ON curation_actions(curation_queue_id);
CREATE INDEX idx_curation_actions_user_id ON curation_actions(user_id);
CREATE INDEX idx_curation_actions_action_type ON curation_actions(action_type);

COMMIT;

-- ============================================
-- Verification Queries
-- ============================================

-- Check video_metadata columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'video_metadata'
ORDER BY ordinal_position;

-- Check curation_queue columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'curation_queue'
ORDER BY ordinal_position;

-- Check database roles
SELECT rolname FROM pg_roles 
WHERE rolname IN ('impact_user', 'oceanportal');

-- Show table counts
SELECT 
    'image_metadata' as table_name, 
    COUNT(*) as record_count 
FROM image_metadata
UNION ALL
SELECT 
    'video_metadata' as table_name, 
    COUNT(*) as record_count 
FROM video_metadata
UNION ALL
SELECT 
    'curation_queue' as table_name, 
    COUNT(*) as record_count 
FROM curation_queue;

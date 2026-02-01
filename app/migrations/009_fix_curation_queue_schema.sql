-- Migration: Fix curation_queue table schema
-- This migration fixes the curation_queue table to properly support polymorphic content
-- and adds missing columns that are expected by the API

BEGIN;

-- Step 1: Check if curation_queue exists and has the wrong schema
-- If image_filename exists but image_id doesn't, we need to migrate
DO $$
DECLARE
    has_image_filename BOOLEAN;
    has_image_id BOOLEAN;
    has_content_id BOOLEAN;
    has_id BOOLEAN;
BEGIN
    -- Check which columns exist
    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'curation_queue' AND column_name = 'image_filename'
    ) INTO has_image_filename;
    
    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'curation_queue' AND column_name = 'image_id'
    ) INTO has_image_id;
    
    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'curation_queue' AND column_name = 'content_id'
    ) INTO has_content_id;
    
    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'curation_queue' AND column_name = 'id'
    ) INTO has_id;
    
    -- If the table exists with wrong schema, recreate it
    IF has_image_filename AND NOT has_image_id THEN
        RAISE NOTICE 'Migrating curation_queue from old schema to new schema';
        
        -- Drop old table and recreate
        DROP TABLE IF EXISTS curation_queue CASCADE;
        
        -- Create new table with correct schema
        CREATE TABLE curation_queue (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            
            -- Polymorphic content support
            content_type VARCHAR(20) NOT NULL DEFAULT 'image',
            content_id UUID NOT NULL,
            
            -- Keep image_id for backwards compatibility (nullable)
            image_id UUID,
            
            -- Status and priority
            status VARCHAR(50) NOT NULL DEFAULT 'pending',
            priority VARCHAR(20) NOT NULL DEFAULT 'medium',
            
            -- Assignment and tracking
            assigned_to VARCHAR,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            due_date TIMESTAMP,
            
            -- Submission details
            submitted_by VARCHAR,
            submission_notes TEXT,
            
            -- Review details
            reviewed_by VARCHAR,
            reviewed_at TIMESTAMP,
            review_notes TEXT,
            
            -- Flags and indicators
            is_flagged BOOLEAN DEFAULT FALSE,
            flag_reason VARCHAR,
            is_duplicate BOOLEAN DEFAULT FALSE,
            duplicate_of VARCHAR,
            
            -- Soft delete
            is_deleted BOOLEAN DEFAULT FALSE,
            deleted_by VARCHAR,
            deleted_at TIMESTAMP
        );
        
        -- Create indexes
        CREATE INDEX IF NOT EXISTS idx_curation_queue_status ON curation_queue(status);
        CREATE INDEX IF NOT EXISTS idx_curation_queue_priority ON curation_queue(priority);
        CREATE INDEX IF NOT EXISTS idx_curation_queue_assigned_to ON curation_queue(assigned_to) WHERE assigned_to IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_curation_queue_created_at ON curation_queue(created_at);
        CREATE INDEX IF NOT EXISTS idx_curation_queue_is_deleted ON curation_queue(is_deleted);
        CREATE INDEX IF NOT EXISTS idx_curation_queue_content_id ON curation_queue(content_id);
        CREATE INDEX IF NOT EXISTS idx_curation_queue_content_type ON curation_queue(content_type);
        CREATE INDEX IF NOT EXISTS idx_curation_queue_status_priority ON curation_queue(status, priority) WHERE is_deleted = FALSE;
        CREATE INDEX IF NOT EXISTS idx_curation_queue_unassigned ON curation_queue(created_at) WHERE assigned_to IS NULL AND is_deleted = FALSE;
    END IF;
END $$;

-- Step 2: Add missing columns if they don't exist (for cases where table already exists)
ALTER TABLE curation_queue ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) DEFAULT 'image';
ALTER TABLE curation_queue ADD COLUMN IF NOT EXISTS content_id UUID;

-- Add indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_curation_queue_content_id ON curation_queue(content_id);
CREATE INDEX IF NOT EXISTS idx_curation_queue_content_type ON curation_queue(content_type);

-- Step 3: Populate content_id from image_id for existing records
UPDATE curation_queue 
SET content_id = image_id, content_type = 'image' 
WHERE content_id IS NULL AND image_id IS NOT NULL;

-- Step 4: Drop dependent tables and recreate them
DROP TABLE IF EXISTS curation_comments CASCADE;

CREATE TABLE IF NOT EXISTS curation_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_item_id UUID NOT NULL REFERENCES curation_queue(id) ON DELETE CASCADE,

    -- Comment details
    author VARCHAR NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Comment type and context
    comment_type VARCHAR DEFAULT 'general',
    is_internal BOOLEAN DEFAULT FALSE,

    -- Reply threading
    parent_comment_id UUID REFERENCES curation_comments(id),

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_curation_comments_queue_item_id ON curation_comments(queue_item_id);
CREATE INDEX IF NOT EXISTS idx_curation_comments_author ON curation_comments(author);

-- Step 5: Drop and recreate curation_actions
DROP TABLE IF EXISTS curation_actions CASCADE;

CREATE TABLE IF NOT EXISTS curation_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_item_id UUID NOT NULL REFERENCES curation_queue(id) ON DELETE CASCADE,

    -- Action details
    action_type VARCHAR NOT NULL,
    performed_by VARCHAR NOT NULL,
    performed_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Action context
    description TEXT,
    metadata_changes JSONB,
    notes TEXT,

    -- Related items
    related_item_id VARCHAR
);

CREATE INDEX IF NOT EXISTS idx_curation_actions_queue_item_id ON curation_actions(queue_item_id);
CREATE INDEX IF NOT EXISTS idx_curation_actions_action_type ON curation_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_curation_actions_performed_by ON curation_actions(performed_by);

-- Step 6: Grant appropriate permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON curation_queue TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON curation_comments TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON curation_actions TO postgres;

COMMIT;

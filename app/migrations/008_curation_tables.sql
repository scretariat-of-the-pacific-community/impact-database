-- Migration: Create curation workflow tables
-- This migration creates the curation_queue, curation_comments, curation_actions,
-- bulk_imports, and export_requests tables for admin curation functionality.

-- Create curation status enum
DO $$ BEGIN
    CREATE TYPE curation_status AS ENUM (
        'pending', 'under_review', 'approved', 'rejected',
        'needs_changes', 'duplicate', 'archived'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Create priority enum
DO $$ BEGIN
    CREATE TYPE curation_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Create action type enum
DO $$ BEGIN
    CREATE TYPE action_type AS ENUM (
        'uploaded', 'reviewed', 'approved', 'rejected', 'flagged',
        'unflagged', 'edited', 'merged', 'marked_duplicate',
        'restored', 'deleted', 'commented', 'bulk_imported'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Create curation_queue table
CREATE TABLE IF NOT EXISTS curation_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_filename VARCHAR NOT NULL,
    status curation_status NOT NULL DEFAULT 'pending',
    priority curation_priority NOT NULL DEFAULT 'medium',

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

-- Create indexes for curation_queue
CREATE INDEX IF NOT EXISTS idx_curation_queue_status ON curation_queue(status);
CREATE INDEX IF NOT EXISTS idx_curation_queue_priority ON curation_queue(priority);
CREATE INDEX IF NOT EXISTS idx_curation_queue_assigned_to ON curation_queue(assigned_to);
CREATE INDEX IF NOT EXISTS idx_curation_queue_created_at ON curation_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_curation_queue_is_deleted ON curation_queue(is_deleted);

-- Create curation_comments table
CREATE TABLE IF NOT EXISTS curation_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_item_id UUID NOT NULL REFERENCES curation_queue(id),

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

-- Create indexes for curation_comments
CREATE INDEX IF NOT EXISTS idx_curation_comments_queue_item_id ON curation_comments(queue_item_id);
CREATE INDEX IF NOT EXISTS idx_curation_comments_author ON curation_comments(author);

-- Create curation_actions table
CREATE TABLE IF NOT EXISTS curation_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_item_id UUID NOT NULL REFERENCES curation_queue(id),

    -- Action details
    action_type action_type NOT NULL,
    performed_by VARCHAR NOT NULL,
    performed_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Action context
    description TEXT,
    metadata_changes JSONB,
    notes TEXT,

    -- Related items
    related_item_id VARCHAR
);

-- Create indexes for curation_actions
CREATE INDEX IF NOT EXISTS idx_curation_actions_queue_item_id ON curation_actions(queue_item_id);
CREATE INDEX IF NOT EXISTS idx_curation_actions_action_type ON curation_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_curation_actions_performed_by ON curation_actions(performed_by);

-- Create bulk_imports table
CREATE TABLE IF NOT EXISTS bulk_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Import details
    import_type VARCHAR NOT NULL,
    original_filename VARCHAR,
    total_items INTEGER DEFAULT 0,
    processed_items INTEGER DEFAULT 0,
    successful_items INTEGER DEFAULT 0,
    failed_items INTEGER DEFAULT 0,

    -- Status and timing
    status VARCHAR DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,

    -- User and execution context
    created_by VARCHAR NOT NULL,
    is_dry_run BOOLEAN DEFAULT FALSE,

    -- Results and reports
    import_report JSONB,
    error_log JSONB,
    validation_results JSONB,

    -- Configuration
    import_settings JSONB,
    mapping_config JSONB
);

-- Create indexes for bulk_imports
CREATE INDEX IF NOT EXISTS idx_bulk_imports_status ON bulk_imports(status);
CREATE INDEX IF NOT EXISTS idx_bulk_imports_created_by ON bulk_imports(created_by);

-- Create export_requests table
CREATE TABLE IF NOT EXISTS export_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Export details
    export_type VARCHAR NOT NULL,
    format_options JSONB,
    filters JSONB,

    -- Status and timing
    status VARCHAR DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,

    -- User context
    requested_by VARCHAR NOT NULL,

    -- Results
    total_records INTEGER DEFAULT 0,
    file_url VARCHAR,
    file_size INTEGER,
    expires_at TIMESTAMP,

    -- Error handling
    error_message TEXT
);

-- Create indexes for export_requests
CREATE INDEX IF NOT EXISTS idx_export_requests_status ON export_requests(status);
CREATE INDEX IF NOT EXISTS idx_export_requests_requested_by ON export_requests(requested_by);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON curation_queue TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON curation_comments TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON curation_actions TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON bulk_imports TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON export_requests TO postgres;

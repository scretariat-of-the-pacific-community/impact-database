-- Phase 1: Review Workflow - Assignment & Audit Trail
-- Creates review_items, review_assignments, and review_audit_trail tables

BEGIN;

-- Create review_items table
CREATE TABLE IF NOT EXISTS review_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_id UUID UNIQUE NOT NULL REFERENCES image_metadata(id) ON DELETE CASCADE,
    
    -- Status & Priority
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    
    -- Assignment
    assigned_to UUID REFERENCES users(id),
    assigned_at TIMESTAMP WITH TIME ZONE,
    assigned_by UUID REFERENCES users(id),
    
    -- Submission Info
    submitted_by UUID NOT NULL REFERENCES users(id),
    submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Review Info
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewer_notes TEXT,
    
    -- Flagging
    is_flagged BOOLEAN NOT NULL DEFAULT false,
    flag_reason TEXT,
    flagged_by UUID REFERENCES users(id),
    flagged_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    title VARCHAR(255),
    description TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    
    -- Duplicates
    is_duplicate BOOLEAN NOT NULL DEFAULT false,
    duplicate_of UUID REFERENCES review_items(id),
    
    -- Timing
    due_date TIMESTAMP WITH TIME ZONE,
    last_modified TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Workflow tracking
    workflow_state JSONB NOT NULL DEFAULT '{}',
    review_duration_minutes INTEGER
);

-- Create indexes for review_items
CREATE INDEX IF NOT EXISTS idx_review_items_status ON review_items(status);
CREATE INDEX IF NOT EXISTS idx_review_items_priority ON review_items(priority);
CREATE INDEX IF NOT EXISTS idx_review_items_assigned_to ON review_items(assigned_to);
CREATE INDEX IF NOT EXISTS idx_review_items_submitted_by ON review_items(submitted_by);
CREATE INDEX IF NOT EXISTS idx_review_items_is_flagged ON review_items(is_flagged);
CREATE INDEX IF NOT EXISTS idx_review_items_due_date ON review_items(due_date);
CREATE INDEX IF NOT EXISTS idx_review_items_image_id ON review_items(image_id);

-- Create review_assignments table (assignment history)
CREATE TABLE IF NOT EXISTS review_assignments (
    id SERIAL PRIMARY KEY,
    review_item_id UUID NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,
    assigned_to UUID NOT NULL REFERENCES users(id),
    assigned_by UUID NOT NULL REFERENCES users(id),
    assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    unassigned_at TIMESTAMP WITH TIME ZONE,
    reason VARCHAR(50),
    notes TEXT
);

-- Create indexes for review_assignments
CREATE INDEX IF NOT EXISTS idx_review_assignments_review_item ON review_assignments(review_item_id);
CREATE INDEX IF NOT EXISTS idx_review_assignments_assigned_to ON review_assignments(assigned_to);
CREATE INDEX IF NOT EXISTS idx_review_assignments_assigned_at ON review_assignments(assigned_at);

-- Create review_audit_trail table
CREATE TABLE IF NOT EXISTS review_audit_trail (
    id SERIAL PRIMARY KEY,
    review_item_id UUID NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,
    
    -- Action Details
    action VARCHAR(50) NOT NULL,
    actor_id UUID REFERENCES users(id),
    actor_name VARCHAR(255),
    actor_role VARCHAR(50),
    
    -- Change Details
    field_changed VARCHAR(100),
    old_value TEXT,
    new_value TEXT,
    change_summary JSONB,
    
    -- Context
    reason TEXT,
    notes TEXT,
    source VARCHAR(50) NOT NULL DEFAULT 'web',
    
    -- Request metadata
    ip_address VARCHAR(45),
    user_agent TEXT,
    session_id VARCHAR(255),
    request_id VARCHAR(255),
    api_endpoint VARCHAR(255),
    
    -- Timing
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processing_duration_ms INTEGER,
    
    -- Metadata
    metadata JSONB NOT NULL DEFAULT '{}'
);

-- Create indexes for review_audit_trail
CREATE INDEX IF NOT EXISTS idx_audit_review_item ON review_audit_trail(review_item_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON review_audit_trail(action);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON review_audit_trail(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON review_audit_trail(timestamp);

-- Create trigger to update last_modified on review_items
CREATE OR REPLACE FUNCTION update_review_item_last_modified()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_modified = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER review_items_last_modified
    BEFORE UPDATE ON review_items
    FOR EACH ROW
    EXECUTE FUNCTION update_review_item_last_modified();

-- Migrate existing image_metadata to review_items
-- Create a review_item for each existing image with pending_review status
INSERT INTO review_items (
    id,
    image_id,
    status,
    priority,
    submitted_by,
    submitted_at,
    title,
    description,
    metadata
)
SELECT 
    gen_random_uuid(),
    im.id,
    CASE 
        WHEN im.status = 'approved' THEN 'approved'
        WHEN im.status = 'rejected' THEN 'rejected'
        ELSE 'pending'
    END,
    'medium',
    -- Use existing dev_user as submitter for migrated items
    (SELECT id FROM users WHERE username = 'dev_user' LIMIT 1),
    im.date_stamp,
    im.title,
    im.abstract,
    jsonb_build_object(
        'hazard_type', im.hazard_type,
        'country', im.country,
        'location', im.location,
        'source', im.source
    )
FROM image_metadata im
WHERE NOT EXISTS (
    SELECT 1 FROM review_items ri WHERE ri.image_id = im.id
)
ON CONFLICT (image_id) DO NOTHING;

-- Log initial migration in audit trail
INSERT INTO review_audit_trail (
    review_item_id,
    action,
    actor_name,
    notes,
    source
)
SELECT 
    ri.id,
    'created',
    'system',
    'Migrated from existing image_metadata',
    'migration'
FROM review_items ri
WHERE NOT EXISTS (
    SELECT 1 FROM review_audit_trail rat 
    WHERE rat.review_item_id = ri.id AND rat.action = 'created'
);

COMMIT;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Phase 1 Migration Complete:';
    RAISE NOTICE '   - Created review_items table with indexes';
    RAISE NOTICE '   - Created review_assignments table';
    RAISE NOTICE '   - Created review_audit_trail table';
    RAISE NOTICE '   - Created triggers for last_modified';
    RAISE NOTICE '   - Migrated existing image_metadata to review_items';
    RAISE NOTICE '   - Total review items: %', (SELECT COUNT(*) FROM review_items);
END $$;

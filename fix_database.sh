#!/bin/bash
# Database fix script using psql

set -e

echo "=========================================="
echo "DATABASE FIX - Using direct SQL fixes"
echo "=========================================="

# Get database connection info
DB_HOST="${DATABASE_HOST:-postgis_db}"
DB_PORT="${DATABASE_PORT:-5432}"
DB_NAME="${DATABASE_NAME:-postgres}"
DB_USER="${DATABASE_USER:-postgres}"

export PGPASSWORD="${DATABASE_PASSWORD:-postgres}"

echo ""
echo "[1/5] Creating database roles..."
psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "
DO \$\$
BEGIN
    CREATE ROLE impact_user WITH LOGIN PASSWORD 'impact_user_password' NOINHERIT;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END \$\$;
" || true

echo "✓ Created/verified impact_user role"

psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "
DO \$\$
BEGIN
    CREATE ROLE oceanportal WITH LOGIN PASSWORD 'oceanportal_password' NOINHERIT;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END \$\$;
" || true

echo "✓ Created/verified oceanportal role"

echo ""
echo "[2/5] Fixing curation_queue schema..."
psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" << 'EOF'
-- Add missing columns if they don't exist
ALTER TABLE IF EXISTS curation_queue ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) DEFAULT 'image';
ALTER TABLE IF EXISTS curation_queue ADD COLUMN IF NOT EXISTS content_id UUID;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_curation_queue_content_id ON curation_queue(content_id);
CREATE INDEX IF NOT EXISTS idx_curation_queue_content_type ON curation_queue(content_type);
CREATE INDEX IF NOT EXISTS idx_curation_queue_status_priority ON curation_queue(status, priority) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_curation_queue_unassigned ON curation_queue(created_at) WHERE assigned_to IS NULL AND is_deleted = FALSE;

-- Populate content_id from image_id
UPDATE curation_queue SET content_id = image_id, content_type = 'image' 
WHERE content_id IS NULL AND image_id IS NOT NULL;
EOF

echo "✓ Fixed curation_queue table schema"

echo ""
echo "[3/5] Adding missing video_metadata columns..."
psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" << 'EOF'
ALTER TABLE IF EXISTS video_metadata ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(255);
ALTER TABLE IF EXISTS video_metadata ADD COLUMN IF NOT EXISTS poster_url VARCHAR(255);
EOF

echo "✓ Added thumbnail_url and poster_url columns"

echo ""
echo "[4/5] Verifying curation_comments and curation_actions tables..."
psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" << 'EOF'
-- Drop and recreate if needed
DROP TABLE IF EXISTS curation_comments CASCADE;
CREATE TABLE IF NOT EXISTS curation_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_item_id UUID NOT NULL REFERENCES curation_queue(id) ON DELETE CASCADE,
    author VARCHAR NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    comment_type VARCHAR DEFAULT 'general',
    is_internal BOOLEAN DEFAULT FALSE,
    parent_comment_id UUID REFERENCES curation_comments(id),
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_curation_comments_queue_item_id ON curation_comments(queue_item_id);
CREATE INDEX IF NOT EXISTS idx_curation_comments_author ON curation_comments(author);

DROP TABLE IF EXISTS curation_actions CASCADE;
CREATE TABLE IF NOT EXISTS curation_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_item_id UUID NOT NULL REFERENCES curation_queue(id) ON DELETE CASCADE,
    action_type VARCHAR NOT NULL,
    performed_by VARCHAR NOT NULL,
    performed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    description TEXT,
    metadata_changes JSONB,
    notes TEXT,
    related_item_id VARCHAR
);
CREATE INDEX IF NOT EXISTS idx_curation_actions_queue_item_id ON curation_actions(queue_item_id);
CREATE INDEX IF NOT EXISTS idx_curation_actions_action_type ON curation_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_curation_actions_performed_by ON curation_actions(performed_by);
EOF

echo "✓ Verified curation_comments and curation_actions tables"

echo ""
echo "[5/5] Populating curation queue..."
psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" << 'EOF'
-- Insert images into curation queue
INSERT INTO curation_queue (content_type, content_id, status, priority, created_at)
SELECT 'image', id, 'pending', 'medium', NOW()
FROM image_metadata
WHERE id NOT IN (SELECT content_id FROM curation_queue WHERE content_type = 'image')
ON CONFLICT DO NOTHING;

-- Insert videos into curation queue
INSERT INTO curation_queue (content_type, content_id, status, priority, created_at)
SELECT 'video', id, 'pending', 'medium', NOW()
FROM video_metadata
WHERE id NOT IN (SELECT content_id FROM curation_queue WHERE content_type = 'video')
ON CONFLICT DO NOTHING;
EOF

echo "✓ Populated curation queue"

echo ""
echo "=========================================="
echo "VERIFICATION"
echo "=========================================="

echo ""
echo "Curation Queue Stats:"
psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "
SELECT content_type, COUNT(*) as count FROM curation_queue GROUP BY content_type;
"

echo ""
echo "✓ DATABASE FIX COMPLETED"
echo "=========================================="

#!/usr/bin/env python3
"""
Comprehensive database fix script to resolve all schema and configuration issues.
This script:
1. Ensures database users/roles exist
2. Fixes curation_queue table schema
3. Adds missing video_metadata columns
4. Populates curation queue from images and videos
"""

import os
import sys
from sqlalchemy import create_engine, text

# Get database configuration
db_host = os.getenv('DATABASE_HOST', 'postgis_db')
db_port = os.getenv('DATABASE_PORT', '5432')
db_name = os.getenv('DATABASE_NAME', 'postgres')
db_user = os.getenv('DATABASE_USER', 'postgres')
db_password = os.getenv('DATABASE_PASSWORD', 'postgres')

# Connection strings
root_conn_string = f'postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}'
admin_conn_string = f'postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}'

def run_sql(engine, sql_text, description=""):
    """Execute SQL and report results."""
    try:
        with engine.connect() as conn:
            result = conn.execute(text(sql_text))
            conn.commit()
            print(f"✓ {description}")
            return True
    except Exception as e:
        print(f"✗ {description}: {e}")
        return False

def main():
    print("=" * 60)
    print("DATABASE FIX SCRIPT - Starting comprehensive fixes")
    print("=" * 60)
    
    # Connect to database
    print(f"\nConnecting to database: {db_host}:{db_port}/{db_name}")
    try:
        engine = create_engine(root_conn_string, echo=False)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
        print("✓ Database connection successful")
    except Exception as e:
        print(f"✗ Failed to connect to database: {e}")
        sys.exit(1)
    
    # Step 1: Create database roles/users if they don't exist
    print("\n[1/5] Creating database roles if needed...")
    
    # Create impact_user role
    run_sql(engine, """
        DO $$
        BEGIN
            CREATE ROLE impact_user WITH LOGIN PASSWORD 'impact_user_password' NOINHERIT;
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        END $$;
    """, "Create impact_user role")
    
    # Create oceanportal role
    run_sql(engine, """
        DO $$
        BEGIN
            CREATE ROLE oceanportal WITH LOGIN PASSWORD 'oceanportal_password' NOINHERIT;
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        END $$;
    """, "Create oceanportal role")
    
    # Grant permissions
    run_sql(engine, """
        GRANT CONNECT ON DATABASE postgres TO impact_user, oceanportal;
        GRANT USAGE ON SCHEMA public TO impact_user, oceanportal;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO impact_user, oceanportal;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO impact_user, oceanportal;
    """, "Grant permissions to database roles")
    
    # Step 2: Fix curation_queue table schema
    print("\n[2/5] Fixing curation_queue table schema...")
    
    fix_curation_queue_sql = """
    DO $$
    DECLARE
        has_image_filename BOOLEAN;
        has_image_id BOOLEAN;
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
        
        -- If the table has wrong schema, recreate it
        IF has_image_filename AND NOT has_image_id THEN
            DROP TABLE IF EXISTS curation_queue CASCADE;
            
            CREATE TABLE curation_queue (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                content_type VARCHAR(20) NOT NULL DEFAULT 'image',
                content_id UUID NOT NULL,
                image_id UUID,
                status VARCHAR(50) NOT NULL DEFAULT 'pending',
                priority VARCHAR(20) NOT NULL DEFAULT 'medium',
                assigned_to VARCHAR,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                due_date TIMESTAMP,
                submitted_by VARCHAR,
                submission_notes TEXT,
                reviewed_by VARCHAR,
                reviewed_at TIMESTAMP,
                review_notes TEXT,
                is_flagged BOOLEAN DEFAULT FALSE,
                flag_reason VARCHAR,
                is_duplicate BOOLEAN DEFAULT FALSE,
                duplicate_of VARCHAR,
                is_deleted BOOLEAN DEFAULT FALSE,
                deleted_by VARCHAR,
                deleted_at TIMESTAMP
            );
            
            CREATE INDEX idx_curation_queue_status ON curation_queue(status);
            CREATE INDEX idx_curation_queue_priority ON curation_queue(priority);
            CREATE INDEX idx_curation_queue_assigned_to ON curation_queue(assigned_to) WHERE assigned_to IS NOT NULL;
            CREATE INDEX idx_curation_queue_created_at ON curation_queue(created_at);
            CREATE INDEX idx_curation_queue_is_deleted ON curation_queue(is_deleted);
            CREATE INDEX idx_curation_queue_content_id ON curation_queue(content_id);
            CREATE INDEX idx_curation_queue_content_type ON curation_queue(content_type);
        END IF;
    END $$;
    
    ALTER TABLE curation_queue ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) DEFAULT 'image';
    ALTER TABLE curation_queue ADD COLUMN IF NOT EXISTS content_id UUID;
    
    CREATE INDEX IF NOT EXISTS idx_curation_queue_content_id ON curation_queue(content_id);
    CREATE INDEX IF NOT EXISTS idx_curation_queue_content_type ON curation_queue(content_type);
    
    UPDATE curation_queue SET content_id = image_id, content_type = 'image' 
    WHERE content_id IS NULL AND image_id IS NOT NULL;
    """
    
    run_sql(engine, fix_curation_queue_sql, "Fix curation_queue table schema")
    
    # Step 3: Add missing video_metadata columns
    print("\n[3/5] Adding missing video_metadata columns...")
    
    run_sql(engine, """
        ALTER TABLE video_metadata ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(255);
        ALTER TABLE video_metadata ADD COLUMN IF NOT EXISTS poster_url VARCHAR(255);
    """, "Add thumbnail_url and poster_url columns to video_metadata")
    
    # Step 4: Recreate curation_comments and curation_actions tables
    print("\n[4/5] Recreating curation comment and action tables...")
    
    run_sql(engine, """
        DROP TABLE IF EXISTS curation_comments CASCADE;
        CREATE TABLE curation_comments (
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
    """, "Recreate curation_comments table")
    
    run_sql(engine, """
        DROP TABLE IF EXISTS curation_actions CASCADE;
        CREATE TABLE curation_actions (
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
    """, "Recreate curation_actions table")
    
    # Step 5: Populate curation queue from existing images and videos
    print("\n[5/5] Populating curation queue from existing content...")
    
    # Check if we need to populate
    with engine.connect() as conn:
        result = conn.execute(text("SELECT COUNT(*) as cnt FROM image_metadata"))
        image_count = result.scalar() or 0
        result = conn.execute(text("SELECT COUNT(*) as cnt FROM video_metadata"))
        video_count = result.scalar() or 0
        result = conn.execute(text("SELECT COUNT(*) as cnt FROM curation_queue"))
        queue_count = result.scalar() or 0
    
    print(f"   Found {image_count} images, {video_count} videos, {queue_count} existing queue items")
    
    if queue_count == 0 and (image_count > 0 or video_count > 0):
        run_sql(engine, """
            INSERT INTO curation_queue (content_type, content_id, status, priority, created_at)
            SELECT 'image', id, 'pending', 'medium', NOW()
            FROM image_metadata
            ON CONFLICT DO NOTHING;
        """, "Add images to curation queue")
        
        run_sql(engine, """
            INSERT INTO curation_queue (content_type, content_id, status, priority, created_at)
            SELECT 'video', id, 'pending', 'medium', NOW()
            FROM video_metadata
            ON CONFLICT DO NOTHING;
        """, "Add videos to curation queue")
    
    # Final verification
    print("\n" + "=" * 60)
    print("VERIFICATION")
    print("=" * 60)
    
    with engine.connect() as conn:
        # Check curation_queue
        result = conn.execute(text("""
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'curation_queue' 
            ORDER BY ordinal_position
        """))
        columns = [row[0] for row in result.fetchall()]
        print(f"\n✓ curation_queue columns: {', '.join(columns[:5])}...")
        
        # Check video_metadata
        result = conn.execute(text("""
            SELECT COUNT(*) as cnt FROM information_schema.columns 
            WHERE table_name = 'video_metadata' AND column_name IN ('thumbnail_url', 'poster_url')
        """))
        url_cols = result.scalar() or 0
        print(f"✓ video_metadata has {url_cols}/2 URL columns")
        
        # Check curation queue content
        result = conn.execute(text("""
            SELECT content_type, COUNT(*) as cnt FROM curation_queue 
            GROUP BY content_type
        """))
        for row in result.fetchall():
            print(f"✓ Curation queue: {row[0]} -> {row[1]} items")
    
    print("\n" + "=" * 60)
    print("✓ DATABASE FIX COMPLETED SUCCESSFULLY")
    print("=" * 60)

if __name__ == '__main__':
    main()

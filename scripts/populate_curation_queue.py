#!/usr/bin/env python3
"""
Populate Curation Queue Script

Populates the curation_queue table with existing images and videos from the database.
This ensures the admin curation dashboard has data to display.

Usage:
    docker-compose exec postgis_db python3 /tmp/populate_curation_queue.py
"""

import psycopg2
import os
import sys
from datetime import datetime

# Database connection parameters
DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_PORT = os.getenv('DB_PORT', '5432')
DB_NAME = os.getenv('DB_NAME', 'impact_db')
DB_USER = os.getenv('DB_USER', 'postgres')
DB_PASSWORD = os.getenv('DB_PASSWORD', '')

def populate_curation_queue():
    """Populate curation queue with existing images and videos."""
    try:
        # Connect to database
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD
        )
        cursor = conn.cursor()
        
        print("Connected to database successfully")
        
        # Count existing queue items
        cursor.execute("SELECT COUNT(*) FROM curation_queue;")
        existing_count = cursor.fetchone()[0]
        print(f"Existing curation queue items: {existing_count}")
        
        # Populate from images
        print("\nPopulating curation queue from image_metadata...")
        cursor.execute("""
            INSERT INTO curation_queue (content_type, content_id, status, priority, created_at)
            SELECT 
                'image'::varchar(20) as content_type,
                id as content_id,
                'pending'::varchar(13) as status,
                'medium'::varchar(6) as priority,
                NOW() as created_at
            FROM image_metadata
            WHERE id NOT IN (
                SELECT content_id 
                FROM curation_queue 
                WHERE content_type = 'image' 
                AND content_id IS NOT NULL
            )
            ON CONFLICT DO NOTHING;
        """)
        images_added = cursor.rowcount
        print(f"✓ Added {images_added} images to curation queue")
        
        # Populate from videos
        print("\nPopulating curation queue from video_metadata...")
        cursor.execute("""
            INSERT INTO curation_queue (content_type, content_id, status, priority, created_at)
            SELECT 
                'video'::varchar(20) as content_type,
                id as content_id,
                'pending'::varchar(13) as status,
                'medium'::varchar(6) as priority,
                NOW() as created_at
            FROM video_metadata
            WHERE id NOT IN (
                SELECT content_id 
                FROM curation_queue 
                WHERE content_type = 'video' 
                AND content_id IS NOT NULL
            )
            ON CONFLICT DO NOTHING;
        """)
        videos_added = cursor.rowcount
        print(f"✓ Added {videos_added} videos to curation queue")
        
        # Commit changes
        conn.commit()
        
        # Show final statistics
        cursor.execute("""
            SELECT 
                content_type,
                status,
                COUNT(*) as count
            FROM curation_queue
            GROUP BY content_type, status
            ORDER BY content_type, status;
        """)
        
        print("\n" + "=" * 50)
        print("CURATION QUEUE STATISTICS")
        print("=" * 50)
        print(f"{'Content Type':<15} {'Status':<15} {'Count':<10}")
        print("-" * 50)
        
        for row in cursor.fetchall():
            content_type, status, count = row
            print(f"{content_type:<15} {status:<15} {count:<10}")
        
        cursor.execute("SELECT COUNT(*) FROM curation_queue;")
        total = cursor.fetchone()[0]
        print("-" * 50)
        print(f"{'TOTAL':<15} {'':<15} {total:<10}")
        print("=" * 50)
        
        print(f"\n✓ Successfully populated curation queue!")
        print(f"  - Images added: {images_added}")
        print(f"  - Videos added: {videos_added}")
        print(f"  - Total items: {total}")
        
        cursor.close()
        conn.close()
        
        return 0
        
    except Exception as e:
        print(f"❌ Error populating curation queue: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(populate_curation_queue())

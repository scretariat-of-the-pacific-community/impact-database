"""Simple population script using raw SQL."""
from sqlalchemy import create_engine, text
import os

# Get database URL
database_url = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@postgis_db:5432/postgres')

engine = create_engine(database_url)

with engine.connect() as conn:
    # Check if tables exist
    result = conn.execute(text("""
        SELECT COUNT(*) FROM image_metadata
    """))
    print(f"Images in DB: {result.scalar()}")
    
    result = conn.execute(text("""
        SELECT COUNT(*) FROM video_metadata
    """))
    print(f"Videos in DB: {result.scalar()}")
    
    # Insert images into curation queue
    result = conn.execute(text("""
        INSERT INTO curation_queue (image_id, content_type, content_id, status, priority)
        SELECT id, 'image', id, 'pending', 'medium'
        FROM image_metadata
        WHERE id NOT IN (
            SELECT COALESCE(image_id, content_id) FROM curation_queue WHERE content_type = 'image'
        )
        ON CONFLICT DO NOTHING
        RETURNING id
    """))
    images_added = len(result.fetchall())
    print(f"Added {images_added} images to queue")
    
    # Insert videos into curation queue
    result = conn.execute(text("""
        INSERT INTO curation_queue (content_type, content_id, status, priority)
        SELECT 'video', id, 'pending', 'medium'
        FROM video_metadata
        WHERE id NOT IN (
            SELECT content_id FROM curation_queue WHERE content_type = 'video'
        )
        ON CONFLICT DO NOTHING
        RETURNING id
    """))
    videos_added = len(result.fetchall())
    print(f"Added {videos_added} videos to queue")
    
    # Commit the transaction
    conn.commit()
    
    # Check final count
    result = conn.execute(text("SELECT COUNT(*) FROM curation_queue"))
    print(f"Total items in curation queue: {result.scalar()}")

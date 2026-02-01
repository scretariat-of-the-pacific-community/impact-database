#!/usr/bin/env python3
"""Populate database with sample disaster impact data."""
import os
import sys
from datetime import datetime, timedelta
from sqlalchemy import create_engine, text
import random

# Database connection
database_url = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@postgis_db:5432/impact_db')
engine = create_engine(database_url)

# Sample data
HAZARDS = ['Cyclone', 'Tsunami', 'Flood', 'Volcanic Eruption', 'Earthquake', 'Drought', 'Landslide']
COUNTRIES = ['Fiji', 'Tonga', 'Vanuatu', 'Solomon Islands', 'Samoa', 'Kiribati', 'Tuvalu', 'Papua New Guinea']
SEVERITIES = ['minor', 'moderate', 'severe', 'catastrophic']
LOCATIONS = [
    ('Suva', -18.1416, 178.4419),
    ('Nuku\'alofa', -21.1393, -175.2045),
    ('Port Vila', -17.7333, 168.3273),
    ('Honiara', -9.4333, 159.9500),
    ('Apia', -13.8333, -171.7667),
    ('Tarawa', 1.3382, 172.9798),
    ('Funafuti', -8.5167, 179.2167),
    ('Port Moresby', -9.4438, 147.1803)
]

DESCRIPTIONS = [
    "Infrastructure damage assessment showing road flooding and debris",
    "Coastal erosion and storm surge impact on residential areas",
    "Building structural damage from high winds and water intrusion",
    "Agricultural land affected by saltwater inundation",
    "Community evacuation center showing displaced families",
    "Emergency response teams conducting rescue operations",
    "Damaged water supply infrastructure and sanitation facilities",
    "School buildings impacted requiring temporary closure",
    "Health facility damage affecting medical service delivery",
    "Power line damage causing widespread electricity outages"
]

SOURCES = [
    "Pacific Community Disaster Assessment Team",
    "National Disaster Management Office",
    "Red Cross Field Survey",
    "UN OCHA Assessment Mission",
    "World Bank Damage Assessment",
    "Asian Development Bank Survey"
]

def create_sample_images(conn, count=50):
    """Create sample image records."""
    print(f"Creating {count} sample images...")
    
    images_created = 0
    for i in range(count):
        location_name, lat, lon = random.choice(LOCATIONS)
        hazard = random.choice(HAZARDS)
        country = random.choice(COUNTRIES)
        description = random.choice(DESCRIPTIONS)
        source = random.choice(SOURCES)
        
        # Random date within last 3 years
        days_ago = random.randint(1, 1095)
        capture_date = datetime.now() - timedelta(days=days_ago)
        
        # Add some coordinate variation
        lat_offset = random.uniform(-0.5, 0.5)
        lon_offset = random.uniform(-0.5, 0.5)
        altitude = random.uniform(0, 500)
        
        try:
            import uuid
            result = conn.execute(text("""
                INSERT INTO image_metadata (
                    id, datetime, geometry, hazard_type, event_id, status,
                    data_license, source_type, uploader_id, thumbnail_url,
                    location, country, title, abstract, source
                )
                VALUES (
                    gen_random_uuid(), :datetime, 
                    ST_SetSRID(ST_MakePoint(:lon, :lat, :altitude), 4326),
                    :hazard_type, :event_id, :status,
                    :data_license, :source_type, :uploader_id, :thumbnail_url,
                    :location, :country, :title, :abstract, :source
                )
                RETURNING id
            """), {
                'datetime': capture_date,
                'lon': lon + lon_offset,
                'lat': lat + lat_offset,
                'altitude': altitude,
                'hazard_type': hazard,
                'event_id': f'EVENT-{random.randint(1000, 9999)}',
                'status': random.choice(['approved', 'pending', 'under_review']),
                'data_license': 'CC-BY-4.0',
                'source_type': 'field_assessment',
                'uploader_id': 'system',
                'thumbnail_url': f'/uploads/thumbnails/sample_{i+1}_thumb.jpg',
                'location': location_name,
                'country': country,
                'title': f"{hazard} Impact in {location_name}, {country}",
                'abstract': f"{description}. Location: {location_name}.",
                'source': source
            })
            image_id = result.fetchone()[0]
            images_created += 1
            
            # Skip curation queue due to schema issues
            # if random.random() < 0.3:
            #     conn.execute(text("""
            #         INSERT INTO curation_queue (
            #             image_id, content_type, content_id, status, priority, created_at
            #         )
            #         VALUES (:image_id, 'image', :image_id, :status, :priority, NOW())
            #         ON CONFLICT DO NOTHING
            #     """), {
            #         'image_id': image_id,
            #         'status': random.choice(['pending', 'in_review', 'approved']),
            #         'priority': random.choice(['low', 'medium', 'high'])
            #     })
                
        except Exception as e:
            print(f"Error creating image {i+1}: {e}")
            conn.rollback()
            continue
    
    conn.commit()
    print(f"✓ Created {images_created} images")
    return images_created

def create_sample_videos(conn, count=20):
    """Create sample video records."""
    print(f"Creating {count} sample videos...")
    
    videos_created = 0
    for i in range(count):
        location_name, lat, lon = random.choice(LOCATIONS)
        hazard = random.choice(HAZARDS)
        country = random.choice(COUNTRIES)
        
        days_ago = random.randint(1, 730)
        capture_date = datetime.now() - timedelta(days=days_ago)
        
        lat_offset = random.uniform(-0.5, 0.5)
        lon_offset = random.uniform(-0.5, 0.5)
        altitude = random.uniform(0, 500)
        
        try:
            result = conn.execute(text("""
                INSERT INTO video_metadata (
                    id, created_at, updated_at, filename, original_filename,
                    file_size, media_type, duration, width, height,
                    processing_state, geometry, hazard_type, event_id,
                    uploader_id, source_type, status, title, abstract,
                    data_license, view_count, download_count, poster_url
                )
                VALUES (
                    gen_random_uuid(), NOW(), NOW(), :filename, :original_filename,
                    :file_size, :media_type, :duration, :width, :height,
                    :processing_state, 
                    ST_SetSRID(ST_MakePoint(:lon, :lat, :altitude), 4326),
                    :hazard_type, :event_id,
                    :uploader_id, :source_type, :status, :title, :abstract,
                    :data_license, :view_count, :download_count, :poster_url
                )
                RETURNING id
            """), {
                'filename': f'sample_video_{i+1}.mp4',
                'original_filename': f'{hazard.lower().replace(" ", "_")}_{location_name.lower()}.mp4',
                'file_size': random.randint(5000000, 50000000),
                'media_type': 'video/mp4',
                'duration': random.randint(30, 600),
                'width': random.choice([1920, 1280, 720]),
                'height': random.choice([1080, 720, 480]),
                'processing_state': 'completed',
                'lon': lon + lon_offset,
                'lat': lat + lat_offset,
                'altitude': altitude,
                'hazard_type': hazard,
                'event_id': f'EVENT-{random.randint(1000, 9999)}',
                'uploader_id': 'system',
                'source_type': 'field_assessment',
                'status': random.choice(['approved', 'pending']),
                'title': f"{hazard} Footage - {location_name}, {country}",
                'abstract': f"Video documentation of {hazard.lower()} impact in {location_name}.",
                'data_license': 'CC-BY-4.0',
                'view_count': random.randint(0, 500),
                'download_count': random.randint(0, 50),
                'poster_url': f'/uploads/thumbnails/video_{i+1}_thumb.jpg'
            })
            video_id = result.fetchone()[0]
            videos_created += 1
            
            # Skip curation queue due to schema issues  
            # if random.random() < 0.4:
            #     conn.execute(text("""
            #         INSERT INTO curation_queue (
            #             content_type, content_id, status, priority, created_at
            #         )
            #         VALUES ('video', :video_id, :status, :priority, NOW())
            #         ON CONFLICT DO NOTHING
            #     """), {
            #         'video_id': video_id,
            #         'status': random.choice(['pending', 'in_review']),
            #         'priority': random.choice(['low', 'medium', 'high'])
            #     })
                
        except Exception as e:
            print(f"Error creating video {i+1}: {e}")
            conn.rollback()
            continue
    
    conn.commit()
    print(f"✓ Created {videos_created} videos")
    return videos_created

def main():
    """Main execution."""
    print("=" * 60)
    print("POPULATING DATABASE WITH SAMPLE DATA")
    print("=" * 60)
    
    try:
        with engine.connect() as conn:
            # Check current state
            result = conn.execute(text("SELECT COUNT(*) FROM image_metadata"))
            current_images = result.scalar()
            result = conn.execute(text("SELECT COUNT(*) FROM video_metadata"))
            current_videos = result.scalar()
            
            print(f"\nCurrent state:")
            print(f"  Images: {current_images}")
            print(f"  Videos: {current_videos}")
            print()
            
            if current_images > 0 or current_videos > 0:
                print("⚠️  Database already contains data!")
                response = input("Do you want to add MORE sample data? (yes/no): ")
                if response.lower() not in ['yes', 'y']:
                    print("Cancelled.")
                    return
            
            # Create sample data
            images_created = create_sample_images(conn, count=50)
            videos_created = create_sample_videos(conn, count=20)
            
            # Show final counts
            result = conn.execute(text("SELECT COUNT(*) FROM image_metadata"))
            total_images = result.scalar()
            result = conn.execute(text("SELECT COUNT(*) FROM video_metadata"))
            total_videos = result.scalar()
            result = conn.execute(text("SELECT COUNT(*) FROM curation_queue"))
            total_queue = result.scalar()
            
            print()
            print("=" * 60)
            print("SUMMARY")
            print("=" * 60)
            print(f"✓ Total images in database: {total_images}")
            print(f"✓ Total videos in database: {total_videos}")
            print(f"✓ Items in curation queue: {total_queue}")
            print()
            print("🎉 Sample data population complete!")
            print("=" * 60)
            
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()

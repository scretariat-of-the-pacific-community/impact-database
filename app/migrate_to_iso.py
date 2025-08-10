"""
Migration script to add ISO 19115 fields to existing database
"""
from sqlalchemy import create_engine, text
from models.database import Base
import sys

DATABASE_URL = "postgresql://impactuser:impactpass@db:5432/impactdb"

def migrate_database():
    """Add ISO 19115 fields to existing ImageMetadata table"""
    engine = create_engine(DATABASE_URL)
    
    # SQL commands to add new columns
    migrations = [
        # ISO 19115 Identification Information
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS title VARCHAR",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS title_i18n JSON DEFAULT '{}'::json",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS abstract TEXT",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS abstract_i18n JSON DEFAULT '{}'::json",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS purpose VARCHAR",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS purpose_i18n JSON DEFAULT '{}'::json",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'Completed'",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS point_of_contact VARCHAR",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS date_stamp TIMESTAMP DEFAULT NOW()",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS maintenance_frequency VARCHAR",
        
        # ISO 19115 Spatial & Temporal Extent
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS geographic_bounding_box JSON",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS geographic_identifier VARCHAR",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS temporal_extent_start TIMESTAMP",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS temporal_extent_end TIMESTAMP",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS vertical_extent FLOAT",
        
        # ISO 19115 Content Information
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS topic_category JSON DEFAULT '[\"environment\", \"disaster\", \"imageryBaseMapsEarthCover\"]'",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS keywords JSON",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS keywords_i18n JSON DEFAULT '{}'::json",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS keyword_thesaurus VARCHAR DEFAULT 'SPC Hazard Vocabulary'",
        
        # ISO 19115 Distribution Information
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS resource_locator VARCHAR",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS format_name VARCHAR DEFAULT 'JPEG'",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS format_version VARCHAR DEFAULT '1.0'",
        
        # ISO 19115 Data Quality & Lineage
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS lineage_statement TEXT",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS source VARCHAR",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS positional_accuracy FLOAT",
        
        # ISO 19115 Constraints
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS use_constraints VARCHAR DEFAULT 'CC-BY'",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS access_constraints VARCHAR DEFAULT 'Public'",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS security_classification VARCHAR DEFAULT 'Unclassified'",
        
        # ISO 19115 Metadata Record Info
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS metadata_language VARCHAR DEFAULT 'eng'",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS metadata_standard_name VARCHAR DEFAULT 'ISO 19115:2003'",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS metadata_standard_version VARCHAR DEFAULT '1.0'",
        "ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS metadata_date TIMESTAMP DEFAULT NOW()",

        # Backfill translation columns for existing records
        "UPDATE image_metadata SET title_i18n = json_build_object('eng', title)\n"
        "    WHERE title IS NOT NULL AND (title_i18n IS NULL OR title_i18n = '{}'::json)",
        "UPDATE image_metadata SET abstract_i18n = json_build_object('eng', abstract)\n"
        "    WHERE abstract IS NOT NULL AND (abstract_i18n IS NULL OR abstract_i18n = '{}'::json)",
        "UPDATE image_metadata SET purpose_i18n = json_build_object('eng', purpose)\n"
        "    WHERE purpose IS NOT NULL AND (purpose_i18n IS NULL OR purpose_i18n = '{}'::json)",
        "UPDATE image_metadata SET keywords_i18n = json_build_object('eng', keywords)\n"
        "    WHERE keywords IS NOT NULL AND (keywords_i18n IS NULL OR keywords_i18n = '{}'::json)"
    ]
    
    try:
        with engine.connect() as conn:
            for migration in migrations:
                print(f"Executing: {migration}")
                conn.execute(text(migration))
                conn.commit()
        
        print("✅ Database migration completed successfully!")
        print("🌍 Your Impact Database is now ISO 19115:2003 compliant!")
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    migrate_database()

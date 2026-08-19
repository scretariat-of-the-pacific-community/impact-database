#!/usr/bin/env python3
"""
Database Initialization Script
Ensures all database roles, extensions, and schema are properly set up.
Safe to run multiple times - idempotent operations only.
"""

import os
import sys
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def get_db_config():
    """Get database configuration from environment."""
    return {
        'host': os.getenv('DATABASE_HOST', 'postgis_db'),
        'port': int(os.getenv('DATABASE_PORT', 5432)),
        'database': os.getenv('DATABASE_NAME', 'postgres'),
        'user': os.getenv('DATABASE_USER', 'postgres'),
        'password': os.getenv('DATABASE_PASSWORD', 'postgres'),
    }


def create_roles(conn):
    """Create database roles if they don't exist."""
    logger.info("Creating database roles...")
    
    roles = [
        {
            'name': 'impact_user',
            'password': os.getenv('IMPACT_USER_PASSWORD', 'impact_user_password'),
            'attributes': 'LOGIN NOINHERIT'
        },
        {
            'name': 'oceanportal',
            'password': os.getenv('OCEANPORTAL_PASSWORD', 'oceanportal_password'),
            'attributes': 'LOGIN NOINHERIT'
        },
    ]
    
    with conn.cursor() as cur:
        for role in roles:
            try:
                # Check if role exists
                cur.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (role['name'],))
                if cur.fetchone():
                    logger.info(f"✓ Role '{role['name']}' already exists")
                else:
                    # Create role
                    cur.execute(f"""
                        CREATE ROLE {role['name']} 
                        WITH {role['attributes']} 
                        PASSWORD '{role['password']}'
                    """)
                    logger.info(f"✓ Created role '{role['name']}'")
            except Exception as e:
                logger.error(f"✗ Error creating role '{role['name']}': {e}")
                conn.rollback()
            else:
                conn.commit()


def create_extensions(conn):
    """Create required PostgreSQL extensions."""
    logger.info("Creating database extensions...")
    
    extensions = ['postgis', 'uuid-ossp', 'pg_trgm']
    
    with conn.cursor() as cur:
        for ext in extensions:
            try:
                cur.execute(f"CREATE EXTENSION IF NOT EXISTS \"{ext}\"")
                logger.info(f"✓ Extension '{ext}' enabled")
            except Exception as e:
                logger.error(f"✗ Error creating extension '{ext}': {e}")
                conn.rollback()
            else:
                conn.commit()


def initialize_alembic(conn):
    """Initialize Alembic version table if it doesn't exist."""
    logger.info("Initializing Alembic migration tracking...")
    
    with conn.cursor() as cur:
        try:
            # Create alembic_version table if it doesn't exist
            cur.execute("""
                CREATE TABLE IF NOT EXISTS alembic_version (
                    version_num VARCHAR(32) NOT NULL,
                    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
                )
            """)
            
            # Check if we have a version
            cur.execute("SELECT version_num FROM alembic_version LIMIT 1")
            current = cur.fetchone()
            
            if not current:
                # Set to the latest migration that should be considered "already applied"
                # This prevents re-running migrations on existing databases
                cur.execute("""
                    INSERT INTO alembic_version (version_num) 
                    VALUES ('025_fix_migration_conflicts')
                    ON CONFLICT (version_num) DO NOTHING
                """)
                logger.info("✓ Initialized Alembic at latest migration")
            else:
                logger.info(f"✓ Alembic already initialized at: {current[0]}")
            
            conn.commit()
        except Exception as e:
            logger.error(f"✗ Error initializing Alembic: {e}")
            conn.rollback()


def grant_permissions(conn):
    """Grant necessary permissions to roles."""
    logger.info("Granting database permissions...")
    
    with conn.cursor() as cur:
        try:
            # Grant usage on schema
            cur.execute("GRANT USAGE ON SCHEMA public TO impact_user, oceanportal")
            
            # Grant select on all tables
            cur.execute("""
                GRANT SELECT, INSERT, UPDATE, DELETE 
                ON ALL TABLES IN SCHEMA public 
                TO impact_user, oceanportal
            """)
            
            # Grant usage on sequences
            cur.execute("""
                GRANT USAGE, SELECT 
                ON ALL SEQUENCES IN SCHEMA public 
                TO impact_user, oceanportal
            """)
            
            # Set default privileges for future tables
            cur.execute("""
                ALTER DEFAULT PRIVILEGES IN SCHEMA public 
                GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES 
                TO impact_user, oceanportal
            """)
            
            cur.execute("""
                ALTER DEFAULT PRIVILEGES IN SCHEMA public 
                GRANT USAGE, SELECT ON SEQUENCES 
                TO impact_user, oceanportal
            """)
            
            logger.info("✓ Permissions granted")
            conn.commit()
        except Exception as e:
            logger.error(f"✗ Error granting permissions: {e}")
            conn.rollback()


def verify_schema(conn):
    """Verify critical tables and columns exist."""
    logger.info("Verifying database schema...")
    
    critical_checks = [
        ("video_metadata", "poster_url", "column"),
        ("video_metadata", "thumbnail_url", "column"),
        ("curation_queue", "content_type", "column"),
        ("curation_queue", "content_id", "column"),
        ("curation_comments", None, "table"),
        ("curation_actions", None, "table"),
        ("alembic_version", None, "table"),
    ]
    
    with conn.cursor() as cur:
        all_ok = True
        for check in critical_checks:
            table, column, check_type = check
            
            if check_type == "table":
                cur.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = %s
                    )
                """, (table,))
                exists = cur.fetchone()[0]
                status = "✓" if exists else "✗"
                logger.info(f"{status} Table '{table}': {'exists' if exists else 'MISSING'}")
                if not exists:
                    all_ok = False
            
            elif check_type == "column":
                cur.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_name = %s AND column_name = %s
                    )
                """, (table, column))
                exists = cur.fetchone()[0]
                status = "✓" if exists else "✗"
                logger.info(f"{status} Column '{table}.{column}': {'exists' if exists else 'MISSING'}")
                if not exists:
                    all_ok = False
        
        return all_ok


def main():
    """Main initialization process."""
    logger.info("=" * 60)
    logger.info("DATABASE INITIALIZATION")
    logger.info("=" * 60)
    
    config = get_db_config()
    logger.info(f"Connecting to {config['host']}:{config['port']}/{config['database']}")
    
    try:
        # Connect to database
        conn = psycopg2.connect(**config)
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        logger.info("✓ Connected to database")
        
        # Run initialization steps
        create_extensions(conn)
        create_roles(conn)
        initialize_alembic(conn)
        grant_permissions(conn)
        
        # Verify schema
        logger.info("\n" + "=" * 60)
        logger.info("SCHEMA VERIFICATION")
        logger.info("=" * 60)
        schema_ok = verify_schema(conn)
        
        conn.close()
        
        if schema_ok:
            logger.info("\n" + "=" * 60)
            logger.info("✓ DATABASE INITIALIZATION COMPLETE")
            logger.info("=" * 60)
            logger.info("\nNext steps:")
            logger.info("1. Run: cd /app && alembic upgrade head")
            logger.info("2. Restart application services")
            return 0
        else:
            logger.warning("\n" + "=" * 60)
            logger.warning("⚠ INITIALIZATION COMPLETE WITH WARNINGS")
            logger.warning("=" * 60)
            logger.warning("\nSome schema elements are missing.")
            logger.warning("Run Alembic migrations: cd /app && alembic upgrade head")
            return 0
        
    except Exception as e:
        logger.error(f"\n✗ INITIALIZATION FAILED: {e}")
        return 1


if __name__ == '__main__':
    sys.exit(main())

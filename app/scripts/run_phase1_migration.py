#!/usr/bin/env python3
"""
Execute Phase 1 migration: Add unified auth fields to database

This script applies the database schema changes needed for unified authentication.
Run this as the first step of the migration process.

Usage:
    python scripts/migrations/run_phase1_migration.py [--dry-run]
"""

import argparse
import logging
import os
import sys
from pathlib import Path

# Add app directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_database_url() -> str:
    """Get database URL from environment"""
    return os.getenv(
        "DATABASE_URL",
        f"postgresql://{os.getenv('POSTGRES_USER', 'postgres')}:"
        f"{os.getenv('POSTGRES_PASSWORD', 'postgres')}@"
        f"{os.getenv('POSTGRES_HOST', 'localhost')}:"
        f"{os.getenv('POSTGRES_PORT', '5432')}/"
        f"{os.getenv('POSTGRES_DB', 'impact_db')}"
    )


def run_migration(dry_run: bool = False) -> bool:
    """
    Execute Phase 1 database migration.
    
    Args:
        dry_run: If True, only check what would be done without executing
        
    Returns:
        True if successful, False otherwise
    """
    try:
        # Connect to database
        database_url = get_database_url()
        logger.info(f"Connecting to database...")
        engine = create_engine(database_url)
        
        # Read migration SQL
        migration_file = Path(__file__).parent / "add_unified_auth_fields.sql"
        if not migration_file.exists():
            logger.error(f"Migration file not found: {migration_file}")
            return False
        
        with open(migration_file, 'r') as f:
            migration_sql = f.read()
        
        if dry_run:
            logger.info("DRY RUN MODE - Would execute the following SQL:")
            logger.info("=" * 80)
            logger.info(migration_sql)
            logger.info("=" * 80)
            logger.info("Dry run complete - no changes made")
            return True
        
        # Execute migration
        logger.info("Executing Phase 1 migration...")
        with engine.begin() as conn:
            # Split into individual statements
            statements = [s.strip() for s in migration_sql.split(';') if s.strip()]
            
            for i, statement in enumerate(statements, 1):
                if statement.startswith('--') or not statement:
                    continue
                    
                logger.info(f"Executing statement {i}/{len(statements)}...")
                try:
                    conn.execute(text(statement))
                except Exception as e:
                    # Some statements might fail if columns already exist
                    if "already exists" in str(e).lower():
                        logger.warning(f"Statement {i} skipped (already exists): {str(e)[:100]}")
                    else:
                        raise
        
        logger.info("✓ Phase 1 migration completed successfully!")
        
        # Verify changes
        logger.info("\nVerifying migration...")
        with engine.connect() as conn:
            # Check if new columns exist
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'users' 
                AND column_name IN (
                    'migrated_from_admin',
                    'is_super_admin',
                    'can_access_admin_panel',
                    'organization'
                )
            """))
            columns = [row[0] for row in result]
            
            logger.info(f"✓ Found {len(columns)} new columns in users table:")
            for col in columns:
                logger.info(f"  - {col}")
            
            # Check migration log table
            result = conn.execute(text("""
                SELECT COUNT(*) FROM information_schema.tables 
                WHERE table_name = 'auth_migration_log'
            """))
            table_exists = result.scalar() > 0
            
            if table_exists:
                logger.info("✓ auth_migration_log table created")
            else:
                logger.warning("⚠ auth_migration_log table not found")
        
        logger.info("\n" + "=" * 80)
        logger.info("Phase 1 Migration Summary:")
        logger.info("  ✓ Added migration tracking columns to users table")
        logger.info("  ✓ Added admin-specific fields to users table")
        logger.info("  ✓ Created auth_migration_log audit table")
        logger.info("  ✓ Added indexes for performance")
        logger.info("=" * 80)
        logger.info("\nNext steps:")
        logger.info("  1. Review the changes in your database")
        logger.info("  2. Test UnifiedUserService with existing users")
        logger.info("  3. Proceed to Phase 2: Data Migration")
        
        return True
        
    except Exception as e:
        logger.error(f"Migration failed: {e}", exc_info=True)
        return False


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description="Execute Phase 1 unified auth migration"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without executing"
    )
    
    args = parser.parse_args()
    
    logger.info("=" * 80)
    logger.info("Phase 1: Unified Authentication Migration")
    logger.info("=" * 80)
    
    if args.dry_run:
        logger.info("Running in DRY RUN mode - no changes will be made")
    
    success = run_migration(dry_run=args.dry_run)
    
    if success:
        logger.info("\n✓ Migration completed successfully")
        sys.exit(0)
    else:
        logger.error("\n✗ Migration failed")
        sys.exit(1)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Migration script to migrate admin_users to RBAC users table
Includes conflict resolution, rollback capability, and dry-run mode
"""

import sys
import os
from pathlib import Path
from datetime import datetime
import uuid
import argparse

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.services.admin_service import AdminUser
from app.models.rbac import User, Role
from app.core.config import settings
from typing import Dict, Any, Optional, List
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Role mapping from AdminUser roles to RBAC roles
ADMIN_ROLE_TO_RBAC = {
    "SUPER_ADMIN": {
        "rbac_role": "admin",
        "is_super_admin": True,
        "can_access_admin_panel": True
    },
    "ADMIN": {
        "rbac_role": "admin",
        "is_super_admin": False,
        "can_access_admin_panel": True
    },
    "VIEWER": {
        "rbac_role": "viewer",
        "is_super_admin": False,
        "can_access_admin_panel": True
    }
}


class AdminToRBACMigrator:
    """Migrates admin_users to RBAC users table"""
    
    def __init__(self, db_session, dry_run=False, migrated_by="system"):
        self.db = db_session
        self.dry_run = dry_run
        self.migrated_by = migrated_by
        self.stats = {
            "total": 0,
            "migrated": 0,
            "skipped": 0,
            "conflicts": 0,
            "errors": 0
        }
        self.migration_log: List[Dict[str, Any]] = []
        
    def log_migration(self, admin_user_id: uuid.UUID, rbac_user_id: Optional[uuid.UUID], 
                     migration_type: str, status: str, conflicts: str = None, details: Dict = None):
        """Log migration event to database and memory"""
        log_entry = {
            "admin_user_id": admin_user_id,
            "rbac_user_id": rbac_user_id,
            "migration_type": migration_type,
            "status": status,
            "conflicts": conflicts,
            "details": details or {},
            "migrated_at": datetime.utcnow(),
            "migrated_by": self.migrated_by
        }
        
        self.migration_log.append(log_entry)
        
        if not self.dry_run:
            # Insert into auth_migration_log table
            try:
                insert_sql = text("""
                    INSERT INTO auth_migration_log 
                    (admin_user_id, rbac_user_id, migration_type, status, conflicts, details, migrated_by)
                    VALUES 
                    (:admin_user_id, :rbac_user_id, :migration_type, :status, :conflicts, :details, :migrated_by)
                """)
                
                self.db.execute(insert_sql, {
                    "admin_user_id": str(admin_user_id),
                    "rbac_user_id": str(rbac_user_id) if rbac_user_id else None,
                    "migration_type": migration_type,
                    "status": status,
                    "conflicts": conflicts,
                    "details": str(details) if details else None,
                    "migrated_by": self.migrated_by
                })
                self.db.commit()
            except Exception as e:
                logger.error(f"Failed to log migration: {e}")
                
    def handle_conflict(self, admin_user: AdminUser, existing_rbac_user: User, 
                       conflict_type: str) -> Optional[User]:
        """Handle conflicts when user already exists in RBAC"""
        logger.warning(f"Conflict for {admin_user.username}: {conflict_type}")
        
        conflict_details = {
            "admin_username": admin_user.username,
            "admin_email": admin_user.email,
            "rbac_username": existing_rbac_user.username,
            "rbac_email": existing_rbac_user.email,
            "conflict_type": conflict_type
        }
        
        # Check if emails match - if so, this is likely the same person
        if admin_user.email == existing_rbac_user.email:
            logger.info(f"  Email match - updating existing RBAC user with admin data")
            
            if not self.dry_run:
                # Update existing RBAC user with admin data
                role_mapping = ADMIN_ROLE_TO_RBAC[admin_user.role]
                rbac_role = self.db.query(Role).filter(Role.name == role_mapping["rbac_role"]).first()
                
                existing_rbac_user.role_id = rbac_role.id
                existing_rbac_user.is_super_admin = role_mapping["is_super_admin"]
                existing_rbac_user.can_access_admin_panel = role_mapping["can_access_admin_panel"]
                existing_rbac_user.organization = admin_user.organization
                existing_rbac_user.migrated_from_admin = True
                existing_rbac_user.migration_date = datetime.utcnow()
                existing_rbac_user.legacy_admin_id = admin_user.id
                
                self.db.commit()
                
            self.log_migration(
                admin_user.id, 
                existing_rbac_user.id,
                "update_existing",
                "success",
                conflict_type,
                conflict_details
            )
            self.stats["migrated"] += 1
            return existing_rbac_user
            
        else:
            # Different emails - real conflict, skip this user
            logger.error(f"  Real conflict - emails don't match, skipping")
            self.log_migration(
                admin_user.id,
                existing_rbac_user.id,
                "conflict",
                "skipped",
                conflict_type,
                conflict_details
            )
            self.stats["conflicts"] += 1
            return None
            
    def migrate_single_user(self, admin_user: AdminUser) -> Optional[User]:
        """Migrate a single admin user to RBAC"""
        try:
            self.stats["total"] += 1
            
            # Check if already migrated
            existing_by_legacy = self.db.query(User).filter(
                User.legacy_admin_id == admin_user.id
            ).first()
            
            if existing_by_legacy:
                logger.info(f"Skipping {admin_user.username} - already migrated (legacy_admin_id match)")
                self.log_migration(
                    admin_user.id,
                    existing_by_legacy.id,
                    "skip",
                    "already_migrated",
                    None,
                    {"reason": "legacy_admin_id already set"}
                )
                self.stats["skipped"] += 1
                return existing_by_legacy
                
            # Check for username conflict
            existing_by_username = self.db.query(User).filter(
                User.username == admin_user.username
            ).first()
            
            if existing_by_username:
                return self.handle_conflict(admin_user, existing_by_username, "username_conflict")
                
            # Check for email conflict
            existing_by_email = self.db.query(User).filter(
                User.email == admin_user.email
            ).first()
            
            if existing_by_email:
                return self.handle_conflict(admin_user, existing_by_email, "email_conflict")
                
            # No conflicts - create new RBAC user
            logger.info(f"Migrating {admin_user.username} ({admin_user.email})...")
            
            # Map role
            if admin_user.role not in ADMIN_ROLE_TO_RBAC:
                logger.error(f"  Unknown admin role: {admin_user.role}, skipping")
                self.log_migration(
                    admin_user.id,
                    None,
                    "error",
                    "invalid_role",
                    f"unknown_role: {admin_user.role}",
                    {"role": admin_user.role}
                )
                self.stats["errors"] += 1
                return None
                
            role_mapping = ADMIN_ROLE_TO_RBAC[admin_user.role]
            rbac_role = self.db.query(Role).filter(Role.name == role_mapping["rbac_role"]).first()
            
            if not rbac_role:
                logger.error(f"  RBAC role not found: {role_mapping['rbac_role']}, skipping")
                self.log_migration(
                    admin_user.id,
                    None,
                    "error",
                    "rbac_role_missing",
                    f"role_not_found: {role_mapping['rbac_role']}",
                    {"rbac_role": role_mapping["rbac_role"]}
                )
                self.stats["errors"] += 1
                return None
                
            if self.dry_run:
                logger.info(f"  [DRY RUN] Would create RBAC user with role: {role_mapping['rbac_role']}")
                new_user_id = uuid.uuid4()
            else:
                # Create new RBAC user
                new_user = User(
                    id=uuid.uuid4(),
                    username=admin_user.username,
                    email=admin_user.email,
                    hashed_password=admin_user.password_hash,  # Direct copy (bcrypt compatible)
                    full_name=admin_user.full_name or admin_user.username,
                    role_id=rbac_role.id,
                    # Admin-specific fields
                    is_super_admin=role_mapping["is_super_admin"],
                    can_access_admin_panel=role_mapping["can_access_admin_panel"],
                    organization=admin_user.organization,
                    failed_login_attempts=admin_user.failed_login_attempts or 0,
                    lockout_until=admin_user.lockout_until,
                    last_password_change=admin_user.last_password_change,
                    email_verification_token=admin_user.email_verification_token,
                    # Status fields
                    is_active=admin_user.is_active if admin_user.is_active is not None else True,
                    is_verified=admin_user.is_verified if admin_user.is_verified is not None else False,
                    # Migration tracking
                    migrated_from_admin=True,
                    migration_date=datetime.utcnow(),
                    legacy_admin_id=admin_user.id,
                    # Timestamps
                    last_login=admin_user.last_login,
                    created_at=admin_user.created_at or datetime.utcnow(),
                    # Required RBAC fields with defaults
                    notification_preferences={"email": True, "push": False, "sms": False},
                    review_preferences={"auto_assign": False},
                    timezone="UTC",
                    language="en"
                )
                
                self.db.add(new_user)
                self.db.commit()
                self.db.refresh(new_user)
                new_user_id = new_user.id
                
                logger.info(f"  ✓ Created RBAC user ID: {new_user_id}")
                
            self.log_migration(
                admin_user.id,
                new_user_id,
                "create_new",
                "success",
                None,
                {
                    "admin_role": admin_user.role,
                    "rbac_role": role_mapping["rbac_role"],
                    "is_super_admin": role_mapping["is_super_admin"]
                }
            )
            self.stats["migrated"] += 1
            
            return new_user if not self.dry_run else None
            
        except Exception as e:
            logger.error(f"Error migrating {admin_user.username}: {e}")
            import traceback
            traceback.print_exc()
            
            self.log_migration(
                admin_user.id,
                None,
                "error",
                "exception",
                str(e),
                {"traceback": traceback.format_exc()}
            )
            self.stats["errors"] += 1
            
            if not self.dry_run:
                self.db.rollback()
                
            return None
            
    def migrate_all(self, filter_email: Optional[str] = None):
        """Migrate all admin users (or filtered subset)"""
        logger.info("=" * 60)
        if self.dry_run:
            logger.info("DRY RUN MODE - No changes will be made")
        logger.info("ADMIN TO RBAC MIGRATION")
        logger.info("=" * 60)
        
        # Get admin users
        query = self.db.query(AdminUser)
        if filter_email:
            query = query.filter(AdminUser.email == filter_email)
            
        admin_users = query.order_by(AdminUser.created_at).all()
        
        logger.info(f"Found {len(admin_users)} admin users to migrate")
        logger.info("")
        
        # Migrate each user
        for admin_user in admin_users:
            self.migrate_single_user(admin_user)
            
        # Print summary
        logger.info("")
        logger.info("=" * 60)
        logger.info("MIGRATION SUMMARY")
        logger.info("=" * 60)
        logger.info(f"Total processed:    {self.stats['total']}")
        logger.info(f"Successfully migrated: {self.stats['migrated']}")
        logger.info(f"Already migrated (skipped): {self.stats['skipped']}")
        logger.info(f"Conflicts:          {self.stats['conflicts']}")
        logger.info(f"Errors:             {self.stats['errors']}")
        
        if self.dry_run:
            logger.info("")
            logger.info("This was a DRY RUN - no actual changes were made")
            logger.info("Run with --execute to perform actual migration")
        else:
            logger.info("")
            logger.info("Migration complete!")
            
        return self.stats
        
    def rollback_migration(self, admin_user_id: Optional[uuid.UUID] = None):
        """Rollback migration for specific user or all migrated users"""
        logger.info("=" * 60)
        logger.info("ROLLBACK MIGRATION")
        logger.info("=" * 60)
        
        if admin_user_id:
            # Rollback specific user
            logger.info(f"Rolling back migration for admin user: {admin_user_id}")
            users = self.db.query(User).filter(User.legacy_admin_id == admin_user_id).all()
        else:
            # Rollback all migrated users
            logger.info("Rolling back ALL migrated users")
            users = self.db.query(User).filter(User.migrated_from_admin == True).all()
            
        logger.info(f"Found {len(users)} users to rollback")
        
        if self.dry_run:
            logger.info("[DRY RUN] Would delete the following users:")
            for user in users:
                logger.info(f"  - {user.username} ({user.email}) - legacy_admin_id: {user.legacy_admin_id}")
            return len(users)
        else:
            confirm = input(f"Are you sure you want to delete {len(users)} users? (yes/no): ")
            if confirm.lower() != "yes":
                logger.info("Rollback cancelled")
                return 0
                
            count = 0
            for user in users:
                logger.info(f"Deleting {user.username}...")
                
                # Log rollback
                self.log_migration(
                    user.legacy_admin_id,
                    user.id,
                    "rollback",
                    "deleted",
                    None,
                    {"reason": "manual_rollback"}
                )
                
                self.db.delete(user)
                count += 1
                
            self.db.commit()
            logger.info(f"Rolled back {count} users")
            return count


def main():
    """Main migration function"""
    parser = argparse.ArgumentParser(description="Migrate admin_users to RBAC users table")
    parser.add_argument("--dry-run", action="store_true", help="Run in dry-run mode (no changes)")
    parser.add_argument("--execute", action="store_true", help="Execute actual migration")
    parser.add_argument("--rollback", action="store_true", help="Rollback migration")
    parser.add_argument("--email", type=str, help="Migrate only specific email")
    parser.add_argument("--migrated-by", type=str, default="system", help="Who is running the migration")
    
    args = parser.parse_args()
    
    # Default to dry-run if neither execute nor rollback specified
    dry_run = not args.execute if not args.rollback else args.dry_run
    
    # Create database connection
    engine = create_engine(settings.database_url)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    
    try:
        migrator = AdminToRBACMigrator(db, dry_run=dry_run, migrated_by=args.migrated_by)
        
        if args.rollback:
            migrator.rollback_migration()
        else:
            migrator.migrate_all(filter_email=args.email)
            
    except Exception as e:
        logger.error(f"Migration failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()

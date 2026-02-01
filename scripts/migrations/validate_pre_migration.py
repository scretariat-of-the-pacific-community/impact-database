#!/usr/bin/env python3
"""
Pre-migration validation script for unified authentication
Checks for data quality issues before migrating admin_users to users table
"""

import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker
from app.models.admin import AdminUser
from app.models.rbac import User, Role
from app.core.config import settings
from typing import List, Dict, Any
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class PreMigrationValidator:
    """Validates data before migration"""
    
    def __init__(self, db_session):
        self.db = db_session
        self.issues: List[Dict[str, Any]] = []
        self.warnings: List[Dict[str, Any]] = []
        
    def add_issue(self, category: str, severity: str, message: str, details: Dict = None):
        """Add validation issue"""
        issue = {
            "category": category,
            "severity": severity,
            "message": message,
            "details": details or {}
        }
        if severity in ["error", "critical"]:
            self.issues.append(issue)
        else:
            self.warnings.append(issue)
            
    def check_duplicate_emails_in_admin(self):
        """Check for duplicate emails in admin_users table"""
        logger.info("Checking for duplicate emails in admin_users...")
        
        duplicates = (
            self.db.query(AdminUser.email, func.count(AdminUser.email).label('count'))
            .group_by(AdminUser.email)
            .having(func.count(AdminUser.email) > 1)
            .all()
        )
        
        if duplicates:
            for email, count in duplicates:
                self.add_issue(
                    category="data_quality",
                    severity="error",
                    message=f"Duplicate email in admin_users: {email}",
                    details={"email": email, "count": count}
                )
        else:
            logger.info("✓ No duplicate emails found in admin_users")
            
    def check_duplicate_usernames_in_admin(self):
        """Check for duplicate usernames in admin_users table"""
        logger.info("Checking for duplicate usernames in admin_users...")
        
        duplicates = (
            self.db.query(AdminUser.username, func.count(AdminUser.username).label('count'))
            .group_by(AdminUser.username)
            .having(func.count(AdminUser.username) > 1)
            .all()
        )
        
        if duplicates:
            for username, count in duplicates:
                self.add_issue(
                    category="data_quality",
                    severity="error",
                    message=f"Duplicate username in admin_users: {username}",
                    details={"username": username, "count": count}
                )
        else:
            logger.info("✓ No duplicate usernames found in admin_users")
            
    def check_username_conflicts_with_rbac(self):
        """Check for username conflicts between admin_users and users"""
        logger.info("Checking for username conflicts with RBAC users...")
        
        # Get admin usernames
        admin_usernames = {u.username for u in self.db.query(AdminUser.username).all()}
        
        # Get RBAC usernames (excluding already migrated)
        rbac_users = (
            self.db.query(User.username, User.email, User.legacy_admin_id)
            .filter(User.username.in_(admin_usernames))
            .all()
        )
        
        conflicts = []
        for username, email, legacy_admin_id in rbac_users:
            # Check if this is NOT already migrated
            admin_user = self.db.query(AdminUser).filter(AdminUser.username == username).first()
            if admin_user and str(legacy_admin_id) != str(admin_user.id):
                conflicts.append({
                    "username": username,
                    "rbac_email": email,
                    "admin_email": admin_user.email,
                    "already_migrated": legacy_admin_id is not None
                })
                
        if conflicts:
            for conflict in conflicts:
                severity = "warning" if conflict["already_migrated"] else "error"
                self.add_issue(
                    category="username_conflict",
                    severity=severity,
                    message=f"Username conflict: {conflict['username']}",
                    details=conflict
                )
        else:
            logger.info("✓ No username conflicts found")
            
    def check_email_conflicts_with_rbac(self):
        """Check for email conflicts between admin_users and users"""
        logger.info("Checking for email conflicts with RBAC users...")
        
        # Get admin emails
        admin_emails = {u.email for u in self.db.query(AdminUser.email).all()}
        
        # Get RBAC emails (excluding already migrated)
        rbac_users = (
            self.db.query(User.email, User.username, User.legacy_admin_id)
            .filter(User.email.in_(admin_emails))
            .all()
        )
        
        conflicts = []
        for email, username, legacy_admin_id in rbac_users:
            # Check if this is NOT already migrated
            admin_user = self.db.query(AdminUser).filter(AdminUser.email == email).first()
            if admin_user and str(legacy_admin_id) != str(admin_user.id):
                conflicts.append({
                    "email": email,
                    "rbac_username": username,
                    "admin_username": admin_user.username,
                    "already_migrated": legacy_admin_id is not None
                })
                
        if conflicts:
            for conflict in conflicts:
                severity = "warning" if conflict["already_migrated"] else "error"
                self.add_issue(
                    category="email_conflict",
                    severity=severity,
                    message=f"Email conflict: {conflict['email']}",
                    details=conflict
                )
        else:
            logger.info("✓ No email conflicts found")
            
    def check_invalid_roles(self):
        """Check for invalid or unmappable admin roles"""
        logger.info("Checking for invalid admin roles...")
        
        # Role mapping from admin to RBAC
        VALID_ADMIN_ROLES = {'SUPER_ADMIN', 'ADMIN', 'VIEWER'}
        
        admin_users = self.db.query(AdminUser).all()
        
        for admin_user in admin_users:
            if admin_user.role not in VALID_ADMIN_ROLES:
                self.add_issue(
                    category="invalid_role",
                    severity="error",
                    message=f"Invalid admin role: {admin_user.role}",
                    details={
                        "username": admin_user.username,
                        "email": admin_user.email,
                        "role": admin_user.role
                    }
                )
                
        # Check RBAC roles exist
        rbac_roles = {r.name for r in self.db.query(Role.name).all()}
        required_roles = {'admin', 'viewer'}
        missing_roles = required_roles - rbac_roles
        
        if missing_roles:
            self.add_issue(
                category="missing_rbac_roles",
                severity="critical",
                message=f"Missing RBAC roles: {missing_roles}",
                details={"missing_roles": list(missing_roles)}
            )
        else:
            logger.info("✓ All required RBAC roles exist")
            
    def check_data_integrity(self):
        """Check for data integrity issues"""
        logger.info("Checking data integrity...")
        
        # Check for null critical fields in admin_users
        admin_users = self.db.query(AdminUser).all()
        
        for admin_user in admin_users:
            if not admin_user.username:
                self.add_issue(
                    category="data_integrity",
                    severity="error",
                    message=f"Admin user missing username",
                    details={"id": str(admin_user.id), "email": admin_user.email}
                )
            if not admin_user.email:
                self.add_issue(
                    category="data_integrity",
                    severity="error",
                    message=f"Admin user missing email",
                    details={"id": str(admin_user.id), "username": admin_user.username}
                )
            if not admin_user.password_hash:
                self.add_issue(
                    category="data_integrity",
                    severity="error",
                    message=f"Admin user missing password hash",
                    details={"username": admin_user.username, "email": admin_user.email}
                )
                
        logger.info("✓ Data integrity checks complete")
        
    def check_already_migrated(self):
        """Check how many users are already migrated"""
        logger.info("Checking migration status...")
        
        total_admin = self.db.query(AdminUser).count()
        migrated = self.db.query(User).filter(User.migrated_from_admin == True).count()
        
        logger.info(f"Total admin users: {total_admin}")
        logger.info(f"Already migrated: {migrated}")
        logger.info(f"Remaining to migrate: {total_admin - migrated}")
        
        return {
            "total_admin": total_admin,
            "already_migrated": migrated,
            "remaining": total_admin - migrated
        }
        
    def run_all_checks(self):
        """Run all validation checks"""
        logger.info("=" * 60)
        logger.info("PRE-MIGRATION VALIDATION")
        logger.info("=" * 60)
        
        # Run all checks
        self.check_duplicate_emails_in_admin()
        self.check_duplicate_usernames_in_admin()
        self.check_username_conflicts_with_rbac()
        self.check_email_conflicts_with_rbac()
        self.check_invalid_roles()
        self.check_data_integrity()
        stats = self.check_already_migrated()
        
        # Print summary
        logger.info("")
        logger.info("=" * 60)
        logger.info("VALIDATION SUMMARY")
        logger.info("=" * 60)
        
        if not self.issues and not self.warnings:
            logger.info("✓ All validation checks passed!")
            logger.info(f"Ready to migrate {stats['remaining']} users")
            return True
        else:
            if self.issues:
                logger.error(f"✗ Found {len(self.issues)} critical issues:")
                for issue in self.issues:
                    logger.error(f"  [{issue['severity'].upper()}] {issue['message']}")
                    if issue['details']:
                        logger.error(f"    Details: {issue['details']}")
                        
            if self.warnings:
                logger.warning(f"⚠ Found {len(self.warnings)} warnings:")
                for warning in self.warnings:
                    logger.warning(f"  [{warning['severity'].upper()}] {warning['message']}")
                    if warning['details']:
                        logger.warning(f"    Details: {warning['details']}")
                        
            if self.issues:
                logger.error("")
                logger.error("Migration CANNOT proceed until critical issues are resolved")
                return False
            else:
                logger.warning("")
                logger.warning("Migration can proceed but review warnings first")
                return True


def main():
    """Main validation function"""
    # Create database connection
    engine = create_engine(settings.database_url)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    
    try:
        validator = PreMigrationValidator(db)
        success = validator.run_all_checks()
        
        sys.exit(0 if success else 1)
        
    except Exception as e:
        logger.error(f"Validation failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()

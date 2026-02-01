"""
Unified User Service - Abstraction layer for dual authentication systems

This service provides a unified interface for user operations during the migration
from admin_users to RBAC users table. It allows the application to work with both
systems simultaneously and provides a clean migration path.

Usage:
    service = UnifiedUserService(db)
    user = service.authenticate(username, password)
    new_user = service.create_user(username, email, password, role_name="admin")
"""

import logging
import os
import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

import bcrypt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from models.rbac import User, Role
from services.admin_service import AdminUser, UserRole as AdminUserRole

logger = logging.getLogger(__name__)

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Role mapping between admin and RBAC systems
ADMIN_ROLE_TO_RBAC = {
    "super_admin": ("admin", {"is_super_admin": True, "can_access_admin_panel": True}),
    "admin": ("admin", {"is_super_admin": False, "can_access_admin_panel": True}),
    "viewer": ("viewer", {"is_super_admin": False, "can_access_admin_panel": True}),
}


class UnifiedUserService:
    """
    Unified service for user operations across admin_users and RBAC users tables.
    
    This service abstracts the complexity of managing two user tables during migration.
    It provides a single interface for authentication, user creation, and updates.
    """
    
    def __init__(self, db: Session, prefer_rbac: bool = True):
        """
        Initialize the unified user service.
        
        Args:
            db: SQLAlchemy database session
            prefer_rbac: If True, prefer RBAC users table for operations (default: True)
        """
        self.db = db
        self.prefer_rbac = prefer_rbac
        self.migration_enabled = os.getenv("AUTH_MIGRATION_ENABLED", "true").lower() == "true"
    
    def get_user_by_username(self, username: str) -> Optional[User]:
        """
        Get user by username from unified system.
        
        Checks RBAC users table first, falls back to admin_users if not found.
        
        Args:
            username: Username to search for
            
        Returns:
            User object if found, None otherwise
        """
        # Check RBAC users first
        user = self.db.query(User).filter(User.username == username).first()
        if user:
            logger.debug(f"Found user {username} in RBAC users table")
            return user
        
        # Fall back to admin_users if migration not complete
        admin_user = self.db.query(AdminUser).filter(AdminUser.username == username).first()
        if admin_user and self.migration_enabled:
            logger.warning(f"User {username} found in admin_users but not RBAC - should be migrated")
        
        return None
    
    def get_user_by_email(self, email: str) -> Optional[User]:
        """
        Get user by email from unified system.
        
        Args:
            email: Email address to search for
            
        Returns:
            User object if found, None otherwise
        """
        # Check RBAC users first
        user = self.db.query(User).filter(User.email == email).first()
        if user:
            return user
        
        # Check if exists in admin_users (for migration planning)
        admin_user = self.db.query(AdminUser).filter(AdminUser.email == email).first()
        if admin_user and self.migration_enabled:
            logger.warning(f"User {email} exists in admin_users but not RBAC")
        
        return None
    
    def authenticate(self, username: str, password: str) -> Optional[User]:
        """
        Authenticate user with username/email and password.
        
        Handles both native RBAC users and migrated users from admin_users.
        For migrated users, verifies password against the original admin_users record
        and automatically rehashes to native RBAC format on successful login.
        
        Args:
            username: Username or email
            password: Plain text password
            
        Returns:
            User object if authentication succeeds, None otherwise
        """
        # Try RBAC users first
        user = self.db.query(User).filter(
            (User.username == username) | (User.email == username)
        ).first()
        
        if not user:
            logger.warning(f"User {username} not found in RBAC system")
            return None
        
        # Check if user was migrated from admin_users
        if user.migrated_from_admin and user.legacy_admin_id:
            # Need to verify password using admin_users salt
            admin_user = self.db.query(AdminUser).filter(
                AdminUser.id == user.legacy_admin_id
            ).first()
            
            if admin_user and admin_user.password_hash and admin_user.salt:
                # Admin uses bcrypt with salt
                password_with_salt = password + admin_user.salt
                if bcrypt.checkpw(password_with_salt.encode('utf-8'), 
                                 admin_user.password_hash.encode('utf-8')):
                    logger.info(f"User {username} authenticated (migrated user, verified via admin_users)")
                    
                    # PHASE 4: Automatically rehash password to native RBAC format
                    logger.info(f"Rehashing password for migrated user {username} to native RBAC format")
                    user.hashed_password = pwd_context.hash(password)
                    user.last_password_change = datetime.now(timezone.utc)
                    # Note: Keep migrated_from_admin=True for audit trail, but user is now fully native
                    
                    # Update last login
                    user.last_login = datetime.now(timezone.utc)
                    self.db.commit()
                    
                    logger.info(f"Password rehashed successfully for {username} - now using native RBAC authentication")
                    return user
                else:
                    logger.warning(f"Password verification failed for migrated user {username}")
                    return None
            else:
                logger.error(f"Migrated user {username} missing admin_users record or salt")
                return None
        
        # Native RBAC user - use passlib bcrypt
        if user.hashed_password:
            if pwd_context.verify(password, user.hashed_password):
                logger.info(f"User {username} authenticated (native RBAC user)")
                # Update last login
                user.last_login = datetime.now(timezone.utc)
                self.db.commit()
                return user
        
        logger.warning(f"Authentication failed for {username}")
        return None
    
    def create_user(
        self,
        username: str,
        email: str,
        password: str,
        role_name: str = "contributor",
        full_name: Optional[str] = None,
        organization: Optional[str] = None,
        is_super_admin: bool = False,
        can_access_admin_panel: bool = False,
        **kwargs
    ) -> User:
        """
        Create a new user in the unified system (RBAC users table).
        
        Args:
            username: Unique username
            email: Unique email address
            password: Plain text password (will be hashed)
            role_name: Role name (contributor, admin, viewer, etc.)
            full_name: User's full name
            organization: Organization name
            is_super_admin: Grant super admin privileges
            can_access_admin_panel: Allow access to admin panel
            **kwargs: Additional fields for User model
            
        Returns:
            Created User object
            
        Raises:
            ValueError: If username or email already exists
        """
        # Check for existing users
        if self.get_user_by_username(username):
            raise ValueError(f"Username {username} already exists")
        
        if self.get_user_by_email(email):
            raise ValueError(f"Email {email} already exists")
        
        # Get role
        role = self.db.query(Role).filter(Role.name == role_name).first()
        if not role:
            # Default to contributor
            role = self.db.query(Role).filter(Role.name == "contributor").first()
            logger.warning(f"Role {role_name} not found, defaulting to contributor")
        
        # Create user
        user = User(
            id=uuid.uuid4(),
            username=username,
            email=email,
            hashed_password=pwd_context.hash(password),
            full_name=full_name,
            role_id=role.id if role else None,
            organization=organization,
            is_super_admin=is_super_admin,
            can_access_admin_panel=can_access_admin_panel,
            is_active=kwargs.get('is_active', True),
            is_verified=kwargs.get('is_verified', False),
            notification_preferences={"email": True, "slack": False, "in_app": True},
            review_preferences={},
            timezone="UTC",
            language="en",
        )
        
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        
        logger.info(f"Created user {username} ({email}) with role {role_name}")
        return user
    
    def update_password(self, user: User, new_password: str) -> None:
        """
        Update user password in unified system.
        
        Args:
            user: User object to update
            new_password: New plain text password
        """
        user.hashed_password = pwd_context.hash(new_password)
        user.last_password_change = datetime.now(timezone.utc)
        self.db.commit()
        logger.info(f"Updated password for user {user.username}")
    
    def check_admin_access(self, user: User) -> bool:
        """
        Check if user has admin panel access.
        
        Args:
            user: User object to check
            
        Returns:
            True if user can access admin panel
        """
        return user.can_access_admin_panel or user.is_super_admin
    
    def check_super_admin(self, user: User) -> bool:
        """
        Check if user has super admin privileges.
        
        Args:
            user: User object to check
            
        Returns:
            True if user is super admin
        """
        return user.is_super_admin
    
    def get_user_permissions(self, user: User) -> List[str]:
        """
        Get all permissions for a user (role + custom).
        
        Args:
            user: User object
            
        Returns:
            List of permission strings
        """
        permissions = []
        
        # Get role permissions
        if user.role and hasattr(user.role, 'permissions'):
            permissions.extend([p.name for p in user.role.permissions])
        
        # Add custom permissions if they exist
        if hasattr(user, 'custom_permissions') and user.custom_permissions:
            permissions.extend(user.custom_permissions)
        
        return list(set(permissions))  # Remove duplicates
    
    def log_migration_event(
        self,
        admin_user_id: Optional[uuid.UUID],
        rbac_user_id: Optional[uuid.UUID],
        migration_type: str,
        status: str,
        conflicts: Optional[Dict] = None,
        details: Optional[Dict] = None
    ) -> None:
        """
        Log a migration event for audit trail.
        
        Args:
            admin_user_id: ID from admin_users table
            rbac_user_id: ID from users (RBAC) table
            migration_type: Type of migration (initial, update, conflict_resolved)
            status: Status (success, failed, skipped)
            conflicts: Any conflicts encountered
            details: Additional details
        """
        log_entry = f"""
            INSERT INTO auth_migration_log 
            (admin_user_id, rbac_user_id, migration_type, status, conflicts, details)
            VALUES (
                {'NULL' if admin_user_id is None else f"'{admin_user_id}'"},
                {'NULL' if rbac_user_id is None else f"'{rbac_user_id}'"},
                '{migration_type}',
                '{status}',
                {'NULL' if conflicts is None else f"'{conflicts}'::jsonb"},
                {'NULL' if details is None else f"'{details}'::jsonb"}
            )
        """
        try:
            self.db.execute(log_entry)
            self.db.commit()
        except Exception as e:
            logger.error(f"Failed to log migration event: {e}")
            self.db.rollback()


def get_unified_user_service(db: Session) -> UnifiedUserService:
    """
    Dependency injection helper for FastAPI.
    
    Usage:
        @router.get("/endpoint")
        async def endpoint(service: UnifiedUserService = Depends(get_unified_user_service)):
            user = service.get_user_by_username("admin")
    """
    return UnifiedUserService(db)

"""Admin services for enhanced user management and role-based access control."""

from typing import List, Dict, Any, Optional
from enum import Enum
from datetime import datetime, timedelta
import bcrypt
import secrets

from sqlalchemy import Column, String, DateTime, Boolean, JSON, Integer, ForeignKey
from sqlalchemy.orm import relationship, Session
from sqlalchemy.dialects.postgresql import UUID
import uuid

from models.database import Base

class UserRole(Enum):
    """User roles with different permission levels."""
    VIEWER = "viewer"  # Can view data only
    CONTRIBUTOR = "contributor"  # Can upload and edit own data
    CURATOR = "curator"  # Can review and approve submissions
    ADMIN = "admin"  # Full administrative access
    SUPER_ADMIN = "super_admin"  # System administration

class Permission(Enum):
    """Granular permissions."""
    VIEW_DATA = "view_data"
    UPLOAD_DATA = "upload_data"
    EDIT_OWN_DATA = "edit_own_data"
    EDIT_ANY_DATA = "edit_any_data"
    DELETE_DATA = "delete_data"
    REVIEW_SUBMISSIONS = "review_submissions"
    MANAGE_USERS = "manage_users"
    BULK_IMPORT = "bulk_import"
    EXPORT_DATA = "export_data"
    VIEW_AUDIT_LOGS = "view_audit_logs"
    SYSTEM_CONFIG = "system_config"

class AdminUser(Base):
    """Enhanced user model with roles and permissions."""
    __tablename__ = "admin_users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    full_name = Column(String, nullable=True)
    
    # Authentication
    password_hash = Column(String, nullable=False)
    salt = Column(String, nullable=False)
    
    # Role and permissions
    role = Column(String, nullable=False, default=UserRole.VIEWER.value)
    custom_permissions = Column(JSON, nullable=True)  # Additional permissions beyond role
    
    # Account status
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    is_locked = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)
    last_password_change = Column(DateTime, default=datetime.utcnow)
    
    # Security
    failed_login_attempts = Column(Integer, default=0)
    lockout_until = Column(DateTime, nullable=True)
    password_reset_token = Column(String, nullable=True)
    password_reset_expires = Column(DateTime, nullable=True)
    email_verification_token = Column(String, nullable=True)
    
    # Profile information
    organization = Column(String, nullable=True)
    position = Column(String, nullable=True)
    timezone = Column(String, default="UTC")
    language_preference = Column(String, default="en")
    
    # Relationships
    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    audit_logs = relationship("UserAuditLog", back_populates="user", cascade="all, delete-orphan")
    
    def has_permission(self, permission: Permission) -> bool:
        """Check if user has a specific permission."""
        role_permissions = self._get_role_permissions()
        custom_perms = self.custom_permissions or []
        
        return (
            permission.value in role_permissions or
            permission.value in custom_perms
        )
    
    def _get_role_permissions(self) -> List[str]:
        """Get permissions for user's role."""
        role_permission_map = {
            UserRole.VIEWER: [
                Permission.VIEW_DATA.value
            ],
            UserRole.CONTRIBUTOR: [
                Permission.VIEW_DATA.value,
                Permission.UPLOAD_DATA.value,
                Permission.EDIT_OWN_DATA.value
            ],
            UserRole.CURATOR: [
                Permission.VIEW_DATA.value,
                Permission.UPLOAD_DATA.value,
                Permission.EDIT_OWN_DATA.value,
                Permission.EDIT_ANY_DATA.value,
                Permission.REVIEW_SUBMISSIONS.value,
                Permission.EXPORT_DATA.value
            ],
            UserRole.ADMIN: [
                Permission.VIEW_DATA.value,
                Permission.UPLOAD_DATA.value,
                Permission.EDIT_OWN_DATA.value,
                Permission.EDIT_ANY_DATA.value,
                Permission.DELETE_DATA.value,
                Permission.REVIEW_SUBMISSIONS.value,
                Permission.MANAGE_USERS.value,
                Permission.BULK_IMPORT.value,
                Permission.EXPORT_DATA.value,
                Permission.VIEW_AUDIT_LOGS.value
            ],
            UserRole.SUPER_ADMIN: [perm.value for perm in Permission]
        }
        
        return role_permission_map.get(UserRole(self.role), [])
    
    def to_dict(self, include_sensitive=False):
        """Convert to dictionary."""
        data = {
            'id': str(self.id),
            'username': self.username,
            'email': self.email,
            'full_name': self.full_name,
            'role': self.role,
            'custom_permissions': self.custom_permissions,
            'is_active': self.is_active,
            'is_verified': self.is_verified,
            'is_locked': self.is_locked,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'last_login': self.last_login.isoformat() if self.last_login else None,
            'organization': self.organization,
            'position': self.position,
            'timezone': self.timezone,
            'language_preference': self.language_preference
        }
        
        if include_sensitive:
            data.update({
                'failed_login_attempts': self.failed_login_attempts,
                'lockout_until': self.lockout_until.isoformat() if self.lockout_until else None,
                'last_password_change': self.last_password_change.isoformat()
            })
        
        return data

class UserSession(Base):
    """User session tracking."""
    __tablename__ = "user_sessions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=False)
    session_token = Column(String, unique=True, nullable=False)
    
    # Session info
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    last_activity = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)
    
    # Client info
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    device_info = Column(JSON, nullable=True)
    
    # Relationships
    user = relationship("AdminUser", back_populates="sessions")

class UserAuditLog(Base):
    """User activity audit log."""
    __tablename__ = "user_audit_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True)
    
    # Action details
    action = Column(String, nullable=False)  # login, logout, create_user, edit_metadata, etc.
    resource_type = Column(String, nullable=True)  # image, user, queue_item, etc.
    resource_id = Column(String, nullable=True)
    
    # Context
    timestamp = Column(DateTime, default=datetime.utcnow)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    
    # Details
    details = Column(JSON, nullable=True)  # Additional action-specific data
    success = Column(Boolean, default=True)
    error_message = Column(String, nullable=True)
    
    # Relationships
    user = relationship("AdminUser", back_populates="audit_logs")

class AdminService:
    """Service class for admin operations."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def create_user(
        self,
        username: str,
        email: str,
        password: str,
        role: UserRole = UserRole.VIEWER,
        full_name: str = None,
        organization: str = None,
        created_by: str = None
    ) -> AdminUser:
        """Create a new user."""
        # Check if user already exists
        existing = self.db.query(AdminUser).filter(
            (AdminUser.username == username) | (AdminUser.email == email)
        ).first()
        
        if existing:
            raise ValueError("Username or email already exists")
        
        # Generate password hash
        salt = secrets.token_hex(16)
        password_hash = bcrypt.hashpw(
            (password + salt).encode('utf-8'),
            bcrypt.gensalt()
        ).decode('utf-8')
        
        # Create user
        user = AdminUser(
            username=username,
            email=email,
            password_hash=password_hash,
            salt=salt,
            role=role.value,
            full_name=full_name,
            organization=organization,
            email_verification_token=secrets.token_urlsafe(32)
        )
        
        self.db.add(user)
        self.db.commit()
        
        # Log the action
        self._log_action(
            user_id=None,
            action="create_user",
            resource_type="user",
            resource_id=str(user.id),
            details={
                "created_user": username,
                "role": role.value,
                "created_by": created_by
            }
        )
        
        return user
    
    def authenticate_user(self, username: str, password: str, ip_address: str = None) -> Optional[AdminUser]:
        """Authenticate user login."""
        user = self.db.query(AdminUser).filter(
            (AdminUser.username == username) | (AdminUser.email == username)
        ).first()
        
        if not user:
            self._log_action(
                user_id=None,
                action="login_failed",
                details={"username": username, "reason": "user_not_found"},
                success=False,
                ip_address=ip_address
            )
            return None
        
        # Check if account is locked
        if user.is_locked or (user.lockout_until and user.lockout_until > datetime.utcnow()):
            self._log_action(
                user_id=user.id,
                action="login_failed",
                details={"username": username, "reason": "account_locked"},
                success=False,
                ip_address=ip_address
            )
            return None
        
        # Verify password
        if not bcrypt.checkpw(
            (password + user.salt).encode('utf-8'),
            user.password_hash.encode('utf-8')
        ):
            # Increment failed attempts
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= 5:
                user.is_locked = True
                user.lockout_until = datetime.utcnow() + timedelta(minutes=30)
            
            self.db.commit()
            
            self._log_action(
                user_id=user.id,
                action="login_failed",
                details={"username": username, "reason": "invalid_password"},
                success=False,
                ip_address=ip_address
            )
            return None
        
        # Successful login
        user.failed_login_attempts = 0
        user.last_login = datetime.utcnow()
        user.lockout_until = None
        self.db.commit()
        
        self._log_action(
            user_id=user.id,
            action="login_success",
            details={"username": username},
            ip_address=ip_address
        )
        
        return user
    
    def create_session(self, user: AdminUser, ip_address: str = None, user_agent: str = None) -> UserSession:
        """Create a new user session."""
        session = UserSession(
            user_id=user.id,
            session_token=secrets.token_urlsafe(32),
            expires_at=datetime.utcnow() + timedelta(hours=24),
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        self.db.add(session)
        self.db.commit()
        
        return session
    
    def get_user_by_session_token(self, token: str) -> Optional[AdminUser]:
        """Get user by session token."""
        session = self.db.query(UserSession).filter(
            UserSession.session_token == token,
            UserSession.is_active == True,
            UserSession.expires_at > datetime.utcnow()
        ).first()
        
        if session:
            # Update last activity
            session.last_activity = datetime.utcnow()
            self.db.commit()
            return session.user
        
        return None
    
    def revoke_session(self, token: str):
        """Revoke a user session."""
        session = self.db.query(UserSession).filter(
            UserSession.session_token == token
        ).first()
        
        if session:
            session.is_active = False
            self.db.commit()
    
    def update_user_role(self, user_id: str, new_role: UserRole, updated_by: str):
        """Update user role."""
        user = self.db.query(AdminUser).filter(AdminUser.id == user_id).first()
        if not user:
            raise ValueError("User not found")
        
        old_role = user.role
        user.role = new_role.value
        user.updated_at = datetime.utcnow()
        self.db.commit()
        
        self._log_action(
            user_id=updated_by,
            action="update_user_role",
            resource_type="user",
            resource_id=str(user.id),
            details={
                "target_user": user.username,
                "old_role": old_role,
                "new_role": new_role.value
            }
        )
    
    def get_dashboard_metrics(self) -> Dict[str, Any]:
        """Get admin dashboard metrics."""
        from sqlalchemy import func
        from models.curation import CurationQueue, CurationAction
        
        # User metrics
        total_users = self.db.query(func.count(AdminUser.id)).scalar()
        active_users = self.db.query(func.count(AdminUser.id)).filter(
            AdminUser.is_active == True
        ).scalar()
        
        # Activity metrics (last 7 days)
        week_ago = datetime.utcnow() - timedelta(days=7)
        recent_logins = self.db.query(func.count(UserAuditLog.id)).filter(
            UserAuditLog.action == "login_success",
            UserAuditLog.timestamp >= week_ago
        ).scalar()
        
        # Queue metrics
        pending_items = self.db.query(func.count(CurationQueue.id)).filter(
            CurationQueue.status == "pending"
        ).scalar()
        
        # Recent activity
        recent_actions = self.db.query(CurationAction).order_by(
            CurationAction.performed_at.desc()
        ).limit(10).all()
        
        return {
            "user_metrics": {
                "total_users": total_users,
                "active_users": active_users,
                "recent_logins": recent_logins
            },
            "queue_metrics": {
                "pending_items": pending_items
            },
            "recent_activity": [
                {
                    "action": action.action_type.value,
                    "user": action.performed_by,
                    "timestamp": action.performed_at.isoformat(),
                    "description": action.description
                }
                for action in recent_actions
            ]
        }
    
    def _log_action(
        self,
        user_id: Optional[str],
        action: str,
        resource_type: str = None,
        resource_id: str = None,
        details: Dict[str, Any] = None,
        success: bool = True,
        error_message: str = None,
        ip_address: str = None
    ):
        """Log user action to audit log."""
        log_entry = UserAuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
            success=success,
            error_message=error_message,
            ip_address=ip_address
        )
        
        self.db.add(log_entry)
        self.db.commit()

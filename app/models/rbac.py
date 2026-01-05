"""
Role-Based Access Control (RBAC) Models
Phase 0: Foundation tables for permissions, roles, and user extensions
"""

from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Table
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from datetime import datetime, timezone
import uuid

from models.database import Base


# Many-to-many relationship: roles <-> permissions
role_permissions = Table(
    'role_permissions',
    Base.metadata,
    Column('role_id', Integer, ForeignKey('roles.id', ondelete='CASCADE'), primary_key=True),
    Column('permission_id', Integer, ForeignKey('permissions.id', ondelete='CASCADE'), primary_key=True),
    Column('granted_at', DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
)


class Role(Base):
    """
    Role model for RBAC system
    Defines roles like admin, senior_reviewer, reviewer, contributor
    """
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), unique=True, nullable=False, index=True)
    display_name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    level = Column(Integer, nullable=False, index=True)  # 1=highest (admin), 5=lowest (viewer)
    is_system_role = Column(Boolean, default=False)  # Cannot be deleted if True
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    permissions = relationship(
        "Permission",
        secondary=role_permissions,
        back_populates="roles",
        lazy="joined"
    )
    users = relationship("User", back_populates="role")

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'display_name': self.display_name,
            'description': self.description,
            'level': self.level,
            'is_system_role': self.is_system_role,
            'permission_count': len(self.permissions) if self.permissions else 0,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def to_dict_with_permissions(self):
        data = self.to_dict()
        data['permissions'] = [p.name for p in self.permissions] if self.permissions else []
        return data


class Permission(Base):
    """
    Permission model for RBAC system
    Defines granular permissions like 'review:read', 'review:approve'
    """
    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    resource = Column(String(50), nullable=False, index=True)  # e.g., 'review_item', 'metadata', 'user'
    action = Column(String(50), nullable=False, index=True)    # e.g., 'read', 'create', 'update', 'delete', 'approve'
    description = Column(Text, nullable=True)

    # Relationships
    roles = relationship(
        "Role",
        secondary=role_permissions,
        back_populates="permissions"
    )

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'resource': self.resource,
            'action': self.action,
            'description': self.description
        }


class User(Base):
    """
    Enhanced User model with RBAC support
    Extends the simple auth.User with database persistence and role assignment
    """
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=True)
    hashed_password = Column(String(255), nullable=True)  # Nullable for SSO users
    
    # SSO fields
    sso_provider = Column(String(50), nullable=True, index=True)  # e.g., 'google', 'github', 'azure'
    sso_provider_id = Column(String(255), nullable=True, index=True)  # Provider's user ID
    
    # Role assignment
    role_id = Column(Integer, ForeignKey('roles.id'), nullable=True, index=True)
    
    # Status flags
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    
    # Timestamps
    last_login = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Profile fields
    avatar_url = Column(String(500), nullable=True)
    bio = Column(Text, nullable=True)
    department = Column(String(100), nullable=True)
    position = Column(String(100), nullable=True)
    timezone = Column(String(50), default='UTC')
    language = Column(String(10), default='en')
    
    # Preferences (JSONB for flexibility)
    notification_preferences = Column(
        JSONB,
        default={'email': True, 'slack': False, 'in_app': True},
        nullable=False
    )
    review_preferences = Column(JSONB, default={}, nullable=False)
    
    # Review statistics
    reviews_completed = Column(Integer, default=0)
    avg_review_time_minutes = Column(Integer, nullable=True)

    # Relationships
    role = relationship("Role", back_populates="users")
    # Extended user data relationships (commented out to avoid forward ref issues)
    # profile = relationship("UserProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    # settings = relationship("UserSettings", back_populates="user", uselist=False, cascade="all, delete-orphan")
    # api_tokens = relationship("APIToken", back_populates="user", cascade="all, delete-orphan")

    def to_dict(self):
        """Convert user to dictionary (safe for API responses - no password)"""
        return {
            'id': str(self.id),
            'email': self.email,
            'username': self.username,
            'full_name': self.full_name,
            'role': self.role.to_dict() if self.role else None,
            'is_active': self.is_active,
            'is_verified': self.is_verified,
            'avatar_url': self.avatar_url,
            'department': self.department,
            'position': self.position,
            'timezone': self.timezone,
            'language': self.language,
            'reviews_completed': self.reviews_completed,
            'avg_review_time_minutes': self.avg_review_time_minutes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_login': self.last_login.isoformat() if self.last_login else None
        }

    def to_dict_with_permissions(self):
        """Include role permissions in response"""
        data = self.to_dict()
        if self.role:
            data['permissions'] = [p.name for p in self.role.permissions]
        else:
            data['permissions'] = []
        return data

    def has_permission(self, permission_name: str) -> bool:
        """Check if user has a specific permission"""
        if not self.role or not self.role.permissions:
            return False
        return any(p.name == permission_name for p in self.role.permissions)

    def has_role(self, role_name: str) -> bool:
        """Check if user has a specific role"""
        return self.role and self.role.name == role_name

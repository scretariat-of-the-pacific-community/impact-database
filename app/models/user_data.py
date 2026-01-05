"""
User Data Models - Settings, API Tokens, and Profiles
Contains models for user preferences, API token management, and extended profile information
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime, timezone, timedelta
import uuid
import secrets

from models.database import Base


class UserProfile(Base):
    """
    Extended user profile information
    Stores additional user metadata beyond basic auth
    """
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey('users.username', ondelete='CASCADE'), unique=True, nullable=False, index=True)
    
    # Profile information
    bio = Column(Text, nullable=True)
    avatar_url = Column(String, nullable=True)
    organization = Column(String, nullable=True)
    location = Column(String, nullable=True)
    website = Column(String, nullable=True)
    
    # Social/contact (optional)
    orcid = Column(String, nullable=True)
    twitter_handle = Column(String, nullable=True)
    
    # Metadata
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships (commented out to avoid circular dependency)
    # user = relationship("User", back_populates="profile")
    
    def to_dict(self):
        return {
            'user_id': self.user_id,
            'bio': self.bio,
            'avatar_url': self.avatar_url,
            'organization': self.organization,
            'location': self.location,
            'website': self.website,
            'orcid': self.orcid,
            'twitter_handle': self.twitter_handle,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class UserSettings(Base):
    """
    User settings and preferences
    Stores user-specific configuration in a flexible JSON structure
    """
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey('users.username', ondelete='CASCADE'), unique=True, nullable=False, index=True)
    
    # Settings stored as JSON for flexibility
    profile_settings = Column(JSONB, default={}, nullable=False)  # Profile visibility, etc.
    privacy_settings = Column(JSONB, default={}, nullable=False)  # Privacy preferences
    notification_settings = Column(JSONB, default={}, nullable=False)  # Email, in-app, push notifications
    default_metadata = Column(JSONB, default={}, nullable=False)  # Default values for uploads
    
    # Metadata
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    # user = relationship("User", back_populates="settings")  # Commented out - circular dependency
    
    def to_dict(self):
        return {
            'user_id': self.user_id,
            'profile': self.profile_settings or {},
            'privacy': self.privacy_settings or {},
            'notifications': self.notification_settings or {},
            'default_metadata': self.default_metadata or {},
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    @staticmethod
    def get_default_settings():
        """Returns default settings structure"""
        return {
            'profile': {
                'avatar_url': '',
                'bio': '',
                'location': '',
                'organization': ''
            },
            'privacy': {
                'public_profile': True,
                'hide_stats': False,
                'anonymous_contributions': False
            },
            'notifications': {
                'email': {
                    'uploads': True,
                    'reviews': True,
                    'comments': True,
                    'achievements': False
                },
                'in_app': {
                    'uploads': True,
                    'reviews': True,
                    'comments': True,
                    'achievements': True
                },
                'push': {
                    'uploads': False,
                    'reviews': False,
                    'comments': False,
                    'achievements': False
                }
            },
            'default_metadata': {
                'tags': []
            }
        }


class APIToken(Base):
    """
    API tokens for programmatic access
    Allows users to generate and manage API tokens with expiration
    """
    __tablename__ = "api_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, ForeignKey('users.username', ondelete='CASCADE'), nullable=False, index=True)
    
    # Token information
    name = Column(String, nullable=False)  # User-friendly name for the token
    token_hash = Column(String, nullable=False, unique=True, index=True)  # Hashed token (never store plaintext)
    token_prefix = Column(String(10), nullable=False)  # First 10 chars for identification
    
    # Permissions and scope
    scopes = Column(JSONB, default=['read'], nullable=False)  # e.g., ['read', 'write', 'delete']
    
    # Usage tracking
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    usage_count = Column(Integer, default=0, nullable=False)
    
    # Expiration
    expires_at = Column(DateTime(timezone=True), nullable=True)  # None = never expires
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Metadata
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships (commented out - circular dependency)
    # user = relationship("User", back_populates="api_tokens")
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_api_tokens_user_active', 'user_id', 'is_active'),
        Index('idx_api_tokens_expiry', 'expires_at'),
    )
    
    def to_dict(self, include_token=False):
        """Convert to dict. Only include actual token on creation."""
        return {
            'id': str(self.id),
            'name': self.name,
            'token_prefix': self.token_prefix,
            'scopes': self.scopes or ['read'],
            'last_used_at': self.last_used_at.isoformat() if self.last_used_at else None,
            'usage_count': self.usage_count,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def is_expired(self):
        """Check if token has expired"""
        if self.expires_at is None:
            return False
        return datetime.now(timezone.utc) > self.expires_at
    
    def is_valid(self):
        """Check if token is valid (active and not expired)"""
        return self.is_active and not self.is_expired()
    
    @staticmethod
    def generate_token():
        """Generate a secure random token"""
        return f"impact_{secrets.token_urlsafe(32)}"
    
    @staticmethod
    def hash_token(token: str) -> str:
        """Hash a token for storage (using simple SHA256 for now)"""
        import hashlib
        return hashlib.sha256(token.encode()).hexdigest()
    
    @staticmethod
    def get_default_expiry(days=90):
        """Get default expiry date (90 days from now)"""
        return datetime.now(timezone.utc) + timedelta(days=days)

"""
Reusable FastAPI dependencies for user lookup and common operations.
Consolidates duplicated user identifier logic into a single source of truth.
"""

from typing import Optional, NamedTuple
from dataclasses import dataclass
import uuid
import logging

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from models.database import get_db
from models.rbac import User as DBUser
from api.auth_rbac import EnhancedUser, get_current_user_enhanced
from services.unified_user_service import UnifiedUserService

logger = logging.getLogger(__name__)


@dataclass
class UserDetails:
    """
    Consolidated user details for use across endpoints.

    Attributes:
        db_user: The database User model instance (may be None if user not in DB yet)
        identifier: String identifier for uploader_id queries (UUID string or username)
        user_uuid: UUID object for foreign key references
        username: The username string
        display_name: Human-readable name for display purposes
    """

    db_user: Optional[DBUser]
    identifier: str
    user_uuid: Optional[uuid.UUID]
    username: str
    display_name: str

    @property
    def id_str(self) -> str:
        """Alias for identifier - string form of user ID."""
        return self.identifier

    @property
    def user_identifiers(self) -> set:
        """
        Set of all possible identifiers that could be in uploader_id.
        Useful for backward compatibility where some records may have username vs UUID.
        """
        identifiers = {self.identifier}
        if self.username and self.username != self.identifier:
            identifiers.add(self.username)
        return identifiers


def get_user_details(
    current_user: EnhancedUser = Depends(get_current_user_enhanced), db: Session = Depends(get_db)
) -> UserDetails:
    """
    Reusable dependency that consolidates user lookup logic.

    Resolves the current authenticated user to:
    - Database user record (if exists)
    - String identifier for uploader_id queries
    - UUID for foreign key references
    - Display name for UI

    Usage:
        @router.get("/my-endpoint")
        async def my_endpoint(user: UserDetails = Depends(get_user_details)):
            # Use user.identifier for uploader_id queries
            # Use user.user_uuid for UUID foreign keys
            # Use user.display_name for UI display

    Raises:
        HTTPException: If user identity cannot be determined
    """
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    username = getattr(current_user, "username", None)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid user session - no username")

    # Query database user
    db_user = db.query(DBUser).filter(DBUser.username == username).first()

    # Resolve identifier (prefer UUID from DB, fallback to current_user.id or username)
    if db_user and getattr(db_user, "id", None):
        identifier = str(db_user.id)
        user_uuid = db_user.id if isinstance(db_user.id, uuid.UUID) else _parse_uuid(db_user.id)
    elif getattr(current_user, "id", None):
        identifier = str(current_user.id)
        user_uuid = _parse_uuid(current_user.id)
    else:
        identifier = username
        user_uuid = None

    # Resolve display name
    if db_user and getattr(db_user, "full_name", None):
        display_name = db_user.full_name
    else:
        display_name = username

    return UserDetails(
        db_user=db_user,
        identifier=identifier,
        user_uuid=user_uuid,
        username=username,
        display_name=display_name,
    )


def get_optional_user_details(
    current_user: Optional[EnhancedUser] = Depends(get_current_user_enhanced),
    db: Session = Depends(get_db),
) -> Optional[UserDetails]:
    """
    Optional version of get_user_details for endpoints that allow anonymous access.
    Returns None if no authenticated user.
    """
    if not current_user or not getattr(current_user, "username", None):
        return None

    try:
        return get_user_details(current_user, db)
    except HTTPException:
        return None


def _parse_uuid(value) -> Optional[uuid.UUID]:
    """Safely parse a value to UUID."""
    if value is None:
        return None
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


# Convenience function for building upload queries with backward-compatible user matching
def build_user_upload_filter(user: UserDetails):
    """
    Build a SQLAlchemy filter for matching user's uploads.
    Handles backward compatibility where uploader_id might be username or UUID.

    Usage:
        from sqlalchemy import or_

        query = db.query(ImageMetadata).filter(
            or_(*[ImageMetadata.uploader_id == id for id in user.user_identifiers])
        )
    """
    from sqlalchemy import or_
    from models.database import ImageMetadata

    if len(user.user_identifiers) == 1:
        return ImageMetadata.uploader_id == user.identifier

    return or_(*[ImageMetadata.uploader_id == id for id in user.user_identifiers])


def get_unified_user_service(db: Session = Depends(get_db)) -> UnifiedUserService:
    """
    Dependency to get UnifiedUserService instance.
    
    This service provides unified authentication across admin_users and RBAC users tables
    during the migration phase. Once migration is complete, this can be simplified.
    
    Usage:
        @router.post("/login")
        def login(
            credentials: OAuth2PasswordRequestForm = Depends(),
            user_service: UnifiedUserService = Depends(get_unified_user_service)
        ):
            user = user_service.authenticate(credentials.username, credentials.password)
    """
    return UnifiedUserService(db, prefer_rbac=True)

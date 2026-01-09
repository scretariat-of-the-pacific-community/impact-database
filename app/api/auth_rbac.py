"""
Enhanced Authentication with RBAC Support (Phase 0)
Provides permission checking and role-based access control
"""

from typing import Optional, List
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from models.database import get_db
from models.rbac import User as DBUser, Permission, Role
from api.auth import User as AuthUser, SECRET_KEY, ALGORITHM, oauth2_scheme
from core.config import settings

import logging

logger = logging.getLogger(__name__)


class EnhancedUser(AuthUser):
    """
    Enhanced user model with RBAC attributes
    Extends the auth.User pydantic model
    """

    id: Optional[str] = None
    role: Optional[str] = None
    permissions: List[str] = []
    is_active: bool = True
    is_verified: bool = False


async def get_current_user_enhanced(
    request: Request, token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> EnhancedUser:
    """
    Get current authenticated user with RBAC information
    Falls back to development mode if needed
    """

    # Check for token in Authorization header first, then cookie
    if not token:
        token = request.cookies.get("ocean_portal_token")

    # Try to authenticate with token first (even in development)
    if token:
        credentials_exception = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            username: str = payload.get("sub")
            if username is None:
                raise credentials_exception
        except JWTError:
            raise credentials_exception

        # Load user from database
        user = db.query(DBUser).filter(DBUser.username == username).first()
        if user is None:
            raise credentials_exception

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="User account is disabled"
            )

        # Update last login
        user.last_login = datetime.now(timezone.utc)
        db.commit()

        # Return enhanced user with permissions
        return EnhancedUser(
            id=str(user.id),
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            role=user.role.name if user.role else None,
            permissions=[p.name for p in user.role.permissions] if user.role else [],
            is_active=user.is_active,
            is_verified=user.is_verified,
        )

    # SECURITY FIX: Removed development mode authentication bypass
    # Always require valid JWT token - no exceptions
    # For development testing, use proper test fixtures or seeded test accounts
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials - valid JWT token required",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_permission(permission: str):
    """
    Dependency for requiring a specific permission
    Usage:
        @router.post("/review/{id}/approve", dependencies=[Depends(require_permission("review:approve"))])
    """

    async def permission_checker(current_user: EnhancedUser = Depends(get_current_user_enhanced)):
        if permission not in current_user.permissions:
            logger.warning(
                f"Permission denied: {current_user.username} attempted {permission} "
                f"(has: {current_user.permissions})"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {permission} required",
            )
        return current_user

    return permission_checker


def require_role(role: str):
    """
    Dependency for requiring a specific role
    Usage:
        @router.get("/admin/users", dependencies=[Depends(require_role("admin"))])
    """

    async def role_checker(current_user: EnhancedUser = Depends(get_current_user_enhanced)):
        if current_user.role != role:
            logger.warning(
                f"Role check failed: {current_user.username} has role {current_user.role}, "
                f"but {role} required"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail=f"Role '{role}' required"
            )
        return current_user

    return role_checker


def check_permission(user: EnhancedUser, permission: str) -> bool:
    """
    Helper function to check if a user has a permission
    For use in non-route code
    """
    return permission in user.permissions


def check_role(user: EnhancedUser, role: str) -> bool:
    """
    Helper function to check if a user has a role
    For use in non-route code
    """
    return user.role == role


async def get_user_permissions(username: str, db: Session = Depends(get_db)) -> List[str]:
    """
    Get all permissions for a user
    Useful for token generation
    """
    user = db.query(DBUser).filter(DBUser.username == username).first()
    if not user or not user.role:
        return []

    return [p.name for p in user.role.permissions]


# Backward compatibility exports
get_current_user = get_current_user_enhanced


async def get_current_user_optional(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Optional[EnhancedUser]:
    """
    Get current authenticated user with RBAC information, or None if not authenticated
    This is for endpoints that work both authenticated and unauthenticated
    """
    # Check for token in Authorization header first, then cookie
    if not token:
        token = request.cookies.get("ocean_portal_token")

    # If no token, return None (public access)
    if not token:
        return None

    # Try to authenticate with token
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return None
    except JWTError:
        return None

    # Load user from database
    user = db.query(DBUser).filter(DBUser.username == username).first()
    if user is None or not user.is_active:
        return None

    # Update last login
    user.last_login = datetime.now(timezone.utc)
    db.commit()

    # Return enhanced user with permissions
    return EnhancedUser(
        id=str(user.id),
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        role=user.role.name if user.role else None,
        permissions=[p.name for p in user.role.permissions] if user.role else [],
        is_active=user.is_active,
        is_verified=user.is_verified,
    )


__all__ = [
    "EnhancedUser",
    "get_current_user",
    "get_current_user_enhanced",
    "get_current_user_optional",
    "require_permission",
    "require_role",
    "check_permission",
    "check_role",
    "get_user_permissions",
]

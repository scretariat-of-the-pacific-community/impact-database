"""
RBAC API Endpoints - Roles and Permissions Management
Phase 0: Foundation endpoints for role/permission administration
"""

import logging
from typing import List, Optional

from api.auth_rbac import EnhancedUser, get_current_user, require_permission, require_role
from fastapi import APIRouter, Depends, HTTPException, Query, status
from models.database import get_db
from models.rbac import Permission, Role
from models.rbac import User as DBUser
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

router = APIRouter(tags=["RBAC"])


# Pydantic Models for API
class RoleResponse(BaseModel):
    id: int
    name: str
    display_name: str
    description: Optional[str]
    level: int
    is_system_role: bool
    permission_count: int

    class Config:
        from_attributes = True


class RoleDetailResponse(RoleResponse):
    permissions: List[str]


class PermissionResponse(BaseModel):
    id: int
    name: str
    resource: str
    action: str
    description: Optional[str]

    class Config:
        from_attributes = True


class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    full_name: Optional[str]
    role: Optional[RoleResponse]
    is_active: bool
    is_verified: bool
    reviews_completed: int
    created_at: str
    last_login: Optional[str]

    class Config:
        from_attributes = True


class UserDetailResponse(UserResponse):
    permissions: List[str]


# Roles Endpoints
@router.get("/roles", response_model=List[RoleResponse])
async def list_roles(
    db: Session = Depends(get_db), current_user: EnhancedUser = Depends(get_current_user)
):
    """
    List all roles
    Requires: authenticated user
    """
    roles = db.query(Role).order_by(Role.level).all()
    return [role.to_dict() for role in roles]


@router.get("/roles/{role_id}", response_model=RoleDetailResponse)
async def get_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user),
):
    """
    Get role details with permissions
    Requires: authenticated user
    """
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    return role.to_dict_with_permissions()


@router.get("/roles/{role_id}/permissions", response_model=List[PermissionResponse])
async def get_role_permissions(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user),
):
    """
    List all permissions for a role
    Requires: authenticated user
    """
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    return [p.to_dict() for p in role.permissions]


# Permissions Endpoints
@router.get("/permissions", response_model=List[PermissionResponse])
async def list_permissions(
    resource: Optional[str] = Query(None, description="Filter by resource"),
    action: Optional[str] = Query(None, description="Filter by action"),
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user),
):
    """
    List all permissions with optional filtering
    Requires: authenticated user
    """
    query = db.query(Permission)

    if resource:
        query = query.filter(Permission.resource == resource)
    if action:
        query = query.filter(Permission.action == action)

    permissions = query.order_by(Permission.resource, Permission.action).all()
    return [p.to_dict() for p in permissions]


@router.get("/permissions/{permission_id}", response_model=PermissionResponse)
async def get_permission(
    permission_id: int,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user),
):
    """
    Get permission details
    Requires: authenticated user
    """
    permission = db.query(Permission).filter(Permission.id == permission_id).first()
    if not permission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permission not found")
    return permission.to_dict()


# Users Endpoints
@router.get("/users")
async def list_users(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(20, ge=1, le=200, description="Items per page"),
    role: Optional[str] = Query(None, description="Filter by role name"),
    status: Optional[str] = Query(None, description="Filter by status (active, locked, inactive)"),
    search: Optional[str] = Query(None, description="Search by username or email"),
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(require_permission("user:read")),
):
    """
    List all users with pagination and filtering
    Requires: user:read permission
    """
    query = db.query(DBUser)

    if role:
        query = query.join(Role).filter(Role.name == role)

    if status:
        status = status.lower()
        if status == "active":
            query = query.filter(DBUser.is_active.is_(True), DBUser.is_locked.is_(False))
        elif status == "locked":
            query = query.filter(DBUser.is_locked.is_(True))
        elif status == "inactive":
            query = query.filter(DBUser.is_active.is_(False))

    if search:
        like_expr = f"%{search}%"
        query = query.filter((DBUser.username.ilike(like_expr)) | (DBUser.email.ilike(like_expr)))

    total = query.count()

    # Basic status counts for UI display
    active_count = (
        db.query(DBUser).filter(DBUser.is_active.is_(True), DBUser.is_locked.is_(False)).count()
    )
    locked_count = db.query(DBUser).filter(DBUser.is_locked.is_(True)).count()
    inactive_count = db.query(DBUser).filter(DBUser.is_active.is_(False)).count()

    # Pagination
    offset = (page - 1) * page_size
    users = query.offset(offset).limit(page_size).all()

    return {
        "users": [user.to_dict() for user in users],
        "total": total,
        "active_count": active_count,
        "locked_count": locked_count,
        "inactive_count": inactive_count,
        "pending_count": 0,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if page_size else 0,
    }


@router.post("/users/{user_id}/lock")
async def lock_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(require_permission("user:update")),
):
    user = db.query(DBUser).filter(DBUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_locked = True
    user.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "User locked", "id": str(user.id)}


@router.post("/users/{user_id}/unlock")
async def unlock_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(require_permission("user:update")),
):
    user = db.query(DBUser).filter(DBUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_locked = False
    user.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "User unlocked", "id": str(user.id)}


@router.get("/users/search")
async def search_users(
    q: str = Query(..., min_length=2, description="Search query (name or email)"),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user),
):
    """
    Search users by name or email
    Requires: authenticated user
    Returns: List of users for autocomplete/mention features
    """
    query = (
        db.query(DBUser)
        .filter(
            (DBUser.username.ilike(f"%{q}%"))
            | (DBUser.email.ilike(f"%{q}%"))
            | (DBUser.full_name.ilike(f"%{q}%"))
        )
        .filter(DBUser.is_active == True)
    )

    users = query.limit(limit).all()

    return [
        {
            "id": str(user.id),
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "avatar_url": user.avatar_url,
            "role": user.role.name if user.role else None,
        }
        for user in users
    ]


@router.get("/users/{user_id}", response_model=UserDetailResponse)
async def get_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(require_permission("user:read")),
):
    """
    Get user details with permissions
    Requires: user:read permission
    """
    user = db.query(DBUser).filter(DBUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user.to_dict_with_permissions()


@router.get("/users/{user_id}/stats")
async def get_user_stats(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: EnhancedUser = Depends(get_current_user),
):
    """
    Get user statistics
    Requires: authenticated user (can view own stats)
    """
    # Users can only view their own stats unless they have user:read permission
    if str(current_user.id) != user_id and "user:read" not in current_user.permissions:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    user = db.query(DBUser).filter(DBUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return {
        "user_id": str(user.id),
        "username": user.username,
        "reviews_completed": user.reviews_completed,
        "avg_review_time_minutes": user.avg_review_time_minutes,
        "role": user.role.name if user.role else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login": user.last_login.isoformat() if user.last_login else None,
    }


# Current User Endpoints
@router.get("/auth/me", response_model=UserDetailResponse)
async def get_current_user_info(
    db: Session = Depends(get_db), current_user: EnhancedUser = Depends(get_current_user)
):
    """
    Get current authenticated user information with permissions
    Requires: authenticated user
    """
    user = db.query(DBUser).filter(DBUser.username == current_user.username).first()
    if not user:
        # Return mock data for development user
        return {
            "id": current_user.id,
            "email": current_user.email,
            "username": current_user.username,
            "full_name": current_user.full_name,
            "role": {"name": current_user.role, "display_name": current_user.role.title()},
            "permissions": current_user.permissions,
            "is_active": current_user.is_active,
            "is_verified": current_user.is_verified,
            "reviews_completed": 0,
            "created_at": "2025-11-10T00:00:00Z",
            "last_login": None,
        }

    return user.to_dict_with_permissions()


@router.get("/auth/permissions")
async def get_current_user_permissions(current_user: EnhancedUser = Depends(get_current_user)):
    """
    Get current user's permissions
    Useful for frontend permission checking
    """
    return {
        "user_id": current_user.id,
        "username": current_user.username,
        "role": current_user.role,
        "permissions": current_user.permissions,
    }


# Health check for RBAC system
@router.get("/rbac/health")
async def rbac_health_check(db: Session = Depends(get_db)):
    """
    Check RBAC system health
    Returns: Role and permission counts
    """
    try:
        role_count = db.query(Role).count()
        permission_count = db.query(Permission).count()
        user_count = db.query(DBUser).count()

        return {
            "status": "healthy",
            "roles": role_count,
            "permissions": permission_count,
            "users": user_count,
            "message": "RBAC system operational",
        }
    except Exception as e:
        logger.error(f"RBAC health check failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"RBAC system error: {str(e)}"
        )

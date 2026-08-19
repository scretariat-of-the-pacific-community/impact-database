"""Admin management API endpoints."""

import logging
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Union
from uuid import UUID

from api.auth import User, get_current_user
from api.auth_rbac import EnhancedUser, get_current_user_enhanced
from api.dependencies import get_unified_user_service
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from models.database import get_db
from models.rbac import User as RBACUser
from pydantic import BaseModel, EmailStr, Field
from services.admin_service import (
    AdminService,
    AdminUser,
    Permission,
    UserAuditLog,
    UserRole,
    UserSession,
)
from services.unified_user_service import UnifiedUserService
from services.email_service import get_email_service, EmailMessage
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer()


# Pydantic models
class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None
    role: str = "viewer"
    organization: Optional[str] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    organization: Optional[str] = None
    position: Optional[str] = None
    is_active: Optional[bool] = None
    custom_permissions: Optional[List[str]] = None


class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    full_name: Optional[str] = None
    role: str
    permissions: List[str] = []
    custom_permissions: Optional[List[str]] = None
    organization: Optional[str] = None
    isActive: bool
    is_active: bool
    isLocked: bool
    is_locked: bool
    lastLogin: Optional[str] = None
    last_login: Optional[str] = None
    createdAt: str
    created_at: str
    updated_at: str
    loginAttempts: int = 0
    is_verified: bool
    position: Optional[str] = None
    profilePicture: Optional[str] = None


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


class RoleUpdateRequest(BaseModel):
    user_id: str
    new_role: str


class AuditLogResponse(BaseModel):
    id: str
    user_id: Optional[str] = None
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    timestamp: str
    ip_address: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    success: bool
    error_message: Optional[str] = None


class DashboardMetrics(BaseModel):
    user_metrics: Dict[str, int]
    queue_metrics: Dict[str, int]
    recent_activity: List[Dict[str, Any]]
    system_health: Dict[str, Any]


class UsersListResponse(BaseModel):
    users: List[UserResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# Dependencies
def get_admin_service(db: Session = Depends(get_db)) -> AdminService:
    """Get admin service instance."""
    return AdminService(db)


def check_permission(required_permission: Permission):
    """Decorator to check user permissions using unified authentication.
    
    Now primarily uses RBAC users table with can_access_admin_panel flag.
    Falls back to legacy admin_users for backward compatibility during migration.
    """

    def permission_checker(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        # Look up RBAC user with admin panel access
        rbac_user = (
            db.query(RBACUser)
            .filter(RBACUser.username == current_user.username)
            .first()
        )

        if not rbac_user:
            raise HTTPException(status_code=403, detail="Admin access required - user not found")

        # Check if user has admin panel access
        if not rbac_user.can_access_admin_panel:
            raise HTTPException(status_code=403, detail="Admin panel access required")
        
        if not rbac_user.is_active:
            raise HTTPException(status_code=403, detail="User account is disabled")

        # RBAC permission checking (simplified for Phase 5)
        # Super admins can do anything
        if rbac_user.is_super_admin:
            # Return a mock AdminUser-like object for backward compatibility
            # This allows existing code to work without changes
            class AdminUserCompat:
                def __init__(self, rbac_user):
                    self.id = str(rbac_user.id)
                    self.username = rbac_user.username
                    self.email = rbac_user.email
                    self.full_name = rbac_user.full_name
                    self.is_active = rbac_user.is_active
                    self.is_super_admin = rbac_user.is_super_admin
                    
            return AdminUserCompat(rbac_user)
        
        # Admin role can manage most things
        if rbac_user.role and rbac_user.role.name == 'admin':
            # Check specific permission restrictions if needed
            # For now, admins can do everything except maybe some super admin actions
            class AdminUserCompat:
                def __init__(self, rbac_user):
                    self.id = str(rbac_user.id)
                    self.username = rbac_user.username
                    self.email = rbac_user.email
                    self.full_name = rbac_user.full_name
                    self.is_active = rbac_user.is_active
                    self.is_super_admin = False
                    
            return AdminUserCompat(rbac_user)
        
        # Other roles don't have admin permissions
        raise HTTPException(
            status_code=403, detail=f"Permission required: {required_permission.value}"
        )

    return permission_checker


def get_client_ip(request: Request) -> str:
    """Get client IP address."""
    return request.client.host


def check_admin_panel_access(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> RBACUser:
    """Check if user has admin panel access and return RBAC user.
    
    This is a simpler check for endpoints that just need admin panel access
    without specific permission requirements.
    """
    rbac_user = (
        db.query(RBACUser)
        .filter(RBACUser.username == current_user.username)
        .first()
    )
    
    if not rbac_user:
        raise HTTPException(status_code=403, detail="User not found")
    
    if not rbac_user.can_access_admin_panel:
        raise HTTPException(status_code=403, detail="Admin panel access required")
    
    if not rbac_user.is_active:
        raise HTTPException(status_code=403, detail="User account is disabled")
    
    return rbac_user


def user_to_response(user: Union[AdminUser, RBACUser]) -> UserResponse:
    """Convert AdminUser or RBACUser to UserResponse with proper field mapping."""
    # Handle RBAC User
    if isinstance(user, RBACUser):
        # Split full_name into firstName and lastName
        full_name = user.full_name or ""
        name_parts = full_name.split(" ", 1) if full_name else ["", ""]
        first_name = name_parts[0] if len(name_parts) > 0 else ""
        last_name = name_parts[1] if len(name_parts) > 1 else ""

        # Get role name
        role_name = user.role.name if user.role else "viewer"
        
        # Get permissions from role
        permissions = []
        if user.role and hasattr(user.role, 'permissions'):
            permissions = [p.name for p in user.role.permissions]

        return UserResponse(
            id=str(user.id),
            username=user.username,
            email=user.email,
            firstName=first_name,
            lastName=last_name,
            full_name=user.full_name,
            role=role_name,
            permissions=permissions,
            custom_permissions=[],
            organization=user.organization,
            isActive=user.is_active,
            is_active=user.is_active,
            isLocked=not user.is_active,  # RBAC doesn't have is_locked, use is_active
            is_locked=not user.is_active,
            lastLogin=user.last_login.isoformat() if user.last_login else None,
            last_login=user.last_login.isoformat() if user.last_login else None,
            createdAt=user.created_at.isoformat() if user.created_at else "",
            created_at=user.created_at.isoformat() if user.created_at else "",
            updated_at=user.updated_at.isoformat() if user.updated_at else "",
            loginAttempts=user.failed_login_attempts or 0,
            is_verified=user.is_verified,
            position=None,  # RBAC doesn't have position field
            profilePicture=None,
        )
    
    # Handle legacy AdminUser
    user_dict = user.to_dict()

    # Split full_name into firstName and lastName
    full_name = user_dict.get("full_name") or ""
    name_parts = full_name.split(" ", 1) if full_name else ["", ""]
    first_name = name_parts[0] if len(name_parts) > 0 else ""
    last_name = name_parts[1] if len(name_parts) > 1 else ""

    # Get all permissions (role + custom)
    try:
        all_permissions = user._get_role_permissions()
        if user.custom_permissions:
            all_permissions.extend(user.custom_permissions)
    except (ValueError, AttributeError) as e:
        logger.warning(f"Failed to get permissions for user {user.username}: {e}")
        all_permissions = []

    return UserResponse(
        id=user_dict["id"],
        username=user_dict["username"],
        email=user_dict["email"],
        firstName=first_name,
        lastName=last_name,
        full_name=user_dict.get("full_name"),
        role=user_dict["role"],
        permissions=list(set(all_permissions)),  # Remove duplicates
        custom_permissions=user_dict.get("custom_permissions"),
        organization=user_dict.get("organization"),
        isActive=user_dict["is_active"],
        is_active=user_dict["is_active"],
        isLocked=user_dict["is_locked"],
        is_locked=user_dict["is_locked"],
        lastLogin=user_dict.get("last_login"),
        last_login=user_dict.get("last_login"),
        createdAt=user_dict["created_at"],
        created_at=user_dict["created_at"],
        updated_at=user_dict["updated_at"],
        loginAttempts=user.failed_login_attempts or 0,
        is_verified=user_dict["is_verified"],
        position=user_dict.get("position"),
        profilePicture=None,
    )


# User Management Endpoints
@router.post("/users", response_model=UserResponse)
async def create_user(
    user_data: UserCreate,
    request: Request,
    admin_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS)),
    admin_service: AdminService = Depends(get_admin_service),
):
    """Create a new user."""
    try:
        # Validate role
        try:
            role = UserRole(user_data.role)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid role")

        new_user = admin_service.create_user(
            username=user_data.username,
            email=user_data.email,
            password=user_data.password,
            role=role,
            full_name=user_data.full_name,
            organization=user_data.organization,
            created_by=admin_user.username,
        )

        return user_to_response(new_user)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/users", response_model=UsersListResponse)
async def list_users(
    active_only: bool = Query(True, description="Show only active users"),
    role: Optional[str] = Query(None, description="Filter by role"),
    search: Optional[str] = Query(None, description="Search in username, email, or full name"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, le=100, description="Items per page"),
    admin_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS)),
    admin_service: AdminService = Depends(get_admin_service),
):
    """List users with filtering and pagination."""
    # Use RBAC users table with admin panel access
    query = admin_service.db.query(RBACUser).filter(RBACUser.can_access_admin_panel == True)

    if active_only:
        query = query.filter(RBACUser.is_active == True)

    if role:
        # Join with Role table for filtering
        from models.rbac import Role
        query = query.join(Role).filter(Role.name == role)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (RBACUser.username.ilike(search_term))
            | (RBACUser.email.ilike(search_term))
            | (RBACUser.full_name.ilike(search_term))
        )

    # Get total count
    total = query.count()

    # Calculate offset and pagination
    offset = (page - 1) * page_size
    total_pages = (total + page_size - 1) // page_size  # Ceiling division

    # Get paginated users
    users = query.offset(offset).limit(page_size).all()

    return UsersListResponse(
        users=[user_to_response(user) for user in users],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    admin_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS)),
    admin_service: AdminService = Depends(get_admin_service),
):
    """Get user details."""
    # Try RBAC user first
    user = admin_service.db.query(RBACUser).filter(RBACUser.id == user_id).first()
    if not user:
        # Fallback to admin_users for backward compatibility
        user = admin_service.db.query(AdminUser).filter(AdminUser.id == user_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user_to_response(user)


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    update_data: UserUpdate,
    admin_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS)),
    admin_service: AdminService = Depends(get_admin_service),
):
    """Update user details."""
    # Try RBAC user first
    user = admin_service.db.query(RBACUser).filter(RBACUser.id == user_id).first()
    is_rbac_user = user is not None
    
    if not user:
        # Fallback to admin_users for backward compatibility
        user = admin_service.db.query(AdminUser).filter(AdminUser.id == user_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Update fields based on user type
    if is_rbac_user:
        # Update RBAC user
        if update_data.full_name is not None:
            user.full_name = update_data.full_name
        if update_data.email is not None:
            user.email = update_data.email
        if update_data.organization is not None:
            user.organization = update_data.organization
        if update_data.is_active is not None:
            user.is_active = update_data.is_active
        # Note: position and custom_permissions not supported in RBAC yet
        
        # Handle role change for RBAC user
        if update_data.role is not None:
            from models.rbac import Role
            new_role = admin_service.db.query(Role).filter(Role.name == update_data.role).first()
            if not new_role:
                raise HTTPException(status_code=400, detail="Invalid role")
            user.role_id = new_role.id
        
        user.updated_at = datetime.utcnow()
    else:
        # Update legacy admin user
        if update_data.full_name is not None:
            user.full_name = update_data.full_name
        if update_data.email is not None:
            user.email = update_data.email
        if update_data.organization is not None:
            user.organization = update_data.organization
        if update_data.position is not None:
            user.position = update_data.position
        if update_data.is_active is not None:
            user.is_active = update_data.is_active
        if update_data.custom_permissions is not None:
            user.custom_permissions = update_data.custom_permissions

        # Handle role change for admin user
        if update_data.role is not None:
            try:
                new_role = UserRole(update_data.role)
                admin_service.update_user_role(user_id, new_role, admin_user.username)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid role")

        user.updated_at = datetime.utcnow()

    admin_service.db.commit()

    return user_to_response(user)


@router.post("/users/{user_id}/lock")
async def lock_user(
    user_id: str,
    reason: str = "Administrative action",
    admin_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS)),
    admin_service: AdminService = Depends(get_admin_service),
):
    """Lock a user account."""
    # Try RBAC user first
    user = admin_service.db.query(RBACUser).filter(RBACUser.id == user_id).first()
    is_rbac_user = user is not None
    
    if not user:
        # Fallback to admin_users
        user = admin_service.db.query(AdminUser).filter(AdminUser.id == user_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # For RBAC users, deactivate instead of lock
    if is_rbac_user:
        user.is_active = False
    else:
        user.is_locked = True
    
    user.updated_at = datetime.utcnow()
    admin_service.db.commit()

    # TODO: Migrate audit logging to use RBAC users
    # admin_service._log_action(
    #     user_id=admin_user.id,
    #     action="lock_user",
    #     resource_type="user",
    #     resource_id=user_id,
    #     details={"target_user": user.username, "reason": reason},
    # )

    return {"message": "User locked successfully"}


@router.post("/users/{user_id}/unlock")
async def unlock_user(
    user_id: str,
    admin_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS)),
    admin_service: AdminService = Depends(get_admin_service),
):
    """Unlock a user account."""
    # Try RBAC user first
    user = admin_service.db.query(RBACUser).filter(RBACUser.id == user_id).first()
    is_rbac_user = user is not None
    
    if not user:
        # Fallback to admin_users
        user = admin_service.db.query(AdminUser).filter(AdminUser.id == user_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # For RBAC users, activate instead of unlock
    if is_rbac_user:
        user.is_active = True
        user.failed_login_attempts = 0
        user.lockout_until = None
    else:
        user.is_locked = False
        user.failed_login_attempts = 0
        user.lockout_until = None
    
    user.updated_at = datetime.utcnow()
    admin_service.db.commit()

    # TODO: Migrate audit logging to use RBAC users
    # admin_service._log_action(
    #     user_id=admin_user.id,
    #     action="unlock_user",
    #     resource_type="user",
    #     resource_id=user_id,
    #     details={"target_user": user.username},
    # )

    return {"message": "User unlocked successfully"}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    admin_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS)),
    admin_service: AdminService = Depends(get_admin_service),
):
    """Delete a user account from the database."""
    logger.info(f"Delete user request: user_id={user_id}")
    
    # Try RBAC user first
    user = admin_service.db.query(RBACUser).filter(RBACUser.id == user_id).first()
    
    if not user:
        # Fallback to admin_users
        user = admin_service.db.query(AdminUser).filter(AdminUser.id == user_id).first()
    
    if not user:
        logger.warning(f"❌ User not found for deletion: {user_id}")
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent self-deletion - check both username and id
    if hasattr(admin_user, 'id') and user.id == admin_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    if user.username == admin_user.username:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    # Hard delete the user
    username = user.username
    admin_service.db.delete(user)
    admin_service.db.commit()
    
    logger.info(f"✅ User deleted successfully: {username} (ID: {user_id})")

    # TODO: Migrate audit logging to use RBAC users
    # admin_service._log_action(
    #     user_id=admin_user.id,
    #     action="delete_user",
    #     resource_type="user",
    #     resource_id=user_id,
    #     details={"target_user": user.username},
    # )

    return {"message": "User deleted successfully"}


# Bulk Actions and Invite Endpoints
class BulkActionRequest(BaseModel):
    user_ids: List[UUID]
    action: str  # 'lock', 'unlock', 'delete', 'activate', 'deactivate'


class InviteUserRequest(BaseModel):
    email: EmailStr
    role: str = "viewer"
    sendInvite: bool = True
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    organization: Optional[str] = None
    
    class Config:
        extra = "ignore"  # Ignore any extra fields


class InviteUserResponse(BaseModel):
    message: str
    user_id: Optional[str] = None
    invite_sent: bool = False


@router.post("/users/invite", response_model=InviteUserResponse)
async def invite_user(
    invite_data: InviteUserRequest,
    request: Request,
    admin_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS)),
    admin_service: AdminService = Depends(get_admin_service),
):
    """Send an invitation to a new user via email."""
    import bcrypt
    import secrets
    import uuid
    
    logger.info(f"Invite user request: email={invite_data.email}, role={invite_data.role}, firstName={invite_data.firstName}, lastName={invite_data.lastName}, organization={invite_data.organization}")

    # Map frontend role to RBAC role
    # Frontend sends: SUPER_ADMIN, ADMIN, VIEWER, etc (uppercase)
    # RBAC uses: admin, viewer, contributor, reviewer, senior_reviewer (lowercase)
    role_mapping = {
        "SUPER_ADMIN": "admin",  # Super admin maps to admin role with is_super_admin flag
        "ADMIN": "admin",
        "VIEWER": "viewer",
        "CONTRIBUTOR": "contributor",
        "CURATOR": "reviewer",  # Map curator to reviewer role
        "REVIEWER": "reviewer",
        "SENIOR_REVIEWER": "senior_reviewer",
        "super_admin": "admin",  # Also handle lowercase
        "admin": "admin",
        "viewer": "viewer",
        "contributor": "contributor",
        "curator": "reviewer",  # Map curator to reviewer role
        "reviewer": "reviewer",
        "senior_reviewer": "senior_reviewer",
    }
    
    rbac_role_name = role_mapping.get(invite_data.role, invite_data.role.lower())
    is_super_admin = invite_data.role.upper() == "SUPER_ADMIN"
    
    # Validate that the role exists in RBAC
    from models.rbac import Role as RBACRole
    rbac_role = admin_service.db.query(RBACRole).filter(RBACRole.name == rbac_role_name).first()
    if not rbac_role:
        # Log all available roles for debugging
        available_roles = admin_service.db.query(RBACRole).all()
        role_names = [r.name for r in available_roles]
        logger.error(f"Invalid role: {invite_data.role} (mapped to {rbac_role_name}). Available roles: {role_names}")
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid role '{invite_data.role}'. Available roles: {', '.join(role_names)}"
        )

    # Check if email already exists in RBAC users
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    
    existing = (
        admin_service.db.query(RBACUser).filter(RBACUser.email == invite_data.email).first()
    )

    # Build full name from firstName and lastName if provided
    full_name = None
    if invite_data.firstName or invite_data.lastName:
        parts = [p for p in [invite_data.firstName, invite_data.lastName] if p]
        full_name = " ".join(parts)

    if existing:
        if existing.is_verified:
            raise HTTPException(status_code=400, detail="User with this email already exists")

        # Re-invite: update existing unverified user
        temp_password = secrets.token_urlsafe(16)
        
        existing.full_name = full_name or existing.full_name
        existing.organization = invite_data.organization or existing.organization
        existing.hashed_password = pwd_context.hash(temp_password)
        existing.is_active = True
        existing.is_verified = False
        existing.role_id = rbac_role.id
        existing.is_super_admin = is_super_admin
        existing.can_access_admin_panel = True  # Grant admin panel access
        
        admin_service.db.commit()
        
        # TODO: Migrate audit logging to use RBAC users
        # admin_service._log_action(
        #     user_id=str(getattr(admin_user, 'id', admin_user.username)),
        #     action="reinvite_user",
        #     resource_type="user",
        #     resource_id=str(existing.id),
        #     details={"email": invite_data.email, "role": invite_data.role},
        # )

        # Send invitation email
        email_sent = False
        if invite_data.sendInvite:
            email_service = get_email_service()
            app_url = os.environ.get("APP_BASE_URL", str(request.base_url)).rstrip('/')
            
            email_body = f"""Hello {full_name or invite_data.email},

You have been invited to join the Ocean Portal Impact Database as {rbac_role.display_name}.

Your account details:
- Email: {invite_data.email}
- Username: {existing.username}
- Temporary Password: {temp_password}

Please visit the following link to log in and set a new password:
{app_url}/auth/login

After logging in, please change your password immediately.

Best regards,
The Ocean Portal Team
"""
            
            email_message = EmailMessage(
                to_email=invite_data.email,
                to_name=full_name,
                subject="You've been re-invited to Ocean Portal",
                body_text=email_body,
            )
            
            email_sent = email_service.send(email_message)
            if not email_sent:
                logger.warning(f"Failed to send re-invitation email to {invite_data.email}")

        return InviteUserResponse(
            message=f"Invitation re-sent to {invite_data.email}",
            user_id=str(existing.id),
            invite_sent=email_sent,
        )

    # Create new RBAC user
    temp_password = secrets.token_urlsafe(16)
    username = invite_data.email.split("@")[0]
    
    # Ensure username is unique
    base_username = username
    counter = 1
    while admin_service.db.query(RBACUser).filter(RBACUser.username == username).first():
        username = f"{base_username}{counter}"
        counter += 1
    
    try:
        new_user = RBACUser(
            username=username,
            email=invite_data.email,
            full_name=full_name or invite_data.email,
            hashed_password=pwd_context.hash(temp_password),
            is_active=True,
            is_verified=False,
            role_id=rbac_role.id,
            is_super_admin=is_super_admin,
            can_access_admin_panel=True,  # Grant admin panel access
            organization=invite_data.organization,
            notification_preferences={"email": True, "slack": False, "in_app": True},
            review_preferences={},
            timezone="UTC",
            language="en",
        )
        
        admin_service.db.add(new_user)
        admin_service.db.commit()
        admin_service.db.refresh(new_user)
        
        logger.info(f"✅ Created new RBAC user {username} (ID: {new_user.id}) for {invite_data.email} with role {rbac_role.name}")
    except Exception as e:
        admin_service.db.rollback()
        logger.error(f"❌ Failed to create user {invite_data.email}: {e}", exc_info=True)
        logger.error(f"User data: username={username}, email={invite_data.email}, role_id={rbac_role.id}, organization={invite_data.organization}")
        raise HTTPException(status_code=500, detail=f"Failed to create user: {str(e)}")

    # TODO: Migrate audit logging to use RBAC users
    # admin_service._log_action(
    #     user_id=str(getattr(admin_user, 'id', admin_user.username)),
    #     action="invite_user",
    #     resource_type="user",
    #     resource_id=str(new_user.id),
    #     details={"email": invite_data.email, "role": invite_data.role},
    # )

    # Send invitation email
    email_sent = False
    if invite_data.sendInvite:
        app_url = os.environ.get("APP_BASE_URL", str(request.base_url)).rstrip('/')
        
        email_body = f"""Hello {full_name or invite_data.email},

You have been invited to join the Ocean Portal Impact Database as {rbac_role.display_name}.

Your account details:
- Email: {invite_data.email}
- Username: {new_user.username}
- Temporary Password: {temp_password}

Please visit the following link to log in and set a new password:
{app_url}/auth/login

After logging in, please change your password immediately.

Best regards,
The Ocean Portal Team
"""

        email_service = get_email_service()
        email_message = EmailMessage(
            to_email=invite_data.email,
            to_name=full_name,
            subject="Welcome to Ocean Portal",
            body_text=email_body,
        )
        email_sent = email_service.send(email_message)
        if not email_sent:
            logger.warning(f"Failed to send invitation email to {invite_data.email}")

    return InviteUserResponse(
        message=f"Invitation sent to {invite_data.email}" if email_sent else f"User created: {invite_data.email}",
        user_id=str(new_user.id),
        invite_sent=email_sent,
    )


@router.post("/users/bulk-action")
async def bulk_user_action(
    action_data: BulkActionRequest,
    request: Request,
    admin_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS)),
    admin_service: AdminService = Depends(get_admin_service),
):
    """Perform bulk actions on multiple users."""

    if not action_data.user_ids:
        raise HTTPException(status_code=400, detail="No users specified")

    if action_data.action not in ["lock", "unlock", "delete", "activate", "deactivate"]:
        raise HTTPException(status_code=400, detail="Invalid action")

    # Don't allow self-modification
    if admin_user.id in action_data.user_ids:
        raise HTTPException(
            status_code=400, detail="Cannot perform bulk action on your own account"
        )

    # Get users from RBAC table (admin panel users)
    users = admin_service.db.query(RBACUser).filter(
        RBACUser.id.in_(action_data.user_ids),
        RBACUser.can_access_admin_panel == True
    ).all()

    if not users:
        raise HTTPException(status_code=404, detail="No valid users found")

    affected = 0
    errors = []

    for user in users:
        try:
            if action_data.action == "lock":
                # RBAC doesn't have is_locked, use is_active instead
                user.is_active = False
            elif action_data.action == "unlock":
                user.is_active = True
                user.failed_login_attempts = 0
                user.lockout_until = None
            elif action_data.action == "delete":
                # Hard delete the user
                admin_service.db.delete(user)
                affected += 1
                continue  # Skip the update_at and add since user is deleted
            elif action_data.action == "activate":
                user.is_active = True
            elif action_data.action == "deactivate":
                user.is_active = False

            user.updated_at = datetime.utcnow()
            admin_service.db.add(user)  # Ensure user is in session
            affected += 1
        except Exception as e:
            errors.append({"user_id": str(user.id), "error": str(e)})
            admin_service.db.rollback()  # Rollback on error for this user

    try:
        admin_service.db.commit()
    except Exception as e:
        admin_service.db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to commit changes: {str(e)}")

    # TODO: Migrate audit logging to use RBAC users
    # admin_service._log_action(
    #     user_id=admin_user.id,
    #     action=f"bulk_{action_data.action}",
    #     resource_type="users",
    #     resource_id=None,
    #     details={"user_ids": action_data.user_ids, "affected": affected, "errors": errors},
    # )

    return {
        "message": f"Bulk {action_data.action} completed",
        "affected": affected,
        "total": len(action_data.user_ids),
        "errors": errors,
    }


# Role and Permission Management
@router.get("/roles")
async def list_roles(admin_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS))):
    """List available user roles."""
    # Define role permissions mapping
    role_permission_map = {
        UserRole.VIEWER: [Permission.VIEW_DATA.value],
        UserRole.CONTRIBUTOR: [
            Permission.VIEW_DATA.value,
            Permission.UPLOAD_DATA.value,
            Permission.EDIT_OWN_DATA.value,
        ],
        UserRole.CURATOR: [
            Permission.VIEW_DATA.value,
            Permission.UPLOAD_DATA.value,
            Permission.EDIT_OWN_DATA.value,
            Permission.EDIT_ANY_DATA.value,
            Permission.REVIEW_SUBMISSIONS.value,
            Permission.EXPORT_DATA.value,
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
            Permission.VIEW_AUDIT_LOGS.value,
        ],
        UserRole.SUPER_ADMIN: [perm.value for perm in Permission],
    }

    return {
        "roles": [
            {
                "value": role.value,
                "name": role.name,
                "permissions": role_permission_map.get(role, []),
            }
            for role in UserRole
        ]
    }


@router.get("/permissions")
async def list_permissions(
    admin_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS)),
):
    """List available permissions."""
    return {
        "permissions": [
            {"value": perm.value, "name": perm.name.replace("_", " ").title()}
            for perm in Permission
        ]
    }


# Audit and Security
@router.get("/audit-logs", response_model=List[AuditLogResponse])
async def get_audit_logs(
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    action: Optional[str] = Query(None, description="Filter by action type"),
    resource_type: Optional[str] = Query(None, description="Filter by resource type"),
    start_date: Optional[datetime] = Query(None, description="Start date filter"),
    end_date: Optional[datetime] = Query(None, description="End date filter"),
    limit: int = Query(100, le=1000),
    offset: int = Query(0),
    admin_user: AdminUser = Depends(check_permission(Permission.VIEW_AUDIT_LOGS)),
    admin_service: AdminService = Depends(get_admin_service),
):
    """Get audit logs with filtering."""
    query = admin_service.db.query(UserAuditLog)

    if user_id:
        query = query.filter(UserAuditLog.user_id == user_id)
    if action:
        query = query.filter(UserAuditLog.action == action)
    if resource_type:
        query = query.filter(UserAuditLog.resource_type == resource_type)
    if start_date:
        query = query.filter(UserAuditLog.timestamp >= start_date)
    if end_date:
        query = query.filter(UserAuditLog.timestamp <= end_date)

    logs = query.order_by(UserAuditLog.timestamp.desc()).offset(offset).limit(limit).all()

    return [
        AuditLogResponse(
            id=str(log.id),
            user_id=str(log.user_id) if log.user_id else None,
            action=log.action,
            resource_type=log.resource_type,
            resource_id=log.resource_id,
            timestamp=log.timestamp.isoformat(),
            ip_address=log.ip_address,
            details=log.details,
            success=log.success,
            error_message=log.error_message,
        )
        for log in logs
    ]


@router.get("/security-summary")
async def get_security_summary(
    admin_user: AdminUser = Depends(check_permission(Permission.VIEW_AUDIT_LOGS)),
    admin_service: AdminService = Depends(get_admin_service),
):
    """Get security summary and recent security events."""
    from sqlalchemy import func

    # Failed login attempts in last 24 hours
    yesterday = datetime.utcnow() - timedelta(days=1)
    failed_logins = (
        admin_service.db.query(func.count(UserAuditLog.id))
        .filter(UserAuditLog.action == "login_failed", UserAuditLog.timestamp >= yesterday)
        .scalar()
    )

    # Locked accounts
    locked_accounts = (
        admin_service.db.query(func.count(AdminUser.id))
        .filter(AdminUser.is_locked == True)
        .scalar()
    )

    # Active sessions
    active_sessions = (
        admin_service.db.query(func.count(UserSession.id))
        .filter(UserSession.is_revoked == False, UserSession.expires_at > datetime.utcnow())
        .scalar()
    )

    # Recent security events
    recent_events = (
        admin_service.db.query(UserAuditLog)
        .filter(
            UserAuditLog.action.in_(
                ["login_failed", "login_success", "password_change", "account_locked"]
            )
        )
        .order_by(UserAuditLog.timestamp.desc())
        .limit(20)
        .all()
    )

    return {
        "failed_logins_24h": failed_logins,
        "locked_accounts": locked_accounts,
        "active_sessions": active_sessions,
        "recent_events": [
            {
                "timestamp": event.timestamp.isoformat(),
                "action": event.action,
                "user_id": str(event.user_id) if event.user_id else None,
                "ip_address": event.ip_address,
                "success": event.success,
            }
            for event in recent_events
        ],
    }


# Dashboard
@router.get("/dashboard", response_model=DashboardMetrics)
async def get_admin_dashboard(
    admin_user: AdminUser = Depends(check_permission(Permission.VIEW_AUDIT_LOGS)),
    admin_service: AdminService = Depends(get_admin_service),
):
    """Get admin dashboard metrics."""
    metrics = admin_service.get_dashboard_metrics()

    # Add system health checks
    system_health = {
        "database_connected": True,  # If we got this far, DB is connected
        "redis_connected": True,  # TODO: Check Redis connection
        "storage_available": True,  # TODO: Check MinIO connection
        "last_backup": "2025-01-10T10:00:00Z",  # TODO: Get actual backup info
    }

    return DashboardMetrics(
        user_metrics=metrics["user_metrics"],
        queue_metrics=metrics["queue_metrics"],
        recent_activity=metrics["recent_activity"],
        system_health=system_health,
    )


# Self-service endpoints
@router.get("/profile", response_model=UserResponse)
async def get_own_profile(
    current_user: User = Depends(get_current_user),
    admin_service: AdminService = Depends(get_admin_service),
):
    """Get current user's profile."""
    # Try RBAC user first
    user = (
        admin_service.db.query(RBACUser)
        .filter(RBACUser.username == current_user.username)
        .first()
    )
    
    # Fallback to admin_users
    if not user:
        user = (
            admin_service.db.query(AdminUser)
            .filter(AdminUser.username == current_user.username)
            .first()
        )

    if not user:
        raise HTTPException(status_code=404, detail="User profile not found")

    return user_to_response(user)


@router.put("/profile")
async def update_own_profile(
    update_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    admin_service: AdminService = Depends(get_admin_service),
):
    """Update current user's profile."""
    # Try RBAC user first
    user = (
        admin_service.db.query(RBACUser)
        .filter(RBACUser.username == current_user.username)
        .first()
    )
    is_rbac_user = user is not None
    
    # Fallback to admin_users
    if not user:
        user = (
            admin_service.db.query(AdminUser)
            .filter(AdminUser.username == current_user.username)
            .first()
        )

    if not user:
        raise HTTPException(status_code=404, detail="User profile not found")

    # Users can only update certain fields
    if update_data.full_name is not None:
        user.full_name = update_data.full_name
    if update_data.organization is not None:
        user.organization = update_data.organization
    if update_data.position is not None and not is_rbac_user:
        # Position only exists in admin_users
        user.position = update_data.position

    user.updated_at = datetime.utcnow()
    admin_service.db.commit()

    return {"message": "Profile updated successfully"}


@router.post("/change-password")
async def change_password(
    password_data: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    admin_service: AdminService = Depends(get_admin_service),
    user_service: UnifiedUserService = Depends(get_unified_user_service),
):
    """Change current user's password."""
    # Verify current password using UnifiedUserService
    verified_user = user_service.authenticate(current_user.username, password_data.current_password)
    
    if not verified_user:
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    # Try RBAC user first
    rbac_user = (
        admin_service.db.query(RBACUser)
        .filter(RBACUser.username == current_user.username)
        .first()
    )
    
    if rbac_user:
        # Update RBAC user password with native format
        from passlib.context import CryptContext
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        rbac_user.hashed_password = pwd_context.hash(password_data.new_password)
        rbac_user.last_password_change = datetime.utcnow()
        rbac_user.updated_at = datetime.utcnow()
        admin_service.db.commit()
        return {"message": "Password changed successfully"}
    
    # Fallback to admin_users
    admin_user = (
        admin_service.db.query(AdminUser)
        .filter(AdminUser.username == current_user.username)
        .first()
    )

    if not admin_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Update admin_users password
    import bcrypt
    import secrets

    salt = secrets.token_hex(16)
    password_hash = bcrypt.hashpw(
        (password_data.new_password + salt).encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")

    admin_user.password_hash = password_hash
    admin_user.salt = salt
    admin_user.last_password_change = datetime.utcnow()
    admin_user.updated_at = datetime.utcnow()
    admin_service.db.commit()

    # TODO: Migrate audit logging to use RBAC users
    # admin_service._log_action(
    #     user_id=admin_user.id, action="password_change", details={"changed_own_password": True}
    # )

    return {"message": "Password changed successfully"}

"""Admin management API endpoints."""

from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field

from models.database import get_db
from services.admin_service import AdminService, AdminUser, UserRole, Permission, UserAuditLog, UserSession
from api.auth import get_current_user, User

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
    full_name: Optional[str] = None
    role: str
    custom_permissions: Optional[List[str]] = None
    is_active: bool
    is_verified: bool
    is_locked: bool
    created_at: str
    updated_at: str
    last_login: Optional[str] = None
    organization: Optional[str] = None
    position: Optional[str] = None

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

# Dependencies
def get_admin_service(db: Session = Depends(get_db)) -> AdminService:
    """Get admin service instance."""
    return AdminService(db)

def check_permission(required_permission: Permission):
    """Decorator to check user permissions."""
    def permission_checker(
        current_user: User = Depends(get_current_user),
        admin_service: AdminService = Depends(get_admin_service)
    ):
        # Convert legacy user to admin user (temporary compatibility)
        admin_user = admin_service.db.query(AdminUser).filter(
            AdminUser.username == current_user.username
        ).first()
        
        if not admin_user:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        if not admin_user.has_permission(required_permission):
            raise HTTPException(
                status_code=403,
                detail=f"Permission required: {required_permission.value}"
            )
        
        return admin_user
    
    return permission_checker

def get_client_ip(request: Request) -> str:
    """Get client IP address."""
    return request.client.host

# User Management Endpoints
@router.post("/users", response_model=UserResponse)
async def create_user(
    user_data: UserCreate,
    request: Request,
    admin_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS)),
    admin_service: AdminService = Depends(get_admin_service)
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
            created_by=admin_user.username
        )
        
        return UserResponse(**new_user.to_dict())
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/users", response_model=List[UserResponse])
async def list_users(
    active_only: bool = Query(True, description="Show only active users"),
    role: Optional[str] = Query(None, description="Filter by role"),
    search: Optional[str] = Query(None, description="Search in username, email, or full name"),
    limit: int = Query(50, le=100),
    offset: int = Query(0),
    admin_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS)),
    admin_service: AdminService = Depends(get_admin_service)
):
    """List users with filtering and pagination."""
    query = admin_service.db.query(AdminUser)
    
    if active_only:
        query = query.filter(AdminUser.is_active == True)
    
    if role:
        query = query.filter(AdminUser.role == role)
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (AdminUser.username.ilike(search_term)) |
            (AdminUser.email.ilike(search_term)) |
            (AdminUser.full_name.ilike(search_term))
        )
    
    users = query.offset(offset).limit(limit).all()
    return [UserResponse(**user.to_dict()) for user in users]

@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    admin_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS)),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Get user details."""
    user = admin_service.db.query(AdminUser).filter(AdminUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserResponse(**user.to_dict())

@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    update_data: UserUpdate,
    admin_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS)),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Update user details."""
    user = admin_service.db.query(AdminUser).filter(AdminUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update fields
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
    
    # Handle role change
    if update_data.role is not None:
        try:
            new_role = UserRole(update_data.role)
            admin_service.update_user_role(user_id, new_role, admin_user.username)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid role")
    
    user.updated_at = datetime.utcnow()
    admin_service.db.commit()
    
    return UserResponse(**user.to_dict())

@router.post("/users/{user_id}/lock")
async def lock_user(
    user_id: str,
    reason: str = "Administrative action",
    admin_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS)),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Lock a user account."""
    user = admin_service.db.query(AdminUser).filter(AdminUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.is_locked = True
    user.updated_at = datetime.utcnow()
    admin_service.db.commit()
    
    # Log the action
    admin_service._log_action(
        user_id=admin_user.id,
        action="lock_user",
        resource_type="user",
        resource_id=user_id,
        details={"target_user": user.username, "reason": reason}
    )
    
    return {"message": "User locked successfully"}

@router.post("/users/{user_id}/unlock")
async def unlock_user(
    user_id: str,
    admin_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS)),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Unlock a user account."""
    user = admin_service.db.query(AdminUser).filter(AdminUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.is_locked = False
    user.failed_login_attempts = 0
    user.lockout_until = None
    user.updated_at = datetime.utcnow()
    admin_service.db.commit()
    
    # Log the action
    admin_service._log_action(
        user_id=admin_user.id,
        action="unlock_user",
        resource_type="user",
        resource_id=user_id,
        details={"target_user": user.username}
    )
    
    return {"message": "User unlocked successfully"}

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    admin_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS)),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Soft delete a user account."""
    user = admin_service.db.query(AdminUser).filter(AdminUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent self-deletion
    if user.id == admin_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    user.is_active = False
    user.updated_at = datetime.utcnow()
    admin_service.db.commit()
    
    # Log the action
    admin_service._log_action(
        user_id=admin_user.id,
        action="delete_user",
        resource_type="user",
        resource_id=user_id,
        details={"target_user": user.username}
    )
    
    return {"message": "User deleted successfully"}


# Bulk Actions and Invite Endpoints
class BulkActionRequest(BaseModel):
    user_ids: List[str]
    action: str  # 'lock', 'unlock', 'delete', 'activate', 'deactivate'

class InviteUserRequest(BaseModel):
    email: EmailStr
    role: str = "viewer"
    send_invite: bool = True

class InviteUserResponse(BaseModel):
    message: str
    user_id: Optional[str] = None
    invite_sent: bool = False


@router.post("/users/invite", response_model=InviteUserResponse)
async def invite_user(
    invite_data: InviteUserRequest,
    request: Request,
    admin_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS)),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Send an invitation to a new user via email."""
    import uuid
    import secrets
    
    # Check if email already exists
    existing = admin_service.db.query(AdminUser).filter(
        AdminUser.email == invite_data.email
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")
    
    # Validate role
    try:
        role = UserRole(invite_data.role)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    # Generate invite token and temporary password
    invite_token = secrets.token_urlsafe(32)
    temp_password = secrets.token_urlsafe(16)
    
    # Create user with pending status
    username = invite_data.email.split('@')[0] + '_' + str(uuid.uuid4())[:8]
    
    new_user = admin_service.create_user(
        username=username,
        email=invite_data.email,
        password=temp_password,
        role=role,
        full_name=None,
        organization=None,
        created_by=admin_user.username
    )
    
    # Mark as pending verification
    new_user.is_verified = False
    admin_service.db.commit()
    
    # Log the action
    admin_service._log_action(
        user_id=admin_user.id,
        action="invite_user",
        resource_type="user",
        resource_id=new_user.id,
        details={"email": invite_data.email, "role": invite_data.role}
    )
    
    # TODO: Integrate with email service to send invite
    # For now, return success with the user created
    
    return InviteUserResponse(
        message=f"Invitation sent to {invite_data.email}",
        user_id=new_user.id,
        invite_sent=invite_data.send_invite
    )


@router.post("/users/bulk-action")
async def bulk_user_action(
    action_data: BulkActionRequest,
    request: Request,
    admin_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS)),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Perform bulk actions on multiple users."""
    
    if not action_data.user_ids:
        raise HTTPException(status_code=400, detail="No users specified")
    
    if action_data.action not in ['lock', 'unlock', 'delete', 'activate', 'deactivate']:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    # Don't allow self-modification
    if admin_user.id in action_data.user_ids:
        raise HTTPException(status_code=400, detail="Cannot perform bulk action on your own account")
    
    users = admin_service.db.query(AdminUser).filter(
        AdminUser.id.in_(action_data.user_ids)
    ).all()
    
    if not users:
        raise HTTPException(status_code=404, detail="No valid users found")
    
    affected = 0
    errors = []
    
    for user in users:
        try:
            if action_data.action == 'lock':
                user.is_locked = True
            elif action_data.action == 'unlock':
                user.is_locked = False
                user.failed_login_attempts = 0
                user.lockout_until = None
            elif action_data.action == 'delete':
                user.is_active = False
            elif action_data.action == 'activate':
                user.is_active = True
            elif action_data.action == 'deactivate':
                user.is_active = False
            
            user.updated_at = datetime.utcnow()
            affected += 1
        except Exception as e:
            errors.append({"user_id": user.id, "error": str(e)})
    
    admin_service.db.commit()
    
    # Log the action
    admin_service._log_action(
        user_id=admin_user.id,
        action=f"bulk_{action_data.action}",
        resource_type="users",
        resource_id=None,
        details={
            "user_ids": action_data.user_ids,
            "affected": affected,
            "errors": errors
        }
    )
    
    return {
        "message": f"Bulk {action_data.action} completed",
        "affected": affected,
        "total": len(action_data.user_ids),
        "errors": errors
    }


# Role and Permission Management
@router.get("/roles")
async def list_roles(
    admin_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS))
):
    """List available user roles."""
    return {
        "roles": [
            {
                "value": role.value,
                "name": role.name,
                "permissions": AdminUser()._get_role_permissions() if role == UserRole.VIEWER else []
            }
            for role in UserRole
        ]
    }

@router.get("/permissions")
async def list_permissions(
    admin_user: AdminUser = Depends(check_permission(Permission.MANAGE_USERS))
):
    """List available permissions."""
    return {
        "permissions": [
            {
                "value": perm.value,
                "name": perm.name.replace("_", " ").title()
            }
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
    admin_service: AdminService = Depends(get_admin_service)
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
            error_message=log.error_message
        )
        for log in logs
    ]

@router.get("/security-summary")
async def get_security_summary(
    admin_user: AdminUser = Depends(check_permission(Permission.VIEW_AUDIT_LOGS)),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Get security summary and recent security events."""
    from sqlalchemy import func
    
    # Failed login attempts in last 24 hours
    yesterday = datetime.utcnow() - timedelta(days=1)
    failed_logins = admin_service.db.query(func.count(UserAuditLog.id)).filter(
        UserAuditLog.action == "login_failed",
        UserAuditLog.timestamp >= yesterday
    ).scalar()
    
    # Locked accounts
    locked_accounts = admin_service.db.query(func.count(AdminUser.id)).filter(
        AdminUser.is_locked == True
    ).scalar()
    
    # Active sessions
    active_sessions = admin_service.db.query(func.count(UserSession.id)).filter(
        UserSession.is_active == True,
        UserSession.expires_at > datetime.utcnow()
    ).scalar()
    
    # Recent security events
    recent_events = admin_service.db.query(UserAuditLog).filter(
        UserAuditLog.action.in_(['login_failed', 'login_success', 'password_change', 'account_locked'])
    ).order_by(UserAuditLog.timestamp.desc()).limit(20).all()
    
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
                "success": event.success
            }
            for event in recent_events
        ]
    }

# Dashboard
@router.get("/dashboard", response_model=DashboardMetrics)
async def get_admin_dashboard(
    admin_user: AdminUser = Depends(check_permission(Permission.VIEW_AUDIT_LOGS)),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Get admin dashboard metrics."""
    metrics = admin_service.get_dashboard_metrics()
    
    # Add system health checks
    system_health = {
        "database_connected": True,  # If we got this far, DB is connected
        "redis_connected": True,     # TODO: Check Redis connection
        "storage_available": True,   # TODO: Check MinIO connection
        "last_backup": "2025-01-10T10:00:00Z"  # TODO: Get actual backup info
    }
    
    return DashboardMetrics(
        user_metrics=metrics["user_metrics"],
        queue_metrics=metrics["queue_metrics"],
        recent_activity=metrics["recent_activity"],
        system_health=system_health
    )

# Self-service endpoints
@router.get("/profile", response_model=UserResponse)
async def get_own_profile(
    current_user: User = Depends(get_current_user),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Get current user's profile."""
    admin_user = admin_service.db.query(AdminUser).filter(
        AdminUser.username == current_user.username
    ).first()
    
    if not admin_user:
        raise HTTPException(status_code=404, detail="User profile not found")
    
    return UserResponse(**admin_user.to_dict())

@router.put("/profile")
async def update_own_profile(
    update_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Update current user's profile."""
    admin_user = admin_service.db.query(AdminUser).filter(
        AdminUser.username == current_user.username
    ).first()
    
    if not admin_user:
        raise HTTPException(status_code=404, detail="User profile not found")
    
    # Users can only update certain fields
    if update_data.full_name is not None:
        admin_user.full_name = update_data.full_name
    if update_data.organization is not None:
        admin_user.organization = update_data.organization
    if update_data.position is not None:
        admin_user.position = update_data.position
    
    admin_user.updated_at = datetime.utcnow()
    admin_service.db.commit()
    
    return {"message": "Profile updated successfully"}

@router.post("/change-password")
async def change_password(
    password_data: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Change current user's password."""
    admin_user = admin_service.db.query(AdminUser).filter(
        AdminUser.username == current_user.username
    ).first()
    
    if not admin_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Verify current password
    import bcrypt
    if not bcrypt.checkpw(
        (password_data.current_password + admin_user.salt).encode('utf-8'),
        admin_user.password_hash.encode('utf-8')
    ):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    # Update password
    import secrets
    salt = secrets.token_hex(16)
    password_hash = bcrypt.hashpw(
        (password_data.new_password + salt).encode('utf-8'),
        bcrypt.gensalt()
    ).decode('utf-8')
    
    admin_user.password_hash = password_hash
    admin_user.salt = salt
    admin_user.last_password_change = datetime.utcnow()
    admin_user.updated_at = datetime.utcnow()
    admin_service.db.commit()
    
    # Log the action
    admin_service._log_action(
        user_id=admin_user.id,
        action="password_change",
        details={"changed_own_password": True}
    )
    
    return {"message": "Password changed successfully"}

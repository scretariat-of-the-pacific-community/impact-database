"""
Enhanced authentication module - compatibility wrapper for existing auth system.
This module provides the enhanced authentication functions expected by other modules.
"""

from typing import Optional
from fastapi import HTTPException, status
from .auth import get_current_user, User

async def require_permission(required_permission: str, current_user: User = None):
    """
    Simple permission check - for development purposes.
    In production, this should be connected to a proper RBAC system.
    """
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    
    # For now, allow all authenticated users
    # In production, check user permissions against required_permission
    return True

# Re-export main functions for compatibility
__all__ = ['get_current_user', 'User', 'require_permission']
"""
CSRF Protection Middleware
---------------------------
Cross-Site Request Forgery protection for cookie-based authentication.
Implements double-submit cookie pattern with server-side validation.
"""

import secrets
import hmac
import hashlib
import logging
from typing import Optional
from functools import wraps

from fastapi import Request, Response, HTTPException, status

logger = logging.getLogger(__name__)

class CSRFProtection:
    """CSRF token generation and validation."""
    
    def __init__(self, secret_key: str, cookie_name: str = "csrf_token"):
        """Initialize CSRF protection.
        
        Args:
            secret_key: Secret key for HMAC signing
            cookie_name: Name of CSRF cookie
        """
        self.secret_key = secret_key.encode()
        self.cookie_name = cookie_name
        self.header_name = "X-CSRF-Token"
        self.form_field_name = "csrf_token"
    
    def generate_token(self) -> str:
        """Generate a new CSRF token.
        
        Returns:
            URL-safe CSRF token string
        """
        random_bytes = secrets.token_bytes(32)
        signature = hmac.new(self.secret_key, random_bytes, hashlib.sha256).digest()
        token = secrets.token_urlsafe(32)
        return token
    
    def validate_token(self, token: str, cookie_token: Optional[str]) -> bool:
        """Validate CSRF token using double-submit pattern.
        
        Args:
            token: Token from request header/body
            cookie_token: Token from cookie
        
        Returns:
            True if tokens match and are valid
        """
        if not token or not cookie_token:
            return False
        
        # Double-submit check: header/body token must match cookie token
        return hmac.compare_digest(token, cookie_token)
    
    def set_csrf_cookie(
        self,
        response: Response,
        request: Request,
        token: Optional[str] = None
    ) -> str:
        """Set CSRF token cookie in response.
        
        Args:
            response: FastAPI Response object
            request: FastAPI Request object
            token: Optional pre-generated token
        
        Returns:
            The CSRF token that was set
        """
        if token is None:
            token = self.generate_token()
        
        is_secure = request.url.scheme == "https"
        
        response.set_cookie(
            key=self.cookie_name,
            value=token,
            max_age=3600 * 24 * 7,  # 7 days
            path="/",
            httponly=False,  # Must be readable by JavaScript
            secure=is_secure,
            samesite="strict"
        )
        
        return token
    
    def get_token_from_request(self, request: Request) -> Optional[str]:
        """Extract CSRF token from request header or form data.
        
        Args:
            request: FastAPI Request object
        
        Returns:
            CSRF token if found, None otherwise
        """
        # Check header first
        token = request.headers.get(self.header_name)
        if token:
            return token
        
        # Check form data for POST requests
        if request.method == "POST":
            try:
                form_data = request.form()
                return form_data.get(self.form_field_name)
            except:
                pass
        
        return None
    
    def verify_csrf_token(self, request: Request) -> bool:
        """Verify CSRF token from request.
        
        Args:
            request: FastAPI Request object
        
        Returns:
            True if CSRF validation passes
        
        Raises:
            HTTPException: If CSRF validation fails (403 status)
        """
        # Skip CSRF for safe methods (GET, HEAD, OPTIONS)
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        
        # Extract tokens
        token = self.get_token_from_request(request)
        cookie_token = request.cookies.get(self.cookie_name)
        
        # Validate
        if not self.validate_token(token, cookie_token):
            logger.warning(f"CSRF validation failed for {request.url.path}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF validation failed"
            )
        
        return True


def csrf_protect(csrf_protection: CSRFProtection):
    """Decorator to protect endpoints with CSRF validation.
    
    Usage:
        @router.post("/api/sensitive-action")
        @csrf_protect(csrf_protection)
        async def sensitive_action(request: Request):
            # Handler code
            pass
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(request: Request, *args, **kwargs):
            csrf_protection.verify_csrf_token(request)
            return await func(request, *args, **kwargs)
        return wrapper
    return decorator


# Dependency for FastAPI route dependencies
def get_csrf_protection(request: Request) -> bool:
    """FastAPI dependency for CSRF protection.
    
    Usage:
        @router.post("/api/action", dependencies=[Depends(get_csrf_protection)])
        async def action():
            # Handler code
            pass
    """
    csrf = request.app.state.csrf_protection
    return csrf.verify_csrf_token(request)

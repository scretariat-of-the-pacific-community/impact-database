"""
CSRF Protection Middleware
Protects against Cross-Site Request Forgery attacks on state-changing operations
"""

import os
import secrets
import logging
from typing import Callable

from fastapi import Request, HTTPException
from fastapi.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.datastructures import MutableHeaders

logger = logging.getLogger(__name__)


class CSRFMiddleware(BaseHTTPMiddleware):
    """
    CSRF Protection Middleware

    - Generates CSRF tokens for authenticated sessions
    - Validates tokens on state-changing methods (POST, PUT, DELETE, PATCH)
    - Exempt paths: /docs, /openapi.json, /api/auth/* (login/signup don't have prior token)
    - Token stored in secure cookie and must match X-CSRF-Token header
    """

    def __init__(
        self,
        app,
        secret_key: str = None,
        cookie_name: str = "csrf_token",
        header_name: str = "X-CSRF-Token",
        cookie_secure: bool = True,
        cookie_httponly: bool = False,  # JS needs to read it
        cookie_samesite: str = "lax",
        exempt_paths: list = None,
    ):
        super().__init__(app)
        # Prefer an explicitly provided secret key, then a configured environment or settings value.
        self.secret_key = secret_key or os.getenv("SECRET_KEY")
        if not self.secret_key:
            try:
                from core.config import settings

                self.secret_key = getattr(settings, "SECRET_KEY", None)
            except Exception:
                self.secret_key = None

        # Fall back to an ephemeral key in development so startup does not fail without SECRET_KEY.
        if not self.secret_key:
            logger.warning(
                "CSRFMiddleware initialized without SECRET_KEY or explicit secret_key; "
                "using a randomly generated ephemeral key. "
                "This is suitable for development only, as CSRF tokens will reset on restart."
            )
            self.secret_key = secrets.token_urlsafe(32)
        self.cookie_name = cookie_name
        self.header_name = header_name
        self.cookie_secure = cookie_secure
        self.cookie_httponly = cookie_httponly
        self.cookie_samesite = cookie_samesite

        # Paths exempt from CSRF protection
        self.exempt_paths = exempt_paths or [
            "/docs",
            "/openapi.json",
            "/redoc",
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/refresh",
            "/health",
            "/favicon.ico",
        ]

    def is_exempt(self, path: str) -> bool:
        """Check if path is exempt from CSRF protection"""
        return any(path.startswith(exempt) for exempt in self.exempt_paths)

    def requires_csrf_check(self, method: str) -> bool:
        """Check if HTTP method requires CSRF validation"""
        return method in ["POST", "PUT", "DELETE", "PATCH"]

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request and validate CSRF token if needed"""

        path = request.url.path
        method = request.method

        # Skip CSRF for exempt paths
        if self.is_exempt(path):
            response = await call_next(request)
            return response

        # Get or generate CSRF token
        csrf_token = request.cookies.get(self.cookie_name)

        if not csrf_token:
            # Generate new token
            csrf_token = secrets.token_urlsafe(32)
            logger.debug(f"Generated new CSRF token for {path}")

        # Validate token on state-changing methods
        if self.requires_csrf_check(method):
            # Get token from header
            header_token = request.headers.get(self.header_name)

            if not header_token:
                logger.warning(f"CSRF token missing in header for {method} {path}")
                raise HTTPException(
                    status_code=403, detail="CSRF token missing. Include X-CSRF-Token header."
                )

            if not csrf_token:
                logger.warning(f"CSRF token missing in cookie for {method} {path}")
                raise HTTPException(
                    status_code=403, detail="CSRF token missing. Refresh the page and try again."
                )

            if not secrets.compare_digest(header_token, csrf_token):
                logger.warning(f"CSRF token mismatch for {method} {path}")
                raise HTTPException(
                    status_code=403, detail="Invalid CSRF token. Refresh the page and try again."
                )

            logger.debug(f"CSRF token validated for {method} {path}")

        # Process request
        response = await call_next(request)

        # Set CSRF cookie in response if not present or refreshed
        if method == "GET" and not request.cookies.get(self.cookie_name):
            # Set new cookie on GET requests
            response.set_cookie(
                key=self.cookie_name,
                value=csrf_token,
                httponly=self.cookie_httponly,
                secure=self.cookie_secure,
                samesite=self.cookie_samesite,
                max_age=3600 * 24,  # 24 hours
            )

            # Also add token to response headers for easy JS access
            headers = MutableHeaders(response.headers)
            headers[self.header_name] = csrf_token
            response.headers = headers

            logger.debug(f"Set CSRF token cookie for {path}")

        return response


class DoubleSubmitCSRF:
    """
    Alternative CSRF protection using double-submit cookie pattern
    More suitable for stateless JWT-based auth
    """

    def __init__(self, cookie_name: str = "csrf_token", header_name: str = "X-CSRF-Token"):
        self.cookie_name = cookie_name
        self.header_name = header_name

    def generate_token(self) -> str:
        """Generate a random CSRF token"""
        return secrets.token_urlsafe(32)

    def validate(self, cookie_token: str, header_token: str) -> bool:
        """Validate that cookie and header tokens match"""
        if not cookie_token or not header_token:
            return False
        return secrets.compare_digest(cookie_token, header_token)


# Singleton instances
csrf_middleware = CSRFMiddleware
double_submit_csrf = DoubleSubmitCSRF()

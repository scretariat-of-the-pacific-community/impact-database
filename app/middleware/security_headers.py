"""
Security Headers Middleware
Adds comprehensive security headers to all HTTP responses
"""

import logging
import os
from typing import Callable

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

logger = logging.getLogger(__name__)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Security Headers Middleware

    Adds security headers to protect against common web vulnerabilities:
    - Content-Security-Policy: Prevents XSS attacks
    - X-Frame-Options: Prevents clickjacking
    - X-Content-Type-Options: Prevents MIME sniffing
    - Strict-Transport-Security: Enforces HTTPS
    - Permissions-Policy: Controls browser features
    - Referrer-Policy: Controls referrer information leakage
    """

    def __init__(
        self,
        app,
        environment: str = None,
        enable_hsts: bool = True,
        hsts_max_age: int = 31536000,  # 1 year
        csp_policy: str = None,
    ):
        super().__init__(app)
        self.environment = environment or os.getenv("ENVIRONMENT", "development").lower()
        self.enable_hsts = enable_hsts
        self.hsts_max_age = hsts_max_age

        # Default CSP policy - customize based on your needs
        if csp_policy:
            self.csp_policy = csp_policy
        else:
            # Strict CSP for production, more relaxed for development
            if self.environment == "production":
                self.csp_policy = (
                    "default-src 'self'; "
                    "script-src 'self' https://unpkg.com; "
                    "style-src 'self' 'unsafe-inline' https://unpkg.com; "
                    "img-src 'self' data: https:; "
                    "font-src 'self' data:; "
                    "connect-src 'self'; "
                    "frame-ancestors 'none'; "
                    "base-uri 'self'; "
                    "form-action 'self'"
                )
            else:
                # Development: Allow unsafe-eval for hot reload, etc.
                self.csp_policy = (
                    "default-src 'self'; "
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; "
                    "style-src 'self' 'unsafe-inline' https://unpkg.com; "
                    "img-src 'self' data: https: http:; "
                    "font-src 'self' data:; "
                    "connect-src 'self' ws: wss: http://localhost:* http://127.0.0.1:*; "
                    "frame-ancestors 'none'; "
                    "base-uri 'self'; "
                    "form-action 'self'"
                )

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Add security headers to all responses"""

        response = await call_next(request)

        # Prevent clickjacking attacks
        response.headers["X-Frame-Options"] = "DENY"

        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Enable XSS filter (legacy header, but doesn't hurt)
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Content Security Policy - Primary XSS defense
        response.headers["Content-Security-Policy"] = self.csp_policy

        # Strict Transport Security (HSTS) - Force HTTPS in production
        if self.enable_hsts and (self.environment == "production" or request.url.scheme == "https"):
            response.headers["Strict-Transport-Security"] = (
                f"max-age={self.hsts_max_age}; includeSubDomains; preload"
            )

        # Permissions Policy - Restrict browser features
        response.headers["Permissions-Policy"] = (
            "geolocation=(), "
            "microphone=(), "
            "camera=(), "
            "payment=(), "
            "usb=(), "
            "magnetometer=(), "
            "gyroscope=(), "
            "accelerometer=()"
        )

        # Referrer Policy - Control referrer information
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Log security headers in development for debugging
        if self.environment == "development" and logger.isEnabledFor(logging.DEBUG):
            logger.debug(
                f"Security headers added to {request.url.path}: "
                f"CSP={response.headers.get('Content-Security-Policy')[:50]}..."
            )

        return response


def create_security_headers_middleware(
    environment: str = None,
    enable_hsts: bool = True,
    custom_csp: str = None,
):
    """
    Factory function to create SecurityHeadersMiddleware with custom settings

    Args:
        environment: Environment name (production, development, etc.)
        enable_hsts: Whether to enable HSTS header
        custom_csp: Custom Content-Security-Policy string

    Returns:
        Configured SecurityHeadersMiddleware class
    """
    return lambda app: SecurityHeadersMiddleware(
        app,
        environment=environment,
        enable_hsts=enable_hsts,
        csp_policy=custom_csp,
    )

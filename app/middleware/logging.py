"""
Structured logging middleware with request IDs for tracing
Provides comprehensive logging with context propagation
"""

import logging
import time
import uuid
from typing import Callable

import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

_structlog_configured = False


class RequestIdFilter(logging.Filter):
    """Inject request context from structlog into stdlib log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        context = structlog.contextvars.get_contextvars()
        record.request_id = context.get("request_id", "n/a")
        record.client_ip = context.get("client_ip", "n/a")
        record.path = context.get("path", "n/a")
        return True


def configure_structlog(log_level: int = logging.INFO, force: bool = False) -> None:
    """
    Configure structlog to emit JSON with request context and align stdlib logging.

    Args:
        log_level: Desired logging level (INFO/DEBUG/etc.).
        force: Reconfigure even if already configured.
    """
    global _structlog_configured
    if _structlog_configured and not force:
        return

    timestamper = structlog.processors.TimeStamper(fmt="iso", utc=True)
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.add_logger_name,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    structlog.configure(
        processors=[*shared_processors, timestamper, structlog.processors.JSONRenderer()],
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s %(levelname)s [request_id=%(request_id)s path=%(path)s] %(name)s - %(message)s"
        )
    )
    handler.addFilter(RequestIdFilter())

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.setLevel(log_level)
    root_logger.addHandler(handler)

    logging.captureWarnings(True)
    _structlog_configured = True


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware that adds request IDs and structured logging to all requests.

    Features:
    - Generates unique request ID for each request
    - Logs request/response with timing
    - Propagates request ID through contextvars
    - Includes user info when authenticated
    """

    def __init__(self, app: ASGIApp, exclude_paths: list[str] = None):
        super().__init__(app)
        self.exclude_paths = exclude_paths or [
            "/health",
            "/metrics",
            "/docs",
            "/openapi.json",
            "/redoc",
        ]

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip logging for excluded paths
        if any(request.url.path.startswith(path) for path in self.exclude_paths):
            return await call_next(request)

        # Generate or extract request ID
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))

        # Bind request context to logger
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            client_ip=request.client.host if request.client else None,
        )

        # Log request
        start_time = time.time()
        log = structlog.get_logger()
        log.info(
            "request_started",
            method=request.method,
            path=request.url.path,
            query_params=dict(request.query_params) if request.query_params else None,
        )

        # Process request
        try:
            response = await call_next(request)

            # Calculate duration
            duration_ms = (time.time() - start_time) * 1000

            # Add request ID to response headers
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Process-Time"] = f"{duration_ms:.2f}ms"

            # Log response
            log.info(
                "request_completed",
                status_code=response.status_code,
                duration_ms=round(duration_ms, 2),
            )

            return response

        except Exception as e:
            # Calculate duration even for errors
            duration_ms = (time.time() - start_time) * 1000

            # Log error
            log.error(
                "request_failed",
                error=str(e),
                error_type=type(e).__name__,
                duration_ms=round(duration_ms, 2),
                exc_info=True,
            )
            raise


def get_logger(name: str = None) -> structlog.BoundLogger:
    """
    Get a structured logger with current request context.

    Usage:
        from middleware.logging import get_logger

        log = get_logger(__name__)
        log.info("operation_completed", user_id=123, items_processed=50)

    Args:
        name: Logger name (typically __name__ of the module)

    Returns:
        Structured logger with request context bound
    """
    return structlog.get_logger(name)


def log_operation(operation: str, **kwargs):
    """
    Helper to log operations with consistent formatting.

    Usage:
        log_operation("image_uploaded", image_id=456, size_kb=1024)

    Args:
        operation: Name of the operation (snake_case)
        **kwargs: Additional context to log
    """
    log = get_logger()
    log.info(operation, **kwargs)


def log_error(operation: str, error: Exception, **kwargs):
    """
    Helper to log errors with consistent formatting.

    Usage:
        try:
            process_image()
        except Exception as e:
            log_error("image_processing_failed", e, image_id=456)

    Args:
        operation: Name of the failed operation
        error: The exception that occurred
        **kwargs: Additional context to log
    """
    log = get_logger()
    log.error(operation, error=str(error), error_type=type(error).__name__, exc_info=True, **kwargs)

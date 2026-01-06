"""
Rate Limiting Middleware
Implements token bucket algorithm for rate limiting API requests per user
"""

from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Dict, Tuple
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


class TokenBucket:
    """Token bucket for rate limiting"""

    def __init__(self, capacity: int, refill_rate: float):
        """
        Args:
            capacity: Maximum number of tokens (requests)
            refill_rate: Tokens added per second
        """
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.tokens = capacity
        self.last_refill = datetime.now()

    def consume(self, tokens: int = 1) -> bool:
        """
        Try to consume tokens. Returns True if allowed, False if rate limited.
        """
        self._refill()

        if self.tokens >= tokens:
            self.tokens -= tokens
            return True
        return False

    def _refill(self):
        """Refill tokens based on elapsed time"""
        now = datetime.now()
        elapsed = (now - self.last_refill).total_seconds()

        # Add tokens based on elapsed time
        tokens_to_add = elapsed * self.refill_rate
        self.tokens = min(self.capacity, self.tokens + tokens_to_add)
        self.last_refill = now

    def get_retry_after(self) -> float:
        """Get seconds until next token is available"""
        if self.tokens >= 1:
            return 0.0
        tokens_needed = 1 - self.tokens
        return tokens_needed / self.refill_rate


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Rate limiting middleware using token bucket algorithm
    Default: 10 requests per minute per user
    """

    def __init__(
        self,
        app,
        requests_per_minute: int = 10,
        burst_size: int = 15,  # Allow small bursts
        exclude_paths: list = None,
    ):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.burst_size = burst_size
        self.refill_rate = requests_per_minute / 60.0  # tokens per second

        # Paths to exclude from rate limiting
        self.exclude_paths = exclude_paths or [
            "/api/health",
            "/api/docs",
            "/api/openapi.json",
            "/api/redoc",
            "/docs",
            "/openapi.json",
            "/redoc",
        ]

        # Store buckets per user: {user_id: TokenBucket}
        self.buckets: Dict[str, TokenBucket] = {}

        # Cleanup old buckets periodically
        self.last_cleanup = datetime.now()
        self.cleanup_interval = timedelta(minutes=10)

    async def dispatch(self, request: Request, call_next):
        """Process request with rate limiting"""

        # Skip rate limiting for excluded paths
        if any(request.url.path.startswith(path) for path in self.exclude_paths):
            return await call_next(request)

        # Get user identifier (username from auth or IP as fallback)
        user_id = self._get_user_identifier(request)

        # Get or create token bucket for this user
        bucket = self._get_bucket(user_id)

        # Try to consume a token
        if not bucket.consume(1):
            # Rate limit exceeded
            retry_after = int(bucket.get_retry_after()) + 1
            logger.warning(
                f"Rate limit exceeded for user {user_id} on {request.url.path}. "
                f"Retry after {retry_after}s"
            )

            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": "Rate limit exceeded",
                    "message": f"Too many requests. Please try again in {retry_after} seconds.",
                    "retry_after": retry_after,
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(self.requests_per_minute),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(
                        int((datetime.now() + timedelta(seconds=retry_after)).timestamp())
                    ),
                },
            )

        # Add rate limit headers to response
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(self.requests_per_minute)
        response.headers["X-RateLimit-Remaining"] = str(int(bucket.tokens))

        # Periodic cleanup of old buckets
        self._cleanup_old_buckets()

        return response

    def _get_user_identifier(self, request: Request) -> str:
        """Get user identifier from request (username or IP)"""
        # Try to get username from request state (set by auth middleware)
        user = getattr(request.state, "user", None)
        if user and hasattr(user, "username"):
            return f"user:{user.username}"

        # Fall back to IP address for unauthenticated requests
        client_ip = request.client.host if request.client else "unknown"

        # Check X-Forwarded-For header for proxied requests
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            client_ip = forwarded.split(",")[0].strip()

        return f"ip:{client_ip}"

    def _get_bucket(self, user_id: str) -> TokenBucket:
        """Get or create token bucket for user"""
        if user_id not in self.buckets:
            self.buckets[user_id] = TokenBucket(
                capacity=self.burst_size, refill_rate=self.refill_rate
            )
        return self.buckets[user_id]

    def _cleanup_old_buckets(self):
        """Remove buckets that haven't been used recently"""
        now = datetime.now()

        if now - self.last_cleanup < self.cleanup_interval:
            return

        # Remove buckets older than 1 hour
        cutoff = now - timedelta(hours=1)
        old_users = [
            user_id for user_id, bucket in self.buckets.items() if bucket.last_refill < cutoff
        ]

        for user_id in old_users:
            del self.buckets[user_id]

        if old_users:
            logger.info(f"Cleaned up {len(old_users)} old rate limit buckets")

        self.last_cleanup = now


# Alternative: Redis-based rate limiter for distributed systems
class RedisRateLimitMiddleware(BaseHTTPMiddleware):
    """
    Redis-based rate limiter for distributed deployments
    Uses Redis to store rate limit counters across multiple app instances
    """

    def __init__(
        self, app, redis_client, requests_per_minute: int = 10, exclude_paths: list = None
    ):
        super().__init__(app)
        self.redis = redis_client
        self.requests_per_minute = requests_per_minute
        self.window_seconds = 60
        self.exclude_paths = exclude_paths or ["/api/health", "/api/docs"]

    async def dispatch(self, request: Request, call_next):
        """Process request with Redis-based rate limiting"""

        # Skip excluded paths
        if any(request.url.path.startswith(path) for path in self.exclude_paths):
            return await call_next(request)

        user_id = self._get_user_identifier(request)
        key = f"rate_limit:{user_id}:{int(datetime.now().timestamp() / self.window_seconds)}"

        try:
            # Increment counter
            count = self.redis.incr(key)

            # Set expiry on first request in window
            if count == 1:
                self.redis.expire(key, self.window_seconds)

            # Check if limit exceeded
            if count > self.requests_per_minute:
                ttl = self.redis.ttl(key)
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={
                        "error": "Rate limit exceeded",
                        "message": f"Too many requests. Please try again in {ttl} seconds.",
                        "retry_after": ttl,
                    },
                    headers={"Retry-After": str(ttl)},
                )

            # Process request
            response = await call_next(request)
            response.headers["X-RateLimit-Limit"] = str(self.requests_per_minute)
            response.headers["X-RateLimit-Remaining"] = str(
                max(0, self.requests_per_minute - count)
            )

            return response

        except Exception as e:
            logger.error(f"Rate limit check failed: {e}")
            # On Redis failure, allow request through (fail open)
            return await call_next(request)

    def _get_user_identifier(self, request: Request) -> str:
        """Get user identifier from request"""
        user = getattr(request.state, "user", None)
        if user and hasattr(user, "username"):
            return f"user:{user.username}"

        client_ip = request.client.host if request.client else "unknown"
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            client_ip = forwarded.split(",")[0].strip()

        return f"ip:{client_ip}"

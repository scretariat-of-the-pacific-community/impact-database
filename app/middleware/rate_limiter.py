"""
Redis-Backed Rate Limiter
--------------------------
Production-ready rate limiting using Redis for persistence across restarts.
Falls back to in-memory storage if Redis is unavailable.
"""

import logging
import time
from collections import defaultdict
from typing import Optional

from fastapi import HTTPException, status

logger = logging.getLogger(__name__)


class RateLimiter:
    """Rate limiter with Redis backend and in-memory fallback."""

    def __init__(self, redis_client=None):
        """Initialize rate limiter with optional Redis client.

        Args:
            redis_client: Redis client instance (redis.Redis or aioredis.Redis)
                         If None, falls back to in-memory storage
        """
        self.redis_client = redis_client
        self.memory_storage = defaultdict(list)  # Fallback storage
        self.use_redis = redis_client is not None

        if self.use_redis:
            try:
                self.redis_client.ping()
                logger.info("Rate limiter initialized with Redis backend")
            except Exception as e:
                logger.warning(f"Redis ping failed, falling back to in-memory: {e}")
                self.use_redis = False
        else:
            logger.warning("Rate limiter initialized with in-memory storage (not production-ready)")

    def _get_redis_key(self, identifier: str) -> str:
        """Generate Redis key for rate limit identifier."""
        return f"rate_limit:{identifier}"

    def _check_redis(self, identifier: str, window: int, max_attempts: int) -> None:
        """Check rate limit using Redis sorted set."""
        key = self._get_redis_key(identifier)
        now = time.time()
        window_start = now - window

        try:
            # Remove old entries outside the time window
            self.redis_client.zremrangebyscore(key, 0, window_start)

            # Count attempts in current window
            count = self.redis_client.zcard(key)

            if count >= max_attempts:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many attempts. Please try again in {window // 60} minutes.",
                    headers={"Retry-After": str(window)},
                )

            # Add new attempt with current timestamp as score
            self.redis_client.zadd(key, {f"{now}": now})

            # Set expiry on key to prevent memory leaks
            self.redis_client.expire(key, window)

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Redis rate limit check failed: {e}, falling back to memory")
            self.use_redis = False
            self._check_memory(identifier, window, max_attempts)

    def _check_memory(self, identifier: str, window: int, max_attempts: int) -> None:
        """Check rate limit using in-memory storage (fallback)."""
        now = time.time()

        # Clean old attempts
        self.memory_storage[identifier] = [
            timestamp for timestamp in self.memory_storage[identifier] if now - timestamp < window
        ]

        # Check limit
        if len(self.memory_storage[identifier]) >= max_attempts:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many attempts. Please try again in {window // 60} minutes.",
                headers={"Retry-After": str(window)},
            )

        # Record attempt
        self.memory_storage[identifier].append(now)

    def check_rate_limit(self, identifier: str, window: int = 900, max_attempts: int = 5) -> None:
        """Check if identifier has exceeded rate limit.

        Args:
            identifier: Unique identifier (IP, username, etc.)
            window: Time window in seconds (default: 15 minutes)
            max_attempts: Maximum attempts allowed (default: 5)

        Raises:
            HTTPException: If rate limit exceeded (429 status)
        """
        if self.use_redis:
            self._check_redis(identifier, window, max_attempts)
        else:
            self._check_memory(identifier, window, max_attempts)

    def reset(self, identifier: str) -> None:
        """Reset rate limit for identifier (useful after successful action)."""
        if self.use_redis:
            try:
                key = self._get_redis_key(identifier)
                self.redis_client.delete(key)
            except Exception as e:
                logger.error(f"Failed to reset rate limit in Redis: {e}")
        else:
            self.memory_storage.pop(identifier, None)


# Default rate limit configurations
RATE_LIMITS = {
    "auth_login": {"window": 900, "max_attempts": 5},  # 5 attempts per 15 min
    "auth_register": {"window": 3600, "max_attempts": 3},  # 3 attempts per hour
    "upload": {"window": 3600, "max_attempts": 10},  # 10 uploads per hour
    "api_general": {"window": 60, "max_attempts": 100},  # 100 requests per minute
}

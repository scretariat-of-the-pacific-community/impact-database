"""
Redis-based caching middleware and utilities
Provides decorators and utilities for caching API responses
"""

import redis
import json
import logging
import hashlib
from typing import Optional, Callable, Any
from datetime import timedelta
from functools import wraps
from fastapi import Request, Response
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class RedisCache:
    """Redis cache manager with TTL support"""

    def __init__(self, redis_client: Optional[redis.Redis] = None, default_ttl: int = 300):
        """
        Initialize Redis cache

        Args:
            redis_client: Redis client instance (optional)
            default_ttl: Default TTL in seconds (default: 300 = 5 minutes)
        """
        self.redis_client = redis_client
        self.default_ttl = default_ttl
        self.enabled = redis_client is not None

        if not self.enabled:
            logger.warning("Redis cache disabled - no Redis client provided")

    def _generate_cache_key(self, prefix: str, *args, **kwargs) -> str:
        """Generate a unique cache key from prefix and arguments"""
        # Create a deterministic string from args/kwargs
        key_data = f"{prefix}:{str(args)}:{str(sorted(kwargs.items()))}"
        key_hash = hashlib.md5(key_data.encode()).hexdigest()
        return f"cache:{prefix}:{key_hash}"

    def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        if not self.enabled:
            return None

        try:
            data = self.redis_client.get(key)
            if data:
                logger.debug(f"Cache HIT: {key}")
                return json.loads(data)
            logger.debug(f"Cache MISS: {key}")
            return None
        except Exception as e:
            logger.error(f"Cache GET error: {e}")
            return None

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set value in cache with TTL"""
        if not self.enabled:
            return False

        try:
            ttl = ttl or self.default_ttl
            data = json.dumps(value)
            self.redis_client.setex(key, ttl, data)
            logger.debug(f"Cache SET: {key} (TTL: {ttl}s)")
            return True
        except Exception as e:
            logger.error(f"Cache SET error: {e}")
            return False

    def delete(self, key: str) -> bool:
        """Delete value from cache"""
        if not self.enabled:
            return False

        try:
            self.redis_client.delete(key)
            logger.debug(f"Cache DELETE: {key}")
            return True
        except Exception as e:
            logger.error(f"Cache DELETE error: {e}")
            return False

    def invalidate_pattern(self, pattern: str) -> int:
        """Delete all keys matching pattern"""
        if not self.enabled:
            return 0

        try:
            keys = self.redis_client.keys(pattern)
            if keys:
                count = self.redis_client.delete(*keys)
                logger.info(f"Cache invalidated {count} keys matching: {pattern}")
                return count
            return 0
        except Exception as e:
            logger.error(f"Cache invalidate pattern error: {e}")
            return 0

    def cached(self, prefix: str, ttl: Optional[int] = None):
        """
        Decorator for caching function results

        Usage:
            @cache.cached("user_stats", ttl=300)
            def get_user_stats(username: str):
                return expensive_calculation()
        """

        def decorator(func: Callable) -> Callable:
            @wraps(func)
            def wrapper(*args, **kwargs):
                if not self.enabled:
                    return func(*args, **kwargs)

                # Generate cache key
                cache_key = self._generate_cache_key(prefix, *args, **kwargs)

                # Try to get from cache
                cached_value = self.get(cache_key)
                if cached_value is not None:
                    return cached_value

                # Execute function
                result = func(*args, **kwargs)

                # Cache result
                self.set(cache_key, result, ttl)

                return result

            return wrapper

        return decorator

    def cached_endpoint(
        self, prefix: str, ttl: Optional[int] = None, key_params: Optional[list] = None
    ):
        """
        Decorator for caching FastAPI endpoint responses

        Args:
            prefix: Cache key prefix
            ttl: Time to live in seconds
            key_params: List of request parameters to include in cache key

        Usage:
            @router.get("/stats")
            @cache.cached_endpoint("user_stats", ttl=300, key_params=["username"])
            async def get_stats(username: str):
                return calculate_stats(username)
        """

        def decorator(func: Callable) -> Callable:
            @wraps(func)
            async def wrapper(*args, **kwargs):
                if not self.enabled:
                    return await func(*args, **kwargs)

                # Extract cache key parameters
                key_data = {}
                if key_params:
                    for param in key_params:
                        if param in kwargs:
                            key_data[param] = kwargs[param]

                # Generate cache key
                cache_key = self._generate_cache_key(prefix, **key_data)

                # Try to get from cache
                cached_value = self.get(cache_key)
                if cached_value is not None:
                    return JSONResponse(
                        content=cached_value, headers={"X-Cache": "HIT", "X-Cache-Key": cache_key}
                    )

                # Execute endpoint
                result = await func(*args, **kwargs)

                # Cache result (if it's a dict or JSONResponse)
                if isinstance(result, dict):
                    self.set(cache_key, result, ttl)
                    return JSONResponse(
                        content=result, headers={"X-Cache": "MISS", "X-Cache-Key": cache_key}
                    )
                elif isinstance(result, JSONResponse):
                    # Extract content from JSONResponse
                    import json as json_lib

                    content = json_lib.loads(result.body.decode())
                    self.set(cache_key, content, ttl)
                    result.headers["X-Cache"] = "MISS"
                    result.headers["X-Cache-Key"] = cache_key

                return result

            return wrapper

        return decorator


# Singleton instance (initialized in main.py)
cache_manager: Optional[RedisCache] = None


def init_cache(redis_client: Optional[redis.Redis], default_ttl: int = 300) -> RedisCache:
    """Initialize global cache manager"""
    global cache_manager
    cache_manager = RedisCache(redis_client, default_ttl)
    return cache_manager


def get_cache() -> RedisCache:
    """Get cache manager instance"""
    global cache_manager
    if cache_manager is None:
        cache_manager = RedisCache(None)
    return cache_manager

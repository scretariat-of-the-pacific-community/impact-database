"""
Performance optimization module for STAC and OGC APIs
Implements caching, spatial indexing, and pagination optimizations
"""

import redis
import json
import hashlib
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from functools import wraps

from fastapi import Request, Depends
from sqlalchemy.orm import Session
from sqlalchemy import Index, text, func
from pydantic import BaseModel

from core.config import settings
from models.database import get_db, ImageMetadata

# Redis connection for caching
redis_client = None
if hasattr(settings, "REDIS_URL") and settings.REDIS_URL:
    try:
        redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        redis_client.ping()
    except Exception as e:
        print(f"Redis connection failed: {e}")
        redis_client = None

# Cache configuration
CACHE_TTL = {
    "collections": 3600,  # 1 hour
    "items": 1800,  # 30 minutes
    "search": 900,  # 15 minutes
    "stats": 7200,  # 2 hours
}


class CacheKey:
    """Generate consistent cache keys"""

    @staticmethod
    def collections() -> str:
        return "collections:all"

    @staticmethod
    def collection(collection_id: str) -> str:
        return f"collection:{collection_id}"

    @staticmethod
    def collection_stats(collection_id: str) -> str:
        return f"collection_stats:{collection_id}"

    @staticmethod
    def search(query_params: Dict[str, Any]) -> str:
        # Create deterministic hash of query parameters
        query_str = json.dumps(query_params, sort_keys=True)
        query_hash = hashlib.md5(query_str.encode()).hexdigest()
        return f"search:{query_hash}"

    @staticmethod
    def item(collection_id: str, item_id: str) -> str:
        return f"item:{collection_id}:{item_id}"


def cache_result(key_func, ttl: int = 3600):
    """Decorator for caching function results"""

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            if not redis_client:
                # No caching available, execute function directly
                return await func(*args, **kwargs)

            # Generate cache key
            cache_key = key_func(*args, **kwargs)

            try:
                # Try to get from cache
                cached_result = redis_client.get(cache_key)
                if cached_result:
                    return json.loads(cached_result)
            except Exception as e:
                print(f"Cache read error: {e}")

            # Execute function and cache result
            result = await func(*args, **kwargs)

            try:
                # Store in cache
                redis_client.setex(cache_key, ttl, json.dumps(result, default=str))
            except Exception as e:
                print(f"Cache write error: {e}")

            return result

        return wrapper

    return decorator


def invalidate_cache_pattern(pattern: str):
    """Invalidate cache entries matching a pattern"""
    if not redis_client:
        return

    try:
        keys = redis_client.keys(pattern)
        if keys:
            redis_client.delete(*keys)
    except Exception as e:
        print(f"Cache invalidation error: {e}")


class SpatialIndex:
    """Spatial indexing utilities"""

    @staticmethod
    def create_indexes(db: Session):
        """Create spatial and other performance indexes"""
        try:
            # Spatial index on geometry column
            db.execute(
                text(
                    """
                CREATE INDEX IF NOT EXISTS idx_image_metadata_geometry
                ON image_metadata
                USING GIST (geometry)
                WHERE geometry IS NOT NULL
            """
                )
            )

            # Temporal index
            db.execute(
                text(
                    """
                CREATE INDEX IF NOT EXISTS idx_image_metadata_timestamp 
                ON image_metadata (timestamp) 
                WHERE timestamp IS NOT NULL
            """
                )
            )

            # Hazard type index
            db.execute(
                text(
                    """
                CREATE INDEX IF NOT EXISTS idx_image_metadata_hazard_type 
                ON image_metadata (hazard_type) 
                WHERE hazard_type IS NOT NULL
            """
                )
            )

            # Country/location index
            db.execute(
                text(
                    """
                CREATE INDEX IF NOT EXISTS idx_image_metadata_country 
                ON image_metadata (country) 
                WHERE country IS NOT NULL
            """
                )
            )

            # Full-text search index for titles and abstracts
            db.execute(
                text(
                    """
                CREATE INDEX IF NOT EXISTS idx_image_metadata_fulltext
                ON image_metadata USING gin(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(abstract, '')))
            """
                )
            )

            db.commit()
            print("Spatial and performance indexes created successfully")

        except Exception as e:
            print(f"Error creating indexes: {e}")
            db.rollback()


class PaginationOptimizer:
    """Optimized pagination for large datasets"""

    @staticmethod
    def get_optimized_query(base_query, offset: int, limit: int, order_by=None):
        """Use cursor-based pagination for better performance on large offsets"""

        # For small offsets, use regular OFFSET/LIMIT
        if offset < 1000:
            query = base_query.offset(offset).limit(limit)
            if order_by:
                query = query.order_by(order_by)
            return query

        # For large offsets, use cursor-based pagination
        # This assumes we have an ID field to use as cursor
        if order_by:
            query = base_query.order_by(order_by)

        # Skip to approximate position using ID ranges
        # This is a heuristic approach for better performance
        estimated_id = offset  # Simple estimation, can be improved

        query = base_query.filter(ImageMetadata.id > estimated_id).limit(limit)
        if order_by:
            query = query.order_by(order_by)

        return query


class StatsCache:
    """Cached statistics for collections and searches"""

    @staticmethod
    async def get_collection_stats(collection_id: str, db: Session) -> Dict[str, Any]:
        """Get cached collection statistics"""
        cache_key = CacheKey.collection_stats(collection_id)

        if redis_client:
            try:
                cached_stats = redis_client.get(cache_key)
                if cached_stats:
                    return json.loads(cached_stats)
            except Exception:
                pass

        # Calculate stats
        stats = await StatsCache._calculate_collection_stats(collection_id, db)

        # Cache the result
        if redis_client:
            try:
                redis_client.setex(cache_key, CACHE_TTL["stats"], json.dumps(stats, default=str))
            except Exception:
                pass

        return stats

    @staticmethod
    async def _calculate_collection_stats(collection_id: str, db: Session) -> Dict[str, Any]:
        """Calculate collection statistics"""

        if collection_id == "general":
            base_query = db.query(ImageMetadata).filter(
                ImageMetadata.hazard_type.is_(None) | (ImageMetadata.hazard_type == "")
            )
        elif collection_id.startswith("hazard-"):
            hazard_type = collection_id.replace("hazard-", "").replace("-", " ")
            base_query = db.query(ImageMetadata).filter(
                func.lower(ImageMetadata.hazard_type) == hazard_type.lower()
            )
        else:
            return {}

        # Basic counts
        total_records = base_query.count()

        # Spatial extent
        spatial_stats = base_query.with_entities(
            func.min(ImageMetadata.longitude).label("min_lon"),
            func.max(ImageMetadata.longitude).label("max_lon"),
            func.min(ImageMetadata.latitude).label("min_lat"),
            func.max(ImageMetadata.latitude).label("max_lat"),
        ).first()

        # Temporal extent
        temporal_stats = base_query.with_entities(
            func.min(ImageMetadata.timestamp).label("min_time"),
            func.max(ImageMetadata.timestamp).label("max_time"),
        ).first()

        # Country distribution
        country_stats = (
            base_query.with_entities(
                ImageMetadata.country, func.count(ImageMetadata.id).label("count")
            )
            .filter(ImageMetadata.country.isnot(None))
            .group_by(ImageMetadata.country)
            .all()
        )

        return {
            "total_records": total_records,
            "spatial_extent": (
                {
                    "min_longitude": spatial_stats.min_lon,
                    "max_longitude": spatial_stats.max_lon,
                    "min_latitude": spatial_stats.min_lat,
                    "max_latitude": spatial_stats.max_lat,
                }
                if spatial_stats.min_lon
                else None
            ),
            "temporal_extent": (
                {"start": temporal_stats.min_time, "end": temporal_stats.max_time}
                if temporal_stats.min_time
                else None
            ),
            "country_distribution": [
                {"country": country, "count": count} for country, count in country_stats
            ],
            "last_updated": datetime.utcnow().isoformat(),
        }


class PresignedURLManager:
    """Manage presigned URL policies and expiry"""

    DEFAULT_EXPIRY = timedelta(hours=1)
    MAX_EXPIRY = timedelta(days=7)

    @staticmethod
    def get_expiry_policy(file_type: str, user_role: str = None) -> timedelta:
        """Get expiry policy based on file type and user role"""

        # Different policies for different content types
        if file_type in ["image/jpeg", "image/png", "image/tiff"]:
            if user_role == "admin":
                return timedelta(days=7)
            elif user_role == "curator":
                return timedelta(days=1)
            else:
                return timedelta(hours=4)  # Public access

        # Thumbnail images - shorter expiry
        elif file_type in ["thumbnail"]:
            return timedelta(hours=2)

        # Default policy
        return PresignedURLManager.DEFAULT_EXPIRY

    @staticmethod
    def generate_cache_key(filename: str, expiry: timedelta) -> str:
        """Generate cache key for presigned URLs"""
        return f"presigned:{filename}:{int(expiry.total_seconds())}"

    @staticmethod
    def get_cached_url(filename: str, expiry: timedelta) -> Optional[str]:
        """Get cached presigned URL if available"""
        if not redis_client:
            return None

        cache_key = PresignedURLManager.generate_cache_key(filename, expiry)
        try:
            return redis_client.get(cache_key)
        except Exception:
            return None

    @staticmethod
    def cache_url(filename: str, url: str, expiry: timedelta):
        """Cache presigned URL"""
        if not redis_client:
            return

        cache_key = PresignedURLManager.generate_cache_key(filename, expiry)
        # Cache for 90% of the URL expiry time to ensure validity
        cache_ttl = int(expiry.total_seconds() * 0.9)

        try:
            redis_client.setex(cache_key, cache_ttl, url)
        except Exception as e:
            print(f"Failed to cache presigned URL: {e}")


class QueryOptimizer:
    """Optimize database queries for STAC and OGC APIs"""

    @staticmethod
    def optimize_spatial_query(query, bbox: List[float]):
        """Optimize spatial queries using appropriate indexes"""
        minx, miny, maxx, maxy = bbox

        # Use spatial intersection with geometry column
        envelope = func.ST_MakeEnvelope(minx, miny, maxx, maxy, 4326)
        return query.filter(func.ST_Intersects(ImageMetadata.geometry, envelope))

    @staticmethod
    def optimize_temporal_query(query, start_date: datetime = None, end_date: datetime = None):
        """Optimize temporal queries"""
        if start_date:
            query = query.filter(ImageMetadata.timestamp >= start_date)
        if end_date:
            query = query.filter(ImageMetadata.timestamp <= end_date)
        return query

    @staticmethod
    def optimize_text_search(query, search_term: str):
        """Optimize full-text search queries"""
        # Use PostgreSQL full-text search for better performance
        return query.filter(
            text(
                "to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(abstract, '')) @@ plainto_tsquery(:search_term)"
            )
        ).params(search_term=search_term)


# Performance monitoring
class PerformanceMonitor:
    """Monitor API performance and generate metrics"""

    @staticmethod
    def log_query_performance(
        endpoint: str, query_params: Dict[str, Any], execution_time: float, result_count: int
    ):
        """Log query performance metrics"""
        if redis_client:
            try:
                # Store performance metrics
                metric_key = f"metrics:{endpoint}:{datetime.utcnow().strftime('%Y-%m-%d-%H')}"
                metric_data = {
                    "timestamp": datetime.utcnow().isoformat(),
                    "endpoint": endpoint,
                    "execution_time": execution_time,
                    "result_count": result_count,
                    "query_params": query_params,
                }

                redis_client.lpush(metric_key, json.dumps(metric_data, default=str))
                redis_client.expire(metric_key, 86400)  # Keep for 24 hours

            except Exception as e:
                print(f"Performance logging error: {e}")


# Cache warming utilities
class CacheWarmer:
    """Warm up frequently accessed cache entries"""

    @staticmethod
    async def warm_collections_cache(db: Session):
        """Pre-populate collection cache"""
        try:
            # Get all hazard types
            hazard_types = db.query(ImageMetadata.hazard_type).distinct().all()

            for (hazard_type,) in hazard_types:
                if hazard_type:
                    collection_id = f"hazard-{hazard_type.lower().replace(' ', '-')}"
                    await StatsCache.get_collection_stats(collection_id, db)

            print("Collections cache warmed successfully")

        except Exception as e:
            print(f"Cache warming error: {e}")

    @staticmethod
    async def warm_search_cache(db: Session):
        """Pre-populate common search results"""
        common_searches = [
            {"limit": 10, "offset": 0},
            {"limit": 20, "offset": 0},
            {"bbox": "-180,-90,180,90", "limit": 10},
        ]

        for search_params in common_searches:
            try:
                cache_key = CacheKey.search(search_params)
                # This would trigger the actual search and cache the result
                # Implementation depends on the specific search function
                print(f"Warming search cache for: {search_params}")
            except Exception as e:
                print(f"Search cache warming error: {e}")


# Initialize performance optimizations
async def initialize_performance_optimizations(db: Session):
    """Initialize all performance optimizations"""

    # Create spatial indexes
    SpatialIndex.create_indexes(db)

    # Warm up caches
    await CacheWarmer.warm_collections_cache(db)

    print("Performance optimizations initialized")


def get_performance_stats() -> Dict[str, Any]:
    """Get current performance statistics"""
    if not redis_client:
        return {"cache": "disabled"}

    try:
        info = redis_client.info()
        return {
            "cache": {
                "status": "enabled",
                "memory_usage": info.get("used_memory_human"),
                "connected_clients": info.get("connected_clients"),
                "total_commands_processed": info.get("total_commands_processed"),
            },
            "cache_keys": {
                "collections": len(redis_client.keys("collection*")),
                "searches": len(redis_client.keys("search*")),
                "items": len(redis_client.keys("item*")),
            },
        }
    except Exception as e:
        return {"cache": f"error: {e}"}

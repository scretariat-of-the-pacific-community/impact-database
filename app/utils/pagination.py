"""
Pagination utilities for API responses
Provides consistent pagination metadata across all endpoints
"""

from typing import Dict, List, Any, Optional
from math import ceil


class PaginationMetadata:
    """Generate standardized pagination metadata"""

    @staticmethod
    def create(
        total: int, page: int, limit: int, items_count: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Create pagination metadata

        Args:
            total: Total number of items available
            page: Current page number (1-indexed)
            limit: Items per page
            items_count: Number of items in current response (optional)

        Returns:
            Dictionary with pagination metadata
        """
        total_pages = ceil(total / limit) if limit > 0 else 0
        has_next = page < total_pages
        has_prev = page > 1

        return {
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": total_pages,
            "has_next": has_next,
            "has_prev": has_prev,
            "items_count": (
                items_count if items_count is not None else min(limit, total - ((page - 1) * limit))
            ),
        }

    @staticmethod
    def paginated_response(
        items: List[Any], total: int, page: int, limit: int, data_key: str = "items"
    ) -> Dict[str, Any]:
        """
        Create a paginated API response

        Args:
            items: List of items for current page
            total: Total number of items
            page: Current page number
            limit: Items per page
            data_key: Key name for items in response

        Returns:
            Dictionary with items and pagination metadata
        """
        return {
            data_key: items,
            "pagination": PaginationMetadata.create(
                total=total, page=page, limit=limit, items_count=len(items)
            ),
        }


def paginate_query(query, page: int = 1, limit: int = 10, max_limit: int = 100):
    """
    Apply pagination to SQLAlchemy query

    Args:
        query: SQLAlchemy query object
        page: Page number (1-indexed)
        limit: Items per page
        max_limit: Maximum allowed limit

    Returns:
        Tuple of (items, total_count)
    """
    # Validate and cap limits
    page = max(1, page)
    limit = min(max(1, limit), max_limit)

    # Get total count
    total = query.count()

    # Apply pagination
    offset = (page - 1) * limit
    items = query.offset(offset).limit(limit).all()

    return items, total

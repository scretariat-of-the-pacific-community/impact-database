"""
Lightweight JSON feeds for external system integration.

This module provides simplified endpoints for systems that need quick access
to recent approved impact imagery without the complexity of STAC or OGC APIs.

Intended use cases:
- Forecast tools polling for new impacts in their region
- Partner systems with simple integration requirements
- Dashboard/monitoring systems needing real-time feeds
- Mobile apps requiring lightweight payloads

Performance notes:
- Queries are optimized with indexes on (status, datetime)
- Default limit of 50 items to prevent large payloads
- Max limit of 200 items to protect server resources
"""

from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc

from models.database import get_db, ImageMetadata

router = APIRouter()


@router.get("/recent-impacts")
def get_recent_impacts(
    request: Request,
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=200, description="Number of items to return (max 200)"),
    hazard_type: Optional[str] = Query(None, description="Filter by hazard type (e.g., 'flood', 'cyclone')"),
    event_id: Optional[str] = Query(None, description="Filter by event ID"),
    from_datetime: Optional[datetime] = Query(None, description="Return items from this datetime onwards (ISO8601)"),
    country: Optional[str] = Query(None, description="Filter by country"),
    location: Optional[str] = Query(None, description="Filter by location/region (partial match)")
) -> Dict[str, Any]:
    """
    Get a lightweight JSON feed of recent approved impact imagery.
    
    This endpoint provides a simple integration point for external systems
    that need to poll for new approved items without understanding STAC or OGC APIs.
    
    **Performance**: Optimized query using indexes on (status, datetime).
    
    **Response format**: Simple JSON with essential fields only:
    - id: Unique identifier
    - datetime: When the image was captured (ISO8601)
    - hazard_type: Type of hazard (flood, cyclone, etc.)
    - event_id: Associated event identifier
    - status: Always "approved" (this feed only shows approved items)
    - geometry: Point coordinates [longitude, latitude]
    - country: Country name
    - location: Location/region description
    - asset_url: URL to download the full image
    - thumbnail_url: URL to preview thumbnail
    - stac_item_url: Link to full STAC Item for advanced clients
    
    **Example**:
    ```
    GET /feeds/recent-impacts?limit=10&hazard_type=flood&country=Fiji
    ```
    
    **Use cases**:
    - Forecast tools: Poll every 5-15 minutes for new impacts
    - Partner systems: Simple webhook-free integration
    - Dashboards: Real-time monitoring of approved imagery
    - Mobile apps: Lightweight payload for bandwidth constraints
    
    **Rate limiting**: Consider caching responses for 1-5 minutes to reduce DB load.
    
    Args:
        db: Database session
        limit: Number of items (default 50, max 200)
        hazard_type: Optional hazard type filter
        event_id: Optional event ID filter
        from_datetime: Optional datetime filter (returns items >= this time)
        country: Optional country filter
        location: Optional location/region filter (partial match)
    
    Returns:
        JSON response with:
        - count: Number of items in this response
        - limit: Limit applied to this query
        - items: List of recent impact items
        - generated_at: When this feed was generated (ISO8601)
    """
    
    # Build query - always filter to approved items only
    # Order by datetime DESC to get most recent first
    query = db.query(ImageMetadata).filter(
        ImageMetadata.status == "approved"
    ).order_by(desc(ImageMetadata.datetime))
    
    # Apply optional filters (reuse logic from metadata.py endpoints)
    if hazard_type:
        query = query.filter(ImageMetadata.hazard_type == hazard_type)
    
    if event_id:
        query = query.filter(ImageMetadata.event_id == event_id)
    
    if from_datetime:
        query = query.filter(ImageMetadata.datetime >= from_datetime)
    
    if country:
        query = query.filter(ImageMetadata.country == country)
    
    if location:
        # Partial match on location field
        query = query.filter(ImageMetadata.location.ilike(f"%{location}%"))
    
    # Apply limit
    images = query.limit(limit).all()
    
    # Build lightweight response
    items = []
    # Construct base URL from request
    base_url = f"{request.url.scheme}://{request.url.netloc}"
    
    for img in images:
        # Build geometry as simple [lon, lat] array
        geometry = None
        if img.longitude is not None and img.latitude is not None:
            geometry = [img.longitude, img.latitude]
        
        # Build asset URL
        asset_url = f"{base_url}/api/v1/images/{img.id}/data" if base_url else None
        
        # Build STAC Item URL for advanced clients
        stac_item_url = None
        if base_url and img.hazard_type:
            collection_id = f"disaster-{img.hazard_type.lower().replace(' ', '-').replace('_', '-')}"
            stac_item_url = f"{base_url}/stac/collections/{collection_id}/items/{img.id}"
        
        item = {
            "id": str(img.id),
            "datetime": img.datetime.isoformat() if img.datetime else None,
            "hazard_type": img.hazard_type,
            "event_id": img.event_id,
            "status": img.status,
            "geometry": geometry,
            "country": img.country,
            "location": img.location,
            "title": img.title,
            "asset_url": asset_url,
            "thumbnail_url": img.thumbnail_url,
            "stac_item_url": stac_item_url
        }
        
        items.append(item)
    
    # Return feed with metadata
    return {
        "count": len(items),
        "limit": limit,
        "filters": {
            "hazard_type": hazard_type,
            "event_id": event_id,
            "from_datetime": from_datetime.isoformat() if from_datetime else None,
            "country": country,
            "location": location
        },
        "items": items,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }

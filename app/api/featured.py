"""
Featured stories API endpoint.

Provides curated, high-quality impact imagery for homepage and marketing use.
"""

from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_

from models.database import get_db, ImageMetadata
from api.schemas.image_schemas import StatusEnum

router = APIRouter()


@router.get("/featured-stories")
def get_featured_stories(
    db: Session = Depends(get_db),
    limit: int = 6
) -> List[Dict[str, Any]]:
    """
    Get featured impact stories for homepage display.
    
    Returns curated, high-quality approved images for featured sections.
    Currently returns most recent approved images; future enhancement
    will add manual curation flags and sorting.
    
    Args:
        db: Database session
        limit: Maximum number of stories to return (default 6)
    
    Returns:
        List of featured story objects with image metadata
    """
    try:
        # Query approved images, sorted by most recent
        # TODO: Add manual curation flag for admin-selected featured content
        featured_images = (
            db.query(ImageMetadata)
            .filter(
                and_(
                    ImageMetadata.status == StatusEnum.APPROVED,
                    ImageMetadata.image_url.isnot(None)
                )
            )
            .order_by(desc(ImageMetadata.datetime))
            .limit(limit)
            .all()
        )
        
        # Transform to frontend-friendly format
        stories = []
        for img in featured_images:
            stories.append({
                "id": img.id,
                "title": img.location or f"{img.hazard_type or 'Impact'} Event",
                "description": img.description or f"Impact imagery from {img.datetime.strftime('%B %d, %Y') if img.datetime else 'recent event'}",
                "image": img.image_url,
                "date": img.datetime.isoformat() if img.datetime else None,
                "hazard_type": img.hazard_type,
                "location": img.location,
                "country": img.country
            })
        
        return stories
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch featured stories: {str(e)}"
        )

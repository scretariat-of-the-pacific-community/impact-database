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
def get_featured_stories(db: Session = Depends(get_db), limit: int = 6) -> List[Dict[str, Any]]:
    """
    Get featured impact stories for homepage display.

    Returns curated, high-quality approved images for featured sections.
    Only returns images with complete metadata (title, description, location).
    TODO: Add manual curation flag for admin-selected featured content.

    Args:
        db: Database session
        limit: Maximum number of stories to return (default 6)

    Returns:
        List of featured story objects with image metadata
    """
    try:
        # Query approved images with COMPLETE metadata
        # Require actual title AND (abstract OR purpose) for quality curation
        # TODO: Add manual is_featured flag for admin curation
        featured_images = (
            db.query(ImageMetadata)
            .filter(
                and_(
                    ImageMetadata.status == StatusEnum.APPROVED,
                    ImageMetadata.resource_locator.isnot(None),
                    ImageMetadata.title.isnot(None),
                    ImageMetadata.title != '',
                    ImageMetadata.location.isnot(None),
                    ImageMetadata.location != '',
                    ImageMetadata.hazard_type.isnot(None),
                    ImageMetadata.hazard_type != '',
                    # Require EITHER abstract OR purpose (not empty)
                    and_(
                        ImageMetadata.abstract.isnot(None),
                        ImageMetadata.abstract != '',
                    )
                    | and_(
                        ImageMetadata.purpose.isnot(None),
                        ImageMetadata.purpose != '',
                    ),
                )
            )
            .order_by(desc(ImageMetadata.datetime))
            .limit(limit * 2)  # Fetch more to filter quality ones
            .all()
        )

        # Transform to frontend-friendly format with strict validation
        stories = []
        for img in featured_images:
            # Skip if missing any required field
            if not all([img.title, img.location, img.hazard_type]):
                continue
            
            # Skip if description is too short (less than 50 chars)
            description = img.abstract or img.purpose or ''
            if len(description.strip()) < 50:
                continue

            # Build image URL from resource_locator or filename
            image_url = img.resource_locator or (
                f"/upload/images/{img.filename}" if img.filename else None
            )

            # Only add if we have a valid image URL
            if not image_url:
                continue

            stories.append(
                {
                    "id": img.id,
                    "filename": img.filename,
                    "title": img.title.strip(),
                    "description": description.strip(),
                    "image": image_url,
                    "date": img.datetime.isoformat() if img.datetime else None,
                    "hazard_type": img.hazard_type.strip(),
                    "location": img.location.strip(),
                    "country": img.country,
                }
            )
            
            # Stop once we have enough quality stories
            if len(stories) >= limit:
                break

        return stories

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch featured stories: {str(e)}",
        )

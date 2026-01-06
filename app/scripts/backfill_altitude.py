#!/usr/bin/env python3
"""
Backfill altitude data for existing images using elevation API.

Usage:
    python scripts/backfill_altitude.py [--limit 100] [--dry-run]

Features:
- Fetches elevation data from Open-Elevation API (free, no API key needed)
- Updates both altitude column and geometry Z coordinate
- Supports dry-run mode for testing
- Progress tracking with statistics
- Graceful handling of API rate limits
- Batch processing to avoid overwhelming API
"""

import asyncio
import logging
import sys
import argparse
from pathlib import Path
from typing import List, Optional

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session
from geoalchemy2 import WKTElement

from models.database import SessionLocal, ImageMetadata
from services.exif_utils import reverse_geocode

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


class ElevationAPIError(Exception):
    """Raised when elevation API fails."""

    pass


async def fetch_elevation_batch(coordinates: List[tuple[float, float]]) -> List[Optional[float]]:
    """
    Fetch elevation data for multiple coordinates using Open-Elevation API.

    Args:
        coordinates: List of (latitude, longitude) tuples

    Returns:
        List of elevation values in meters (None if fetch failed)
    """
    if not coordinates:
        return []

    # Open-Elevation API endpoint (free, open source)
    url = "https://api.open-elevation.com/api/v1/lookup"

    # Format locations for API
    locations = [{"latitude": lat, "longitude": lon} for lat, lon in coordinates]

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                json={"locations": locations},
                headers={"User-Agent": "PacificImpactAtlas-Backfill/1.0"},
            )

            if response.status_code == 200:
                data = response.json()
                results = data.get("results", [])
                elevations = [r.get("elevation") for r in results]
                logger.info(f"Successfully fetched {len(elevations)} elevations")
                return elevations
            elif response.status_code == 429:
                logger.warning("Rate limit hit, waiting 60 seconds...")
                await asyncio.sleep(60)
                return [None] * len(coordinates)
            else:
                logger.error(f"API error: {response.status_code} - {response.text}")
                return [None] * len(coordinates)

    except httpx.RequestError as e:
        logger.error(f"Request failed: {e}")
        return [None] * len(coordinates)
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return [None] * len(coordinates)


def update_image_altitude(
    db: Session, image: ImageMetadata, altitude: float, dry_run: bool = False
) -> bool:
    """
    Update image with altitude data.

    Args:
        db: Database session
        image: ImageMetadata record
        altitude: Elevation in meters
        dry_run: If True, don't actually update database

    Returns:
        True if successful, False otherwise
    """
    try:
        if dry_run:
            logger.info(
                f"[DRY RUN] Would update {image.filename}: "
                f"altitude={altitude}m at ({image.latitude:.4f}, {image.longitude:.4f})"
            )
            return True

        # Update altitude column
        image.altitude = altitude
        image.altitude_ref = 0 if altitude >= 0 else 1  # 0=above, 1=below sea level

        # Update geometry Z coordinate
        if image.geometry:
            lat, lon = image.latitude, image.longitude
            image.geometry = WKTElement(f"POINT Z({lon} {lat} {altitude})", srid=4326)

        db.commit()

        logger.info(
            f"Updated {image.filename}: altitude={altitude}m "
            f"at ({image.latitude:.4f}, {image.longitude:.4f})"
        )
        return True

    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update {image.filename}: {e}")
        return False


async def backfill_altitudes(
    limit: Optional[int] = None, dry_run: bool = False, batch_size: int = 10
):
    """
    Main backfill function.

    Args:
        limit: Maximum number of images to process (None for all)
        dry_run: If True, don't actually update database
        batch_size: Number of coordinates to fetch per API call
    """
    db = SessionLocal()

    try:
        # Find images with coordinates but no altitude
        query = db.query(ImageMetadata).filter(
            ImageMetadata.geometry.isnot(None), ImageMetadata.altitude.is_(None)
        )

        if limit:
            query = query.limit(limit)

        images = query.all()
        total = len(images)

        if total == 0:
            logger.info("No images need altitude backfill")
            return

        logger.info(f"Found {total} images needing altitude data")
        if dry_run:
            logger.info("DRY RUN MODE - No changes will be made")

        # Process in batches
        successful = 0
        failed = 0
        skipped = 0

        for i in range(0, total, batch_size):
            batch = images[i : i + batch_size]
            coordinates = []
            valid_images = []

            # Prepare batch coordinates
            for img in batch:
                if img.latitude is not None and img.longitude is not None:
                    coordinates.append((img.latitude, img.longitude))
                    valid_images.append(img)
                else:
                    logger.warning(f"Skipping {img.filename}: missing coordinates")
                    skipped += 1

            if not coordinates:
                continue

            # Fetch elevations for batch
            logger.info(
                f"Processing batch {i//batch_size + 1}/{(total + batch_size - 1)//batch_size}"
            )
            elevations = await fetch_elevation_batch(coordinates)

            # Update images with elevations
            for img, elevation in zip(valid_images, elevations):
                if elevation is not None:
                    if update_image_altitude(db, img, elevation, dry_run):
                        successful += 1
                    else:
                        failed += 1
                else:
                    logger.warning(f"No elevation data for {img.filename}")
                    failed += 1

            # Rate limiting: wait between batches
            if i + batch_size < total:
                await asyncio.sleep(2)  # 2 second delay between batches

        # Print summary
        logger.info("\n" + "=" * 60)
        logger.info("BACKFILL SUMMARY")
        logger.info("=" * 60)
        logger.info(f"Total images processed: {total}")
        logger.info(f"Successfully updated: {successful}")
        logger.info(f"Failed: {failed}")
        logger.info(f"Skipped: {skipped}")
        logger.info("=" * 60)

    except Exception as e:
        logger.error(f"Backfill failed: {e}")
        raise
    finally:
        db.close()


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Backfill altitude data for images using elevation API"
    )
    parser.add_argument(
        "--limit", type=int, default=None, help="Maximum number of images to process (default: all)"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Run without making changes (preview mode)"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=10,
        help="Number of coordinates per API batch (default: 10)",
    )

    args = parser.parse_args()

    logger.info("Starting altitude backfill...")
    logger.info(f"Limit: {args.limit or 'No limit'}")
    logger.info(f"Dry run: {args.dry_run}")
    logger.info(f"Batch size: {args.batch_size}")

    # Run async backfill
    asyncio.run(
        backfill_altitudes(limit=args.limit, dry_run=args.dry_run, batch_size=args.batch_size)
    )

    logger.info("Backfill complete!")


if __name__ == "__main__":
    main()

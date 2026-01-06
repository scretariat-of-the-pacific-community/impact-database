"""
STAC Item Generator Service

This module provides clean separation between domain models (ImageMetadata)
and STAC representation. It generates valid STAC Items that conform to the
STAC specification v1.0.0 and pass common validators.

STAC Core Specification Mapping:
- Required fields: id, type, geometry, bbox, properties, links, assets
- Geometry: GeoJSON Point from PostGIS geometry
- Properties: datetime (required), custom extensions via namespacing
- Assets: Main image and thumbnail with proper roles and MIME types
- Links: Self, collection, root relationships

Extensions Used/Considered:
1. Core fields (always present)
2. Custom hazard extension (hazard:type, hazard:event_id, hazard:status)
3. Data quality extension (quality:positional_accuracy, quality:source_type)
4. Licensing extension (license field in properties)
5. Potential future extensions: eo, projection, scientific

References:
- STAC Spec: https://github.com/radiantearth/stac-spec
- Item Spec: https://github.com/radiantearth/stac-spec/blob/master/item-spec/item-spec.md
- Best Practices: https://github.com/radiantearth/stac-spec/blob/master/best-practices.md
"""

from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from urllib.parse import urljoin
import logging

from sqlalchemy.orm import Session
from sqlalchemy import func
from geoalchemy2.shape import to_shape
from shapely.geometry import mapping

from models.database import ImageMetadata

logger = logging.getLogger(__name__)


def image_to_stac_item(
    image: ImageMetadata, base_url: str, collection_id: Optional[str] = None
) -> dict:
    """
    Convert an ImageMetadata domain model to a STAC Item.

    This function generates a valid STAC Item (GeoJSON Feature with STAC extensions)
    that can be validated against the STAC specification. It properly maps our
    disaster imagery metadata to STAC properties using namespaced extensions.

    Args:
        image: ImageMetadata SQLAlchemy model instance
        base_url: Base URL for constructing asset and link hrefs (e.g., "https://api.example.com")
        collection_id: Optional collection ID to link this item to a collection

    Returns:
        dict: Valid STAC Item as a dictionary, ready for JSON serialization

    STAC Structure:
        {
            "stac_version": "1.0.0",
            "type": "Feature",
            "id": "<uuid>",
            "geometry": {...},  # GeoJSON Point geometry
            "bbox": [minx, miny, maxx, maxy],  # For point: [lon, lat, lon, lat]
            "properties": {
                "datetime": "2025-11-07T10:00:00Z",  # Required by STAC
                "hazard:type": "flood",
                "hazard:event_id": "TC_HAROLD_2020",
                "impact:status": "approved",
                ...
            },
            "links": [...],
            "assets": {...},
            "collection": "disaster-imagery"  # Optional
        }

    Property Namespacing:
    - Core STAC: datetime, created, updated, title, description
    - hazard:* - Hazard-specific metadata (type, event_id)
    - impact:* - Impact assessment metadata (status, data_license)
    - quality:* - Data quality indicators (positional_accuracy, source_type)
    - contact:* - Contact/attribution (uploader_id, point_of_contact)

    Geometry Handling:
    - Extracts PostGIS Point geometry from database
    - Converts to GeoJSON format with [longitude, latitude] coordinates
    - Validates coordinate ranges (lon: -180 to 180, lat: -90 to 90)
    - Generates bbox as [lon, lat, lon, lat] for point geometries

    Assets:
    - "image": Main disaster image with proper MIME type and "data" role
    - "thumbnail": Preview image with "thumbnail" role (if available)
    - URLs constructed from base_url + image ID/filename

    Links:
    - "self": Link to this STAC Item
    - "collection": Link to parent collection (if collection_id provided)
    - "root": Link to STAC catalog root

    Example Usage:
        >>> image = db.query(ImageMetadata).first()
        >>> stac_item = image_to_stac_item(image, "https://api.example.com")
        >>> print(stac_item["id"])
        "550e8400-e29b-41d4-a716-446655440000"
        >>> print(stac_item["geometry"]["coordinates"])
        [174.7762, -41.2865]  # [longitude, latitude]

    Validation:
    This function generates STAC Items that should pass:
    - STAC Item Validator: https://staclint.com/
    - PySTAC validation: pystac.Item.validate()
    - STAC Browser rendering

    Raises:
        ValueError: If image has no geometry or invalid coordinates

    Notes:
    - datetime field uses image.datetime (capture time), not database timestamps
    - All optional fields are omitted if None (keeps items clean)
    - URLs are properly joined with base_url using path segments
    - STAC version is hardcoded to 1.0.0 (current stable)
    """

    # === 1. Extract and validate geometry ===
    if image.geometry is None:
        raise ValueError(f"Image {image.id} has no geometry - cannot create STAC Item")

    # Convert PostGIS geometry to GeoJSON
    # PostGIS stores as WKB, convert to Shapely geometry, then to GeoJSON dict
    try:
        shapely_geom = to_shape(image.geometry)
        geojson_geom = mapping(shapely_geom)

        # For Point geometry, coordinates are [longitude, latitude]
        if geojson_geom["type"] == "Point":
            lon, lat = geojson_geom["coordinates"]

            # Validate coordinate ranges
            if not (-180 <= lon <= 180):
                raise ValueError(f"Longitude {lon} out of valid range [-180, 180]")
            if not (-90 <= lat <= 90):
                raise ValueError(f"Latitude {lat} out of valid range [-90, 90]")

            # For point geometries, bbox is [minx, miny, maxx, maxy] = [lon, lat, lon, lat]
            bbox = [lon, lat, lon, lat]
        else:
            # For other geometry types, calculate bbox from shapely
            bounds = shapely_geom.bounds  # (minx, miny, maxx, maxy)
            bbox = list(bounds)

    except Exception as e:
        logger.error(f"Failed to convert geometry for image {image.id}: {e}")
        raise ValueError(f"Invalid geometry for image {image.id}: {e}")

    # === 2. Build STAC properties ===
    # datetime is REQUIRED by STAC spec - use image capture time
    if image.datetime is None:
        raise ValueError(f"Image {image.id} has no datetime - required by STAC spec")

    # Format datetime to RFC3339/ISO8601
    datetime_str = image.datetime.isoformat()
    if image.datetime.tzinfo is None:
        # Add UTC timezone if missing
        datetime_str = image.datetime.replace(tzinfo=timezone.utc).isoformat()

    properties = {
        # Core STAC required property
        "datetime": datetime_str,
        # Core STAC optional properties
        "title": image.title or image.filename or f"Disaster Image {image.id}",
        "description": image.abstract,
        "created": image.date_stamp.isoformat() if image.date_stamp else None,
        "updated": image.metadata_date.isoformat() if image.metadata_date else None,
        # Hazard extension (custom namespace)
        "hazard:type": image.hazard_type,
        "hazard:event_id": image.event_id,
        # Impact/status extension (custom namespace)
        "impact:status": image.status,
        "impact:data_license": image.data_license,
        # Quality extension (custom namespace)
        "quality:positional_accuracy": image.positional_accuracy,
        "quality:source_type": image.source_type,
        # Contact/attribution
        "contact:uploader_id": image.uploader_id,
        "contact:point_of_contact": image.point_of_contact,
        # Additional ISO 19115 mappings (optional, keeps compatibility)
        "iso:topic_category": image.topic_category,
        "iso:keywords": image.keywords,
        "iso:lineage": image.lineage_statement,
        "iso:use_constraints": image.use_constraints,
        "iso:access_constraints": image.access_constraints,
        # Spatial/temporal extents (if defined beyond single point/time)
        "temporal:extent_start": (
            image.temporal_extent_start.isoformat() if image.temporal_extent_start else None
        ),
        "temporal:extent_end": (
            image.temporal_extent_end.isoformat() if image.temporal_extent_end else None
        ),
    }

    # Remove None values to keep STAC Item clean
    properties = {k: v for k, v in properties.items() if v is not None}

    # === 3. Build assets ===
    # Assets are the actual data files (images, thumbnails, metadata docs)
    assets = {}

    # Main image asset
    # Construct URL: base_url/api/v1/images/{id}/download or similar
    # For now, use a simple pattern - adjust based on actual API structure
    image_url = f"{base_url.rstrip('/')}/api/v1/images/{image.id}/data"

    # Determine MIME type from format_name or default to image/jpeg
    mime_type = "image/jpeg"  # Default
    if image.format_name:
        format_lower = image.format_name.lower()
        if format_lower in ["jpeg", "jpg"]:
            mime_type = "image/jpeg"
        elif format_lower == "png":
            mime_type = "image/png"
        elif format_lower == "tiff":
            mime_type = "image/tiff"
        elif format_lower == "geotiff":
            mime_type = "image/tiff; application=geotiff"

    assets["image"] = {
        "href": image_url,
        "type": mime_type,
        "title": "Original disaster image",
        "roles": ["data"],  # Primary data asset
    }

    # Thumbnail asset (if available)
    if image.thumbnail_url:
        # Thumbnail might be a full URL or relative path
        if image.thumbnail_url.startswith("http"):
            thumbnail_url = image.thumbnail_url
        else:
            thumbnail_url = f"{base_url.rstrip('/')}/{image.thumbnail_url.lstrip('/')}"

        assets["thumbnail"] = {
            "href": thumbnail_url,
            "type": "image/jpeg",  # Thumbnails typically JPEG
            "title": "Preview thumbnail",
            "roles": ["thumbnail"],
        }

    # === 4. Build links ===
    # Links establish relationships to other STAC resources
    links = []

    # Self link (required by STAC best practices)
    self_url = f"{base_url.rstrip('/')}/stac/items/{image.id}"
    links.append({"rel": "self", "type": "application/geo+json", "href": self_url})

    # Root catalog link
    root_url = f"{base_url.rstrip('/')}/stac"
    links.append({"rel": "root", "type": "application/json", "href": root_url})

    # Collection link (if provided)
    if collection_id:
        collection_url = f"{base_url.rstrip('/')}/stac/collections/{collection_id}"
        links.append({"rel": "collection", "type": "application/json", "href": collection_url})

    # Parent link (same as collection if provided)
    if collection_id:
        links.append({"rel": "parent", "type": "application/json", "href": collection_url})

    # === 5. Assemble STAC Item ===
    stac_item = {
        "stac_version": "1.0.0",
        "type": "Feature",
        "id": str(image.id),  # UUID as string
        "geometry": geojson_geom,
        "bbox": bbox,
        "properties": properties,
        "links": links,
        "assets": assets,
    }

    # Add collection field if provided
    if collection_id:
        stac_item["collection"] = collection_id

    # Add stac_extensions field if using custom extensions
    # This helps validators understand custom namespaces
    stac_item["stac_extensions"] = [
        # Could reference formal extension schemas here
        # For now, using custom namespaces without formal schemas
    ]

    # Remove stac_extensions if empty
    if not stac_item["stac_extensions"]:
        del stac_item["stac_extensions"]

    return stac_item


def get_collection_id_for_image(image: ImageMetadata) -> str:
    """
    Determine the appropriate STAC Collection ID for an image.

    Uses hazard type to organize images into collections.
    This allows users to browse by disaster type.

    Args:
        image: ImageMetadata instance

    Returns:
        str: Collection ID (e.g., "disaster-flood", "disaster-cyclone")

    Example:
        >>> image.hazard_type = "flood"
        >>> get_collection_id_for_image(image)
        "disaster-flood"
    """
    if image.hazard_type:
        # Normalize hazard type to lowercase, replace spaces with hyphens
        normalized = image.hazard_type.lower().replace(" ", "-").replace("_", "-")
        return f"disaster-{normalized}"
    else:
        # Default collection for uncategorized images
        return "disaster-general"


def validate_stac_item(stac_item: dict) -> bool:
    """
    Validate a STAC Item against the core specification.

    Performs basic validation checks. For full validation, use external
    tools like pystac.Item.validate() or https://staclint.com/

    Args:
        stac_item: STAC Item dictionary

    Returns:
        bool: True if valid, raises ValueError if invalid

    Raises:
        ValueError: If required fields are missing or invalid
    """
    # Check required top-level fields
    required_fields = ["stac_version", "type", "id", "geometry", "properties", "links", "assets"]
    for field in required_fields:
        if field not in stac_item:
            raise ValueError(f"Missing required field: {field}")

    # Validate type
    if stac_item["type"] != "Feature":
        raise ValueError(f"Invalid type: {stac_item['type']}, must be 'Feature'")

    # Validate stac_version
    if not stac_item["stac_version"].startswith("1."):
        raise ValueError(f"Invalid stac_version: {stac_item['stac_version']}, must be 1.x.x")

    # Validate geometry
    if stac_item["geometry"] is not None:
        if "type" not in stac_item["geometry"]:
            raise ValueError("Geometry must have 'type' field")
        if "coordinates" not in stac_item["geometry"]:
            raise ValueError("Geometry must have 'coordinates' field")

    # Validate bbox
    if "bbox" in stac_item and stac_item["bbox"] is not None:
        bbox = stac_item["bbox"]
        if not isinstance(bbox, list):
            raise ValueError("bbox must be a list")
        if len(bbox) not in [4, 6]:  # 2D or 3D bbox
            raise ValueError(f"bbox must have 4 or 6 elements, got {len(bbox)}")

    # Validate properties.datetime (required by STAC)
    if "datetime" not in stac_item["properties"]:
        raise ValueError("properties.datetime is required by STAC spec")

    # Validate links is a list
    if not isinstance(stac_item["links"], list):
        raise ValueError("links must be a list")

    # Validate assets is a dict
    if not isinstance(stac_item["assets"], dict):
        raise ValueError("assets must be a dictionary")

    # Check for self link (best practice)
    has_self_link = any(link.get("rel") == "self" for link in stac_item["links"])
    if not has_self_link:
        logger.warning(f"STAC Item {stac_item['id']} missing 'self' link (recommended)")

    return True


def batch_images_to_stac_items(
    images: List[ImageMetadata], base_url: str, include_collection: bool = True
) -> List[dict]:
    """
    Convert multiple images to STAC Items in batch.

    Efficiently processes multiple images, automatically determining
    collection IDs and handling errors gracefully.

    Args:
        images: List of ImageMetadata instances
        base_url: Base URL for constructing hrefs
        include_collection: Whether to include collection field in items

    Returns:
        List[dict]: List of valid STAC Items

    Example:
        >>> images = db.query(ImageMetadata).filter_by(status="approved").all()
        >>> stac_items = batch_images_to_stac_items(images, "https://api.example.com")
        >>> print(len(stac_items))
        42
    """
    stac_items = []

    for image in images:
        try:
            collection_id = get_collection_id_for_image(image) if include_collection else None
            stac_item = image_to_stac_item(image, base_url, collection_id)
            stac_items.append(stac_item)
        except Exception as e:
            logger.error(f"Failed to convert image {image.id} to STAC Item: {e}")
            # Continue processing other images
            continue

    return stac_items

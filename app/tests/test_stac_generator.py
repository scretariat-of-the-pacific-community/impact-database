"""
Unit tests for STAC Item generator service

Tests the conversion of ImageMetadata domain models to valid STAC Items,
including geometry handling, property mapping, asset generation, and validation.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from datetime import datetime, timezone
from uuid import uuid4

from geoalchemy2.elements import WKTElement
from shapely.geometry import Point

from services.stac_generator import (
    image_to_stac_item,
    get_collection_id_for_image,
    validate_stac_item,
    batch_images_to_stac_items
)


class MockImageMetadata:
    """Mock ImageMetadata for testing without database"""
    
    def __init__(self, **kwargs):
        # Core required fields
        self.id = kwargs.get('id', uuid4())
        self.datetime = kwargs.get('datetime', datetime.now(timezone.utc))
        self.hazard_type = kwargs.get('hazard_type', 'flood')
        self.status = kwargs.get('status', 'approved')
        self.data_license = kwargs.get('data_license', 'https://creativecommons.org/licenses/by/4.0/')
        self.source_type = kwargs.get('source_type', 'citizen')
        self.uploader_id = kwargs.get('uploader_id', 'test_user')
        
        # Geometry - create PostGIS-like geometry
        lon = kwargs.get('longitude', 174.7762)
        lat = kwargs.get('latitude', -41.2865)
        self.geometry = WKTElement(f'POINT({lon} {lat})', srid=4326)
        
        # Optional fields
        self.filename = kwargs.get('filename', 'test_image.jpg')
        self.title = kwargs.get('title', 'Test Disaster Image')
        self.abstract = kwargs.get('abstract', 'A test image of disaster impact')
        self.event_id = kwargs.get('event_id', 'TEST_EVENT_2025')
        self.positional_accuracy = kwargs.get('positional_accuracy', 10.5)
        self.thumbnail_url = kwargs.get('thumbnail_url', None)
        self.format_name = kwargs.get('format_name', 'JPEG')
        
        # ISO 19115 fields
        self.date_stamp = kwargs.get('date_stamp', datetime.now(timezone.utc))
        self.metadata_date = kwargs.get('metadata_date', datetime.now(timezone.utc))
        self.point_of_contact = kwargs.get('point_of_contact', 'test@example.com')
        self.topic_category = kwargs.get('topic_category', ['environment', 'disaster'])
        self.keywords = kwargs.get('keywords', ['flood', 'disaster', 'impact'])
        self.lineage_statement = kwargs.get('lineage_statement', 'Test data')
        self.use_constraints = kwargs.get('use_constraints', 'CC-BY')
        self.access_constraints = kwargs.get('access_constraints', 'Public')
        self.temporal_extent_start = kwargs.get('temporal_extent_start', None)
        self.temporal_extent_end = kwargs.get('temporal_extent_end', None)


def test_basic_stac_item_generation():
    """Test generating a basic STAC Item with minimal fields"""
    image = MockImageMetadata()
    base_url = "https://api.example.com"
    
    stac_item = image_to_stac_item(image, base_url)
    
    # Check required STAC fields
    assert stac_item["stac_version"] == "1.0.0"
    assert stac_item["type"] == "Feature"
    assert stac_item["id"] == str(image.id)
    assert "geometry" in stac_item
    assert "bbox" in stac_item
    assert "properties" in stac_item
    assert "links" in stac_item
    assert "assets" in stac_item


def test_geometry_conversion():
    """Test PostGIS geometry to GeoJSON conversion"""
    image = MockImageMetadata(longitude=174.7762, latitude=-41.2865)
    stac_item = image_to_stac_item(image, "https://api.example.com")
    
    # Check geometry structure
    geometry = stac_item["geometry"]
    assert geometry["type"] == "Point"
    assert len(geometry["coordinates"]) == 2
    
    # Check coordinates [longitude, latitude]
    lon, lat = geometry["coordinates"]
    assert abs(lon - 174.7762) < 0.0001
    assert abs(lat - (-41.2865)) < 0.0001
    
    # Check bbox [minx, miny, maxx, maxy]
    bbox = stac_item["bbox"]
    assert len(bbox) == 4
    assert bbox[0] == lon  # minx
    assert bbox[1] == lat  # miny
    assert bbox[2] == lon  # maxx
    assert bbox[3] == lat  # maxy


def test_property_mapping():
    """Test mapping of ImageMetadata fields to STAC properties"""
    image = MockImageMetadata(
        hazard_type="cyclone",
        event_id="TC_HAROLD_2020",
        status="approved",
        positional_accuracy=15.5,
        source_type="official"
    )
    
    stac_item = image_to_stac_item(image, "https://api.example.com")
    props = stac_item["properties"]
    
    # Core STAC properties
    assert "datetime" in props
    assert props["title"] == image.title
    assert props["description"] == image.abstract
    
    # Hazard extension
    assert props["hazard:type"] == "cyclone"
    assert props["hazard:event_id"] == "TC_HAROLD_2020"
    
    # Impact/status extension
    assert props["impact:status"] == "approved"
    assert props["impact:data_license"] == image.data_license
    
    # Quality extension
    assert props["quality:positional_accuracy"] == 15.5
    assert props["quality:source_type"] == "official"


def test_datetime_formatting():
    """Test datetime is properly formatted to ISO8601"""
    dt = datetime(2025, 11, 7, 10, 30, 0, tzinfo=timezone.utc)
    image = MockImageMetadata(datetime=dt)
    
    stac_item = image_to_stac_item(image, "https://api.example.com")
    
    datetime_str = stac_item["properties"]["datetime"]
    assert "2025-11-07" in datetime_str
    assert "T" in datetime_str
    assert datetime_str.endswith(("Z", "+00:00"))


def test_assets_generation():
    """Test generation of asset entries"""
    image = MockImageMetadata(
        format_name="JPEG",
        thumbnail_url="https://cdn.example.com/thumb.jpg"
    )
    
    stac_item = image_to_stac_item(image, "https://api.example.com")
    assets = stac_item["assets"]
    
    # Check main image asset
    assert "image" in assets
    image_asset = assets["image"]
    assert "href" in image_asset
    assert image_asset["type"] == "image/jpeg"
    assert "data" in image_asset["roles"]
    assert str(image.id) in image_asset["href"]
    
    # Check thumbnail asset
    assert "thumbnail" in assets
    thumb_asset = assets["thumbnail"]
    assert thumb_asset["href"] == image.thumbnail_url
    assert thumb_asset["type"] == "image/jpeg"
    assert "thumbnail" in thumb_asset["roles"]


def test_assets_mime_types():
    """Test correct MIME type determination from format_name"""
    test_cases = [
        ("JPEG", "image/jpeg"),
        ("jpg", "image/jpeg"),
        ("PNG", "image/png"),
        ("TIFF", "image/tiff"),
        ("GeoTIFF", "image/tiff; application=geotiff"),
    ]
    
    for format_name, expected_mime in test_cases:
        image = MockImageMetadata(format_name=format_name)
        stac_item = image_to_stac_item(image, "https://api.example.com")
        
        actual_mime = stac_item["assets"]["image"]["type"]
        assert actual_mime == expected_mime, f"Format {format_name} should map to {expected_mime}"


def test_links_generation():
    """Test generation of STAC links"""
    image = MockImageMetadata()
    base_url = "https://api.example.com"
    collection_id = "disaster-flood"
    
    stac_item = image_to_stac_item(image, base_url, collection_id)
    links = stac_item["links"]
    
    # Check required links
    rels = [link["rel"] for link in links]
    assert "self" in rels
    assert "root" in rels
    assert "collection" in rels
    assert "parent" in rels
    
    # Check link structure
    self_link = next(link for link in links if link["rel"] == "self")
    assert "href" in self_link
    assert "type" in self_link
    assert str(image.id) in self_link["href"]
    
    # Check collection link
    coll_link = next(link for link in links if link["rel"] == "collection")
    assert collection_id in coll_link["href"]


def test_collection_field():
    """Test collection field is included when collection_id provided"""
    image = MockImageMetadata()
    
    # With collection ID
    stac_item = image_to_stac_item(image, "https://api.example.com", "disaster-flood")
    assert stac_item["collection"] == "disaster-flood"
    
    # Without collection ID
    stac_item = image_to_stac_item(image, "https://api.example.com", None)
    assert "collection" not in stac_item


def test_coordinate_validation():
    """Test validation of coordinate ranges"""
    # Valid coordinates
    image = MockImageMetadata(longitude=174.7762, latitude=-41.2865)
    stac_item = image_to_stac_item(image, "https://api.example.com")
    assert stac_item is not None
    
    # Invalid longitude (out of range)
    image = MockImageMetadata(longitude=200.0, latitude=0.0)
    with pytest.raises(ValueError, match="Longitude.*out of valid range"):
        image_to_stac_item(image, "https://api.example.com")
    
    # Invalid latitude (out of range)
    image = MockImageMetadata(longitude=0.0, latitude=100.0)
    with pytest.raises(ValueError, match="Latitude.*out of valid range"):
        image_to_stac_item(image, "https://api.example.com")


def test_missing_geometry():
    """Test handling of missing geometry"""
    image = MockImageMetadata()
    image.geometry = None
    
    with pytest.raises(ValueError, match="has no geometry"):
        image_to_stac_item(image, "https://api.example.com")


def test_missing_datetime():
    """Test handling of missing datetime (required by STAC)"""
    image = MockImageMetadata()
    image.datetime = None
    
    with pytest.raises(ValueError, match="has no datetime"):
        image_to_stac_item(image, "https://api.example.com")


def test_none_values_excluded():
    """Test that None values are excluded from properties"""
    image = MockImageMetadata(
        event_id=None,
        positional_accuracy=None,
        thumbnail_url=None
    )
    
    stac_item = image_to_stac_item(image, "https://api.example.com")
    props = stac_item["properties"]
    
    # These should not be in properties
    assert "hazard:event_id" not in props
    assert "quality:positional_accuracy" not in props
    
    # Required field should still be present
    assert "datetime" in props


def test_get_collection_id_for_image():
    """Test collection ID determination from hazard type"""
    test_cases = [
        ("flood", "disaster-flood"),
        ("cyclone", "disaster-cyclone"),
        ("tsunami", "disaster-tsunami"),
        ("Tropical Cyclone", "disaster-tropical-cyclone"),
        ("storm_surge", "disaster-storm-surge"),
        (None, "disaster-general"),
    ]
    
    for hazard_type, expected_id in test_cases:
        image = MockImageMetadata(hazard_type=hazard_type) if hazard_type else MockImageMetadata()
        if hazard_type is None:
            image.hazard_type = None
        
        collection_id = get_collection_id_for_image(image)
        assert collection_id == expected_id, f"Hazard type '{hazard_type}' should map to '{expected_id}'"


def test_validate_stac_item_valid():
    """Test validation of a valid STAC Item"""
    image = MockImageMetadata()
    stac_item = image_to_stac_item(image, "https://api.example.com")
    
    # Should not raise any errors
    assert validate_stac_item(stac_item) is True


def test_validate_stac_item_missing_fields():
    """Test validation catches missing required fields"""
    # Missing type
    stac_item = {"stac_version": "1.0.0", "id": "test"}
    with pytest.raises(ValueError, match="Missing required field"):
        validate_stac_item(stac_item)


def test_validate_stac_item_invalid_type():
    """Test validation catches invalid type field"""
    image = MockImageMetadata()
    stac_item = image_to_stac_item(image, "https://api.example.com")
    stac_item["type"] = "Invalid"
    
    with pytest.raises(ValueError, match="Invalid type"):
        validate_stac_item(stac_item)


def test_validate_stac_item_missing_datetime():
    """Test validation catches missing properties.datetime"""
    image = MockImageMetadata()
    stac_item = image_to_stac_item(image, "https://api.example.com")
    del stac_item["properties"]["datetime"]
    
    with pytest.raises(ValueError, match="properties.datetime is required"):
        validate_stac_item(stac_item)


def test_batch_conversion():
    """Test batch conversion of multiple images"""
    images = [
        MockImageMetadata(hazard_type="flood", longitude=174.0, latitude=-41.0),
        MockImageMetadata(hazard_type="cyclone", longitude=175.0, latitude=-42.0),
        MockImageMetadata(hazard_type="tsunami", longitude=176.0, latitude=-43.0),
    ]
    
    stac_items = batch_images_to_stac_items(images, "https://api.example.com")
    
    assert len(stac_items) == 3
    
    # Check each item is valid
    for stac_item in stac_items:
        assert validate_stac_item(stac_item) is True
    
    # Check collections are assigned
    assert stac_items[0]["collection"] == "disaster-flood"
    assert stac_items[1]["collection"] == "disaster-cyclone"
    assert stac_items[2]["collection"] == "disaster-tsunami"


def test_batch_conversion_with_errors():
    """Test batch conversion handles errors gracefully"""
    images = [
        MockImageMetadata(hazard_type="flood"),  # Valid
        MockImageMetadata(hazard_type="cyclone"),  # Valid
    ]
    
    # Make second image invalid (no geometry)
    images[1].geometry = None
    
    stac_items = batch_images_to_stac_items(images, "https://api.example.com")
    
    # Should return only the valid item
    assert len(stac_items) == 1
    assert stac_items[0]["properties"]["hazard:type"] == "flood"


def test_url_construction():
    """Test proper URL construction with base_url"""
    image = MockImageMetadata()
    base_url = "https://api.example.com"
    
    stac_item = image_to_stac_item(image, base_url)
    
    # Check asset URLs
    image_href = stac_item["assets"]["image"]["href"]
    assert image_href.startswith(base_url)
    assert "/api/v1/images/" in image_href
    
    # Check link URLs
    self_link = next(link for link in stac_item["links"] if link["rel"] == "self")
    assert self_link["href"].startswith(base_url)
    assert "/stac/items/" in self_link["href"]


def test_relative_thumbnail_url():
    """Test handling of relative vs absolute thumbnail URLs"""
    # Absolute URL - should be used as-is
    image = MockImageMetadata(thumbnail_url="https://cdn.example.com/thumb.jpg")
    stac_item = image_to_stac_item(image, "https://api.example.com")
    assert stac_item["assets"]["thumbnail"]["href"] == "https://cdn.example.com/thumb.jpg"
    
    # Relative URL - should be joined with base_url
    image = MockImageMetadata(thumbnail_url="/thumbnails/thumb.jpg")
    stac_item = image_to_stac_item(image, "https://api.example.com")
    assert stac_item["assets"]["thumbnail"]["href"] == "https://api.example.com/thumbnails/thumb.jpg"


def test_iso_fields_mapping():
    """Test ISO 19115 fields are properly mapped to STAC properties"""
    image = MockImageMetadata(
        topic_category=['environment', 'disaster'],
        keywords=['flood', 'inundation', 'damage'],
        lineage_statement='Citizen science upload from field team',
        use_constraints='CC-BY-4.0',
        access_constraints='Public'
    )
    
    stac_item = image_to_stac_item(image, "https://api.example.com")
    props = stac_item["properties"]
    
    assert props["iso:topic_category"] == ['environment', 'disaster']
    assert props["iso:keywords"] == ['flood', 'inundation', 'damage']
    assert props["iso:lineage"] == 'Citizen science upload from field team'
    assert props["iso:use_constraints"] == 'CC-BY-4.0'
    assert props["iso:access_constraints"] == 'Public'


def test_temporal_extent_mapping():
    """Test temporal extent fields are mapped when present"""
    start = datetime(2025, 11, 1, tzinfo=timezone.utc)
    end = datetime(2025, 11, 7, tzinfo=timezone.utc)
    
    image = MockImageMetadata(
        temporal_extent_start=start,
        temporal_extent_end=end
    )
    
    stac_item = image_to_stac_item(image, "https://api.example.com")
    props = stac_item["properties"]
    
    assert "temporal:extent_start" in props
    assert "temporal:extent_end" in props
    assert "2025-11-01" in props["temporal:extent_start"]
    assert "2025-11-07" in props["temporal:extent_end"]


def test_real_world_coordinates():
    """Test with real-world disaster coordinates"""
    # Wellington, New Zealand (flood)
    image_nz = MockImageMetadata(longitude=174.7762, latitude=-41.2865, hazard_type="flood")
    stac_nz = image_to_stac_item(image_nz, "https://api.example.com")
    assert abs(stac_nz["geometry"]["coordinates"][0] - 174.7762) < 0.0001
    
    # Vanuatu (cyclone)
    image_vu = MockImageMetadata(longitude=168.3273, latitude=-17.7334, hazard_type="cyclone")
    stac_vu = image_to_stac_item(image_vu, "https://api.example.com")
    assert abs(stac_vu["geometry"]["coordinates"][1] - (-17.7334)) < 0.0001
    
    # Fiji (tsunami)
    image_fj = MockImageMetadata(longitude=178.0650, latitude=-18.1416, hazard_type="tsunami")
    stac_fj = image_to_stac_item(image_fj, "https://api.example.com")
    assert stac_fj["properties"]["hazard:type"] == "tsunami"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

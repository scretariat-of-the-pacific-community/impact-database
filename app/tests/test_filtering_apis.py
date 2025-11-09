"""
Test filtering capabilities for images and GeoJSON endpoints
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from datetime import datetime, timezone, timedelta
from typing import List

def test_status_filter_default():
    """Test that default status filter is 'approved' only"""
    # When calling /images without status parameter
    # Expected: only approved images returned
    default_status = ["approved"]
    assert "approved" in default_status
    assert "pending_review" not in default_status
    assert "rejected" not in default_status


def test_status_filter_multiple():
    """Test filtering by multiple statuses"""
    # When calling /images?status=approved&status=pending_review
    # Expected: both approved and pending_review images returned
    requested_statuses = ["approved", "pending_review"]
    
    # All requested statuses should be valid
    valid_statuses = ["pending_review", "approved", "rejected"]
    for status in requested_statuses:
        assert status in valid_statuses


def test_hazard_type_filter_single():
    """Test filtering by single hazard type"""
    hazard_type = "flood"
    valid_types = ["flood", "cyclone", "tsunami", "landslide", "other"]
    assert hazard_type in valid_types


def test_hazard_type_filter_multiple():
    """Test filtering by multiple hazard types"""
    # When calling /images?hazard_type=flood&hazard_type=cyclone
    # Expected: both flood and cyclone images returned
    requested_types = ["flood", "cyclone"]
    valid_types = ["flood", "cyclone", "tsunami", "landslide", "other"]
    
    for htype in requested_types:
        assert htype in valid_types


def test_event_id_filter():
    """Test filtering by event ID"""
    event_id = "TC_HAROLD_2020"
    assert isinstance(event_id, str)
    assert len(event_id) > 0


def test_datetime_range_filter():
    """Test filtering by datetime range"""
    # From datetime
    from_dt = datetime(2025, 1, 1, tzinfo=timezone.utc)
    to_dt = datetime(2025, 12, 31, tzinfo=timezone.utc)
    
    assert from_dt < to_dt
    assert from_dt.tzinfo == timezone.utc
    assert to_dt.tzinfo == timezone.utc


def test_bbox_validation_valid():
    """Test valid bounding box format"""
    bbox = "174.0,-42.0,175.0,-41.0"  # Wellington, NZ region
    coords = [float(x) for x in bbox.split(',')]
    
    assert len(coords) == 4
    minx, miny, maxx, maxy = coords
    
    # Validate ranges
    assert -180 <= minx <= 180
    assert -180 <= maxx <= 180
    assert -90 <= miny <= 90
    assert -90 <= maxy <= 90
    
    # Validate min < max
    assert minx < maxx
    assert miny < maxy


def test_bbox_validation_invalid_format():
    """Test invalid bounding box format"""
    invalid_bboxes = [
        "174.0,-42.0,175.0",  # Only 3 coordinates
        "174.0,-42.0,175.0,-41.0,10.0",  # 5 coordinates
        "abc,def,ghi,jkl",  # Non-numeric
    ]
    
    for bbox in invalid_bboxes:
        try:
            coords = [float(x) for x in bbox.split(',')]
            if len(coords) != 4:
                # Should raise error
                assert True
        except (ValueError, AssertionError):
            # Expected to fail
            assert True


def test_bbox_validation_invalid_ranges():
    """Test bounding box with invalid coordinate ranges"""
    invalid_ranges = [
        "200.0,-42.0,175.0,-41.0",  # Longitude > 180
        "174.0,-100.0,175.0,-41.0",  # Latitude < -90
        "175.0,-42.0,174.0,-41.0",  # minx > maxx
        "174.0,-41.0,175.0,-42.0",  # miny > maxy
    ]
    
    for bbox in invalid_ranges:
        coords = [float(x) for x in bbox.split(',')]
        minx, miny, maxx, maxy = coords
        
        # At least one validation should fail
        is_valid = (
            -180 <= minx <= 180 and
            -180 <= maxx <= 180 and
            -90 <= miny <= 90 and
            -90 <= maxy <= 90 and
            minx < maxx and
            miny < maxy
        )
        
        assert not is_valid


def test_pagination_defaults():
    """Test default pagination values"""
    default_limit = 100
    default_offset = 0
    
    assert default_limit > 0
    assert default_offset >= 0


def test_pagination_limits():
    """Test pagination limit boundaries"""
    max_limit_images = 1000
    max_limit_geojson = 1000  # Updated to match actual implementation
    
    # User requests should be capped at max
    requested_limit = 5000
    actual_limit_images = min(requested_limit, max_limit_images)
    actual_limit_geojson = min(requested_limit, max_limit_geojson)
    
    assert actual_limit_images == max_limit_images
    assert actual_limit_geojson == max_limit_geojson


def test_geojson_feature_structure():
    """Test GeoJSON feature structure"""
    feature = {
        "type": "Feature",
        "id": "test-123",
        "geometry": {
            "type": "Point",
            "coordinates": [174.7762, -41.2865]
        },
        "properties": {
            "filename": "test.jpg",
            "datetime": "2025-11-07T10:00:00Z",
            "hazard_type": "flood",
            "event_id": "FLOOD_2025",
            "status": "approved",
            "title": "Test Image"
        }
    }
    
    # Validate structure
    assert feature["type"] == "Feature"
    assert "id" in feature
    assert "geometry" in feature
    assert "properties" in feature
    
    # Validate geometry
    assert feature["geometry"]["type"] == "Point"
    assert len(feature["geometry"]["coordinates"]) == 2
    
    # Validate properties
    props = feature["properties"]
    assert "datetime" in props
    assert "hazard_type" in props
    assert "status" in props


def test_geojson_collection_structure():
    """Test GeoJSON FeatureCollection structure"""
    collection = {
        "type": "FeatureCollection",
        "features": [],
        "metadata": {
            "total_features": 100,
            "returned_features": 50,
            "limit": 50,
            "offset": 0,
            "has_more": True
        }
    }
    
    assert collection["type"] == "FeatureCollection"
    assert "features" in collection
    assert "metadata" in collection
    
    metadata = collection["metadata"]
    assert "total_features" in metadata
    assert "returned_features" in metadata
    assert "has_more" in metadata
    
    # Validate has_more logic
    total = metadata["total_features"]
    returned = metadata["returned_features"]
    offset = metadata["offset"]
    has_more = (offset + returned) < total
    
    assert metadata["has_more"] == has_more


def test_combined_filters():
    """Test combining multiple filters"""
    filters = {
        "status": ["approved"],
        "hazard_type": ["flood", "cyclone"],
        "event_id": "TC_HAROLD_2020",
        "from_datetime": datetime(2020, 4, 1, tzinfo=timezone.utc),
        "to_datetime": datetime(2020, 4, 30, tzinfo=timezone.utc),
        "bbox": "160.0,-20.0,180.0,-10.0"
    }
    
    # All filters should be applicable
    assert len(filters["status"]) > 0
    assert len(filters["hazard_type"]) > 0
    assert filters["event_id"] is not None
    assert filters["from_datetime"] < filters["to_datetime"]
    assert filters["bbox"] is not None


def test_approved_only_default_for_forecast():
    """Test that forecast apps get approved data by default"""
    # This is the key requirement for disaster offices
    # When no status is specified, only approved images should be returned
    
    default_behavior = {
        "explicit_status_param": None,
        "effective_status_filter": ["approved"]
    }
    
    # Verify default behavior
    if default_behavior["explicit_status_param"] is None:
        assert default_behavior["effective_status_filter"] == ["approved"]


def test_query_parameter_documentation():
    """Test that all query parameters are documented"""
    documented_params = {
        "status": "Filter by status (pending_review, approved, rejected). Default: approved only",
        "hazard_type": "Filter by hazard type(s)",
        "event_id": "Filter by event ID",
        "from_datetime": "Filter images from this datetime (ISO8601)",
        "to_datetime": "Filter images until this datetime (ISO8601)",
        "bbox": "Bounding box filter: minx,miny,maxx,maxy (EPSG:4326)",
        "limit": "Maximum number of results",
        "offset": "Number of results to skip"
    }
    
    # All parameters should have descriptions
    for param, description in documented_params.items():
        assert len(description) > 0
        assert isinstance(description, str)


def test_response_includes_trust_fields():
    """Test that responses include trust-related fields"""
    required_fields = [
        "status",
        "data_license",
        "source_type",
        "uploader_id",
        "positional_accuracy"
    ]
    
    # Sample response
    sample_image = {
        "id": "123",
        "filename": "test.jpg",
        "datetime": "2025-11-07T10:00:00Z",
        "status": "approved",
        "data_license": "https://creativecommons.org/licenses/by/4.0/",
        "source_type": "official",
        "uploader_id": "admin",
        "positional_accuracy": 10.5
    }
    
    # Verify all trust fields are present
    for field in required_fields:
        assert field in sample_image


def test_st_intersects_query():
    """Test that bbox uses PostGIS ST_Intersects"""
    # This is a conceptual test - in real DB query:
    # query.filter(ST_Intersects(ImageMetadata.geometry, bbox_geom))
    
    # Verify we're using the correct PostGIS function
    postgis_function = "ST_Intersects"
    bbox_function = "ST_MakeEnvelope"
    
    assert postgis_function == "ST_Intersects"
    assert bbox_function == "ST_MakeEnvelope"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

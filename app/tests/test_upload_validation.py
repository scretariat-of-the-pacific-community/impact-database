"""
Test upload validation with Pydantic models (standalone unit tests)
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from datetime import datetime, timezone
from pydantic import ValidationError
from enum import Enum
from pydantic import BaseModel, validator, Field, root_validator
from typing import Optional

# Copy the models inline to avoid import issues in tests
class HazardType(str, Enum):
    flood = "flood"
    cyclone = "cyclone"
    tsunami = "tsunami"
    landslide = "landslide"
    other = "other"

class SourceType(str, Enum):
    citizen = "citizen"
    official = "official"
    other = "other"

class GeometryModel(BaseModel):
    type: str = Field(..., pattern="^Point$")
    coordinates: list[float]

    @validator('coordinates')
    def validate_coordinates(cls, v):
        if len(v) != 2:
            raise ValueError("Coordinates must be a list of two floats [lon, lat]")
        lon, lat = v
        if not (-180 <= lon <= 180):
            raise ValueError("Longitude must be between -180 and 180")
        if not (-90 <= lat <= 90):
            raise ValueError("Latitude must be between -90 and 90")
        return v

class ImageUploadRequest(BaseModel):
    filename: str
    datetime: datetime
    hazard_type: HazardType
    event_id: Optional[str] = None
    geometry: Optional[GeometryModel] = None
    data_license: str = "https://creativecommons.org/licenses/by/4.0/"
    source_type: SourceType
    positional_accuracy: Optional[float] = None

    @validator('datetime', pre=True)
    def ensure_utc(cls, v):
        if isinstance(v, str):
            try:
                dt = datetime.fromisoformat(v.replace('Z', '+00:00'))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt.astimezone(timezone.utc)
            except ValueError:
                raise ValueError("Invalid ISO8601 datetime format")
        if isinstance(v, datetime):
            if v.tzinfo is None:
                return v.replace(tzinfo=timezone.utc)
            return v.astimezone(timezone.utc)
        return v

    @root_validator(pre=True)
    def check_geometry(cls, values):
        """Handle both lat/lon pairs and GeoJSON geometry formats"""
        if 'geometry' in values and ('lat' in values or 'lon' in values):
            raise ValueError("Provide either 'geometry' or 'lat'/'lon', not both.")
        if 'lat' in values and 'lon' in values:
            lon, lat = values.pop('lon'), values.pop('lat')
            if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                raise ValueError("Invalid coordinates.")
            values['geometry'] = {'type': 'Point', 'coordinates': [lon, lat]}
        return values


def test_valid_upload_request_with_geometry():
    """Test valid upload request with GeoJSON geometry"""
    data = {
        "filename": "test.jpg",
        "datetime": "2025-11-07T12:00:00Z",
        "hazard_type": "flood",
        "source_type": "citizen",
        "geometry": {
            "type": "Point",
            "coordinates": [174.7762, -41.2865]  # Wellington, NZ
        }
    }
    
    request = ImageUploadRequest(**data)
    
    assert request.filename == "test.jpg"
    assert request.hazard_type == HazardType.flood
    assert request.source_type == SourceType.citizen
    assert request.geometry.coordinates == [174.7762, -41.2865]
    assert request.datetime.tzinfo == timezone.utc
    assert request.data_license == "https://creativecommons.org/licenses/by/4.0/"


def test_valid_upload_request_with_lat_lon():
    """Test valid upload request with lat/lon that gets converted to geometry"""
    data = {
        "filename": "test.jpg",
        "datetime": "2025-11-07T12:00:00+00:00",
        "hazard_type": "cyclone",
        "source_type": "official",
        "lat": -41.2865,
        "lon": 174.7762
    }
    
    request = ImageUploadRequest(**data)
    
    assert request.geometry is not None
    assert request.geometry.coordinates == [174.7762, -41.2865]


def test_invalid_hazard_type():
    """Test that invalid hazard type is rejected"""
    data = {
        "filename": "test.jpg",
        "datetime": "2025-11-07T12:00:00Z",
        "hazard_type": "earthquake",  # Not in enum
        "source_type": "citizen",
        "geometry": {"type": "Point", "coordinates": [174.7762, -41.2865]}
    }
    
    with pytest.raises(ValidationError) as exc_info:
        ImageUploadRequest(**data)
    
    assert "hazard_type" in str(exc_info.value)


def test_invalid_datetime_format():
    """Test that invalid datetime format is rejected"""
    data = {
        "filename": "test.jpg",
        "datetime": "not-a-date",
        "hazard_type": "flood",
        "source_type": "citizen",
        "geometry": {"type": "Point", "coordinates": [174.7762, -41.2865]}
    }
    
    with pytest.raises(ValidationError) as exc_info:
        ImageUploadRequest(**data)
    
    assert "datetime" in str(exc_info.value).lower()


def test_invalid_coordinates_out_of_range():
    """Test that coordinates out of range are rejected"""
    data = {
        "filename": "test.jpg",
        "datetime": "2025-11-07T12:00:00Z",
        "hazard_type": "flood",
        "source_type": "citizen",
        "geometry": {"type": "Point", "coordinates": [200.0, -41.2865]}  # Invalid lon
    }
    
    with pytest.raises(ValidationError) as exc_info:
        ImageUploadRequest(**data)
    
    assert "Longitude" in str(exc_info.value)


def test_invalid_coordinates_latitude_out_of_range():
    """Test that latitude out of range is rejected"""
    data = {
        "filename": "test.jpg",
        "datetime": "2025-11-07T12:00:00Z",
        "hazard_type": "tsunami",
        "source_type": "citizen",
        "geometry": {"type": "Point", "coordinates": [174.7762, -95.0]}  # Invalid lat
    }
    
    with pytest.raises(ValidationError) as exc_info:
        ImageUploadRequest(**data)
    
    assert "Latitude" in str(exc_info.value)


def test_both_lat_lon_and_geometry_rejected():
    """Test that providing both lat/lon and geometry is rejected"""
    data = {
        "filename": "test.jpg",
        "datetime": "2025-11-07T12:00:00Z",
        "hazard_type": "flood",
        "source_type": "citizen",
        "lat": -41.2865,
        "lon": 174.7762,
        "geometry": {"type": "Point", "coordinates": [174.7762, -41.2865]}
    }
    
    with pytest.raises(ValidationError) as exc_info:
        ImageUploadRequest(**data)
    
    assert "either" in str(exc_info.value).lower()


def test_datetime_converted_to_utc():
    """Test that datetime without timezone is converted to UTC"""
    data = {
        "filename": "test.jpg",
        "datetime": "2025-11-07T12:00:00",  # No timezone
        "hazard_type": "flood",
        "source_type": "citizen",
        "geometry": {"type": "Point", "coordinates": [174.7762, -41.2865]}
    }
    
    request = ImageUploadRequest(**data)
    
    assert request.datetime.tzinfo == timezone.utc


def test_optional_fields_have_defaults():
    """Test that optional fields use correct defaults"""
    data = {
        "filename": "test.jpg",
        "datetime": "2025-11-07T12:00:00Z",
        "hazard_type": "landslide",
        "source_type": "citizen",
        "geometry": {"type": "Point", "coordinates": [174.7762, -41.2865]}
    }
    
    request = ImageUploadRequest(**data)
    
    assert request.event_id is None
    assert request.positional_accuracy is None
    assert request.data_license == "https://creativecommons.org/licenses/by/4.0/"


def test_geometry_can_be_optional():
    """Test that geometry can be None (optional)"""
    data = {
        "filename": "test.jpg",
        "datetime": "2025-11-07T12:00:00Z",
        "hazard_type": "flood",
        "source_type": "citizen"
    }
    
    request = ImageUploadRequest(**data)
    
    assert request.geometry is None


def test_invalid_geometry_wrong_number_of_coordinates():
    """Test that geometry with wrong number of coordinates is rejected"""
    data = {
        "filename": "test.jpg",
        "datetime": "2025-11-07T12:00:00Z",
        "hazard_type": "flood",
        "source_type": "citizen",
        "geometry": {"type": "Point", "coordinates": [174.7762]}  # Only 1 coordinate
    }
    
    with pytest.raises(ValidationError) as exc_info:
        ImageUploadRequest(**data)
    
    assert "two floats" in str(exc_info.value)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from core.main import app
from models.database import Base, get_db

# Use an in-memory SQLite database for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create the tables in the test database
Base.metadata.create_all(bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

def test_upload_image():
    """
    Test case for uploading an image.
    """
    # Mock authentication
    headers = {"Authorization": "Bearer test-token"}
    
    # Test data
    data = {
        "datetime": "2025-11-07T12:00:00Z",
        "hazard_type": "flood",
        "source_type": "citizen",
        "lat": -41.2865,
        "lon": 174.7762
    }
    
    # The file to upload
    file_path = os.path.join(os.path.dirname(__file__), '..', 'hazard_test_images', 'flood_1.jpg')
    
    with open(file_path, "rb") as f:
        files = {"file": ("flood_1.jpg", f, "image/jpeg")}
        response = client.post("/upload/", data=data, files=files, headers=headers)
    
    assert response.status_code == 201
    
    response_json = response.json()
    assert response_json["filename"] == "flood_1.jpg"
    assert response_json["status"] == "pending_review"
    
    # Verify the data in the database
    db = next(override_get_db())
    from models.database import ImageMetadata
    db_image = db.query(ImageMetadata).filter(ImageMetadata.filename == "flood_1.jpg").first()
    assert db_image is not None
    assert db_image.status == "pending_review"
    assert db_image.hazard_type == "flood"

def test_admin_approve_image():
    """
    Test case for an admin approving an image.
    """
    # First, upload an image
    test_upload_image()

    # Get the image from the database
    db = next(override_get_db())
    from models.database import ImageMetadata
    db_image = db.query(ImageMetadata).filter(ImageMetadata.filename == "flood_1.jpg").first()
    assert db_image is not None

    # Mock admin authentication
    admin_headers = {"Authorization": "Bearer admin-test-token"}

    # Approve the image
    response = client.put(f"/admin/images/{db_image.id}/status", json={"status": "approved"}, headers=admin_headers)
    assert response.status_code == 200

    # Verify the status is updated
    updated_image = db.query(ImageMetadata).filter(ImageMetadata.id == db_image.id).first()
    assert updated_image.status == "approved"

    # Verify an audit log entry is created
    from models.audit_log import AuditLog
    audit_log = db.query(AuditLog).filter(AuditLog.image_id == db_image.id).first()
    assert audit_log is not None
    assert audit_log.action == "status_change"
    assert audit_log.details["new_status"] == "approved"

def test_stac_item_endpoint():
    """
    Test case for the STAC Item endpoint.
    """
    # Ensure an image is approved
    test_admin_approve_image()

    # Get the image from the database
    db = next(override_get_db())
    from models.database import ImageMetadata
    db_image = db.query(ImageMetadata).filter(ImageMetadata.filename == "flood_1.jpg").first()
    assert db_image is not None
    assert db_image.status == "approved"

    # Fetch the STAC item
    response = client.get(f"/stac/collections/flood/items/{db_image.id}")
    assert response.status_code == 200

    stac_item = response.json()
    assert stac_item["id"] == str(db_image.id)
    assert stac_item["type"] == "Feature"
    assert "geometry" in stac_item
    assert "bbox" in stac_item
    assert "properties" in stac_item
    assert "datetime" in stac_item["properties"]
    assert "assets" in stac_item

from unittest.mock import patch

def test_webhook_system():
    """
    Test case for the webhook system.
    """
    # Ensure an image is approved
    test_admin_approve_image()

    # Get the image from the database
    db = next(override_get_db())
    from models.database import ImageMetadata
    db_image = db.query(ImageMetadata).filter(ImageMetadata.filename == "flood_1.jpg").first()
    assert db_image is not None

    # Register a webhook
    webhook_data = {"callback_url": "https://example.com/webhook"}
    response = client.post("/webhooks/", json=webhook_data)
    assert response.status_code == 201
    webhook_id = response.json()["id"]

    # Mock the celery task
    with patch("workers.tasks.trigger_webhooks_on_approval.delay") as mock_task:
        # Approve the image, which should trigger the webhook
        admin_headers = {"Authorization": "Bearer admin-test-token"}
        response = client.put(f"/admin/images/{db_image.id}/status", json={"status": "approved"}, headers=admin_headers)
        assert response.status_code == 200

        # Assert that the task was called
        mock_task.assert_called_once()


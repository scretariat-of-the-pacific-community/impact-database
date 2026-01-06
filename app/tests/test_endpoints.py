import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from core.main import app
from models.database import Base, get_db
import os

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
        "lon": 174.7762,
    }

    # The file to upload
    file_path = os.path.join(os.path.dirname(__file__), "..", "hazard_test_images", "flood_1.jpg")

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
    response = client.put(
        f"/admin/images/{db_image.id}/status", json={"status": "approved"}, headers=admin_headers
    )
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
        response = client.put(
            f"/admin/images/{db_image.id}/status",
            json={"status": "approved"},
            headers=admin_headers,
        )
        assert response.status_code == 200

        # Assert that the task was called
        mock_task.assert_called_once()

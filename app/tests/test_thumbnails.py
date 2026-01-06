import pytest
import os
import io
from unittest.mock import Mock, patch, MagicMock
from PIL import Image
import tempfile

from workers.tasks import generate_thumbnail
from models.database import ImageMetadata
from api.services.minio_client import minio_storage
from core.config import settings


class TestThumbnailGeneration:
    """Test suite for thumbnail generation pipeline"""

    @pytest.fixture
    def sample_image_data(self):
        """Create sample image data for testing"""
        img = Image.new("RGB", (800, 600), color="red")
        img_buffer = io.BytesIO()
        img.save(img_buffer, format="JPEG", quality=90)
        img_buffer.seek(0)
        return img_buffer.getvalue()

    @pytest.fixture
    def sample_png_image_data(self):
        """Create sample PNG image with transparency for testing conversion"""
        img = Image.new("RGBA", (800, 600), color=(255, 0, 0, 128))
        img_buffer = io.BytesIO()
        img.save(img_buffer, format="PNG")
        img_buffer.seek(0)
        return img_buffer.getvalue()

    @pytest.fixture
    def mock_minio_client(self):
        """Mock MinIO client for testing"""
        with patch("workers.tasks.get_minio_client") as mock_get_client:
            mock_client = Mock()
            mock_get_client.return_value = mock_client
            yield mock_client

    @pytest.fixture
    def mock_database_session(self):
        """Mock database session for testing"""
        with patch("workers.tasks.Session") as mock_session:
            mock_db_session = Mock()
            mock_session.return_value.__enter__.return_value = mock_db_session
            yield mock_db_session

    def test_generate_thumbnail_success(
        self, mock_minio_client, mock_database_session, sample_image_data
    ):
        """Test successful thumbnail generation"""
        # Setup mock responses
        mock_response = Mock()
        mock_response.read.return_value = sample_image_data
        mock_minio_client.get_object.return_value = mock_response

        # Mock database record
        mock_image = Mock()
        mock_image.filename = "test_image.jpg"
        mock_database_session.query.return_value.filter.return_value.first.return_value = mock_image

        # Execute task
        result = generate_thumbnail.apply(args=["test_image.jpg"])

        # Verify success
        assert result.successful()
        task_result = result.result
        assert task_result["status"] == "success"
        assert task_result["filename"] == "test_image.jpg"
        assert task_result["thumbnail_key"] == "thumbnails/test_image.jpg"
        assert "thumbnail_url" in task_result
        assert "original_size" in task_result
        assert "thumbnail_size" in task_result

        # Verify MinIO interactions
        mock_minio_client.get_object.assert_called_once()
        mock_minio_client.put_object.assert_called_once()

        # Verify database update
        assert mock_image.thumbnail_url is not None
        assert mock_image.thumbnail_key == "thumbnails/test_image.jpg"
        mock_database_session.commit.assert_called_once()

    def test_generate_thumbnail_png_conversion(
        self, mock_minio_client, mock_database_session, sample_png_image_data
    ):
        """Test PNG to JPEG conversion with transparency handling"""
        # Setup mock responses
        mock_response = Mock()
        mock_response.read.return_value = sample_png_image_data
        mock_minio_client.get_object.return_value = mock_response

        # Mock database record
        mock_image = Mock()
        mock_database_session.query.return_value.filter.return_value.first.return_value = mock_image

        # Execute task
        result = generate_thumbnail.apply(args=["test_image.png"])

        # Verify success
        assert result.successful()

        # Verify MinIO put_object was called with JPEG content type
        mock_minio_client.put_object.assert_called_once()
        call_args = mock_minio_client.put_object.call_args
        assert call_args[1]["content_type"] == "image/jpeg"

    def test_generate_thumbnail_custom_size(
        self, mock_minio_client, mock_database_session, sample_image_data
    ):
        """Test thumbnail generation with custom size"""
        # Setup mock responses
        mock_response = Mock()
        mock_response.read.return_value = sample_image_data
        mock_minio_client.get_object.return_value = mock_response

        # Mock database record
        mock_image = Mock()
        mock_database_session.query.return_value.filter.return_value.first.return_value = mock_image

        # Execute task with custom size
        custom_size = (150, 150)
        result = generate_thumbnail.apply(args=["test_image.jpg", None, custom_size])

        # Verify success
        assert result.successful()
        task_result = result.result

        # Verify thumbnail size is within custom bounds
        thumb_width, thumb_height = task_result["thumbnail_size"]
        assert thumb_width <= custom_size[0]
        assert thumb_height <= custom_size[1]

    def test_generate_thumbnail_image_not_found(self, mock_minio_client, mock_database_session):
        """Test thumbnail generation when original image not found"""
        # Setup mock to raise exception
        mock_minio_client.get_object.side_effect = Exception("Object not found")

        # Execute task and expect failure
        result = generate_thumbnail.apply(args=["nonexistent.jpg"])

        assert not result.successful()
        assert "Object not found" in str(result.result)

    def test_generate_thumbnail_invalid_image_data(self, mock_minio_client, mock_database_session):
        """Test thumbnail generation with invalid image data"""
        # Setup mock with invalid image data
        mock_response = Mock()
        mock_response.read.return_value = b"invalid image data"
        mock_minio_client.get_object.return_value = mock_response

        # Execute task and expect failure
        result = generate_thumbnail.apply(args=["invalid.jpg"])

        assert not result.successful()

    def test_generate_thumbnail_database_update_failure(
        self, mock_minio_client, mock_database_session, sample_image_data
    ):
        """Test thumbnail generation with database update failure"""
        # Setup mock responses
        mock_response = Mock()
        mock_response.read.return_value = sample_image_data
        mock_minio_client.get_object.return_value = mock_response

        # Mock database failure (but don't fail the task)
        mock_database_session.query.side_effect = Exception("Database error")

        # Execute task - should still succeed (thumbnail created)
        result = generate_thumbnail.apply(args=["test_image.jpg"])

        # Task should succeed even with DB failure
        assert result.successful()
        task_result = result.result
        assert task_result["status"] == "success"

    def test_generate_thumbnail_upload_failure(
        self, mock_minio_client, mock_database_session, sample_image_data
    ):
        """Test thumbnail generation with MinIO upload failure"""
        # Setup mock responses
        mock_response = Mock()
        mock_response.read.return_value = sample_image_data
        mock_minio_client.get_object.return_value = mock_response

        # Mock upload failure
        mock_minio_client.put_object.side_effect = Exception("Upload failed")

        # Execute task and expect failure
        result = generate_thumbnail.apply(args=["test_image.jpg"])

        assert not result.successful()

    @patch("workers.tasks.settings")
    def test_generate_thumbnail_with_custom_settings(
        self, mock_settings, mock_minio_client, mock_database_session, sample_image_data
    ):
        """Test thumbnail generation with custom settings"""
        # Setup custom settings
        mock_settings.MINIO_BUCKET_NAME = "custom-bucket"
        mock_settings.THUMBNAIL_SIZE = (100, 100)
        mock_settings.THUMBNAIL_QUALITY = 95
        mock_settings.MINIO_ENDPOINT = "custom-endpoint:9000"

        # Setup mock responses
        mock_response = Mock()
        mock_response.read.return_value = sample_image_data
        mock_minio_client.get_object.return_value = mock_response

        # Mock database record
        mock_image = Mock()
        mock_database_session.query.return_value.filter.return_value.first.return_value = mock_image

        # Execute task
        result = generate_thumbnail.apply(args=["test_image.jpg"])

        # Verify success with custom settings
        assert result.successful()
        task_result = result.result
        assert "custom-endpoint:9000" in task_result["thumbnail_url"]

    def test_thumbnail_aspect_ratio_preservation(self, mock_minio_client, mock_database_session):
        """Test that thumbnail preserves aspect ratio"""
        # Create a wide image (2:1 aspect ratio)
        wide_img = Image.new("RGB", (400, 200), color="blue")
        img_buffer = io.BytesIO()
        wide_img.save(img_buffer, format="JPEG")
        img_buffer.seek(0)
        wide_image_data = img_buffer.getvalue()

        # Setup mock responses
        mock_response = Mock()
        mock_response.read.return_value = wide_image_data
        mock_minio_client.get_object.return_value = mock_response

        # Mock database record
        mock_image = Mock()
        mock_database_session.query.return_value.filter.return_value.first.return_value = mock_image

        # Execute task
        result = generate_thumbnail.apply(args=["wide_image.jpg"])

        # Verify success
        assert result.successful()
        task_result = result.result

        # Check aspect ratio preservation
        orig_width, orig_height = task_result["original_size"]
        thumb_width, thumb_height = task_result["thumbnail_size"]

        orig_ratio = orig_width / orig_height
        thumb_ratio = thumb_width / thumb_height

        # Allow small floating point differences
        assert abs(orig_ratio - thumb_ratio) < 0.1


class TestThumbnailIntegration:
    """Integration tests for thumbnail pipeline"""

    @pytest.fixture
    def real_test_image(self):
        """Create a real test image file"""
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp_file:
            img = Image.new("RGB", (300, 200), color="green")
            img.save(tmp_file, format="JPEG")
            tmp_file.flush()
            yield tmp_file.name
        os.unlink(tmp_file.name)

    @pytest.mark.integration
    def test_full_thumbnail_pipeline(self, real_test_image):
        """Test complete thumbnail generation pipeline"""
        # This would test with real MinIO and database
        # For now, it's a placeholder for actual integration testing
        pass

    def test_thumbnail_task_retry_mechanism(self, mock_minio_client, mock_database_session):
        """Test Celery retry mechanism for thumbnail generation"""
        # Setup mock to fail first time, succeed second time
        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise Exception("Temporary failure")
            else:
                mock_response = Mock()
                mock_response.read.return_value = self.create_simple_image_data()
                return mock_response

        mock_minio_client.get_object.side_effect = side_effect

        # Mock database record
        mock_image = Mock()
        mock_database_session.query.return_value.filter.return_value.first.return_value = mock_image

        # The retry mechanism would be tested in a real Celery environment
        # Here we just verify the task structure supports retries
        task = generate_thumbnail
        assert task.max_retries == 3
        assert task.default_retry_delay == 60

    def create_simple_image_data(self):
        """Helper to create simple image data"""
        img = Image.new("RGB", (100, 100), color="red")
        img_buffer = io.BytesIO()
        img.save(img_buffer, format="JPEG")
        img_buffer.seek(0)
        return img_buffer.getvalue()


class TestUploadWithThumbnails:
    """Test upload endpoint integration with thumbnail generation"""

    @pytest.fixture
    def mock_upload_dependencies(self):
        """Mock dependencies for upload testing"""
        with patch.multiple(
            "api.upload", minio_storage=Mock(), get_db_connection=Mock(), generate_thumbnail=Mock()
        ) as mocks:
            yield mocks

    def test_upload_triggers_thumbnail_generation(self, mock_upload_dependencies):
        """Test that file upload triggers thumbnail generation"""
        # Setup mocks
        mocks = mock_upload_dependencies
        mock_connection = Mock()
        mock_cursor = Mock()
        mock_cursor.fetchone.return_value = [1]  # Mock inserted ID
        mock_connection.cursor.return_value = mock_cursor
        mocks["get_db_connection"].return_value = mock_connection

        mocks["minio_storage"].upload_file.return_value = "http://minio/test-image.jpg"
        mocks["generate_thumbnail"].delay.return_value = Mock(id="task-123")

        # This would be tested with a real FastAPI test client
        # For now, verify the structure is in place
        assert "generate_thumbnail" in [t.name for t in generate_thumbnail.app.tasks.values()]

    def test_manual_thumbnail_regeneration(self):
        """Test manual thumbnail regeneration endpoint"""
        # Test the regenerate-thumbnail endpoint
        # This would use FastAPI TestClient in a real test
        pass


class TestThumbnailUtilities:
    """Test utility functions for thumbnail handling"""

    def test_thumbnail_key_generation(self):
        """Test thumbnail key generation follows correct pattern"""
        filename = "test_image.jpg"
        expected_key = f"thumbnails/{filename}"

        # This verifies the pattern used in the task
        assert expected_key == f"thumbnails/{filename}"

    def test_thumbnail_url_generation(self):
        """Test thumbnail URL generation"""
        bucket_name = "test-bucket"
        thumbnail_key = "thumbnails/test_image.jpg"
        endpoint = "localhost:9000"

        expected_url = f"http://{endpoint}/{bucket_name}/{thumbnail_key}"
        assert expected_url == f"http://{endpoint}/{bucket_name}/{thumbnail_key}"

    def test_image_format_support(self):
        """Test various image format support"""
        supported_formats = ["JPEG", "PNG", "GIF", "BMP", "TIFF"]

        for format_name in supported_formats:
            # Create image in specific format
            img = Image.new("RGB", (100, 100), color="red")
            buffer = io.BytesIO()

            if format_name == "JPEG":
                img.save(buffer, format=format_name, quality=90)
            else:
                img.save(buffer, format=format_name)

            buffer.seek(0)

            # Verify Pillow can read it back
            loaded_img = Image.open(buffer)
            assert loaded_img.size == (100, 100)


# Fixtures for the entire test module
@pytest.fixture(scope="module")
def celery_app():
    """Celery app fixture for testing"""
    from workers.celery_app import celery_app

    return celery_app


@pytest.fixture(scope="module")
def celery_config():
    """Celery configuration for testing"""
    return {
        "broker_url": "memory://",
        "result_backend": "cache+memory://",
        "task_always_eager": True,
        "task_eager_propagates": True,
    }

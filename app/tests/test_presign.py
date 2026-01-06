import pytest
from unittest.mock import Mock, patch, MagicMock
from fastapi.testclient import TestClient
from fastapi import status
from datetime import datetime, timedelta

from core.main import app
from core.config import settings

client = TestClient(app)


class TestPresignedURLs:
    """Test suite for presigned URL endpoints"""

    @pytest.fixture
    def auth_headers(self):
        """Auth headers for testing"""
        return {"Authorization": "Bearer valid-token"}

    @pytest.fixture
    def mock_minio_client(self):
        """Mock MinIO client"""
        with patch("api.presign.get_minio_client") as mock_get_client:
            mock_client = Mock()
            mock_get_client.return_value = mock_client
            yield mock_client

    def test_generate_presigned_upload_url_success(self, auth_headers, mock_minio_client):
        """Test successful presigned upload URL generation"""
        # Mock MinIO presigned_post_policy response
        mock_presigned_data = {
            "url": "http://localhost:9000/impact-images",
            "fields": {
                "key": "uploads/user123/test_image.jpg",
                "policy": "base64-encoded-policy",
                "x-amz-algorithm": "AWS4-HMAC-SHA256",
                "x-amz-credential": "minioadmin/20230101/us-east-1/s3/aws4_request",
                "x-amz-date": "20230101T000000Z",
                "x-amz-signature": "signature",
            },
        }
        mock_minio_client.presigned_post_policy.return_value = mock_presigned_data

        response = client.get(
            "/presign/upload",
            params={"filename": "test_image.jpg", "content_type": "image/jpeg", "expires_in": 3600},
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "upload_url" in data
        assert "fields" in data
        assert "object_key" in data
        assert "bucket_name" in data
        assert data["expires_in"] == 3600
        assert data["object_key"] == "uploads/user123/test_image.jpg"
        assert data["bucket_name"] == settings.MINIO_BUCKET_NAME

    def test_generate_presigned_upload_url_invalid_extension(self, auth_headers, mock_minio_client):
        """Test presigned upload URL with invalid file extension"""
        response = client.get(
            "/presign/upload",
            params={"filename": "test_file.txt", "content_type": "text/plain"},  # Invalid extension
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "not allowed" in response.json()["detail"]

    def test_generate_presigned_upload_url_empty_filename(self, auth_headers, mock_minio_client):
        """Test presigned upload URL with empty filename"""
        response = client.get("/presign/upload", params={"filename": ""}, headers=auth_headers)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "cannot be empty" in response.json()["detail"]

    def test_generate_presigned_upload_url_unauthorized(self, mock_minio_client):
        """Test presigned upload URL without authentication"""
        response = client.get("/presign/upload", params={"filename": "test_image.jpg"})

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_generate_presigned_download_url_success(self, auth_headers, mock_minio_client):
        """Test successful presigned download URL generation"""
        # Mock object stat
        mock_stat = Mock()
        mock_stat.size = 1024000
        mock_stat.content_type = "image/jpeg"
        mock_stat.last_modified = datetime.utcnow()
        mock_stat.etag = "abc123"
        mock_minio_client.stat_object.return_value = mock_stat

        # Mock presigned URL
        mock_url = "http://localhost:9000/impact-images/test-object-key?signature=xyz"
        mock_minio_client.presigned_get_object.return_value = mock_url

        response = client.get(
            "/presign/download",
            params={"object_key": "uploads/user123/test_image.jpg", "expires_in": 1800},
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["download_url"] == mock_url
        assert data["object_key"] == "uploads/user123/test_image.jpg"
        assert data["expires_in"] == 1800
        assert data["file_size"] == 1024000
        assert data["content_type"] == "image/jpeg"
        assert "last_modified" in data
        assert data["etag"] == "abc123"

    def test_generate_presigned_download_url_object_not_found(
        self, auth_headers, mock_minio_client
    ):
        """Test presigned download URL for non-existent object"""
        # Mock object not found
        mock_minio_client.stat_object.side_effect = Exception("Object not found")

        response = client.get(
            "/presign/download", params={"object_key": "nonexistent/file.jpg"}, headers=auth_headers
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "not found" in response.json()["detail"]

    def test_generate_presigned_download_url_empty_object_key(
        self, auth_headers, mock_minio_client
    ):
        """Test presigned download URL with empty object key"""
        response = client.get("/presign/download", params={"object_key": ""}, headers=auth_headers)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "cannot be empty" in response.json()["detail"]

    def test_initiate_multipart_upload_success(self, auth_headers, mock_minio_client):
        """Test successful multipart upload initiation"""
        # Mock multipart upload initiation
        mock_upload_id = "test-upload-id-123"
        mock_minio_client._create_multipart_upload.return_value = mock_upload_id

        response = client.get(
            "/presign/upload/multipart/initiate",
            params={"filename": "large_image.jpg", "content_type": "image/jpeg"},
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["upload_id"] == mock_upload_id
        assert "object_key" in data
        assert data["bucket_name"] == settings.MINIO_BUCKET_NAME
        assert "instructions" in data

    def test_generate_multipart_upload_url_success(self, auth_headers, mock_minio_client):
        """Test successful multipart part URL generation"""
        # Mock presigned URL for part
        mock_url = "http://localhost:9000/impact-images/test-object?uploadId=123&partNumber=1&signature=xyz"
        mock_minio_client.presigned_put_object.return_value = mock_url

        response = client.get(
            "/presign/upload/multipart/part",
            params={
                "object_key": "uploads/user123/large_image.jpg",
                "upload_id": "test-upload-id-123",
                "part_number": 1,
                "expires_in": 3600,
            },
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["upload_url"] == mock_url
        assert data["object_key"] == "uploads/user123/large_image.jpg"
        assert data["upload_id"] == "test-upload-id-123"
        assert data["part_number"] == 1
        assert data["expires_in"] == 3600

    def test_multipart_part_invalid_part_number(self, auth_headers, mock_minio_client):
        """Test multipart part URL with invalid part number"""
        response = client.get(
            "/presign/upload/multipart/part",
            params={
                "object_key": "test-object",
                "upload_id": "test-upload-id",
                "part_number": 0,  # Invalid: must be >= 1
            },
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_multipart_part_part_number_too_high(self, auth_headers, mock_minio_client):
        """Test multipart part URL with part number too high"""
        response = client.get(
            "/presign/upload/multipart/part",
            params={
                "object_key": "test-object",
                "upload_id": "test-upload-id",
                "part_number": 10001,  # Invalid: must be <= 10000
            },
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_presign_health_check_success(self, mock_minio_client):
        """Test presign health check endpoint"""
        # Mock bucket exists check
        mock_minio_client.bucket_exists.return_value = True

        response = client.get("/presign/health")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "healthy"
        assert data["minio_endpoint"] == settings.MINIO_ENDPOINT
        assert data["bucket_name"] == settings.MINIO_BUCKET_NAME
        assert data["bucket_exists"] is True
        assert "max_file_size" in data
        assert "allowed_extensions" in data

    def test_presign_health_check_bucket_not_exists(self, mock_minio_client):
        """Test presign health check when bucket doesn't exist"""
        # Mock bucket doesn't exist
        mock_minio_client.bucket_exists.return_value = False

        response = client.get("/presign/health")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "healthy"
        assert data["bucket_exists"] is False

    def test_presign_health_check_minio_error(self, mock_minio_client):
        """Test presign health check with MinIO error"""
        # Mock MinIO error
        mock_minio_client.bucket_exists.side_effect = Exception("MinIO connection failed")

        response = client.get("/presign/health")

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert "unhealthy" in response.json()["detail"]

    def test_upload_url_expires_in_validation(self, auth_headers, mock_minio_client):
        """Test expires_in parameter validation"""
        # Too low
        response = client.get(
            "/presign/upload",
            params={"filename": "test.jpg", "expires_in": 30},  # Below minimum of 60
            headers=auth_headers,
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

        # Too high
        response = client.get(
            "/presign/upload",
            params={"filename": "test.jpg", "expires_in": 700000},  # Above maximum of 604800
            headers=auth_headers,
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_filename_sanitization(self, auth_headers, mock_minio_client):
        """Test that filenames are properly sanitized"""
        mock_presigned_data = {
            "url": "http://localhost:9000/impact-images",
            "fields": {"key": "uploads/user123/test_file_name.jpg"},
        }
        mock_minio_client.presigned_post_policy.return_value = mock_presigned_data

        response = client.get(
            "/presign/upload",
            params={"filename": "test file name.jpg"},  # Contains spaces
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        # Spaces should be replaced with underscores
        assert "test_file_name.jpg" in data["object_key"]

    def test_content_disposition_header(self, auth_headers, mock_minio_client):
        """Test download URL with custom Content-Disposition header"""
        # Mock object stat
        mock_stat = Mock()
        mock_stat.size = 1024000
        mock_stat.content_type = "image/jpeg"
        mock_stat.last_modified = datetime.utcnow()
        mock_stat.etag = "abc123"
        mock_minio_client.stat_object.return_value = mock_stat

        # Mock presigned URL
        mock_url = (
            "http://localhost:9000/impact-images/test.jpg?response-content-disposition=attachment"
        )
        mock_minio_client.presigned_get_object.return_value = mock_url

        response = client.get(
            "/presign/download",
            params={
                "object_key": "test.jpg",
                "response_content_disposition": "attachment; filename=downloaded_image.jpg",
            },
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        # Verify that presigned_get_object was called with response_headers
        mock_minio_client.presigned_get_object.assert_called_once()
        call_args = mock_minio_client.presigned_get_object.call_args
        assert "response_headers" in call_args.kwargs
        assert (
            call_args.kwargs["response_headers"]["response-content-disposition"]
            == "attachment; filename=downloaded_image.jpg"
        )


@pytest.mark.integration
class TestPresignedURLsIntegration:
    """Integration tests for presigned URLs"""

    def test_presigned_upload_flow(self):
        """Test complete presigned upload flow"""
        # This would test:
        # 1. Generate presigned upload URL
        # 2. Use URL to upload file
        # 3. Verify file exists in MinIO
        # 4. Generate presigned download URL
        # 5. Download and verify file content
        pass

    def test_multipart_upload_flow(self):
        """Test complete multipart upload flow"""
        # This would test:
        # 1. Initiate multipart upload
        # 2. Generate URLs for parts
        # 3. Upload individual parts
        # 4. Complete multipart upload
        # 5. Verify final file
        pass

import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path):
    os.environ["DATABASE_URL"] = f"sqlite:///{tmp_path}/test.db"
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from core.main import app

    os.makedirs("/app/uploads", exist_ok=True)
    return TestClient(app)


def test_upload_requires_authentication(client):
    image_path = Path(__file__).resolve().parents[1] / "hazard_test_images" / "flood_1.jpg"
    with image_path.open("rb") as img:
        response = client.post(
            "/api/upload",
            files={"file": ("auth_flood.jpg", img, "image/jpeg")},
            data={
                "hazard_type": "flood",
                "location": "Test Location",
                "title": "Test Title",
                "abstract": "Test Abstract",
                "purpose": "Testing",
                "keywords": '["flood"]',
            },
        )
    assert response.status_code == 401


def test_upload_with_valid_token(client, auth_headers):
    image_path = Path(__file__).resolve().parents[1] / "hazard_test_images" / "flood_1.jpg"
    with image_path.open("rb") as img:
        response = client.post(
            "/api/upload",
            files={"file": ("auth_flood.jpg", img, "image/jpeg")},
            data={
                "hazard_type": "flood",
                "location": "Test Location",
                "title": "Test Title",
                "abstract": "Test Abstract",
                "purpose": "Testing",
                "keywords": '["flood"]',
            },
            headers=auth_headers,
        )
    assert response.status_code == 200

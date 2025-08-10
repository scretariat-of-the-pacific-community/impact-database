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


def test_get_single_image_metadata(client):
    token_resp = client.post(
        "/api/token", data={"username": "johndoe", "password": "secret"}
    )
    token = token_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    image_path = Path(__file__).resolve().parents[1] / "hazard_test_images" / "flood_1.jpg"
    with image_path.open("rb") as img:
        response = client.post(
            "/api/upload",
            files={"file": ("flood_1.jpg", img, "image/jpeg")},
            data={
                "hazard_type": "flood",
                "location": "Test Location",
                "title": "Test Title",
                "abstract": "Test Abstract",
                "purpose": "Testing",
                "keywords": '["flood"]',
            },
            headers=headers,
        )
    assert response.status_code == 200

    get_response = client.get("/api/images/flood_1.jpg")
    assert get_response.status_code == 200
    data = get_response.json()
    assert data["filename"] == "flood_1.jpg"
    assert data["hazard_type"] == "flood"
    assert data["location"] == "Test Location"

import json
import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

import pytest
import requests

pytestmark = pytest.mark.smoke


@pytest.fixture(scope="session")
def base_url():
    url = os.getenv("IMPACT_API_BASE", "http://localhost:8000")
    try:
        requests.get(f"{url}/docs", timeout=5)
    except requests.RequestException:
        pytest.skip(f"IMPACT API not available at {url}")
    return url


@pytest.fixture(scope="session")
def auth_token(base_url):
    username = os.getenv("IMPACT_API_USER", "admin")
    password = os.getenv("IMPACT_API_PASSWORD", "admin123")
    try:
        resp = requests.post(
            f"{base_url}/auth/token",
            data={"username": username, "password": password},
            timeout=5,
        )
    except requests.RequestException:
        pytest.skip("Auth service unreachable")
    assert resp.status_code == 200
    token = resp.json().get("access_token")
    assert token and token.count(".") == 2  # basic JWT structure
    return token


def test_docs_available(base_url):
    resp = requests.get(f"{base_url}/docs", timeout=5)
    assert resp.status_code == 200


def test_auth_token_returns_jwt(auth_token):
    assert auth_token.count(".") == 2


def test_upload_returns_metadata(base_url, auth_token):
    image_path = Path(__file__).resolve().parent.parent / "app" / "hazard_test_images" / "flood_1.jpg"
    filename = f"test_{uuid.uuid4().hex}.jpg"
    with image_path.open("rb") as f:
        files = {"file": (filename, f, "image/jpeg")}
        data = {"hazard_type": "flood", "location": "Test Location"}
        headers = {"Authorization": f"Bearer {auth_token}"}
        resp = requests.post(
            f"{base_url}/upload/upload",
            files=files,
            data=data,
            headers=headers,
            timeout=30,
        )
    assert resp.status_code == 200
    body = resp.json()
    # id field
    assert any(k in body for k in ["id", "file_id", "filename"])
    # hazard type
    hz = body.get("hazard_type") or body.get("metadata", {}).get("hazard_type")
    assert hz == "flood"
    # S3 key
    key = (
        body.get("object_key")
        or body.get("object_name")
        or body.get("resource_locator")
        or (body.get("asset") or {}).get("key")
        or (body.get("asset") or {}).get("href")
    )
    assert key


def validate_stac_json(data):
    validator = shutil.which("stac-validator")
    if validator:
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as tmp:
            json.dump(data, tmp)
            tmp.flush()
            result = subprocess.run(
                [validator, tmp.name], capture_output=True, text=True
            )
        assert result.returncode == 0, result.stdout + result.stderr
    else:
        assert data.get("type") in {"Catalog", "Collection", "FeatureCollection", "Feature"}
        assert "stac_version" in data


def test_stac_endpoint(base_url):
    resp = requests.get(f"{base_url}/stac", timeout=5)
    assert resp.status_code == 200
    data = resp.json()
    validate_stac_json(data)

import pytest
from fastapi.testclient import TestClient
import os
import sys
from pathlib import Path


@pytest.fixture
def auth_headers():
    """Provide mock authentication headers for tests"""
    return {"Authorization": "Bearer test-token"}


@pytest.fixture
def test_image_path():
    """Provide path to test image"""
    return Path(__file__).resolve().parents[1] / "hazard_test_images" / "flood_1.jpg"

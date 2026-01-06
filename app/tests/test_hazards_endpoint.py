import os
import sys
from datetime import datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path):
    os.environ["DATABASE_URL"] = f"sqlite:///{tmp_path}/test.db"
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from core.main import app

    os.makedirs("/app/uploads", exist_ok=True)
    client = TestClient(app)

    from models.database import SessionLocal, Base, ImageMetadata

    session = SessionLocal()
    Base.metadata.drop_all(bind=session.get_bind())
    Base.metadata.create_all(bind=session.get_bind())

    entries = [
        ImageMetadata(
            filename="img1.jpg",
            hazard_type="flood",
            location="Location1",
            country="USA",
            timestamp=datetime(2021, 1, 1),
        ),
        ImageMetadata(
            filename="img2.jpg",
            hazard_type="cyclone",
            location="Location2",
            country="USA",
            timestamp=datetime(2021, 1, 2),
        ),
        ImageMetadata(
            filename="img3.jpg",
            hazard_type="flood",
            location="Location3",
            country="CAN",
            timestamp=datetime(2021, 1, 1),
        ),
    ]

    session.add_all(entries)
    session.commit()
    session.close()

    return client


def test_hazards_no_filters(client):
    response = client.get("/api/hazards")
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 3
    assert len(data["hazards"]) == 3


def test_hazards_filter_by_type(client):
    response = client.get("/api/hazards", params={"type": "flood"})
    data = response.json()
    assert data["count"] == 2
    assert all(h["hazard_type"] == "flood" for h in data["hazards"])


def test_hazards_filter_by_date(client):
    response = client.get("/api/hazards", params={"date": "2021-01-01"})
    data = response.json()
    assert data["count"] == 2
    dates = {h["timestamp"] for h in data["hazards"]}
    assert dates == {"2021-01-01T00:00:00"}


def test_hazards_filter_by_country(client):
    response = client.get("/api/hazards", params={"country": "USA"})
    data = response.json()
    assert data["count"] == 2
    assert all(h["country"] == "USA" for h in data["hazards"])


def test_hazards_filter_combined(client):
    response = client.get(
        "/api/hazards",
        params={"type": "flood", "date": "2021-01-01", "country": "USA"},
    )
    data = response.json()
    assert data["count"] == 1
    assert data["hazards"][0]["filename"] == "img1.jpg"

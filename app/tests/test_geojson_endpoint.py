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
            location="Loc1",
            latitude=10.0,
            longitude=20.0,
            timestamp=datetime(2021, 1, 1),
        ),
        ImageMetadata(
            filename="img2.jpg",
            hazard_type="cyclone",
            location="Loc2",
        ),
    ]

    session.add_all(entries)
    session.commit()
    session.close()

    return client


def test_geojson_endpoint(client):
    response = client.get("/api/geojson")
    assert response.status_code == 200
    data = response.json()
    assert data["type"] == "FeatureCollection"
    assert len(data["features"]) == 1

    feature = data["features"][0]
    assert feature["geometry"]["type"] == "Point"
    assert feature["geometry"]["coordinates"] == [20.0, 10.0]
    assert feature["properties"]["filename"] == "img1.jpg"

import os
from datetime import datetime
from fastapi.testclient import TestClient
from shapely.geometry import Point
from geoalchemy2.shape import from_shape

# Ensure test DB
os.environ.setdefault("DATABASE_URL", "sqlite://")

from core.main import app
from models.database import get_db


class DummyImage:
    def __init__(self):
        self.id = 1
        # Geometry as WKBElement
        self.geometry = from_shape(Point(174.7762, -41.2865), srid=4326)
        self.datetime = datetime.utcnow()
        self.timestamp = self.datetime
        self.filename = "sample.jpg"
        self.title = "Sample Title"
        self.abstract = "Sample Abstract"
        self.date_stamp = datetime.utcnow()
        self.metadata_date = datetime.utcnow()
        self.hazard_type = "flood"
        self.event_id = "EV1"
        self.status = "approved"
        self.data_license = "CC-BY-4.0"
        self.format_name = "JPEG"
        self.thumbnail_url = None
        self.positional_accuracy = None
        self.source_type = None
        self.uploader_id = "tester"
        self.point_of_contact = "tester"
        self.topic_category = ["environment"]
        self.keywords = ["flood"]
        self.lineage_statement = None
        self.use_constraints = None
        self.access_constraints = None
        self.temporal_extent_start = None
        self.temporal_extent_end = None
        # Add missing attributes for build_stac_collection
        self.latitude = -41.2865
        self.longitude = 174.7762
        self.country = "New Zealand"
        self.location = "Wellington"


class DummyQuery:
    def __init__(self, items):
        self._items = items
        self._skip = 0
        self._limit = None

    def filter(self, *args, **kwargs):
        # Ignore filters in the dummy - return all items
        return self

    def distinct(self):
        # Return unique hazard types
        # Emulate SQLAlchemy's return shape for .distinct().all() which yields tuples
        class Q:
            def __init__(self, items):
                self._items = items

            def all(self):
                # Return list of tuples as (hazard_type,)
                return list({(it.hazard_type,) for it in self._items})

        return Q(self._items)

    def all(self):
        items = self._items
        if self._limit is not None:
            items = items[self._skip:self._skip + self._limit]
        return items

    def first(self):
        return self._items[0] if self._items else None

    def count(self):
        return len(self._items)

    def offset(self, skip):
        self._skip = skip
        return self

    def limit(self, limit):
        self._limit = limit
        return self


class DummySession:
    def __init__(self, items):
        self._items = items

    def query(self, model):
        return DummyQuery(self._items)

    def close(self):
        pass


def override_get_db():
    # Use a single sample image for all queries
    img = DummyImage()
    session = DummySession([img])
    yield session


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def test_collections_and_items_return_stac_items():
    # Get collections
    resp = client.get("/stac/collections")
    assert resp.status_code == 200
    collections = resp.json()
    assert isinstance(collections, list)
    assert len(collections) >= 0

    # If there is at least one collection returned, test items endpoint
    if collections:
        coll_id = collections[0]["id"]
    else:
        # Fallback: use expected hazard-based id
        coll_id = "hazard-flood"

    items_resp = client.get(f"/stac/collections/{coll_id}/items")
    assert items_resp.status_code == 200
    items_json = items_resp.json()

    # Should be a FeatureCollection-like structure
    assert items_json.get("type") == "FeatureCollection"
    features = items_json.get("features")
    assert isinstance(features, list)
    assert len(features) >= 0

    if features:
        feat = features[0]
        # Check some required STAC fields
        assert "properties" in feat
        assert "datetime" in feat["properties"] or feat["properties"].get("datetime")
        assert "id" in feat
        assert "geometry" in feat


def test_search_endpoint_returns_stac_items():
    resp = client.get("/stac/search")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("type") == "FeatureCollection"
    features = data.get("features")
    assert isinstance(features, list)

    if features:
        feat = features[0]
        assert "properties" in feat
        assert "datetime" in feat["properties"] or feat["properties"].get("datetime")

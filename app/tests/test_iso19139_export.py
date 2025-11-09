import sys
from pathlib import Path
from datetime import datetime
import os

from fastapi.testclient import TestClient
from lxml import etree

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ.setdefault("DATABASE_URL", "sqlite://")

from core.main import app
from models.database import get_db

class DummyImage:
    filename = "sample.jpg"
    hazard_type = "flood"
    location = "Test Location"
    title = "Sample Title"
    abstract = "Sample Abstract"
    purpose = "Testing"
    topic_category = ["environment"]
    keywords = ["flood"]
    format_name = "JPEG"
    format_version = "1.0"
    latitude = 0.5
    longitude = 0.5
    geographic_bounding_box = {
        "westBoundLongitude": 0.0,
        "eastBoundLongitude": 1.0,
        "southBoundLatitude": 0.0,
        "northBoundLatitude": 1.0,
    }
    point_of_contact = "Tester"
    metadata_language = "en"
    metadata_date = datetime.utcnow()


class DummySession:
    def query(self, model):
        class Q:
            def filter(self_inner, *args, **kwargs):
                return self_inner
            def first(self_inner):
                return DummyImage()
        return Q()
    def close(self):
        pass

def override_get_db():
    yield DummySession()

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def test_metadata_xml_endpoint():
    response = client.get("/api/metadata/sample.jpg/xml")
    assert response.status_code == 200
    xml_doc = etree.fromstring(response.content)
    schema_doc = etree.parse(Path(__file__).parent / "data" / "gmd.xsd")
    xmlschema = etree.XMLSchema(schema_doc)
    xmlschema.assertValid(xml_doc)

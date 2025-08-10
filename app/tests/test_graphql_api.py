import os
import sys
import json
from datetime import datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path):
    os.environ["DATABASE_URL"] = f"sqlite:///{tmp_path}/test.db"
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from core.main import app
    from api.graphql_schema import schema, get_context
    from strawberry.fastapi import GraphQLRouter
    from fastapi.routing import APIRoute

    # replace GraphQL router with file upload support
    app.router.routes = [
        r for r in app.router.routes if not (isinstance(r, APIRoute) and r.path == "/graphql")
    ]
    app.include_router(
        GraphQLRouter(schema, context_getter=get_context, multipart_uploads_enabled=True),
        prefix="/graphql",
    )

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
            latitude=10.0,
            longitude=20.0,
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
            latitude=11.0,
            longitude=21.0,
        ),
    ]

    session.add_all(entries)
    session.commit()
    session.close()

    return client


def graphql(client: TestClient, query: str, variables: dict | None = None):
    return client.post("/graphql", json={"query": query, "variables": variables or {}})


def test_images_query_matches_rest(client):
    rest = client.get("/api/images", params={"hazard_type": "flood"}).json()
    query = """
    query($hazardType: String){
      images(hazardType: $hazardType){ filename hazardType location country }
    }
    """
    gql = graphql(client, query, {"hazardType": "flood"}).json()
    assert sorted(img["filename"] for img in gql["data"]["images"]) == \
        sorted(img["filename"] for img in rest["images"])


def test_hazards_query_matches_rest(client):
    rest = client.get("/api/hazards", params={"type": "flood"}).json()
    query = """
    query($hazardType: String){
      hazards(hazardType: $hazardType){ filename hazardType }
    }
    """
    gql = graphql(client, query, {"hazardType": "flood"}).json()
    assert rest["count"] == len(gql["data"]["hazards"])
    assert all(h["hazardType"] == "flood" for h in gql["data"]["hazards"])


def test_image_query_matches_rest(client):
    rest = client.get("/api/images/img1.jpg").json()
    query = """
    query($filename: String!){
      image(filename: $filename){ filename hazardType location }
    }
    """
    gql = graphql(client, query, {"filename": "img1.jpg"}).json()
    data = gql["data"]["image"]
    assert data["filename"] == rest["filename"]
    assert data["hazardType"] == rest["hazard_type"]
    assert data["location"] == rest["location"]


def test_upload_image_mutation(client):
    image_path = Path(__file__).resolve().parents[1] / "hazard_test_images" / "flood_1.jpg"
    mutation = """
    mutation(
      $file: Upload!,
      $hazardType: String!,
      $location: String!,
      $title: String,
      $abstract: String,
      $purpose: String,
      $keywords: String
    ){
      uploadImage(
        file: $file,
        hazardType: $hazardType,
        location: $location,
        title: $title,
        abstract: $abstract,
        purpose: $purpose,
        keywords: $keywords
      ){
        filename hazardType location
      }
    }
    """
    operations = {
        "query": mutation,
        "variables": {
            "file": None,
            "hazardType": "flood",
            "location": "Test Location",
            "title": "Test Title",
            "abstract": "Test Abstract",
            "purpose": "Testing",
            "keywords": "[\"flood\"]",
        },
    }
    file_map = {"0": ["variables.file"]}
    with image_path.open("rb") as img:
        response = client.post(
            "/graphql",
            data={"operations": json.dumps(operations), "map": json.dumps(file_map)},
            files={"0": ("flood_1.jpg", img, "image/jpeg")},
        )
    assert response.status_code == 200
    data = response.json()["data"]["uploadImage"]
    rest = client.get(f"/api/images/{data['filename']}").json()
    assert rest["filename"] == data["filename"]
    assert rest["hazard_type"] == data["hazardType"]
    assert rest["location"] == data["location"]


def test_hazards_invalid_date(client):
    rest = client.get("/api/hazards", params={"date": "2021-13-01"})
    assert rest.status_code == 400
    query = """
    query($date: String){ hazards(date: $date){ filename } }
    """
    gql = graphql(client, query, {"date": "2021-13-01"})
    assert "errors" in gql.json()


def test_images_invalid_has_coordinates(client):
    rest = client.get("/api/images", params={"has_coordinates": "notabool"})
    assert rest.status_code == 422
    query = "query { images(hasCoordinates: \"notabool\"){ filename } }"
    gql = client.post("/graphql", json={"query": query})
    assert "errors" in gql.json()

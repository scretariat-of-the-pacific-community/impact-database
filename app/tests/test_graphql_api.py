import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Ensure repository root is on sys.path for fixture import
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

# Reuse the REST API fixture to seed the database
from app.tests.test_hazards_endpoint import client as seeded_client


@pytest.fixture
def client(seeded_client):
    _ = seeded_client  # trigger fixture for DB setup

    # Replace the GraphQL router with file upload support
    from core.main import app
    from api.graphql_schema import schema, get_context
    from strawberry.fastapi import GraphQLRouter
    from fastapi.routing import APIRoute

    app.router.routes = [
        r for r in app.router.routes if not (isinstance(r, APIRoute) and r.path == "/graphql")
    ]
    app.include_router(
        GraphQLRouter(schema, context_getter=get_context, multipart_uploads_enabled=True),
        prefix="/graphql",
    )

    return TestClient(app)


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
    assert sorted(img["filename"] for img in gql["data"]["images"]) == sorted(
        img["filename"] for img in rest["images"]
    )


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
            "keywords": '["flood"]',
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
    query = 'query { images(hasCoordinates: "notabool"){ filename } }'
    gql = client.post("/graphql", json={"query": query})
    assert "errors" in gql.json()

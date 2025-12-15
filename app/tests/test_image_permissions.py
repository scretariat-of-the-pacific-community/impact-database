import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from fastapi import FastAPI

from api import images
from api.auth_rbac import EnhancedUser, get_current_user_enhanced
from models.database import get_db


class FakeQuery:
    def __init__(self, items):
        self.items = list(items)

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def count(self):
        return len(self.items)

    def limit(self, value):
        self.items = self.items[:value]
        return self

    def offset(self, value):
        self.items = self.items[value:]
        return self

    def all(self):
        return self.items

    def first(self):
        return self.items[0] if self.items else None


class FakeDB:
    def __init__(self, items=None):
        self.items = items or []

    def query(self, *_args, **_kwargs):
        return FakeQuery(self.items)

    def commit(self):
        return None

    def refresh(self, _obj):
        return None

    def rollback(self):
        return None


def override_user_with_permissions(permissions):
    async def _override():
        return EnhancedUser(
            id=str(uuid.uuid4()),
            username="tester",
            permissions=permissions,
        )

    return _override


async def unauthorized_user_override():
    raise HTTPException(status_code=401, detail="Not authenticated")


@pytest.fixture
def fake_images():
    return [
        SimpleNamespace(
            id=str(uuid.uuid4()),
            filename="sample.jpg",
            title="Sample",
            abstract="Desc",
            hazard_type="flood",
            location="Test",
            country="TS",
            keywords=["flood"],
            date_stamp=None,
        )
    ]


@pytest.fixture
def client(fake_images):
    test_app = FastAPI()
    test_app.include_router(images.router)

    def override_db():
        yield FakeDB(fake_images)

    test_app.dependency_overrides[get_db] = override_db

    client = TestClient(test_app)
    yield client
    test_app.dependency_overrides.clear()


def test_get_all_images_requires_authentication(client):
    client.app.dependency_overrides[get_current_user_enhanced] = unauthorized_user_override

    response = client.get("/images")

    assert response.status_code == 401


def test_get_all_images_enforces_permissions(client):
    client.app.dependency_overrides[get_current_user_enhanced] = override_user_with_permissions([])

    response = client.get("/images")

    assert response.status_code == 403


def test_get_all_images_allows_metadata_read(client):
    client.app.dependency_overrides[get_current_user_enhanced] = override_user_with_permissions(["metadata:read"])

    response = client.get("/images")

    assert response.status_code == 200
    body = response.json()
    assert "images" in body
    assert body["total"] >= 1


def test_update_image_metadata_requires_update_permission(client):
    client.app.dependency_overrides[get_current_user_enhanced] = override_user_with_permissions(["metadata:read"])

    response = client.put(
        "/images/test-id",
        json={"title": "New title"},
    )

    assert response.status_code == 403


def test_get_image_history_requires_permissions(client):
    client.app.dependency_overrides[get_current_user_enhanced] = override_user_with_permissions([])

    response = client.get("/images/test-id/history")

    assert response.status_code == 403


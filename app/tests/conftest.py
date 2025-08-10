import pytest

@pytest.fixture
def access_token(client):
    """Return a valid JWT access token."""
    resp = client.post("/api/token", data={"username": "johndoe", "password": "secret"})
    resp.raise_for_status()
    return resp.json()["access_token"]

@pytest.fixture
def auth_headers(access_token):
    return {"Authorization": f"Bearer {access_token}"}

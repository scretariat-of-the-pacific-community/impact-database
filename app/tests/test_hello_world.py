import httpx
import pytest

@pytest.mark.asyncio
async def test_hello_world():
    async with httpx.AsyncClient() as client:
        response = await client.get("http://localhost:8000/")  # Adjust the URL as needed
        assert response.status_code == 200
        assert response.json() == {"message": "Hello, World!"}  # Adjust the expected response as needed
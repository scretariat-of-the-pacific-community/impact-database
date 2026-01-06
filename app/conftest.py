import os
import sys
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def app():
    os.environ["DATABASE_URL"] = "sqlite:///./test.db"
    from core.main import app as main_app

    return main_app


@pytest.fixture(scope="session")
def client(app):
    return TestClient(app)

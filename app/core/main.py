"""FastAPI application entry point with health check endpoint."""

from fastapi import FastAPI

app = FastAPI(title="Impact Database API")


@app.get("/health")
def health_check() -> dict[str, str]:
    """Return a basic health status."""
    return {"status": "ok"}

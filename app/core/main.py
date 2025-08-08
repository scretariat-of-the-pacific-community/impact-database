<<<<<<< HEAD
=======
"""FastAPI application entry point with health check endpoint."""

>>>>>>> bdfc7e2d7b308aef7a453ea98a1183c4ca378862
from fastapi import FastAPI
from api.upload import router as upload_router

app = FastAPI(title="Impact Database API")

<<<<<<< HEAD
app.include_router(upload_router, prefix="/api", tags=["upload"])

@app.get("/")
async def root():
    return {"message": "Welcome to Impact Database API"}

@app.get("/health")
async def health_check():
=======

@app.get("/health")
def health_check() -> dict[str, str]:
    """Return a basic health status."""
>>>>>>> bdfc7e2d7b308aef7a453ea98a1183c4ca378862
    return {"status": "ok"}

@app.get("/images/")
async def list_images():
    # Placeholder: return empty list or implement listing logic
    return {"images": []}

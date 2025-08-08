from fastapi import FastAPI
from api.upload import router as upload_router

app = FastAPI(title="Impact Database API")

app.include_router(upload_router, prefix="/api", tags=["upload"])

@app.get("/")
async def root():
    return {"message": "Welcome to Impact Database API"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/images/")
async def list_images():
    # Placeholder: return empty list or implement listing logic
    return {"images": []}

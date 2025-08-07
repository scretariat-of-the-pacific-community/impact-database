
from fastapi import FastAPI

app = FastAPI(title="Impact Database API")

@app.get("/health")
def health_check():
    return {"status": "ok"}

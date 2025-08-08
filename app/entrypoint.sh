#!/bin/bash

# Wait for DB to be ready
echo "Waiting for database..."
until pg_isready -h db -p 5432 -U impactuser; do
  sleep 2
done

# Apply SQLAlchemy models (fix the import path)
echo "Initializing database schema..."
python -c "from models.database import Base, engine; Base.metadata.create_all(bind=engine)"

# Start FastAPI server
echo "Starting FastAPI app..."
exec uvicorn core.main:app --host 0.0.0.0 --port 8000 --reload
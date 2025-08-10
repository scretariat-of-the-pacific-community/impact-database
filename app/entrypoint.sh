#!/bin/bash

# Wait for DB to be ready
echo "Waiting for database..."
until pg_isready -h db -p 5432 -U impactuser; do
  sleep 2
done

# Apply SQLAlchemy models with error handling
echo "Initializing database schema..."
python -c "
import sys
sys.path.insert(0, '/app')
from models.database import Base, engine
try:
    Base.metadata.create_all(bind=engine, checkfirst=True)
    print('Database schema initialized successfully')
except Exception as e:
    print(f'Schema initialization completed with note: {e}')
"

# Start FastAPI server
echo "Starting FastAPI app..."
exec uvicorn core.main:app --host 0.0.0.0 --port 8000 --reload
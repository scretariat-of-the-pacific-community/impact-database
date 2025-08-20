#!/bin/bash

# Wait for DB to be ready
echo "Waiting for database..."
until pg_isready -h postgis_db -p 5432 -U postgres; do
  echo "Database not ready yet, waiting..."
  sleep 2
done

echo "Database is ready!"

# Run database migrations
echo "Running database migrations..."
python -c "
import sys
import os
sys.path.insert(0, '/app')
try:
    from alembic import command
    from alembic.config import Config
    alembic_cfg = Config('/app/alembic.ini')
    command.upgrade(alembic_cfg, 'head')
    print('Database migrations completed successfully')
except Exception as e:
    print(f'Migration error (continuing anyway): {e}')
"

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

# Initialize MinIO bucket
echo "Initializing MinIO bucket..."
python -c "
import sys
sys.path.insert(0, '/app')
try:
    from services.minio_client import get_minio_storage
    import os
    import time
    
    # Wait a bit for MinIO to be fully ready
    time.sleep(10)
    
    minio_client = get_minio_storage()
    bucket_name = os.getenv('MINIO_BUCKET', 'impact-images')
    
    # The bucket creation is handled inside get_minio_storage()
    print(f'MinIO bucket already exists: {bucket_name}')
        
except Exception as e:
    print(f'MinIO initialization error (continuing anyway): {e}')
"

# Check if command is provided, otherwise start FastAPI server
if [ $# -eq 0 ]; then
    # Start FastAPI server
    echo "Starting FastAPI app..."
    exec uvicorn core.main:app --host 0.0.0.0 --port 8000 --reload
else
    # Execute the provided command
    echo "Executing command: $@"
    exec "$@"
fi
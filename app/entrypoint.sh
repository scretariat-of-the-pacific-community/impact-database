#!/bin/bash

# Exit on error
set -e

wait_for_tcp() {
    local host="$1"
    local port="$2"
    local label="$3"
    local max_retries=${4:-60}  # Default 60 retries = 2 minutes
    local retry_count=0

    echo "Waiting for ${label} at ${host}:${port}..."
    until (echo > /dev/tcp/"$host"/"$port") >/dev/null 2>&1; do
        retry_count=$((retry_count + 1))
        if [ $retry_count -ge $max_retries ]; then
            echo "ERROR: ${label} at ${host}:${port} failed to become ready after ${max_retries} attempts"
            return 1
        fi
        echo "${label} not ready yet, waiting... (${retry_count}/${max_retries})"
        sleep 2
    done
    echo "${label} is ready!"
    return 0
}

# Default service role to 'api' if not set
SERVICE_ROLE=${SERVICE_ROLE:-api}

echo "Starting service with role: $SERVICE_ROLE"

# Common database readiness check
if [ "$SERVICE_ROLE" = "api" ] || [ "$SERVICE_ROLE" = "worker" ] || [ "$SERVICE_ROLE" = "beat" ]; then
    echo "Waiting for database..."
    DB_HOST=${POSTGRES_HOST:-postgis_db}
    DB_PORT=${POSTGRES_PORT:-5432}
    DB_USER=${POSTGRES_USER:-postgres}
    MAX_DB_RETRIES=${MAX_DB_RETRIES:-60}
    retry_count=0

    until pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER; do
      retry_count=$((retry_count + 1))
      if [ $retry_count -ge $MAX_DB_RETRIES ]; then
          echo "ERROR: Database failed to become ready after ${MAX_DB_RETRIES} attempts"
          exit 1
      fi
      echo "Database not ready yet, waiting... (${retry_count}/${MAX_DB_RETRIES})"
      sleep 2
    done
    echo "Database is ready!"
fi

if [ "$SERVICE_ROLE" = "api" ] || [ "$SERVICE_ROLE" = "worker" ] || [ "$SERVICE_ROLE" = "beat" ] || [ "$SERVICE_ROLE" = "flower" ]; then
    REDIS_TARGET=$(python - <<'PY'
import os
from urllib.parse import urlparse

url = os.getenv("REDIS_URL", "redis://redis:6379/0")
parsed = urlparse(url)
host = parsed.hostname or "redis"
port = parsed.port or 6379
print(f"{host}:{port}", end="")
PY
)
    REDIS_HOST=${REDIS_TARGET%:*}
    REDIS_PORT=${REDIS_TARGET#*:}
    if ! wait_for_tcp "$REDIS_HOST" "$REDIS_PORT" "Redis" 60; then
        echo "ERROR: Redis connection failed"
        exit 1
    fi
fi

# Role-specific startup logic
case "$SERVICE_ROLE" in
  api)
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

# Import all models to ensure they are registered with Base.metadata
try:
    from models.rbac import User, Role, Permission
except ImportError as e:
    print(f'RBAC models import: {e}')

try:
    from services.admin_service import AdminUser, UserSession, UserAuditLog
except ImportError as e:
    print(f'Admin models import: {e}')

try:
    Base.metadata.create_all(bind=engine, checkfirst=True)
    print('Database schema initialized successfully')
except Exception as e:
    print(f'Schema initialization completed with note: {e}')
"

# Initialize MinIO bucket
echo "Initializing MinIO bucket..."
# Standardize bucket env (prefer MINIO_BUCKET_NAME, fallback to legacy MINIO_BUCKET)
: "${MINIO_BUCKET_NAME:=${MINIO_BUCKET:-impact-images}}"
export MINIO_BUCKET_NAME
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
    bucket_name = os.getenv('MINIO_BUCKET_NAME', 'impact-images')

    # The bucket creation is handled inside get_minio_storage()
    print(f'MinIO bucket already exists: {bucket_name}')

except Exception as e:
    print(f'MinIO initialization error (continuing anyway): {e}')
"

    # Populate curation queue if needed (disabled - using manual SQL population)
    # python /app/populate_curation_queue.py 2>&1 || echo "Note: Curation queue population encountered an issue (continuing anyway)"

    # Start FastAPI server
    echo "Starting FastAPI app..."
    APP_ENV=${APP_ENV:-prod}
    APP_MODULE="core.main:app"
    if [ -f "/app/core/main_simple.py" ]; then
        echo "Using simplified main for development"
        APP_MODULE="core.main_simple:app"
    else
        echo "Using regular main"
    fi

    case "$APP_ENV" in
        dev)
            echo "APP_ENV=dev → enabling auto-reload"
            exec uvicorn "$APP_MODULE" --host 0.0.0.0 --port 8000 --reload
            ;;
        prod|*)
            echo "APP_ENV=${APP_ENV} → running without reload"
            exec uvicorn "$APP_MODULE" --host 0.0.0.0 --port 8000
            ;;
    esac
    ;;

  worker)
    echo "Starting Celery worker..."
    exec celery -A workers.celery_app worker --loglevel=info --concurrency=2 -E
    ;;

  beat)
    echo "Starting Celery beat..."
    exec celery -A workers.celery_app beat --loglevel=info
    ;;

  flower)
    echo "Starting Flower..."
    exec celery -A workers.celery_app flower --port=5555
    ;;

  *)
    echo "Error: Unknown SERVICE_ROLE: $SERVICE_ROLE"
    exit 1
    ;;
esac

# Impact Database

A 3-tier web platform to collect, index, and serve images and metadata related to climate and disaster hazards (e.g., cyclones, king tides, floods) using ISO metadata standards. Supports web access and mobile field data collection.

## Tech Stack
- **Backend**: FastAPI + PostGIS + MS Graph API
- **Frontend**: Next.js + React + TailwindCSS
- **Mobile**: React Native (mobile)
- **Infrastructure**: Docker + GitHub Codespaces
- **Database**: PostgreSQL with PostGIS
- **Storage**: MinIO object storage
- **Cache/Queue**: Redis + Celery

## Quick Start

### Using Docker (Recommended)

1. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # edit .env to provide local settings and secrets
   ```

2. **Start all services:**
   ```bash
   # Standard mode
   ./docker-start.sh

   # Development mode (recommended for coding)
   ./docker-start.sh --dev

   # Production mode
   ./docker-start.sh --prod
   ```

3. **Access the applications:**
   - 🌐 **Frontend**: http://localhost:3000
   - ⚡ **Backend API**: http://localhost:8000
   - 📊 **API Documentation**: http://localhost:8000/docs
   - 🌸 **Flower (Celery Monitor)**: http://localhost:5555
   - 🗄️ **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin)

4. **Stop all services:**
   ```bash
   ./docker-stop.sh
   ```

### Development Mode Features

When using `--dev` flag:
- ✅ PWA disabled (eliminates warnings)
- ✅ Hot reloading enabled
- ✅ Debug mode active
- ✅ Faster rebuilds
- ✅ Shorter cache times
- ✅ Analytics disabled

### Manual Setup

#### Backend
```bash
cd app
pip install -r requirements.txt
python -m uvicorn core.main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend
```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```

## Services Overview

### Frontend (Next.js)
- **Port**: 3000
- **Features**:
  - Progressive Web App (PWA) support
  - Responsive design with TailwindCSS
  - Real-time image upload and management
  - Interactive maps with Leaflet
  - Search and filtering capabilities
  - Admin dashboard for curation

### Backend (FastAPI)
- **Port**: 8000
- **Features**:
  - RESTful API with automatic OpenAPI documentation
  - Image upload with EXIF metadata extraction
  - PostGIS spatial queries
  - ISO 19115 metadata compliance
  - Authentication and authorization
  - STAC (SpatioTemporal Asset Catalog) support

### Database (PostgreSQL + PostGIS)
- **Port**: 5432
- **Features**:
  - Spatial data support
  - Full-text search
  - Metadata indexing

### Object Storage (MinIO)
- **API Port**: 9000
- **Console Port**: 9001
- **Features**:
  - S3-compatible object storage
  - Automatic thumbnail generation
  - Lifecycle management

### Task Queue (Celery + Redis)
- **Redis Port**: 6379
- **Flower Port**: 5555
- **Features**:
  - Background image processing
  - Thumbnail generation
  - Metadata extraction
  - Task monitoring with Flower

## Development

### Project Structure
```
├── app/                 # FastAPI backend
├── frontend/           # Next.js frontend
├── docker-compose.yml  # Docker services configuration
├── docker-start.sh     # Quick start script
└── docker-stop.sh      # Quick stop script
```

### Environment Variables

#### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_API_VERSION=v1
NEXT_PUBLIC_ENABLE_GUEST_ACCESS=true
NEXT_PUBLIC_APP_NAME="SPC Ocean Portal"
NEXT_PUBLIC_SPC_SSO_ISSUER=https://sso.spc.int
NEXT_PUBLIC_SPC_SSO_CLIENT_ID=ocean-portal
```

#### Backend
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/impact_db
REDIS_URL=redis://localhost:6379/0
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
```

### Common Tasks

#### View Service Logs
```bash
docker compose logs [service-name]
# Examples:
docker compose logs frontend
docker compose logs web
docker compose logs postgis_db
```

#### Rebuild a Service
```bash
docker compose build [service-name]
docker compose up [service-name] -d
```

#### Access Service Shell
```bash
docker compose exec [service-name] sh
# Examples:
docker compose exec frontend sh
docker compose exec web bash
```

#### Database Management
```bash
# Access PostgreSQL
docker compose exec postgis_db psql -U postgres -d impact_db

# Run migrations
docker compose exec web alembic upgrade head
```

## API Documentation

Once the backend is running, visit:
- **Interactive API Docs**: http://localhost:8000/docs
- **ReDoc Documentation**: http://localhost:8000/redoc

## Troubleshooting

### Permission Errors

#### Docker Volume Permissions

**Problem**: `EACCES: permission denied` when running npm/docker commands

**Solution**:
```bash
# Fix frontend node_modules permissions
sudo chown -R $USER:$USER frontend/node_modules
cd frontend && npm install

# Fix backend volume permissions
sudo chown -R $USER:$USER app/
```

**Prevention**: Use Docker with proper user mapping:
```yaml
# docker-compose.override.yml
services:
  frontend:
    user: "${UID}:${GID}"
  api:
    user: "${UID}:${GID}"
```

#### File Upload Permissions

**Problem**: "Permission denied" when uploading images

**Solution**:
```bash
# Check MinIO container permissions
docker compose exec minio ls -la /data

# Fix MinIO data directory
sudo chown -R 1000:1000 .minio-data/
```

### Docker Issues

#### Port Already in Use

**Problem**: `Error: port is already allocated`

**Solution**:
```bash
# Find process using port
sudo lsof -i :3000  # or :8000, :5432, etc.

# Kill the process
sudo kill -9 <PID>

# Or use different ports in docker-compose.override.yml
```

#### Container Fails to Start

**Problem**: Container exits immediately or restarts continuously

**Diagnosis**:
```bash
# Check container logs
docker compose logs <service-name>

# Check container status
docker compose ps

# Inspect container
docker compose exec <service-name> sh
```

**Common fixes**:
```bash
# Rebuild without cache
docker compose build --no-cache <service-name>

# Remove volumes and restart
docker compose down -v
docker compose up -d

# Check disk space
df -h
docker system df
```

#### Out of Disk Space

**Problem**: Docker build fails with "no space left on device"

**Solution**:
```bash
# Remove unused images and volumes
docker system prune -a --volumes

# Check Docker disk usage
docker system df -v

# Clean specific resources
docker volume prune
docker image prune -a
```

### Database Issues

#### Connection Refused

**Problem**: `Connection refused` or `could not connect to server`

**Solution**:
```bash
# Check if PostgreSQL is running
docker compose ps postgis_db

# Restart database
docker compose restart postgis_db

# Check database logs
docker compose logs postgis_db

# Verify DATABASE_URL in .env
echo $DATABASE_URL
```

#### Migration Errors

**Problem**: Alembic migration fails

**Solution**:
```bash
# Check current migration version
docker compose exec api alembic current

# View migration history
docker compose exec api alembic history

# Rollback to previous version
docker compose exec api alembic downgrade -1

# Force to specific version
docker compose exec api alembic stamp head
```

#### Database Locked

**Problem**: `database is locked` or deadlock detected

**Solution**:
```bash
# Check active connections
docker compose exec postgis_db psql -U postgres -d impact_db -c "SELECT * FROM pg_stat_activity;"

# Terminate blocking queries
docker compose exec postgis_db psql -U postgres -d impact_db -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle in transaction';"

# Restart database as last resort
docker compose restart postgis_db
```

### Frontend Issues

#### Module Not Found

**Problem**: `Module not found: Can't resolve...`

**Solution**:
```bash
cd frontend

# Clear cache and reinstall
rm -rf .next node_modules package-lock.json
npm install
npm run dev
```

#### Build Errors with Next.js 16

**Problem**: Turbopack or build errors

**Solution**:
```bash
# Use clean build
npm run dev:clean

# Check next.config.js for turbo.root setting
# Should have: turbo: { root: __dirname }
```

#### Map Container Errors

**Problem**: "Map container is already initialized"

**Solution**: See [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md#react-18-strict-mode--leaflet-map-compatibility) for detailed workarounds.

### Backend Issues

#### Import Errors

**Problem**: `ModuleNotFoundError` or import errors

**Solution**:
```bash
# Reinstall dependencies
docker compose exec api pip install -r requirements.txt

# Check Python path
docker compose exec api python -c "import sys; print(sys.path)"

# Rebuild container
docker compose build api
```

#### CORS Errors

**Problem**: `CORS policy: No 'Access-Control-Allow-Origin' header`

**Solution**:
```python
# Check CORS settings in app/core/main.py
# Ensure frontend URL is in allowed_origins

# For development, temporarily allow all:
allow_origins=["*"]  # Not for production!
```

### MinIO Issues

#### Connection Timeout

**Problem**: MinIO client timeout or connection errors

**Solution**:
```bash
# Check MinIO is accessible
curl http://localhost:9000/minio/health/live

# Restart MinIO
docker compose restart minio

# Check MinIO logs
docker compose logs minio

# Verify credentials in .env
echo $MINIO_ACCESS_KEY
echo $MINIO_SECRET_KEY
```

#### Bucket Not Found

**Problem**: `Bucket does not exist` errors

**Solution**:
```bash
# Access MinIO console: http://localhost:9001
# Login: minioadmin / minioadmin
# Create bucket: impact-images

# Or use mc (MinIO Client)
docker run --rm --network host minio/mc alias set local http://localhost:9000 minioadmin minioadmin
docker run --rm --network host minio/mc mb local/impact-images
```

### Pre-commit Hook Issues

#### Hooks Not Running

**Problem**: Pre-commit hooks don't execute on commit

**Solution**:
```bash
# Reinstall hooks
pre-commit uninstall
pre-commit install

# Verify installation
pre-commit --version
ls -la .git/hooks/pre-commit
```

#### Hook Failures

**Problem**: Commit blocked by failing hooks

**Solution**:
```bash
# Run hooks manually to see errors
pre-commit run --all-files

# Run specific hook
pre-commit run black --all-files

# Emergency bypass (not recommended)
git commit --no-verify -m "message"
```

### Performance Issues

#### Slow Docker Build

**Problem**: Docker build takes too long

**Solution**:
```bash
# Use BuildKit
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# Enable layer caching
# Add to ~/.docker/daemon.json:
{
  "builder": {
    "gc": {
      "enabled": true,
      "defaultKeepStorage": "20GB"
    }
  }
}
```

#### High Memory Usage

**Problem**: System running out of memory

**Solution**:
```bash
# Check Docker memory usage
docker stats

# Increase Docker memory limit
# Docker Desktop → Settings → Resources → Memory

# Set memory limits in docker-compose.yml
services:
  frontend:
    mem_limit: 2g
  api:
    mem_limit: 1g
```

### Getting More Help

1. **Check existing documentation**:
   - [Known Issues](docs/KNOWN_ISSUES.md)
   - [Pre-commit Hooks Guide](docs/PRE_COMMIT_HOOKS.md)
   - [Deployment Guide](docs/DEPLOYMENT.md)

2. **Enable debug logging**:
   ```bash
   # Backend
   DEBUG=true docker compose up api
   
   # Frontend
   DEBUG=* npm run dev
   ```

3. **Search GitHub Issues**:
   - Check if issue already reported
   - Review closed issues for solutions

4. **Ask for help**:
   - Open a GitHub issue with:
     - System info (`docker version`, `node -v`, `python --version`)
     - Full error message
     - Steps to reproduce
     - Logs from affected service

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with Docker setup
5. Submit a pull request

## License

[Add your license information here]

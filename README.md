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

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with Docker setup
5. Submit a pull request

## License

[Add your license information here]

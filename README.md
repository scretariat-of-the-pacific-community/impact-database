# Impact Database

Impact Database is a 3-tier system for indexing hazard-related images and metadata across Pacific Island countries. It supports ISO-compliant metadata, mobile offline uploads, and web access via Ocean Portal, built using Django, FastAPI, React, and React Native.

## Backend Setup Complete ✅

The Django backend with PostGIS support has been successfully initialized and configured:

### 🏗️ **Project Structure**
- **Django Project**: `impactdb_backend` 
- **Main App**: `hazard_images` with spatial models
- **Database**: PostgreSQL + PostGIS (via Docker)
- **Fallback**: SQLite with lat/lng fields for development

### 🗄️ **Models Implemented**
- **HazardImage**: ISO 19115 compliant metadata with spatial fields
- **SpatialTestModel**: Testing spatial functionality
- **Admin Interface**: Map widgets for spatial data management

### 🐳 **Docker Configuration**
- **Multi-container setup**: Django + PostgreSQL + PostGIS + pgAdmin
- **Automatic PostGIS initialization**: Extensions enabled on startup
- **Development ready**: Full containerized environment

### 🧪 **Testing & Verification**
- **Management command**: `python manage.py test_spatial`
- **Conditional PostGIS**: Works with/without spatial libraries
- **Database migrations**: Ready for deployment

## Quick Start

```bash
# Start with Docker (recommended)
docker-compose up --build

# Or manual setup
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Access:
- **Django Admin**: http://localhost:8000/admin/
- **API**: http://localhost:8000/
- **pgAdmin**: http://localhost:8080/

## Next Steps

1. **API Development**: Implement RESTful endpoints
2. **Frontend Integration**: React/React Native apps
3. **Image Processing**: Upload and metadata extraction
4. **Spatial Queries**: Geographic search capabilities

For detailed setup instructions, see [SETUP.md](SETUP.md).

# Impact Database Backend

This is the Django backend for the Impact Database, a 3-tier system for indexing hazard-related images and metadata across Pacific Island countries. The backend supports ISO-compliant metadata, spatial queries via PostGIS, and RESTful API access.

## Features

- **PostGIS Integration**: Full spatial database support for geographic queries
- **ISO 19115 Compliance**: Metadata structure follows international standards
- **Hazard Image Management**: Store and index disaster-related imagery
- **Spatial Operations**: Point and polygon spatial data support
- **Docker Support**: Containerized development environment
- **Admin Interface**: Django admin with spatial map widgets

## Quick Start with Docker

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd impact-database
   ```

2. **Build and start the containers**:
   ```bash
   docker-compose up --build
   ```

3. **Access the application**:
   - Django Admin: http://localhost:8000/admin/ (admin/admin123)
   - API: http://localhost:8000/
   - pgAdmin: http://localhost:8080/ (admin@impactdb.com/admin123)

## Manual Setup

### Prerequisites

- Python 3.12+
- PostgreSQL 14+ with PostGIS extension
- GDAL, GEOS, and PROJ libraries

### Installation

1. **Install Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

3. **Set up PostgreSQL with PostGIS**:
   ```sql
   CREATE DATABASE impactdb;
   CREATE EXTENSION postgis;
   ```

4. **Run migrations**:
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   ```

5. **Create superuser**:
   ```bash
   python manage.py createsuperuser
   ```

6. **Start development server**:
   ```bash
   python manage.py runserver
   ```

## Project Structure

```
impactdb_backend/
├── impactdb_backend/          # Django project settings
│   ├── settings.py           # Main configuration
│   ├── urls.py              # URL routing
│   └── wsgi.py              # WSGI application
├── hazard_images/            # Main Django app
│   ├── models.py            # Data models (HazardImage, SpatialTestModel)
│   ├── admin.py             # Admin interface
│   ├── views.py             # API views (to be implemented)
│   └── migrations/          # Database migrations
├── requirements.txt          # Python dependencies
├── Dockerfile               # Docker container configuration
├── docker-compose.yml       # Multi-container setup
├── init-postgis.sql         # PostGIS initialization
└── .env.example             # Environment variables template
```

## Models

### HazardImage

The main model for storing hazard-related images with spatial metadata:

- **Spatial Fields**: `location` (PointField), `coverage_area` (PolygonField)
- **Temporal Fields**: `date_captured`, `date_uploaded`
- **Metadata Fields**: `hazard_type`, `severity_level`, `source`
- **ISO 19115 Compliance**: Structured metadata following international standards

### SpatialTestModel

A simple model for testing PostGIS functionality:

- **Spatial Fields**: `point` (PointField), `polygon` (PolygonField)
- **Test Operations**: Spatial queries, distance calculations, area operations

## Spatial Functionality

The application supports various PostGIS operations:

- **Point-in-polygon queries**: Find images within a specific area
- **Distance calculations**: Find images within X km of a point
- **Spatial indexing**: Optimized queries on geographic data
- **Coordinate transformations**: Support for different projection systems

## Configuration

### Environment Variables

Key configuration options (see `.env.example`):

- `DATABASE_*`: PostgreSQL connection settings
- `SECRET_KEY`: Django secret key (change in production)
- `DEBUG`: Development mode toggle
- `ALLOWED_HOSTS`: Allowed hostnames
- `CORS_ALLOWED_ORIGINS`: Frontend origins for API access

### PostGIS Settings

The application is configured to use PostGIS as the spatial database backend:

- **Engine**: `django.contrib.gis.db.backends.postgis`
- **Default CRS**: EPSG:4326 (WGS84)
- **Spatial Index**: Automatically created for spatial fields

## Development

### Adding New Models

1. Create models in `hazard_images/models.py`
2. Use `django.contrib.gis.db.models` for spatial fields
3. Run `python manage.py makemigrations`
4. Run `python manage.py migrate`

### Testing Spatial Functionality

Use the Django shell to test spatial operations:

```python
python manage.py shell

from django.contrib.gis.geos import Point, Polygon
from hazard_images.models import SpatialTestModel

# Create a test point
point = Point(179.0, -17.0)  # Longitude, Latitude
test_obj = SpatialTestModel.objects.create(name="Test Location", point=point)

# Perform spatial queries
nearby = SpatialTestModel.objects.filter(point__dwithin=(point, 0.1))
```

## Production Deployment

1. **Security**: Change `SECRET_KEY` and set `DEBUG=False`
2. **Database**: Use managed PostgreSQL with PostGIS
3. **Static Files**: Configure proper static file serving
4. **Environment**: Use proper environment variable management
5. **CORS**: Configure specific allowed origins

## API Endpoints (To Be Implemented)

- `GET /api/hazard-images/`: List hazard images
- `POST /api/hazard-images/`: Upload new hazard image
- `GET /api/hazard-images/spatial/`: Spatial queries (within area, near point)
- `GET /api/metadata/`: ISO 19115 metadata endpoints

## Troubleshooting

### PostGIS Installation Issues

If you encounter PostGIS-related errors:

1. Ensure PostGIS is installed: `SELECT PostGIS_Version();`
2. Check GDAL/GEOS library paths in environment variables
3. Verify PostGIS extension is enabled: `CREATE EXTENSION postgis;`

### Docker Issues

- **Container build fails**: Check Docker daemon and network connectivity
- **Database connection fails**: Ensure PostgreSQL container is healthy
- **PostGIS not available**: Verify init-postgis.sql script execution

### Performance

- Enable spatial indexing on frequently queried fields
- Use appropriate spatial reference systems for your region
- Consider partitioning for large datasets

## License

[Add your license information here]

## Contributing

[Add contribution guidelines here]
# Pacific Impact Database - Docker Setup

## Quick Start

### 1. Prerequisites

- Docker and Docker Compose installed
- At least 4GB of available RAM
- Ports 8000, 5432, 6379, 9000, 9001, 5555 available

### 2. Start the Application

```bash
# Clone and navigate to the repository
git clone <repository-url>
cd impact-database

# Start all services
./run_docker.sh start
```

The startup script will automatically:

- Build all Docker images
- Start all services with health checks
- Initialize the database
- Create MinIO buckets
- Run database migrations

### 3. Access the Application

Once started, you can access:

| Service | URL | Credentials |
|---------|-----|-------------|
| **API Documentation** | <http://localhost:8000/docs> | - |
| **Health Check** | <http://localhost:8000/health> | - |
| **STAC API** | <http://localhost:8000/stac> | - |
| **OGC API** | <http://localhost:8000/ogc> | - |
| **GraphQL** | <http://localhost:8000/graphql> | - |
| **MinIO Console** | <http://localhost:9001> | admin/minioadmin |
| **Celery Flower** | <http://localhost:5555> | - |

## Detailed Setup

### Manual Docker Compose

If you prefer to use Docker Compose directly:

```bash
# Build and start services
docker-compose up --build -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f web

# Stop services
docker-compose down
```

### Environment Configuration

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Modify `.env` for your environment:

```bash
# Production settings
ENVIRONMENT=production
DEBUG=false
SECRET_KEY=your-production-secret-key

# Custom database
DATABASE_URL=postgresql://user:pass@host:port/dbname

# Custom MinIO
MINIO_ENDPOINT=your-minio-host:9000
MINIO_ACCESS_KEY=your-access-key
MINIO_SECRET_KEY=your-secret-key
```

## Services Architecture

The application consists of the following services:

### Core Services

- **web**: FastAPI application server
- **postgis_db**: PostgreSQL database with PostGIS
- **redis**: Redis for caching and task queue
- **minio**: Object storage for images

### Background Services

- **celery_worker**: Background task processing
- **celery_beat**: Scheduled task execution
- **flower**: Celery monitoring interface

## Management Commands

### Using the Helper Script

```bash
# Start all services
./run_docker.sh start

# Stop all services
./run_docker.sh stop

# Restart services
./run_docker.sh restart

# Check service status
./run_docker.sh status

# View logs (all services)
./run_docker.sh logs

# View logs (specific service)
./run_docker.sh logs web

# Run tests
./run_docker.sh test

# Clean up containers and images
./run_docker.sh cleanup

# Open shell in web container
./run_docker.sh shell
```

### Direct Docker Compose Commands

```bash
# Build specific service
docker-compose build web

# Restart specific service
docker-compose restart web

# View service logs
docker-compose logs -f web

# Execute commands in container
docker-compose exec web bash
docker-compose exec web python manage.py shell

# Scale services
docker-compose up -d --scale celery_worker=3
```

## Database Management

### Migrations

```bash
# Run migrations
docker-compose exec web python -c "
from alembic import command
from alembic.config import Config
alembic_cfg = Config('/app/alembic.ini')
command.upgrade(alembic_cfg, 'head')
"

# Create new migration
docker-compose exec web alembic revision --autogenerate -m "Description"
```

### Database Access

```bash
# Connect to PostgreSQL
docker-compose exec postgis_db psql -U postgres -d impact_db

# Backup database
docker-compose exec postgis_db pg_dump -U postgres impact_db > backup.sql

# Restore database
docker-compose exec -T postgis_db psql -U postgres impact_db < backup.sql
```

## Development Workflow

### Code Changes

The application supports hot reloading for development:

1. Make changes to code in `./app/`
2. Changes are automatically reflected (volume mounted)
3. FastAPI will reload automatically when files change

### Adding Dependencies

1. Update `app/requirements.txt`

2. Rebuild the container:

```bash
docker-compose build web
docker-compose up -d web
```

### Running Tests

```bash
# Run all tests
./run_docker.sh test

# Run specific test suites
docker-compose exec web python -m pytest tests/
docker-compose exec web ./test_stac_ogc_apis.sh
docker-compose exec web ./test_admin_features.sh
```

## Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure ports 8000, 5432, 6379, 9000, 9001, 5555 are available
2. **Memory issues**: Ensure Docker has at least 4GB RAM allocated
3. **Permission issues**: Ensure Docker daemon is running and accessible

### Service Health Checks

```bash
# Check all service health
docker-compose ps

# Check specific service logs
docker-compose logs web
docker-compose logs postgis_db
docker-compose logs redis
docker-compose logs minio

# Check application health
curl http://localhost:8000/health
```

### Database Connection Issues

```bash
# Check if database is ready
docker-compose exec postgis_db pg_isready -U postgres

# Check database connections
docker-compose exec web python -c "
from models.database import engine
print('Database connection:', engine.connect())
"
```

### MinIO Issues

```bash
# Check MinIO health
curl http://localhost:9000/minio/health/live

# Access MinIO console
open http://localhost:9001

# Check bucket creation
docker-compose exec web python -c "
from services.minio_client import get_minio_client
client = get_minio_client()
print('Buckets:', list(client.list_buckets()))
"
```

## Production Deployment

### Security Considerations

1. Change default passwords:

```bash
# PostgreSQL
POSTGRES_PASSWORD=secure-random-password

# MinIO
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=secure-random-password

# Application
SECRET_KEY=cryptographically-secure-random-key
```

2. Use HTTPS:

```bash
MINIO_SECURE=true
MINIO_USE_SSL=true
```

3. Network Security:

```bash
# Remove port mappings for internal services
# Use reverse proxy for external access
```

### Resource Limits

Add resource limits in `docker-compose.yml`:

```yaml
services:
  web:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### Monitoring

Enable monitoring services:

```yaml
services:
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    
  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
```

## API Documentation

Once running, comprehensive API documentation is available at:

- **Swagger UI**: <http://localhost:8000/docs>
- **ReDoc**: <http://localhost:8000/redoc>
- **OpenAPI JSON**: <http://localhost:8000/openapi.json>

## Support

For issues and questions:

1. Check the logs: `./run_docker.sh logs`
2. Verify service health: `./run_docker.sh status`
3. Run tests: `./run_docker.sh test`
4. Check the GitHub repository issues

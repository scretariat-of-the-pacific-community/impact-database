# 🚀 Impact Database Application - Run Guide

## Overview

The Impact Database is a comprehensive application with:
- **Backend**: FastAPI with robust MinIO storage and Celery background tasks
- **Frontend**: Next.js React application
- **Database**: PostgreSQL with PostGIS extension
- **Storage**: MinIO object storage
- **Cache/Queue**: Redis
- **Monitoring**: Flower (Celery monitoring)

## 📋 Quick Start (Recommended)

### 1. Start the Infrastructure Services First

Start Redis, MinIO, and PostgreSQL:

```bash
cd /home/kishank/impact-database
docker compose up -d postgis_db redis minio
```

Wait for services to be ready (about 30 seconds), then verify:

```bash
docker compose ps
```

### 2. Start the Application Services

Start the backend API, Celery worker, and frontend:

```bash
docker compose up web celery frontend flower
```

### 3. Access the Application

Once running, access these URLs:

- **🌐 Frontend Application**: http://localhost:3000
- **⚡ Backend API**: http://localhost:8000
- **📚 API Documentation**: http://localhost:8000/docs
- **📊 Celery Monitoring (Flower)**: http://localhost:5555
- **🗃️ MinIO Console**: http://localhost:9011 (admin/minioadmin)

## 🛠️ Alternative: Run Everything at Once

If you want to start everything together:

```bash
docker compose up
```

This will start all services but may take longer and show more logs.

## 🔧 Development Mode (Local Development)

For development with hot reloading:

### Backend Development:

```bash
# 1. Start infrastructure services
docker compose up -d postgis_db redis minio

# 2. Run backend locally
cd app
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m core.main

# 3. Run Celery worker (separate terminal)
celery -A workers.celery_app worker --loglevel=info
```

### Frontend Development:

```bash
cd frontend
npm install
npm run dev
```

## 📊 Service Ports

| Service | Port | Access URL | Purpose |
|---------|------|------------|---------|
| Frontend | 3000 | http://localhost:3000 | Main web application |
| Backend API | 8000 | http://localhost:8000 | FastAPI REST API |
| PostgreSQL | 5432 | localhost:5432 | Database |
| Redis | 6379 | localhost:6379 | Cache/Queue |
| MinIO API | 9010 | localhost:9010 | Object storage |
| MinIO Console | 9011 | http://localhost:9011 | Storage management |
| Flower | 5555 | http://localhost:5555 | Celery monitoring |

## 🐛 Troubleshooting

### Docker Issues:

If you encounter Docker build issues:

```bash
# Reset Docker buildx
docker buildx rm --all
docker buildx create --use --bootstrap

# Or use legacy builder
DOCKER_BUILDKIT=0 docker compose up --build
```

### Port Conflicts:

If ports are already in use:

```bash
# Check what's using the ports
sudo netstat -tulpn | grep :3000
sudo netstat -tulpn | grep :8000

# Kill processes using the ports if needed
sudo fuser -k 3000/tcp
sudo fuser -k 8000/tcp
```

### Database Issues:

If database connection fails:

```bash
# Reset database
docker compose down -v  # This removes volumes!
docker compose up postgis_db
```

### MinIO Issues:

If MinIO storage fails:

```bash
# Check MinIO health
curl -I http://localhost:9010/minio/health/live

# Access MinIO console at http://localhost:9011
# Default credentials: minioadmin / minioadmin
```

## 🧪 Testing the Application

### 1. Basic Health Check:

```bash
# Test API health
curl http://localhost:8000/health

# Test frontend
curl http://localhost:3000
```

### 2. Run Comprehensive Tests:

```bash
cd app

# Run robustness tests (requires services running)
MINIO_ENDPOINT=localhost:9010 python test_robustness.py

# Run end-to-end upload test
python test_e2e_upload.py
```

### 3. Upload Test Image:

```bash
# Upload a test image
curl -X POST "http://localhost:8000/api/v1/upload" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@app/hazard_test_images/flood_1.jpg" \
  -F "hazard_type=flood" \
  -F "location=test-location" \
  -F "country=test-country"
```

## 📈 Monitoring and Logs

### View Service Logs:

```bash
# All services
docker compose logs

# Specific service
docker compose logs web
docker compose logs celery
docker compose logs frontend

# Follow logs in real-time
docker compose logs -f web
```

### Check Service Health:

```bash
# Service status
docker compose ps

# Resource usage
docker stats

# Check robust deployment status
./verify_deployment.sh
```

## 🔐 Security Notes

The current setup uses **development credentials**. For production:

1. **Change all default passwords** in `.env`
2. **Set `ENVIRONMENT=production`**
3. **Use proper SSL certificates**
4. **Configure firewall rules**
5. **Review security checklist**: `DEPLOYMENT_SECURITY_CHECKLIST.md`

## 📂 Key Files

- `docker-compose.yml` - Main orchestration
- `.env` - Environment configuration
- `app/` - FastAPI backend
- `frontend/` - Next.js frontend
- `ROBUST_DEPLOYMENT_COMPLETE.md` - Production deployment guide
- `verify_deployment.sh` - Health check script

## 🆘 Getting Help

1. **Check logs** first: `docker compose logs [service-name]`
2. **Review documentation** in the project root
3. **Run health checks**: `./verify_deployment.sh`
4. **Test robustness**: `cd app && python test_robustness.py`

## 🎯 Next Steps

1. **Upload images** via the web interface at http://localhost:3000
2. **View API documentation** at http://localhost:8000/docs
3. **Monitor background tasks** at http://localhost:5555
4. **Manage storage** at http://localhost:9011

The application is now ready for use! 🚀

# MVP Deployment Guide

## Overview
This guide covers deploying the Impact Database MVP to a production environment. The application uses Docker Compose for orchestration with PostgreSQL+PostGIS, Redis, MinIO, Celery workers, and Next.js frontend.

---

## Prerequisites

### Server Requirements
- **OS**: Ubuntu 20.04+ or Debian 11+
- **RAM**: Minimum 4GB (8GB recommended)
- **Storage**: 50GB+ SSD
- **CPU**: 2+ cores
- **Ports**: 80, 443, 5432, 6379 (internal), 9000 (internal)

### Software Dependencies
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Verify installations
docker --version
docker compose version
```

### Domain & DNS
- Domain name pointed to your server IP
- SSL certificate (Let's Encrypt recommended)

---

## 1. Clone Repository

```bash
# Clone the repository
git clone https://github.com/kishkumar96/impact-database.git
cd impact-database

# Checkout production branch (or main after PR merge)
git checkout upgrade/nextjs-16-remove-sentry
```

---

## 2. Environment Configuration

### Backend Environment (.env in /app)

Create `/app/.env`:

```bash
# Database Configuration
POSTGRES_USER=impact_admin
POSTGRES_PASSWORD=<STRONG_PASSWORD_HERE>
POSTGRES_DB=impact_database
POSTGRES_HOST=postgis_db
POSTGRES_PORT=5432

# Redis Configuration
REDIS_URL=redis://redis:6379/0

# MinIO Configuration (S3-compatible storage)
MINIO_ROOT_USER=minio_admin
MINIO_ROOT_PASSWORD=<STRONG_PASSWORD_HERE>
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=<GENERATE_ACCESS_KEY>
MINIO_SECRET_KEY=<GENERATE_SECRET_KEY>
MINIO_BUCKET_NAME=impact-images
MINIO_USE_SSL=false

# Email Configuration (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=<your-email@gmail.com>
SMTP_PASSWORD=<app-specific-password>
SMTP_FROM_EMAIL=<your-email@gmail.com>
SMTP_FROM_NAME="Impact Database"

# Security
SECRET_KEY=<GENERATE_STRONG_SECRET_KEY_64_CHARS>
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Application Settings
ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=INFO

# Celery Configuration
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0
```

### Frontend Environment (/frontend/.env.local)

Create `/frontend/.env.local`:

```bash
# API Configuration
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com

# MinIO/S3 Configuration (for direct uploads)
NEXT_PUBLIC_MINIO_ENDPOINT=https://storage.yourdomain.com
NEXT_PUBLIC_MINIO_BUCKET=impact-images

# Google Maps API (optional for map features)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<your-maps-api-key>

# Analytics (optional)
NEXT_PUBLIC_ENABLE_ANALYTICS=true

# Environment
NODE_ENV=production
```

### Generate Secure Secrets

```bash
# Generate SECRET_KEY (64 characters)
openssl rand -hex 32

# Generate MinIO credentials
openssl rand -base64 32

# Generate PostgreSQL password
openssl rand -base64 24
```

---

## 3. SSL/HTTPS Setup

### Option A: Let's Encrypt with Nginx

Create `/nginx/nginx.conf`:

```nginx
upstream api_backend {
    server api:8000;
}

upstream frontend {
    server frontend:3000;
}

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Frontend
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # API
    location /api/ {
        proxy_pass http://api_backend/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts for upload
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
        client_max_body_size 100M;
    }
}
```

Add to `docker-compose.prod.yml`:

```yaml
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certbot/conf:/etc/letsencrypt:ro
      - ./certbot/www:/var/www/certbot:ro
    depends_on:
      - frontend
      - api
    restart: unless-stopped

  certbot:
    image: certbot/certbot
    volumes:
      - ./certbot/conf:/etc/letsencrypt
      - ./certbot/www:/var/www/certbot
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"
```

Generate initial certificate:

```bash
# Create directories
mkdir -p certbot/conf certbot/www

# Get certificate
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email \
  -d yourdomain.com -d www.yourdomain.com
```

---

## 4. Database Initialization

```bash
# Start database service only
docker compose -f docker-compose.prod.yml up -d postgis_db

# Wait for database to be ready
sleep 10

# Run migrations
docker compose -f docker-compose.prod.yml run --rm api alembic upgrade head

# Create initial admin user (optional)
docker compose -f docker-compose.prod.yml run --rm api python -c "
from models.database import SessionLocal
from models.rbac import User
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')
db = SessionLocal()

admin = User(
    username='admin',
    email='admin@yourdomain.com',
    hashed_password=pwd_context.hash('CHANGE_THIS_PASSWORD'),
    role='admin',
    is_active=True
)
db.add(admin)
db.commit()
print('Admin user created!')
"
```

---

## 5. Production Deployment

### Update docker-compose.prod.yml

Key production configurations:

```yaml
version: '3.8'

services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      target: production
    environment:
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  api:
    build:
      context: ./app
      dockerfile: Dockerfile
    command: uvicorn core.main:app --host 0.0.0.0 --port 8000 --workers 4
    environment:
      - ENVIRONMENT=production
      - DEBUG=false
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  postgis_db:
    image: postgis/postgis:15-3.3
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 20s
      retries: 3

  celery_worker:
    build:
      context: ./app
      dockerfile: Dockerfile
    command: celery -A core.celery_app worker --loglevel=info
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "celery -A core.celery_app inspect ping"]
      interval: 30s
      timeout: 10s
      retries: 3

  celery_beat:
    build:
      context: ./app
      dockerfile: Dockerfile
    command: celery -A core.celery_app beat --loglevel=info
    restart: unless-stopped

  flower:
    build:
      context: ./app
      dockerfile: Dockerfile
    command: celery -A core.celery_app flower --port=5555
    ports:
      - "127.0.0.1:5555:5555"  # Only accessible locally
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

### Deploy

```bash
# Build and start all services
docker compose -f docker-compose.prod.yml up -d --build

# Monitor logs
docker compose -f docker-compose.prod.yml logs -f

# Check service health
docker compose -f docker-compose.prod.yml ps
```

---

## 6. Post-Deployment Verification

### Health Checks

```bash
# API Health
curl https://api.yourdomain.com/health

# Frontend Health
curl https://yourdomain.com/api/health

# Database Connection
docker compose -f docker-compose.prod.yml exec api python -c "
from models.database import engine
from sqlalchemy import text
with engine.connect() as conn:
    result = conn.execute(text('SELECT version()')).fetchone()
    print(f'Database: {result[0]}')
"

# Redis Connection
docker compose -f docker-compose.prod.yml exec redis redis-cli ping

# MinIO Connection
docker compose -f docker-compose.prod.yml exec api python -c "
from minio import Minio
import os
client = Minio(
    os.getenv('MINIO_ENDPOINT'),
    os.getenv('MINIO_ACCESS_KEY'),
    os.getenv('MINIO_SECRET_KEY'),
    secure=False
)
print(f'Buckets: {[b.name for b in client.list_buckets()]}')
"

# Email Configuration
docker compose -f docker-compose.prod.yml exec api python -c "
from core.celery_tasks import send_email_task
result = send_email_task.delay(
    'admin@yourdomain.com',
    'Test Email',
    'If you receive this, email is configured correctly!'
)
print(f'Email task: {result.id}')
"
```

### Functional Tests

1. **User Registration**
   - Visit https://yourdomain.com/auth/register
   - Create a test account
   - Verify email delivery

2. **Image Upload**
   - Login and navigate to upload page
   - Upload a test image with EXIF data
   - Verify metadata extraction

3. **Analytics Dashboard**
   - Check analytics page loads
   - Verify charts render correctly

4. **Tutorial System**
   - Click help button
   - Verify tutorial overlay works
   - Test interactive checkpoints

---

## 7. Monitoring & Maintenance

### Setup Log Rotation

Create `/etc/logrotate.d/docker-containers`:

```
/var/lib/docker/containers/*/*.log {
    rotate 7
    daily
    compress
    size=50M
    missingok
    delaycompress
    copytruncate
}
```

### Backup Strategy

```bash
# Database Backup Script
cat > /root/backup-database.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/postgres"
mkdir -p $BACKUP_DIR

docker compose -f /path/to/docker-compose.prod.yml exec -T postgis_db \
  pg_dump -U impact_admin impact_database | gzip > \
  $BACKUP_DIR/impact_db_$DATE.sql.gz

# Keep last 30 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
EOF

chmod +x /root/backup-database.sh

# Add to crontab
echo "0 2 * * * /root/backup-database.sh" | crontab -
```

### Monitoring with Docker Stats

```bash
# Real-time stats
docker stats

# Setup alerting (example with simple script)
cat > /root/monitor.sh << 'EOF'
#!/bin/bash
docker compose -f /path/to/docker-compose.prod.yml ps --format json | \
  jq -r '.[] | select(.Health != "healthy") | "Service \(.Service) is \(.Health)"'
EOF
```

---

## 8. Troubleshooting

### Service Won't Start

```bash
# Check logs
docker compose -f docker-compose.prod.yml logs service_name

# Check disk space
df -h

# Check memory
free -h

# Restart specific service
docker compose -f docker-compose.prod.yml restart service_name
```

### Database Connection Issues

```bash
# Test connection from API container
docker compose -f docker-compose.prod.yml exec api python -c "
from sqlalchemy import create_engine, text
import os
engine = create_engine(os.getenv('DATABASE_URL'))
with engine.connect() as conn:
    result = conn.execute(text('SELECT 1')).fetchone()
    print('Database connected!' if result else 'Connection failed')
"

# Check PostgreSQL logs
docker compose -f docker-compose.prod.yml logs postgis_db
```

### Upload Failures

```bash
# Check MinIO logs
docker compose -f docker-compose.prod.yml logs minio

# Verify bucket exists
docker compose -f docker-compose.prod.yml exec api python -c "
from minio import Minio
import os
client = Minio(os.getenv('MINIO_ENDPOINT'), os.getenv('MINIO_ACCESS_KEY'), os.getenv('MINIO_SECRET_KEY'), secure=False)
if not client.bucket_exists('impact-images'):
    client.make_bucket('impact-images')
    print('Bucket created')
else:
    print('Bucket exists')
"

# Check file permissions
docker compose -f docker-compose.prod.yml exec api ls -la /app/uploads
```

### Email Not Sending

```bash
# Test Celery worker
docker compose -f docker-compose.prod.yml logs celery_worker

# Check Redis connection
docker compose -f docker-compose.prod.yml exec celery_worker python -c "
from redis import Redis
import os
r = Redis.from_url(os.getenv('CELERY_BROKER_URL'))
print('Redis ping:', r.ping())
"

# Test SMTP settings
docker compose -f docker-compose.prod.yml exec api python -c "
import smtplib, os
server = smtplib.SMTP(os.getenv('SMTP_HOST'), int(os.getenv('SMTP_PORT')))
server.starttls()
server.login(os.getenv('SMTP_USERNAME'), os.getenv('SMTP_PASSWORD'))
print('SMTP connection successful')
server.quit()
"
```

### High Memory Usage

```bash
# Check container stats
docker stats --no-stream

# Limit API workers
# In docker-compose.prod.yml, change:
command: uvicorn core.main:app --host 0.0.0.0 --port 8000 --workers 2

# Restart services
docker compose -f docker-compose.prod.yml restart api
```

### SSL Certificate Issues

```bash
# Renew certificate manually
docker compose -f docker-compose.prod.yml run --rm certbot renew

# Check certificate expiry
openssl x509 -in certbot/conf/live/yourdomain.com/cert.pem -text -noout | grep "Not After"

# Test SSL configuration
docker compose -f docker-compose.prod.yml exec nginx nginx -t
```

---

## 9. Security Hardening

### Firewall Configuration

```bash
# Setup UFW
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw enable
```

### Docker Security

```bash
# Run containers as non-root user (add to Dockerfile)
USER nobody

# Enable Docker security scanning
docker scan impact-database-api
```

### Environment Security

```bash
# Secure .env files
chmod 600 app/.env frontend/.env.local

# Use secrets management (Docker Swarm or Kubernetes)
# For Docker Swarm:
docker secret create db_password ./db_password.txt
```

---

## 10. Performance Optimization

### Database Indexing

```sql
-- Create indexes for common queries
CREATE INDEX idx_images_hazard ON image_metadata(hazard_type);
CREATE INDEX idx_images_location ON image_metadata USING GIST(location);
CREATE INDEX idx_images_created ON image_metadata(created_at DESC);
CREATE INDEX idx_users_username ON users(username);
```

### Redis Caching

```python
# Verify cache hit rates
docker compose -f docker-compose.prod.yml exec redis redis-cli INFO stats
```

### Frontend Optimization

```bash
# Build with production optimizations
cd frontend
npm run build

# Verify bundle size
npm run analyze
```

---

## 11. Scaling Considerations

### Horizontal Scaling

For higher traffic, consider:

1. **Load Balancer**: Add Nginx upstream with multiple API instances
2. **Read Replicas**: PostgreSQL read replicas for analytics
3. **CDN**: CloudFlare or AWS CloudFront for static assets
4. **Object Storage**: Migrate from MinIO to AWS S3/Azure Blob

### Vertical Scaling

```yaml
# Increase container resources
services:
  api:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
```

---

## 12. Rollback Procedure

```bash
# Stop current deployment
docker compose -f docker-compose.prod.yml down

# Checkout previous version
git log --oneline -10
git checkout <previous-commit-hash>

# Restore database backup (if needed)
gunzip < /backups/postgres/impact_db_YYYYMMDD_HHMMSS.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgis_db \
  psql -U impact_admin impact_database

# Deploy previous version
docker compose -f docker-compose.prod.yml up -d --build

# Verify rollback
curl https://yourdomain.com/api/health
```

---

## Support & Resources

- **GitHub**: https://github.com/kishkumar96/impact-database
- **Issues**: https://github.com/kishkumar96/impact-database/issues
- **Docker Docs**: https://docs.docker.com
- **FastAPI Docs**: https://fastapi.tiangolo.com
- **Next.js Docs**: https://nextjs.org/docs

---

## Deployment Checklist

- [ ] Server provisioned with required specs
- [ ] Docker and Docker Compose installed
- [ ] Domain DNS configured
- [ ] SSL certificate obtained
- [ ] Environment files created and secured
- [ ] Database initialized and migrated
- [ ] Admin user created
- [ ] All services started and healthy
- [ ] Health checks passing
- [ ] Functional tests completed
- [ ] Backup script configured
- [ ] Monitoring setup
- [ ] Firewall configured
- [ ] Security hardening applied
- [ ] Documentation reviewed
- [ ] Team notified of deployment

---

*Last Updated: January 5, 2026*
*Version: 1.0 (MVP)*

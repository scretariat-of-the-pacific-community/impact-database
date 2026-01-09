# Pacific Impact Database - Production Deployment Guide

## 📋 Prerequisites

- Docker Engine 24.0+ with BuildKit enabled
- Docker Compose 2.20+
- Domain name with DNS configured (for HTTPS)
- Minimum server specs:
  - 4 CPU cores
  - 8GB RAM
  - 50GB storage (+ additional for uploads)

## 🚀 Quick Start

### 1. Prepare Production Environment

```bash
# Clone repository
git clone https://github.com/kishkumar96/impact-database.git
cd impact-database

# Copy production environment template
cp .env.production.example .env.production

# Generate strong secrets
python3 -c "import secrets; print(f'SECRET_KEY={secrets.token_urlsafe(64)}')" >> .env.production
python3 -c "import secrets; print(f'POSTGRES_PASSWORD={secrets.token_urlsafe(32)}')" >> .env.production
python3 -c "import secrets; print(f'MINIO_ROOT_PASSWORD={secrets.token_urlsafe(32)}')" >> .env.production
```

### 2. Configure Environment Variables

Edit `.env.production` and update:

```bash
# Required: Update these values
POSTGRES_PASSWORD=<generated-above>
SECRET_KEY=<generated-above>
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=<generated-above>

# Update with your domain
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_API_URL_INTERNAL=http://api:8000

# Update email settings (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

### 3. Build and Deploy

```bash
# Run deployment script
chmod +x deploy_production.sh
./deploy_production.sh

# Or manually:
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production up -d
```

### 4. Initialize Database

```bash
# Run migrations
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api alembic upgrade head

# Create admin user (optional)
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api python create_admin_user.py
```

### 5. Verify Deployment

```bash
# Check all services are running
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

# Check API health
curl http://localhost:8000/health

# Check frontend
curl http://localhost:3000

# View logs
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f
```

## 🔒 Security Configuration

### SSL/TLS Setup (Required for Production)

Use a reverse proxy (Nginx/Caddy) or load balancer to handle SSL:

#### Option 1: Caddy (Automatic HTTPS)

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy

# Configure Caddyfile
sudo nano /etc/caddy/Caddyfile
```

Add:
```
api.yourdomain.com {
    reverse_proxy localhost:8000
}

yourdomain.com {
    reverse_proxy localhost:3000
}
```

```bash
# Restart Caddy
sudo systemctl restart caddy
```

#### Option 2: Nginx with Let's Encrypt

```bash
# Install Nginx and Certbot
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

# Configure Nginx
sudo nano /etc/nginx/sites-available/impact-database
```

Add:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 100M;
    }
}
```

```bash
# Enable site and get SSL certificate
sudo ln -s /etc/nginx/sites-available/impact-database /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com -d api.yourdomain.com
```

### Firewall Configuration

```bash
# UFW (Ubuntu)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable

# Close direct access to application ports
# (only allow through reverse proxy)
```

## 📊 Monitoring & Maintenance

### View Logs

```bash
# All services
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f frontend

# Celery task monitoring (Flower)
# Access at http://localhost:5555 (secure this in production!)
```

### Database Backup

```bash
# Create backup
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec postgis_db pg_dump -U postgres impact_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgis_db psql -U postgres impact_db < backup_20260109_123456.sql
```

### Update Application

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Run migrations
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api alembic upgrade head
```

### Resource Monitoring

```bash
# Check resource usage
docker stats

# Check disk space
df -h
docker system df
```

## 🔧 Troubleshooting

### Service Won't Start

```bash
# Check logs
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs <service-name>

# Check service health
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

### Database Connection Issues

```bash
# Test database connection
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api python -c "from app.database import engine; engine.connect()"

# Check PostgreSQL logs
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs postgis_db
```

### Out of Memory

```bash
# Check current memory usage
docker stats --no-stream

# Adjust memory limits in docker-compose.prod.yml
# Restart services
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart
```

### Disk Space Issues

```bash
# Clean unused Docker resources
docker system prune -a --volumes

# Remove old images
docker image prune -a

# Check upload storage
du -sh ./uploads/
```

## 🔄 CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /opt/impact-database
            git pull origin main
            docker compose -f docker-compose.yml -f docker-compose.prod.yml build
            docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
            docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T api alembic upgrade head
```

## 📈 Performance Optimization

### Enable Docker BuildKit

```bash
# Add to ~/.bashrc or ~/.zshrc
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
```

### Use Build Cache

```bash
# Build with cache
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --build-arg BUILDKIT_INLINE_CACHE=1
```

### Database Tuning

```bash
# Increase shared_buffers and work_mem for PostgreSQL
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec postgis_db psql -U postgres -c "ALTER SYSTEM SET shared_buffers = '512MB';"
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec postgis_db psql -U postgres -c "ALTER SYSTEM SET work_mem = '16MB';"
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart postgis_db
```

## 📞 Support

For issues and support:
- GitHub Issues: https://github.com/kishkumar96/impact-database/issues
- Documentation: https://github.com/kishkumar96/impact-database/tree/main/docs

## 📝 License

See LICENSE file for details.

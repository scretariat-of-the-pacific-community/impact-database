# Security Improvements Implemented

## Overview
This document outlines the security enhancements made to the Impact Database application to address production security concerns.

## Changes Made

### 1. **Celery Worker - Non-Root User** ✅
**Issue**: Celery was running as root (uid=0), which is a significant security risk.

**Solution**:
- Enabled `USER appuser` in the Dockerfile (production stage)
- Application now runs as non-root user `appuser` (created in Dockerfile)
- All necessary files and directories have proper ownership set

**Files Modified**:
- `app/Dockerfile`: Uncommented USER appuser directive and set proper permissions

### 2. **API Documentation - Production Security** ✅
**Issue**: API documentation endpoints (/docs, /redoc) were enabled in production, exposing API structure.

**Solution**:
- Changed `ENABLE_API_DOCS` default from `true` to `false`
- Added automatic disabling in production environment
- Updated field validator to force-disable docs in production (not just warn)
- Updated main.py to use `settings.ENABLE_API_DOCS` instead of `settings.DEBUG`

**Files Modified**:
- `app/core/config.py`: Updated ENABLE_API_DOCS field and validator
- `app/core/main.py`: Changed docs_url/redoc_url to use ENABLE_API_DOCS

**Environment Variable**:
```bash
ENABLE_API_DOCS=false  # Default for production
ENABLE_API_DOCS=true   # Only for development/testing
```

### 3. **Altitude Extraction - Bytes Handling** ✅
**Issue**: Altitude extraction was failing with `invalid literal for int() with base 10: b'\x00'`

**Solution**:
- Added proper handling for `altitude_ref` when it's a bytes object
- Handles null bytes (`b'\x00'`) gracefully
- Falls back to default value (0 = above sea level) for invalid data
- Includes proper decoding with error handling

**Files Modified**:
- `app/services/exif_utils.py`: Updated `extract_altitude()` function

### 4. **Startup Resilience - Better Error Handling** ✅
**Issue**: Services would wait indefinitely if dependencies failed to start

**Solution**:
- Added configurable retry limits (default 60 retries = 2 minutes)
- Added retry counters with progress display
- Exit with error code if dependencies fail to connect
- Better error messages indicating which service failed

**Files Modified**:
- `app/entrypoint.sh`: Updated wait_for_tcp() and database/Redis wait logic

**Environment Variables**:
```bash
MAX_DB_RETRIES=60  # Maximum database connection retries (default: 60)
```

### 5. **SSL/HTTPS Configuration Support** ✅
**Issue**: Production deployments should use SSL/TLS but configuration was not enforced

**Current State**:
- Configuration settings already exist in `app/core/config.py`:
  - `MINIO_SECURE`: Enables HTTPS for MinIO
  - `REDIS_SSL`: Enables SSL for Redis
  - Security validators warn in production if SSL is disabled

**To Enable SSL in Production**:

#### MinIO HTTPS:
```bash
# .env file
MINIO_SECURE=true
MINIO_ENDPOINT=minio.yourdomain.com:9000
```

#### Redis SSL:
```bash
# .env file  
REDIS_SSL=true
REDIS_URL=rediss://redis:6379/0  # Note: rediss:// not redis://
REDIS_PASSWORD=your-secure-password
```

#### PostgreSQL SSL:
```bash
# .env file
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
DATABASE_SSL_MODE=require  # Options: disable, allow, prefer, require, verify-ca, verify-full
```

## Verification

### Check if Celery is running as non-root:
```bash
docker exec -it impact-database_celery_worker_1 id
# Should show: uid=1000(appuser) gid=1000(appuser)
```

### Check if API docs are disabled:
```bash
curl http://localhost:8000/docs
# Should return 404 in production (ENVIRONMENT=production)
```

### Check altitude extraction:
```bash
# Watch celery logs during image upload
docker logs -f impact-database_celery_worker_1
# Should see: "Extracted altitude: X.Xm (ref: 0)" without errors
```

### Check startup resilience:
```bash
# Restart services and watch for retry counts
docker-compose restart celery_worker
docker logs -f impact-database_celery_worker_1
# Should see: "Database not ready yet, waiting... (X/60)"
```

## Production Deployment Checklist

- [ ] Set `ENVIRONMENT=production` in .env file
- [ ] Set `ENABLE_API_DOCS=false` (or omit - defaults to false)
- [ ] Enable SSL for MinIO: `MINIO_SECURE=true`
- [ ] Enable SSL for Redis: `REDIS_SSL=true` and use `rediss://` URL
- [ ] Enable SSL for PostgreSQL: `DATABASE_SSL_MODE=require`
- [ ] Set strong, unique values for:
  - `SECRET_KEY` (min 32 chars)
  - `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY`
  - `POSTGRES_PASSWORD`
  - `REDIS_PASSWORD`
- [ ] Review CORS origins in `ALLOWED_ORIGINS`
- [ ] Enable rate limiting with appropriate values
- [ ] Configure proper TLS certificates for all services
- [ ] Rebuild containers: `docker-compose build --no-cache`

## SSL/TLS Certificate Setup

### For MinIO:
1. Generate or obtain SSL certificates
2. Mount certificates in docker-compose.yml:
   ```yaml
   volumes:
     - ./certs/minio:/root/.minio/certs
   ```
3. Certificate files needed:
   - `/root/.minio/certs/public.crt`
   - `/root/.minio/certs/private.key`

### For Redis:
1. Generate certificates:
   ```bash
   openssl req -x509 -nodes -newkey rsa:4096 \
     -keyout redis.key -out redis.crt -days 365
   ```
2. Update docker-compose.yml:
   ```yaml
   command: redis-server --tls-port 6379 --port 0 \
     --tls-cert-file /etc/redis/redis.crt \
     --tls-key-file /etc/redis/redis.key \
     --tls-ca-cert-file /etc/redis/ca.crt
   volumes:
     - ./certs/redis:/etc/redis
   ```

### For PostgreSQL:
1. Generate certificates:
   ```bash
   openssl req -new -x509 -days 365 -nodes -text \
     -out server.crt -keyout server.key
   chmod 600 server.key
   ```
2. Update docker-compose.yml:
   ```yaml
   volumes:
     - ./certs/postgres:/var/lib/postgresql/certs
   command: >
     postgres
     -c ssl=on
     -c ssl_cert_file=/var/lib/postgresql/certs/server.crt
     -c ssl_key_file=/var/lib/postgresql/certs/server.key
   ```

## Security Warnings Addressed

| Warning | Status | Solution |
|---------|--------|----------|
| Celery running as root | ✅ Fixed | Enabled non-root user (appuser) |
| API docs enabled in production | ✅ Fixed | Auto-disabled in production |
| MinIO should use HTTPS | ⚠️ Configurable | Set MINIO_SECURE=true + certificates |
| Redis should use SSL | ⚠️ Configurable | Set REDIS_SSL=true + certificates |
| Database SSL disabled | ⚠️ Configurable | Set DATABASE_SSL_MODE=require |
| Altitude extraction errors | ✅ Fixed | Proper bytes handling |

## Additional Security Features

The application includes these additional security features (already present):

- JWT token authentication with configurable expiry
- Rate limiting (configurable per endpoint)
- CORS protection with explicit origin whitelist
- File upload validation and size limits
- SQL injection protection (SQLAlchemy ORM)
- XSS protection headers
- Session security (HttpOnly, Secure, SameSite cookies)
- Audit logging for security events
- Strong password policies
- Content Security Policy headers

## Testing

After applying these changes:

1. **Rebuild containers**:
   ```bash
   docker-compose down
   docker-compose build --no-cache
   docker-compose up -d
   ```

2. **Verify logs**:
   ```bash
   # Check API logs
   docker logs impact-database_api_1 | grep -i "production\|security"
   
   # Check Celery logs
   docker logs impact-database_celery_worker_1 | grep -i "security\|uid"
   ```

3. **Test functionality**:
   - Upload images with GPS data
   - Check that altitude is extracted without errors
   - Verify API docs are not accessible at /docs
   - Confirm worker is running as non-root user

## Support

For questions or issues related to these security improvements:
- Review logs: `docker-compose logs -f`
- Check configuration: `docker-compose config`
- Verify environment: `docker exec api env | grep -E 'ENVIRONMENT|SECURE|SSL'`

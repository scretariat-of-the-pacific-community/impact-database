# Known Issues & Limitations

This document tracks known technical limitations, compatibility issues, and workarounds in the Impact Database application.

## Table of Contents
- [Frontend Issues](#frontend-issues)
- [Backend Limitations](#backend-limitations)
- [Infrastructure & Deployment](#infrastructure--deployment)
- [Browser Compatibility](#browser-compatibility)

---

## Frontend Issues

### 1. React 18 Strict Mode + Leaflet Map Compatibility

**Issue**: Leaflet maps throw "Map container is already initialized" errors in development mode with React 18.3.1 Strict Mode enabled.

**Root Cause**:
- React 18 Strict Mode intentionally double-mounts components in development to detect side effects
- Leaflet uses imperative initialization (`L.map()`) that doesn't work well with React's declarative model
- When components remount, Leaflet tries to initialize the same DOM container twice

**Impact**: 
- ❌ Map components crash in development mode
- ✅ Works correctly in production builds (Strict Mode disabled)

**Workaround Options**:
1. **Disable Strict Mode** (current approach for MVP):
   ```tsx
   // next.config.js
   reactStrictMode: false
   ```

2. **Use unique keys** (partial fix):
   ```tsx
   <MapContainer key={`map-${uniqueId}`} />
   ```

3. **Future solution**: Migrate to a React-first mapping library like:
   - `react-map-gl` (Mapbox-based)
   - `@vis.gl/react-google-maps`
   - Or wait for Leaflet v2 with better React support

**Related Files**:
- [frontend/src/components/profile/AnalyticsMap.tsx](../frontend/src/components/profile/AnalyticsMap.tsx)
- [frontend/src/app/search/page.tsx](../frontend/src/app/search/page.tsx)
- [frontend/src/app/map/page.tsx](../frontend/src/app/map/page.tsx)
- [frontend/src/app/images/[id]/page.tsx](../frontend/src/app/images/[id]/page.tsx)

**References**:
- [React 18 Strict Mode documentation](https://react.dev/reference/react/StrictMode)
- [Leaflet Issue #7255](https://github.com/Leaflet/Leaflet/issues/7255)

---

### 2. Next.js 16 + Turbopack Workspace Detection

**Issue**: Turbopack fails to detect workspace root when `turbo.root` is not explicitly configured.

**Error Message**:
```
Failed to read turbopack config: No workspace root found
```

**Solution**: Add explicit workspace root in `next.config.js`:
```javascript
turbo: {
  root: __dirname,
}
```

**Status**: ✅ Fixed in [next.config.js](../frontend/next.config.js)

---

### 3. Storybook Removal (Next.js 16 Incompatibility)

**Issue**: Storybook 8.x is not yet compatible with Next.js 16.0.x.

**Impact**:
- Storybook removed from project during Next.js 16 upgrade
- Component documentation and isolated development temporarily unavailable

**Workaround**:
- Manual component testing via actual application pages
- Use browser DevTools for component inspection

**Future Resolution**:
- Wait for Storybook 8.4+ with Next.js 16 support
- Consider alternative component documentation tools (Ladle, Histoire)

**Tracking**: [Storybook Issue #29200](https://github.com/storybookjs/storybook/issues/29200)

---

## Backend Limitations

### 1. PostgreSQL Connection Pool Limits

**Issue**: Default connection pool size (20) may be insufficient under high load.

**Impact**: Connection timeouts during traffic spikes

**Monitoring**:
```python
# Check active connections
SELECT count(*) FROM pg_stat_activity;

# View connection pool stats at /metrics endpoint
database_connections_active
```

**Tuning**:
```python
# core/config.py
SQLALCHEMY_POOL_SIZE = 20
SQLALCHEMY_MAX_OVERFLOW = 10
```

**Status**: Monitoring enabled, no action required until metrics show issues

---

### 2. MinIO Lifecycle Policies (Disabled)

**Issue**: MinIO lifecycle management and backup policies are temporarily disabled.

**Impact**: 
- No automatic cleanup of old/orphaned objects
- Manual backup required

**Code Location**: [app/core/main.py:198](../app/core/main.py#L198)

**Reason**: Simplified startup for MVP; will be re-enabled after deployment stabilization

---

### 3. Rate Limiting Implementation

**Issue**: Rate limiting falls back to in-memory storage when Redis is unavailable.

**Impact**:
- Rate limits reset on application restart
- Rate limits not shared across multiple backend instances (horizontal scaling)

**Detection**:
```
# Check logs for:
"Using in-memory rate limiting"
```

**Solution**: Ensure Redis is available and `REDIS_URL` is configured:
```bash
REDIS_URL=redis://redis:6379/0
```

---

## Infrastructure & Deployment

### 1. HTTPS/SSL Not Configured by Default

**Issue**: Application runs on HTTP in local development.

**Security Impact**:
- OAuth redirect URIs require HTTPS for production
- Cookies marked as `secure` won't work over HTTP

**Setup Instructions**: See [HTTPS_SSL_SETUP.md](../HTTPS_SSL_SETUP.md)

**Production Requirements**:
- Use reverse proxy (nginx/Caddy) with SSL termination
- Configure `CORS_ORIGINS` with HTTPS URLs
- Set `cookie_secure=True` in CSRF middleware

---

### 2. Docker Compose Performance (Development)

**Issue**: File synchronization in Docker volumes can be slow on macOS/Windows.

**Impact**: 
- 2-5 second lag when editing Python files
- Hot reload delays

**Workaround**:
```yaml
# docker-compose.override.yml (macOS)
volumes:
  - ./app:/app:delegated  # Use delegated consistency
```

**Better Alternative**: Run backend natively outside Docker during development

---

### 3. S3/MinIO Image Storage Latency

**Issue**: Image uploads to MinIO can timeout on slow networks.

**Current Timeout**: 30 seconds

**Configuration**:
```python
# services/upload.py
UPLOAD_TIMEOUT = 30  # Increase if needed
```

**Monitoring**: Check Prometheus metrics:
```
upload_duration_seconds_bucket
```

---

## Browser Compatibility

### 1. Safari EXIF Extraction

**Issue**: Safari doesn't support `ImageCapture` API for EXIF extraction.

**Impact**: Manual coordinate entry required for iOS/Safari users

**Status**: Fallback implemented using `exif-js` library

**Testing**:
```bash
# Test on iOS Safari or BrowserStack
```

---

### 2. Firefox Geolocation Permissions

**Issue**: Firefox requires HTTPS for `navigator.geolocation` API.

**Impact**: Location-based search doesn't work on HTTP

**Workaround**: Use HTTPS in development or allow exception in Firefox settings

---

## Development Workflow

### 1. Database Migrations in Docker

**Issue**: Alembic migrations must be run inside Docker container, not on host.

**Correct Usage**:
```bash
# ✅ Run inside container
docker compose exec backend alembic upgrade head

# ❌ Don't run on host (wrong Python environment)
alembic upgrade head
```

---

### 2. Frontend Build Cache Issues

**Issue**: Next.js cache can become stale after dependency updates.

**Symptoms**:
- Module not found errors
- Type errors that don't exist in code

**Solution**:
```bash
cd frontend
rm -rf .next node_modules
npm install
npm run dev
```

---

## Reporting New Issues

Found a new issue? Please document it here with:

1. **Clear title** describing the problem
2. **Root cause** analysis (if known)
3. **Impact** on users/developers
4. **Workaround** or mitigation steps
5. **Related files** and line numbers
6. **Status** (🔄 investigating, ⚠️ workaround available, ✅ fixed)

### Template:
```markdown
### N. Issue Title

**Issue**: Brief description

**Root Cause**: Technical explanation

**Impact**: Who is affected and how

**Workaround**: Steps to mitigate

**Status**: Current state
```

---

*Last Updated: January 2025*  
*Next Review: Before production deployment*

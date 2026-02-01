# Nginx Production Deployment Fix

## Issue
The production server at `opmthredds.gem.spc.int` returns 404 errors when clicking "View" buttons or accessing image detail pages:
- `/images/{uuid}` - Frontend image detail page route
- Direct image/video thumbnail access fails

## Root Cause
1. Nginx reverse proxy is not configured to route frontend page requests properly
2. Next.js uses basePath `/impact-database/` but the Link components generate `/images/{id}` 
3. Nginx doesn't know to rewrite `/images/{uuid}` to `/impact-database/images/{uuid}` for Next.js

## Solution

### 1. Install/Update Nginx Configuration

Copy the configuration file to the server:
```bash
# On the production server
sudo cp nginx-production.conf /etc/nginx/sites-available/impact-database
sudo ln -s /etc/nginx/sites-available/impact-database /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # Remove default if needed
```

### 2. Test Configuration
```bash
sudo nginx -t
```

### 3. Reload Nginx
```bash
sudo systemctl reload nginx
# Or
sudo service nginx reload
```

### 4. Verify Services Are Running
```bash
docker-compose ps
# Should show:
# - api (port 8000)
# - frontend (port 3000/3100)
```

## URL Mapping

After configuration, these URLs will work:

### Backend API (proxied through nginx)
- `/api/images/{id}` → Backend port 8000
- `/api/video/thumbnail/{id}` → Backend port 8000
- `/upload/images/{filename}/thumbnail` → Backend port 8000

### Frontend (Next.js)
- `/impact-database/` → Frontend home page
- `/impact-database/search` → Search page
- `/impact-database/map` → Map view
- `/images/{uuid}` → **Automatically rewritten** to `/impact-database/images/{uuid}` (image detail page)
- `/hazards/{type}` → **Automatically rewritten** to `/impact-database/hazards/{type}`

### Legacy Redirects
- Nginx rewrites `/images/{uuid}` to `/impact-database/images/{uuid}` transparently
- Users can click "View" buttons and they work correctly

## Verification

Test the endpoints:
```bash
# Test API endpoint
curl -I https://opmthredds.gem.spc.int/api/images/0900bb8c-4542-474d-8b01-5803e9316679

# Test thumbnail
curl -I https://opmthredds.gem.spc.int/upload/images/f815a7670d71_DJI_0133.JPG/thumbnail

# Test video thumbnail
curl -I https://opmthredds.gem.spc.int/api/video/thumbnail/e994dfe9-2464-45ff-bbb8-55a9f2a76cb8

# Test frontend home page
curl -I https://opmthredds.gem.spc.int/impact-database/

# Test "View" button link (image detail page) - should return 200, not 404
curl -I https://opmthredds.gem.spc.int/images/0900bb8c-4542-474d-8b01-5803e9316679
# This should return Next.js page HTML, not nginx 404
```

All should return 200 OK (or appropriate status codes).

### Testing the "View" Button Fix

1. Go to search page: `https://opmthredds.gem.spc.int/impact-database/search`
2. Click on any image card or "View" button
3. Should navigate to image detail page (not nginx 404)
4. URL will be `/images/{uuid}` which nginx rewrites to `/impact-database/images/{uuid}`

## Common Issues

### Issue: 502 Bad Gateway
**Solution:** Check backend is running: `docker-compose ps api`

### Issue: 504 Gateway Timeout  
**Solution:** Increase timeouts in nginx config (already set to 600s for video uploads)

### Issue: Static files 404
**Solution:** Ensure frontend container is accessible and Next.js is built with correct basePath

### Issue: CORS errors
**Solution:** CORS headers are already configured in nginx for API routes

## Current Configuration

The nginx config includes:
- ✅ 500MB max upload size for videos
- ✅ 600s timeout for large uploads
- ✅ Streaming support for video playback
- ✅ Caching for images/thumbnails
- ✅ WebSocket support for development HMR
- ✅ Security headers (X-Frame-Options, CSP, etc.)
- ✅ Legacy URL redirects

## Alternative: Using Docker Compose with Nginx

If you prefer to run nginx in Docker:

```yaml
# Add to docker-compose.yml
nginx:
  image: nginx:1.18
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./nginx-production.conf:/etc/nginx/conf.d/default.conf:ro
    - ./ssl:/etc/ssl:ro  # If using HTTPS
  depends_on:
    - api
    - frontend
  networks:
    - app-network
```

Then:
```bash
docker-compose up -d nginx
```

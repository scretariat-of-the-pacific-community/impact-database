# Docker Cache Optimization Guide

## Current Status ✅

**Storage Cleanup Results:**
- **Freed Space:** 18.78GB
- **Build Cache Cleaned:** 4.742GB of unused layers pruned
- **Active Images:** 36 (15.37GB)
- **Build Cache:** 0B (fully cleaned and ready for optimized caching)

## Caching Strategy

### 1. Multi-Stage Builds (Already Implemented)

Both Dockerfiles use multi-stage builds to minimize final image sizes:

**Backend (app/Dockerfile):**
- **Stage 1 - Builder:** Installs all dependencies
- **Stage 2 - Runner:** Copies only runtime requirements
- Result: Reduced image size by ~30%

**Frontend (frontend/Dockerfile):**
- **Stage 1 - Dependencies:** npm install
- **Stage 2 - Builder:** npm build (uses cached deps)
- **Stage 3 - Runner:** Production bundle only
- Result: Optimized for fast rebuilds when code changes

### 2. Layer Caching Optimization

#### Copy Order (Stability)
Files are copied in order of change frequency (least to most frequent):
1. Package files (rarely change) → COPY early
2. Source code (frequently change) → COPY late
3. Build args → defined early

#### Backend Layer Caching
```dockerfile
COPY requirements.txt .          # Cached unless deps change
RUN pip install ...             # Reused if requirements.txt unchanged

COPY . .                        # Source code (changes frequently)
RUN entrypoint.sh               # Re-executed on source changes
```

#### Frontend Layer Caching
```dockerfile
COPY package*.json ./           # Cached long-term
RUN npm install                 # Reused unless package.json changes

COPY . .                        # Source code (changes frequently)
RUN npm run build               # Rebuilt only when needed
```

### 3. .dockerignore Optimization

Excluded patterns prevent unnecessary layer invalidation:

**Backend .dockerignore:**
- Python cache (`__pycache__`, `*.pyc`)
- Virtual environments (`.venv/`)
- Git history (`.git/`)
- Test files (`test_*.py`)
- Upload directories (synced separately)
- Documentation (`.md` files)

**Result:** Reduced build context size, faster context transfer

### 4. Production Caching Best Practices

#### For Development
```bash
# Full rebuild with fresh cache
docker-compose build --no-cache

# Rebuild with cache (faster)
docker-compose build
```

#### For Production
```bash
# Incremental builds with cache
docker build -t app:latest \
  --cache-from app:latest \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  .
```

### 5. Docker BuildKit Configuration

Enable BuildKit for improved caching (automatic in Docker 20.10+):

```bash
# Check if BuildKit is enabled
echo $DOCKER_BUILDKIT

# Enable BuildKit
export DOCKER_BUILDKIT=1
docker-compose build
```

**Benefits:**
- Parallel build stages
- Better layer caching
- Inline cache information
- Faster builds overall

## Maintenance Commands

### Clean Specific Cache
```bash
# Remove build cache only
docker builder prune

# Keep images, only clear unused cache
docker builder prune --keep-state
```

### Monitor Disk Usage
```bash
# Check current usage
docker system df

# List all images and sizes
docker images --format "table {{.Repository}}\t{{.Size}}"

# Check layer cache growth
docker builder du
```

### Full Cleanup (Use Carefully!)
```bash
# Remove ALL unused resources
docker system prune --all --volumes

# This will:
# - Delete unused images (except active containers)
# - Delete unused volumes
# - Delete unused networks
# - Clear build cache
```

## Image Size Targets

**Current Sizes (Optimized):**
- Backend: ~800MB (Python 3.11-slim + FastAPI)
- Frontend: ~150MB (Node 20-bookworm-slim + Next.js)
- Total Multi-Service: ~2.5GB (database, cache, storage included)

**Target Sizes (with improvements):**
- Backend: <700MB (by optimizing Python deps)
- Frontend: <120MB (by analyzing bundle)
- Total: <2.2GB

## Recommendations

1. **CI/CD Integration:** Use `--cache-from` with registry caching
2. **Local Development:** Keep BuildKit enabled for faster iteration
3. **Scheduled Cleanup:** Run `docker system prune` weekly
4. **Monitoring:** Track image sizes in CI/CD logs
5. **Registry Caching:** Push cache layers to Docker registry for team builds

## Troubleshooting

### Cache Not Working?
```bash
# Check BuildKit status
docker version | grep -i buildkit

# Force full rebuild
docker-compose build --no-cache
```

### Large Images?
```bash
# Analyze image layers
docker history app:latest

# Check .dockerignore effectiveness
docker build --progress=plain -t app:test .
```

### Slow Builds?
```bash
# Enable BuildKit parallel processing
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# Monitor build progress
docker build --progress=plain -t app:test .
```

## Next Steps

1. ✅ Cleared 18.78GB of cache
2. ✅ Optimized .dockerignore patterns
3. ⏳ Consider: Registry caching for CI/CD
4. ⏳ Consider: Multi-platform builds (ARM64)
5. ⏳ Consider: Dependency layer scanning

---

**Last Updated:** Feb 2, 2026
**Status:** Optimized & Ready for Production

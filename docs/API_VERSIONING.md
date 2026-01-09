# API Versioning Strategy

This document outlines the API versioning strategy for the Impact Database, including current implementation, future plans, and migration guidelines.

## Table of Contents

- [Overview](#overview)
- [Current API (v1)](#current-api-v1)
- [Versioning Scheme](#versioning-scheme)
- [Breaking Changes Policy](#breaking-changes-policy)
- [Future API (v2) Plans](#future-api-v2-plans)
- [Deprecation Process](#deprecation-process)
- [Client Migration Guide](#client-migration-guide)

---

## Overview

### Versioning Philosophy

The Impact Database API follows **URI versioning** with semantic versioning principles:

- **Major version** (v1, v2, v3): Breaking changes
- **Minor updates**: New features, backward compatible
- **Patches**: Bug fixes, no API changes

### Version Support Policy

- **Current version** (v1): Fully supported
- **Previous version** (v0/unversioned): Deprecated, maintained for 6 months
- **Future versions** (v2): Planned features documented here

---

## Current API (v1)

### Base URL

```
Production:  https://api.impactdatabase.org/api
Development: http://localhost:8000/api
```

**Note**: Current implementation does NOT use `/v1` prefix. All endpoints are directly under `/api/`.

### Endpoints Structure

```
/api/
  ├─ /auth/               # Authentication & authorization
  ├─ /images/             # Image CRUD operations
  ├─ /upload/             # Image upload
  ├─ /metadata/           # Metadata management
  ├─ /search/             # Search & filtering
  ├─ /stac/               # STAC API endpoints
  ├─ /ogc/                # OGC API - Records
  ├─ /webhooks/           # Webhook management
  ├─ /feeds/              # RSS/Atom feeds
  └─ /rbac/               # Role-based access control
```

### Example Requests

```bash
# Get image by ID
GET /api/images/123

# Upload new image
POST /api/upload

# Search images
GET /api/search?hazard=cyclone&location=Fiji
```

### Response Format

All responses follow consistent JSON structure:

```json
{
  "success": true,
  "data": {
    "id": 123,
    "title": "Cyclone damage",
    "url": "https://..."
  },
  "meta": {
    "timestamp": "2024-01-01T12:00:00Z",
    "version": "1.0"
  }
}
```

### Error Format

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid image format",
    "details": {
      "field": "file",
      "allowed_formats": ["jpg", "png", "heif"]
    }
  },
  "meta": {
    "timestamp": "2024-01-01T12:00:00Z",
    "request_id": "req_abc123"
  }
}
```

---

## Versioning Scheme

### Current Implementation (No /v1 Prefix)

**Decision**: Keep current `/api/*` structure without version prefix.

**Rationale**:
- Simplifies initial deployment
- Reduces URL complexity
- Maintains backward compatibility with existing clients
- Can add `/api/v2` later without breaking `/api/*`

### Future Implementation (/api/v2)

When v2 is introduced:

```
/api/           # v1 endpoints (current)
/api/v2/        # v2 endpoints (new)
```

Clients can choose which version to use:
```bash
# Legacy client (v1)
GET /api/images/123

# New client (v2)
GET /api/v2/images/123
```

### Version Negotiation

#### Header-based (Optional)

```bash
GET /api/images/123
Accept: application/vnd.impactdb.v2+json
```

Response header:
```
API-Version: 2.0
```

#### Query Parameter (Not Recommended)

```bash
# Avoid this pattern
GET /api/images/123?version=2
```

**Why not recommended**: Caching issues, URL pollution

---

## Breaking Changes Policy

### What Constitutes a Breaking Change

✅ **Breaking changes** (require major version bump):

- Removing an endpoint
- Renaming fields in response
- Changing field types (string → integer)
- Removing required parameters
- Changing authentication mechanism
- Modifying error code structure

❌ **Non-breaking changes** (minor version):

- Adding new endpoints
- Adding optional parameters
- Adding new response fields
- Adding new error codes
- Performance improvements
- Bug fixes

### Example: Field Rename (Breaking)

**v1 Response**:
```json
{
  "id": 123,
  "created_at": "2024-01-01T00:00:00Z"
}
```

**v2 Response** (BREAKING):
```json
{
  "id": 123,
  "uploaded_at": "2024-01-01T00:00:00Z"  // Renamed field
}
```

### Example: Field Addition (Non-breaking)

**v1 Response**:
```json
{
  "id": 123,
  "title": "Image"
}
```

**v1.1 Response** (SAFE):
```json
{
  "id": 123,
  "title": "Image",
  "description": "New field"  // Added field
}
```

---

## Future API (v2) Plans

### Proposed Changes for v2

#### 1. Consistent Resource Naming

**Current (v1)**:
```
/api/images/          # Plural
/api/upload/          # Verb (inconsistent)
/api/metadata/        # Singular
```

**Proposed (v2)**:
```
/api/v2/images/       # Plural, RESTful
/api/v2/images/{id}/upload/  # Nested resource
/api/v2/images/{id}/metadata/  # Nested resource
```

#### 2. Unified Response Envelope

**Current (v1)**: Inconsistent response shapes

**Proposed (v2)**: Consistent envelope:
```json
{
  "data": { /* actual data */ },
  "meta": {
    "version": "2.0",
    "timestamp": "...",
    "request_id": "..."
  },
  "links": {
    "self": "/api/v2/images/123",
    "next": "/api/v2/images?page=2"
  }
}
```

#### 3. Pagination Standardization

**Current (v1)**: Mixed pagination styles

**Proposed (v2)**: Cursor-based pagination:
```json
{
  "data": [...],
  "meta": {
    "total": 1000,
    "cursor": "eyJpZCI6MTIzfQ=="
  },
  "links": {
    "next": "/api/v2/images?cursor=eyJpZCI6MTIzfQ==",
    "prev": "/api/v2/images?cursor=eyJpZCI6MTAwfQ=="
  }
}
```

#### 4. GraphQL Support

**New in v2**: GraphQL endpoint for flexible queries

```graphql
# /api/v2/graphql
query {
  image(id: "123") {
    id
    title
    uploader {
      username
    }
    tags {
      name
    }
  }
}
```

#### 5. Batch Operations

**New in v2**: Bulk operations endpoint

```bash
POST /api/v2/batch
Content-Type: application/json

{
  "operations": [
    {"method": "GET", "path": "/images/1"},
    {"method": "GET", "path": "/images/2"},
    {"method": "DELETE", "path": "/images/3"}
  ]
}
```

#### 6. Webhooks v2

**Current (v1)**: Basic webhook support

**Proposed (v2)**:
- Event filtering
- Retry logic with exponential backoff
- HMAC signature verification
- Event replay capability

```json
POST /api/v2/webhooks
{
  "url": "https://example.com/webhook",
  "events": ["image.uploaded", "image.approved"],
  "secret": "webhook_secret_123",
  "retry_policy": {
    "max_retries": 3,
    "backoff": "exponential"
  }
}
```

#### 7. Rate Limiting Improvements

**Current (v1)**: 10 requests/minute per user

**Proposed (v2)**:
- Tiered rate limits (free/pro/enterprise)
- Separate limits for read/write operations
- Burst allowance

Response headers:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
X-RateLimit-Burst: 50
```

### Timeline for v2

| Phase | Timeline | Description |
|-------|----------|-------------|
| **Planning** | Q2 2026 | Gather requirements, design decisions |
| **Alpha** | Q3 2026 | Internal testing, breaking changes allowed |
| **Beta** | Q4 2026 | Public testing, minimal breaking changes |
| **RC** | Q1 2027 | Release candidate, no breaking changes |
| **GA** | Q2 2027 | General availability |

---

## Deprecation Process

### Deprecation Timeline

```
Announcement → Warning Period → Shutdown
    6 months        6 months      Complete
```

### Step 1: Announcement (Month 0)

- **Documentation**: Update API docs with deprecation notice
- **Release notes**: Publish deprecation announcement
- **Email**: Notify registered API users
- **Headers**: Add deprecation header

```
Deprecation: version="1.0", sunset="2027-01-01"
Sunset: Sat, 01 Jan 2027 00:00:00 GMT
Link: <https://docs.impactdb.org/api/v2>; rel="alternate"
```

### Step 2: Warning Period (Months 1-6)

- **Logs**: Log usage of deprecated endpoints
- **Console**: Add console warnings for web clients
- **Metrics**: Track deprecated endpoint usage
- **Support**: Offer migration assistance

```json
// Response includes deprecation warning
{
  "data": {...},
  "meta": {
    "deprecated": true,
    "sunset_date": "2027-01-01",
    "migration_guide": "https://docs.impactdb.org/migration-v1-to-v2"
  }
}
```

### Step 3: Shutdown (Month 12+)

- **Final notice**: 30-day email warning
- **Redirect**: Deprecated endpoints return 410 Gone
- **Documentation**: Archive v1 docs
- **Support**: Provide emergency support for 90 days

```json
// After sunset date
HTTP/1.1 410 Gone

{
  "error": {
    "code": "API_VERSION_RETIRED",
    "message": "API v1 was retired on 2027-01-01. Please upgrade to v2.",
    "migration_guide": "https://docs.impactdb.org/migration-v1-to-v2"
  }
}
```

---

## Client Migration Guide

### Detecting Current Version

```python
# Python client
import requests

response = requests.get("https://api.impactdb.org/api/images/1")
api_version = response.headers.get("API-Version", "1.0")

if api_version.startswith("1."):
    print("Using v1 API")
elif api_version.startswith("2."):
    print("Using v2 API")
```

### Gradual Migration Strategy

#### Option 1: Dual Client (Recommended)

```python
class ImpactDBClient:
    def __init__(self, version="1"):
        self.version = version
        self.base_url = f"https://api.impactdb.org/api"
        if version == "2":
            self.base_url += "/v2"

    def get_image(self, image_id):
        if self.version == "1":
            return self._get_image_v1(image_id)
        else:
            return self._get_image_v2(image_id)
```

#### Option 2: Feature Flags

```python
# config.py
USE_API_V2 = os.getenv("USE_API_V2", "false").lower() == "true"

# client.py
if USE_API_V2:
    from clients.v2 import ImpactDBClient
else:
    from clients.v1 import ImpactDBClient
```

### Field Mapping

When v2 introduces field changes, use mapping:

```python
# v1 to v2 field mapping
FIELD_MAPPING = {
    "created_at": "uploaded_at",
    "user": "uploader",
    "lat": "latitude",
    "lon": "longitude"
}

def normalize_response(data, from_version="1", to_version="2"):
    """Convert v1 response to v2 format."""
    if from_version == "1" and to_version == "2":
        return {
            FIELD_MAPPING.get(k, k): v
            for k, v in data.items()
        }
    return data
```

### Testing Both Versions

```python
import pytest

@pytest.mark.parametrize("api_version", ["1", "2"])
def test_get_image(api_version):
    """Test image retrieval works in both API versions."""
    client = ImpactDBClient(version=api_version)
    image = client.get_image(123)

    assert image["id"] == 123
    assert "title" in image

    # Version-specific assertions
    if api_version == "1":
        assert "created_at" in image
    else:
        assert "uploaded_at" in image
```

---

## API Versioning Best Practices

### For API Developers

1. **Never break v1**: Once released, v1 endpoints must remain stable
2. **Version routes, not models**: Database models can change, API contracts cannot
3. **Use transformers**: Create response transformers for each version
4. **Document everything**: Every breaking change must be documented
5. **Test compatibility**: CI/CD must test all supported versions

### For API Consumers

1. **Pin versions**: Always specify which version you're using
2. **Monitor headers**: Check for deprecation headers
3. **Subscribe to changes**: Watch repository for API changes
4. **Test early**: Test against beta versions before GA
5. **Have fallback**: Implement graceful degradation

---

## Version Detection in Code

### Backend (FastAPI)

```python
# app/api/versioning.py
from fastapi import Request

def get_api_version(request: Request) -> str:
    """Extract API version from request path."""
    path = request.url.path

    if path.startswith("/api/v2/"):
        return "2.0"
    elif path.startswith("/api/v1/"):
        return "1.0"
    else:
        return "1.0"  # Default to v1 for unversioned /api/*


# app/api/images.py
from fastapi import APIRouter, Request

router = APIRouter()

@router.get("/images/{image_id}")
async def get_image(image_id: int, request: Request):
    version = get_api_version(request)

    if version == "1.0":
        return get_image_v1(image_id)
    else:
        return get_image_v2(image_id)
```

### Frontend (TypeScript)

```typescript
// lib/api/client.ts
export class APIClient {
  private version: string;
  private baseURL: string;

  constructor(version: '1' | '2' = '1') {
    this.version = version;
    this.baseURL = version === '2'
      ? '/api/v2'
      : '/api';
  }

  async getImage(id: number): Promise<Image> {
    const response = await fetch(`${this.baseURL}/images/${id}`);
    const data = await response.json();

    // Transform v1 response to v2 format if needed
    return this.version === '1'
      ? this.transformV1ToV2(data)
      : data;
  }
}
```

---

## FAQ

### Q: When will `/api/v1` be introduced?

**A**: Not planned. Current `/api/*` endpoints are considered v1. Future v2 will use `/api/v2/` prefix.

### Q: Can I use v1 and v2 simultaneously?

**A**: Yes! Both versions will coexist. Use different base URLs:
- v1: `/api/images/123`
- v2: `/api/v2/images/123`

### Q: How long will v1 be supported after v2 release?

**A**: Minimum 12 months after v2 GA (General Availability).

### Q: Will breaking changes ever happen in v1?

**A**: No. Once v1 is released, it's frozen. Only bug fixes and security patches.

### Q: What if I find a critical bug in v1 after v2 is released?

**A**: Security and critical bugs will be patched in v1 even after v2 release, until v1 sunset date.

### Q: How are third-party integrations (STAC, OGC) versioned?

**A**: They follow their own versioning standards:
- STAC: v1.0.0 (follows SemVer)
- OGC API - Records: Part 1 v1.0

---

## Resources

- **API Documentation**: https://docs.impactdb.org
- **Change Log**: https://github.com/kishkumar96/impact-database/blob/main/CHANGELOG.md
- **Migration Guide**: https://docs.impactdb.org/migration-v1-to-v2
- **Support**: api-support@impactdb.org

---

*Last updated: January 2026*
*Next review: Q2 2026 (before v2 planning)*

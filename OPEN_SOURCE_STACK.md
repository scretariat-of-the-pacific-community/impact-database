# Open Source Stack

This project uses 100% open-source technologies. No proprietary services or API keys required.

## Mapping & Geospatial

### Leaflet (instead of Mapbox GL)
- **License**: BSD-2-Clause
- **What**: Interactive map library
- **Tiles**: OpenStreetMap (ODbL License)
- **Why**: Mapbox GL requires API keys and has usage limits. Leaflet with OSM tiles is completely free and open-source.
- **Components using it**:
  - `InteractiveHeroMap.tsx`
  - All map views throughout the application

### Leaflet.markercluster
- **License**: MIT
- **What**: Marker clustering for Leaflet
- **Why**: Open-source clustering without proprietary services

## Error Tracking

### Console Logging (instead of Sentry SaaS)
- **Current**: Console-based error logging
- **Future Option**: Self-hosted Sentry (BSL 1.1 License) or GlitchTip (MIT License)
- **Why**: Sentry SaaS requires paid subscriptions. Self-hosted alternatives provide the same functionality with full control.
- **Files updated**:
  - `global-error.tsx`
  - `query-provider.tsx`

## Frontend Framework

### Next.js
- **License**: MIT
- **What**: React framework with SSR/SSG
- **Why**: Industry-standard open-source framework

### React
- **License**: MIT
- **What**: UI library
- **Why**: Industry-standard open-source library

## UI Components

### Radix UI
- **License**: MIT
- **What**: Unstyled, accessible component primitives
- **Why**: Open-source alternative to proprietary UI kits

### Headless UI
- **License**: MIT
- **What**: Unstyled, accessible components by Tailwind Labs
- **Why**: Open-source component library

### Lucide React
- **License**: ISC
- **What**: Icon library
- **Why**: Open-source icon set

## Styling

### Tailwind CSS
- **License**: MIT
- **What**: Utility-first CSS framework
- **Why**: Open-source styling solution

## Backend

### FastAPI
- **License**: MIT
- **What**: Modern Python web framework
- **Why**: High-performance open-source API framework

### PostgreSQL + PostGIS
- **License**: PostgreSQL License (similar to MIT)
- **What**: Relational database with geospatial extensions
- **Why**: Most advanced open-source geospatial database

### SQLAlchemy
- **License**: MIT
- **What**: Python SQL toolkit and ORM
- **Why**: Industry-standard open-source ORM

### Celery
- **License**: BSD-3-Clause
- **What**: Distributed task queue
- **Why**: Open-source async task processing

### Redis
- **License**: BSD-3-Clause (before v7.4), RSALv2/SSPLv1 (v7.4+)
- **What**: In-memory data store
- **Why**: Open-source caching and message broker

## Storage

### MinIO
- **License**: AGPL v3.0
- **What**: S3-compatible object storage
- **Why**: Open-source alternative to AWS S3

## Data Formats & Standards

### STAC (SpatioTemporal Asset Catalog)
- **License**: Apache 2.0
- **What**: Geospatial metadata standard
- **Why**: Open standard for geospatial data

### GeoJSON
- **License**: Open standard
- **What**: Geographic data format
- **Why**: Industry-standard open format

## Testing

### Jest
- **License**: MIT
- **What**: JavaScript testing framework
- **Why**: Open-source testing solution

### Playwright
- **License**: Apache 2.0
- **What**: End-to-end testing
- **Why**: Open-source browser automation

### Pytest
- **License**: MIT
- **What**: Python testing framework
- **Why**: Industry-standard open-source testing

## Development Tools

### TypeScript
- **License**: Apache 2.0
- **What**: Typed JavaScript superset
- **Why**: Open-source type safety

### ESLint
- **License**: MIT
- **What**: JavaScript linter
- **Why**: Open-source code quality

### Prettier
- **License**: MIT
- **What**: Code formatter
- **Why**: Open-source formatting

## Container Orchestration

### Docker
- **License**: Apache 2.0
- **What**: Containerization platform
- **Why**: Open-source container runtime

### Docker Compose
- **License**: Apache 2.0
- **What**: Multi-container orchestration
- **Why**: Open-source development environment

## Installation & Setup

No API keys or proprietary service accounts required! Just:

```bash
# Install dependencies
cd frontend && npm install
cd ../app && pip install -r requirements.txt

# Start services
docker-compose up

# Access the application
# Frontend: http://localhost:3001
# Backend API: http://localhost:8000
```

## Future Considerations

If you need advanced error tracking:
- **Self-hosted Sentry**: Full-featured error tracking (BSL 1.1)
- **GlitchTip**: Open-source Sentry alternative (MIT)
- **Rollbar Community Edition**: Free tier available

If you need advanced map features:
- **OpenLayers**: More advanced than Leaflet (BSD-2-Clause)
- **MapLibre GL**: Open-source Mapbox GL fork (BSD-3-Clause)

## License Compatibility

All dependencies use permissive open-source licenses (MIT, BSD, Apache 2.0, ISC) that are compatible with commercial use, modification, and distribution.

The only AGPL-licensed component is MinIO (object storage), which can be replaced with:
- Local filesystem storage
- Self-hosted S3-compatible alternatives
- PostgreSQL BLOB storage

## Verification

To verify all dependencies are open-source:

```bash
# Frontend
cd frontend
npm run licenses  # Lists all dependency licenses

# Backend
cd app
pip-licenses  # Requires pip-licenses package
```

---

**Summary**: This entire stack is open-source, self-hostable, and requires no proprietary API keys or paid services to function.

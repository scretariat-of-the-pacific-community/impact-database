#!/bin/bash

# MVP Quick Start Script
# Fixes critical issues and starts all services for MVP

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}MVP Quick Start - Impact Database${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Step 1: Stop any running services
echo -e "${YELLOW}Step 1: Stopping existing services...${NC}"
docker compose down 2>/dev/null || true
sleep 2

# Step 2: Start infrastructure services
echo -e "${YELLOW}Step 2: Starting infrastructure services...${NC}"
docker compose up -d postgis_db redis minio
echo "Waiting for services to initialize..."
sleep 15

# Check infrastructure health
echo "Checking infrastructure health..."
docker compose ps postgis_db redis minio

# Step 3: Fix database schema (add file_size and upload_date columns)
echo -e "${YELLOW}Step 3: Fixing database schema...${NC}"
docker compose exec -T postgis_db psql -U postgres -d impact_db << 'EOF'
-- Add file_size column if missing
ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS file_size INTEGER;

-- Add upload_date column if missing
ALTER TABLE image_metadata ADD COLUMN IF NOT EXISTS upload_date TIMESTAMP DEFAULT NOW();

-- Verify columns exist
\d image_metadata
EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Database schema fixed${NC}"
else
    echo -e "${RED}✗ Database schema fix failed${NC}"
fi

# Step 4: Start application services
echo -e "${YELLOW}Step 4: Starting application services...${NC}"
docker compose up -d api celery_worker celery_beat flower frontend
echo "Waiting for application to start..."
sleep 20

# Step 5: Check service status
echo -e "${YELLOW}Step 5: Checking service status...${NC}"
docker compose ps

# Step 6: Health checks
echo -e "${YELLOW}Step 6: Running health checks...${NC}"
echo ""

# Backend health check
echo -n "Backend API: "
if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Healthy${NC}"
else
    echo -e "${RED}✗ Not responding${NC}"
fi

# Frontend check
echo -n "Frontend: "
if curl -sf http://localhost:3001 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Accessible (port 3001)${NC}"
else
    echo -e "${RED}✗ Not responding on port 3001${NC}"
fi

# Review workflow health
echo -n "Review Workflow: "
if curl -sf http://localhost:8000/api/v1/review-items/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Healthy${NC}"
else
    echo -e "${RED}✗ Not responding${NC}"
fi

# Redis check
echo -n "Redis: "
if docker compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Responding${NC}"
else
    echo -e "${RED}✗ Not responding${NC}"
fi

# Database check
echo -n "Database: "
if docker compose exec -T postgis_db pg_isready -U postgres > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Ready${NC}"
else
    echo -e "${RED}✗ Not ready${NC}"
fi

# MinIO check
echo -n "MinIO: "
if curl -sf http://localhost:9020/minio/health/live > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Healthy${NC}"
else
    echo -e "${RED}✗ Not responding${NC}"
fi

echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}MVP Services Ready!${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "Access points:"
echo -e "  🌐 Frontend:        ${GREEN}http://localhost:3000${NC}"
echo -e "  ⚡ Backend API:     ${GREEN}http://localhost:8000${NC}"
echo -e "  📚 API Docs:        ${GREEN}http://localhost:8000/docs${NC}"
echo -e "  📊 Flower:          ${GREEN}http://localhost:5555${NC}"
echo -e "  🗃️  MinIO Console:   ${GREEN}http://localhost:9020${NC} (minioadmin/minioadmin)"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Run review workflow tests: ${BLUE}./verify_review_workflow.sh${NC}"
echo "  2. Run RBAC tests: ${BLUE}./verify_rbac.sh${NC}"
echo "  3. Upload test image via frontend"
echo "  4. Review MVP_READINESS_PLAN.md for full checklist"
echo ""
echo -e "${GREEN}To view logs:${NC} docker compose logs -f [service]"
echo -e "${GREEN}To stop all:${NC} docker compose down"
echo ""

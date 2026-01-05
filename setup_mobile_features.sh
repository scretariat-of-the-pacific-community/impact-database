#!/bin/bash

# Mobile Features Setup Script
# Automates the setup of mobile optimization features

set -e

echo "🚀 Setting up Mobile Optimization Features..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Check if containers are running
echo -e "${BLUE}[1/6] Checking Docker containers...${NC}"
if ! docker ps | grep -q "impact-database"; then
    echo -e "${YELLOW}⚠️  Containers not running. Starting...${NC}"
    docker compose up -d
    sleep 5
fi
echo -e "${GREEN}✓ Containers are running${NC}"
echo ""

# 2. Install frontend dependencies
echo -e "${BLUE}[2/6] Installing frontend dependencies...${NC}"
docker exec $(docker ps -qf "name=frontend") npm install idb react-window react-virtualized-auto-sizer @types/react-window --legacy-peer-deps > /dev/null 2>&1
echo -e "${GREEN}✓ Frontend dependencies installed${NC}"
echo ""

# 3. Install backend dependencies
echo -e "${BLUE}[3/6] Installing backend dependencies...${NC}"
docker exec $(docker ps -qf "name=api") pip install pywebpush > /dev/null 2>&1
echo -e "${GREEN}✓ Backend dependencies installed (pywebpush)${NC}"
echo ""

# 4. Generate VAPID keys for push notifications
echo -e "${BLUE}[4/6] Configuring push notifications...${NC}"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: VAPID Key Security${NC}"
echo ""
echo "Push notifications require VAPID keys. For security:"
echo "1. NEVER commit VAPID keys to version control"
echo "2. Generate unique keys per environment"
echo "3. Store them securely in environment variables"
echo ""
echo "To generate VAPID keys, run:"
echo -e "${GREEN}  python3 -c 'from pywebpush import webpush; vapid = webpush.vapid_key(); print(f\"Public: {vapid.public_key.decode()}\\nPrivate: {vapid.private_key.decode()}\")'${NC}"
echo ""
echo "Then add them to your environment files:"
echo ""
echo "  frontend/.env.local:"
echo "    NEXT_PUBLIC_VAPID_PUBLIC_KEY=<your_public_key>"
echo "    NEXT_PUBLIC_SW_ENABLED=true"
echo ""
echo "  app/.env:"
echo "    VAPID_PRIVATE_KEY=<your_private_key>"
echo "    VAPID_SUBJECT=mailto:your@email.com"
echo ""
echo -e "${YELLOW}Skipping VAPID setup - please generate your own keys${NC}"
echo ""

# 5. Check environment files exist
echo -e "${BLUE}[5/6] Checking environment configuration...${NC}"
if [ -f "frontend/.env.local" ]; then
    if grep -q "NEXT_PUBLIC_VAPID_PUBLIC_KEY" frontend/.env.local; then
        echo -e "${GREEN}✓ Frontend VAPID key configured${NC}"
    else
        echo -e "${YELLOW}⚠️  Frontend VAPID key not found in .env.local${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  frontend/.env.local not found${NC}"
fi

if [ -f "app/.env" ]; then
    if grep -q "VAPID_PRIVATE_KEY" app/.env; then
        echo -e "${GREEN}✓ Backend VAPID key configured${NC}"
    else
        echo -e "${YELLOW}⚠️  Backend VAPID key not found in app/.env${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  app/.env not found${NC}"
fi
echo ""

# 6. Restart containers to apply changes
echo -e "${BLUE}[6/6] Restarting services...${NC}"
docker compose restart api frontend > /dev/null 2>&1
sleep 5
echo -e "${GREEN}✓ Services restarted${NC}"
echo ""

# Verify setup
echo -e "${BLUE}Verifying setup...${NC}"
API_HEALTH=$(curl -s http://localhost:8000/health | grep -o '"status":"ok"' || echo "")
if [ -n "$API_HEALTH" ]; then
    echo -e "${GREEN}✓ API is healthy${NC}"
else
    echo -e "${YELLOW}⚠️  API health check failed${NC}"
fi

FRONTEND_RUNNING=$(docker ps | grep "impact-database-frontend" || echo "")
if [ -n "$FRONTEND_RUNNING" ]; then
    echo -e "${GREEN}✓ Frontend is running${NC}"
else
    echo -e "${YELLOW}⚠️  Frontend not running${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Mobile Optimization Setup Complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Open http://localhost:3000 in your browser"
echo "2. Navigate to /profile to see mobile components"
echo "3. Navigate to /upload/mobile for camera-first upload"
echo "4. Test push notifications (requires HTTPS or localhost)"
echo ""
echo "📚 Documentation:"
echo "- Frontend: ./frontend/MOBILE_OPTIMIZATION.md"
echo "- Quick Reference: ./frontend/MOBILE_QUICK_REFERENCE.md"
echo "- Setup: ./MOBILE_ENV_SETUP.md"
echo ""
echo "🧪 Testing:"
echo "- Run: ./test_mobile_features.sh"
echo ""

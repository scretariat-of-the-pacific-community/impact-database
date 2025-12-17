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

# 4. Create frontend .env.local if it doesn't exist
echo -e "${BLUE}[4/6] Configuring environment variables...${NC}"
if [ ! -f "frontend/.env.local" ]; then
    echo "Creating frontend/.env.local..."
    cat > frontend/.env.local << EOF
# Push Notifications VAPID Public Key
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BElxhpt18ThIRqB2SxIShTi8AOrsQFP0u9eLBJEr9s-hzaoacMWsq-XSH0zgZXR5lBhe36P75alTPA-qXZPn-TU

# Service Worker
NEXT_PUBLIC_SW_ENABLED=true
EOF
    echo -e "${GREEN}✓ Created frontend/.env.local${NC}"
else
    # Check if VAPID key exists
    if ! grep -q "NEXT_PUBLIC_VAPID_PUBLIC_KEY" frontend/.env.local; then
        echo "" >> frontend/.env.local
        echo "# Push Notifications VAPID Public Key" >> frontend/.env.local
        echo "NEXT_PUBLIC_VAPID_PUBLIC_KEY=BElxhpt18ThIRqB2SxIShTi8AOrsQFP0u9eLBJEr9s-hzaoacMWsq-XSH0zgZXR5lBhe36P75alTPA-qXZPn-TU" >> frontend/.env.local
        echo -e "${GREEN}✓ Added VAPID key to frontend/.env.local${NC}"
    else
        echo -e "${GREEN}✓ VAPID key already configured${NC}"
    fi
fi
echo ""

# 5. Check/create backend .env
echo -e "${BLUE}[5/6] Configuring backend environment...${NC}"
if [ ! -f "app/.env" ]; then
    echo "Creating app/.env..."
    cat > app/.env << EOF
# Push Notifications VAPID Private Key (keep secret!)
VAPID_PRIVATE_KEY=zn2JQDGe0YC0L75BW-6LSTnnCxrQmBogn-VBvjngxZY

# VAPID Subject (change to your email)
VAPID_SUBJECT=mailto:admin@impactdatabase.com
EOF
    echo -e "${GREEN}✓ Created app/.env${NC}"
else
    # Check if VAPID key exists
    if ! grep -q "VAPID_PRIVATE_KEY" app/.env; then
        echo "" >> app/.env
        echo "# Push Notifications VAPID Private Key (keep secret!)" >> app/.env
        echo "VAPID_PRIVATE_KEY=zn2JQDGe0YC0L75BW-6LSTnnCxrQmBogn-VBvjngxZY" >> app/.env
        echo "VAPID_SUBJECT=mailto:admin@impactdatabase.com" >> app/.env
        echo -e "${GREEN}✓ Added VAPID key to app/.env${NC}"
    else
        echo -e "${GREEN}✓ VAPID key already configured${NC}"
    fi
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

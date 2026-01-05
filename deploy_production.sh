#!/bin/bash
# Pacific Impact Database - Production Deployment Script
# Generated: January 4, 2026
#
# Usage: ./deploy_production.sh [--check-only]
#
# This script:
# 1. Validates production configuration
# 2. Stops existing services
# 3. Starts services with production settings
# 4. Runs health checks
# 5. Runs production tests

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env.production"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
PROD_COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       Pacific Impact Database - Production Deployment        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running in check-only mode
CHECK_ONLY=false
if [[ "$1" == "--check-only" ]]; then
    CHECK_ONLY=true
    echo -e "${YELLOW}Running in check-only mode (no deployment)${NC}"
fi

# ==============================================================================
# Pre-flight Checks
# ==============================================================================
echo -e "${BLUE}[1/6] Running pre-flight checks...${NC}"

# Check for production env file
if [[ ! -f "$ENV_FILE" ]]; then
    echo -e "${RED}❌ ERROR: Production environment file not found!${NC}"
    echo -e "   Expected: ${ENV_FILE}"
    echo -e "   Run: cp .env.production.example .env.production"
    exit 1
fi
echo -e "${GREEN}  ✓ Production .env file found${NC}"

# Check for docker compose
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ ERROR: Docker is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}  ✓ Docker is installed${NC}"

if ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ ERROR: Docker Compose is not available${NC}"
    exit 1
fi
echo -e "${GREEN}  ✓ Docker Compose is available${NC}"

# ==============================================================================
# Configuration Validation
# ==============================================================================
echo ""
echo -e "${BLUE}[2/6] Validating production configuration...${NC}"

# Source the env file for validation
set -a
source "$ENV_FILE"
set +a

ERRORS=0

# Check ENVIRONMENT
if [[ "$ENVIRONMENT" != "production" ]]; then
    echo -e "${RED}  ❌ ENVIRONMENT must be 'production' (got: $ENVIRONMENT)${NC}"
    ((ERRORS++))
else
    echo -e "${GREEN}  ✓ ENVIRONMENT=production${NC}"
fi

# Check DEBUG
if [[ "$DEBUG" != "false" ]]; then
    echo -e "${RED}  ❌ DEBUG must be 'false' (got: $DEBUG)${NC}"
    ((ERRORS++))
else
    echo -e "${GREEN}  ✓ DEBUG=false${NC}"
fi

# Check SECRET_KEY strength
if [[ ${#SECRET_KEY} -lt 32 ]]; then
    echo -e "${RED}  ❌ SECRET_KEY must be at least 32 characters (got: ${#SECRET_KEY})${NC}"
    ((ERRORS++))
else
    echo -e "${GREEN}  ✓ SECRET_KEY is strong (${#SECRET_KEY} chars)${NC}"
fi

# Check for weak patterns in SECRET_KEY
if echo "$SECRET_KEY" | grep -qiE "(secret|password|key123|changeme|default|dev)"; then
    echo -e "${YELLOW}  ⚠ WARNING: SECRET_KEY may contain weak patterns${NC}"
fi

# Check POSTGRES_PASSWORD strength
if [[ ${#POSTGRES_PASSWORD} -lt 16 ]]; then
    echo -e "${RED}  ❌ POSTGRES_PASSWORD should be at least 16 characters${NC}"
    ((ERRORS++))
else
    echo -e "${GREEN}  ✓ POSTGRES_PASSWORD is strong${NC}"
fi

# Check MINIO credentials
if [[ "$MINIO_ROOT_USER" == "minioadmin" ]] || [[ "$MINIO_ROOT_PASSWORD" == "minioadmin" ]]; then
    echo -e "${RED}  ❌ MINIO credentials must be changed from defaults${NC}"
    ((ERRORS++))
else
    echo -e "${GREEN}  ✓ MINIO credentials configured${NC}"
fi

# Summary
if [[ $ERRORS -gt 0 ]]; then
    echo ""
    echo -e "${RED}Configuration validation failed with $ERRORS error(s)${NC}"
    echo -e "Please fix the issues in ${ENV_FILE}"
    exit 1
fi

echo -e "${GREEN}  ✓ All configuration checks passed${NC}"

if [[ "$CHECK_ONLY" == true ]]; then
    echo ""
    echo -e "${GREEN}Check-only mode complete. Configuration is valid.${NC}"
    exit 0
fi

# ==============================================================================
# Stop Existing Services
# ==============================================================================
echo ""
echo -e "${BLUE}[3/6] Stopping existing services...${NC}"

docker compose -f "$COMPOSE_FILE" -f "$PROD_COMPOSE_FILE" down --remove-orphans 2>/dev/null || true
echo -e "${GREEN}  ✓ Existing services stopped${NC}"

# ==============================================================================
# Start Production Services
# ==============================================================================
echo ""
echo -e "${BLUE}[4/6] Starting production services...${NC}"

docker compose -f "$COMPOSE_FILE" -f "$PROD_COMPOSE_FILE" --env-file "$ENV_FILE" up -d

echo -e "${GREEN}  ✓ Services started${NC}"

# ==============================================================================
# Wait for Services to be Healthy
# ==============================================================================
echo ""
echo -e "${BLUE}[5/6] Waiting for services to become healthy...${NC}"

MAX_RETRIES=30
RETRY_INTERVAL=5

for i in $(seq 1 $MAX_RETRIES); do
    HEALTHY=$(docker compose -f "$COMPOSE_FILE" -f "$PROD_COMPOSE_FILE" ps --format json 2>/dev/null | grep -c '"healthy"' || echo "0")
    TOTAL=$(docker compose -f "$COMPOSE_FILE" -f "$PROD_COMPOSE_FILE" ps --format json 2>/dev/null | wc -l || echo "0")
    
    # Simple health check via curl
    if curl -s http://localhost:8000/health | grep -q "ok"; then
        echo -e "${GREEN}  ✓ API is healthy${NC}"
        break
    fi
    
    echo -e "  Waiting for services... (attempt $i/$MAX_RETRIES)"
    sleep $RETRY_INTERVAL
done

# Final health check
if ! curl -s http://localhost:8000/health | grep -q "ok"; then
    echo -e "${RED}❌ API health check failed${NC}"
    echo "Check logs with: docker compose logs api"
    exit 1
fi

# Check frontend
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}  ✓ Frontend is accessible${NC}"
else
    echo -e "${YELLOW}  ⚠ Frontend may not be ready yet${NC}"
fi

# ==============================================================================
# Run Production Tests
# ==============================================================================
echo ""
echo -e "${BLUE}[6/6] Running production tests...${NC}"

if [[ -f "${SCRIPT_DIR}/tests/test_production_ready.py" ]]; then
    if command -v pytest &> /dev/null; then
        cd "$SCRIPT_DIR"
        pytest tests/test_production_ready.py -v --tb=short -x 2>/dev/null || {
            echo -e "${YELLOW}  ⚠ Some tests failed (non-blocking)${NC}"
        }
    else
        echo -e "${YELLOW}  ⚠ pytest not installed, skipping tests${NC}"
    fi
else
    echo -e "${YELLOW}  ⚠ Test file not found, skipping tests${NC}"
fi

# ==============================================================================
# Summary
# ==============================================================================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Production Deployment Complete!                 ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Services are running with production configuration."
echo ""
echo -e "Access points (internal only - use nginx for external access):"
echo -e "  • API:      http://127.0.0.1:8000"
echo -e "  • Frontend: http://127.0.0.1:3000"
echo -e "  • Flower:   http://127.0.0.1:5555"
echo ""
echo -e "${YELLOW}IMPORTANT: For external access, set up Nginx with SSL.${NC}"
echo -e "See: HTTPS_SSL_SETUP.md"
echo ""
echo -e "Commands:"
echo -e "  • View logs:    docker compose logs -f"
echo -e "  • Stop:         docker compose down"
echo -e "  • Status:       docker compose ps"

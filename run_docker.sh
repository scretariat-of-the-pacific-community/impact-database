#!/bin/bash

# Pacific Impact Database - Docker Startup Script
# This script helps manage the Docker environment for the application

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Function to check if Docker is running
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        log_error "Docker is not running. Please start Docker first."
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not available"
        exit 1
    fi
}

# Function to clean up old containers and volumes
cleanup() {
    log_info "Cleaning up old containers and volumes..."
    
    # Stop and remove containers
    docker-compose down --remove-orphans
    
    # Remove dangling images
    docker image prune -f
    
    log_success "Cleanup completed"
}

# Function to build and start services
start_services() {
    log_info "Building and starting services..."
    
    # Build images
    docker-compose build --no-cache
    
    # Start services
    docker-compose up -d
    
    log_success "Services started successfully"
}

# Function to check service health
check_health() {
    log_info "Checking service health..."
    
    services=("postgis_db" "redis" "minio" "web")
    all_healthy=true
    
    for service in "${services[@]}"; do
        log_info "Checking $service..."
        
        # Wait for service to be running
        timeout=60
        elapsed=0
        while [ $elapsed -lt $timeout ]; do
            if docker-compose ps "$service" | grep -q "Up"; then
                break
            fi
            sleep 2
            elapsed=$((elapsed + 2))
        done
        
        if [ $elapsed -ge $timeout ]; then
            log_error "$service failed to start within $timeout seconds"
            all_healthy=false
            continue
        fi
        
        # Check health status
        if docker-compose ps "$service" | grep -q "healthy\|Up"; then
            log_success "$service is healthy"
        else
            log_warning "$service is running but health check failed"
            all_healthy=false
        fi
    done
    
    if [ "$all_healthy" = true ]; then
        log_success "All services are healthy!"
        show_access_info
    else
        log_error "Some services are not healthy. Check logs with: docker-compose logs"
    fi
}

# Function to show access information
show_access_info() {
    echo ""
    echo "🚀 Pacific Impact Database is running!"
    echo "=================================="
    echo ""
    echo "📱 Application Services:"
    echo "   • API Documentation: http://localhost:8000/docs"
    echo "   • Health Check: http://localhost:8000/health"
    echo "   • GraphQL Playground: http://localhost:8000/graphql"
    echo "   • STAC API: http://localhost:8000/stac"
    echo "   • OGC API: http://localhost:8000/ogc"
    echo ""
    echo "🔧 Management Services:"
    echo "   • MinIO Console: http://localhost:9001 (admin/minioadmin)"
    echo "   • Celery Flower: http://localhost:5555"
    echo "   • PostgreSQL: localhost:5432 (postgres/password)"
    echo "   • Redis: localhost:6379"
    echo ""
    echo "📊 Monitoring:"
    echo "   • Prometheus Metrics: http://localhost:8000/metrics"
    echo "   • SLO Status: http://localhost:8000/monitoring/slo"
    echo "   • Performance Stats: http://localhost:8000/monitoring/performance"
    echo ""
    echo "🛠️  Useful Commands:"
    echo "   • View logs: docker-compose logs -f [service_name]"
    echo "   • Stop services: docker-compose down"
    echo "   • Restart service: docker-compose restart [service_name]"
    echo "   • Run tests: ./run_tests.sh"
    echo ""
}

# Function to show logs
show_logs() {
    local service=${1:-""}
    
    if [ -n "$service" ]; then
        log_info "Showing logs for $service..."
        docker-compose logs -f "$service"
    else
        log_info "Showing logs for all services..."
        docker-compose logs -f
    fi
}

# Function to run tests
run_tests() {
    log_info "Running application tests..."
    
    # Wait for services to be ready
    sleep 10
    
    # Run health check
    if curl -f http://localhost:8000/health > /dev/null 2>&1; then
        log_success "API is responding"
        
        # Run STAC/OGC tests if available
        if [ -f "./app/test_stac_ogc_apis.sh" ]; then
            log_info "Running STAC/OGC API tests..."
            ./app/test_stac_ogc_apis.sh
        fi
        
        # Run admin feature tests if available
        if [ -f "./app/test_admin_features.sh" ]; then
            log_info "Running admin feature tests..."
            ./app/test_admin_features.sh
        fi
    else
        log_error "API is not responding. Check logs: docker-compose logs web"
    fi
}

# Function to stop services
stop_services() {
    log_info "Stopping services..."
    docker-compose down
    log_success "Services stopped"
}

# Function to show usage
show_usage() {
    echo "Pacific Impact Database - Docker Management Script"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  start     - Start all services (default)"
    echo "  stop      - Stop all services"
    echo "  restart   - Restart all services"
    echo "  status    - Check service status"
    echo "  logs      - Show logs for all services"
    echo "  logs SERVICE - Show logs for specific service"
    echo "  test      - Run application tests"
    echo "  cleanup   - Clean up containers and images"
    echo "  shell     - Open shell in web container"
    echo "  help      - Show this help message"
    echo ""
    echo "Services: web, postgis_db, redis, minio, celery_worker, celery_beat, flower"
    echo ""
}

# Function to open shell in web container
open_shell() {
    log_info "Opening shell in web container..."
    docker-compose exec web bash
}

# Function to check status
check_status() {
    echo "Service Status:"
    echo "==============="
    docker-compose ps
}

# Main script logic
case "${1:-start}" in
    start)
        check_docker
        cleanup
        start_services
        sleep 10  # Give services time to start
        check_health
        ;;
    stop)
        check_docker
        stop_services
        ;;
    restart)
        check_docker
        stop_services
        sleep 5
        start_services
        sleep 10
        check_health
        ;;
    status)
        check_docker
        check_status
        ;;
    logs)
        check_docker
        show_logs "$2"
        ;;
    test)
        check_docker
        run_tests
        ;;
    cleanup)
        check_docker
        cleanup
        ;;
    shell)
        check_docker
        open_shell
        ;;
    help|--help|-h)
        show_usage
        ;;
    *)
        log_error "Unknown command: $1"
        show_usage
        exit 1
        ;;
esac

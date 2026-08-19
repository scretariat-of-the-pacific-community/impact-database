#!/bin/bash
# Docker Cache Management Script
# Optimizes and monitors Docker build cache

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "${BLUE}════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}════════════════════════════════════════${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Show usage
show_usage() {
    cat <<EOF
${BLUE}Docker Cache Management${NC}

Usage: $0 [COMMAND] [OPTIONS]

Commands:
    status              Show Docker disk usage and cache status
    clean               Clean unused build cache and system data
    optimize            Clean and enable BuildKit optimization
    prune-all          CAREFUL! Remove ALL unused Docker resources
    monitor            Monitor cache growth over time
    help                Show this help message

Examples:
    $0 status           # Check current cache usage
    $0 clean            # Free up disk space
    $0 optimize         # Full optimization with BuildKit

EOF
}

# Show Docker status
show_status() {
    print_header "Docker Cache Status"
    docker system df
    
    echo ""
    print_header "BuildKit Status"
    if [ -n "$DOCKER_BUILDKIT" ]; then
        print_success "BuildKit enabled (DOCKER_BUILDKIT=$DOCKER_BUILDKIT)"
    else
        print_warning "BuildKit not explicitly enabled"
        echo "Enable with: export DOCKER_BUILDKIT=1"
    fi
    
    echo ""
    print_header "Image Sizes"
    docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | \
        grep -E 'impact-database|REPOSITORY' || echo "No images found"
}

# Clean cache
clean_cache() {
    print_header "Cleaning Docker Cache"
    
    echo "Removing unused build cache..."
    docker builder prune --force
    
    echo "Removing unused system data..."
    docker system prune --force
    
    print_success "Cache cleaned successfully"
    
    echo ""
    show_status
}

# Full optimization
optimize() {
    print_header "Docker Cache Optimization"
    
    # Enable BuildKit
    export DOCKER_BUILDKIT=1
    export COMPOSE_DOCKER_CLI_BUILD=1
    print_success "BuildKit enabled"
    
    # Clean cache
    clean_cache
    
    # Show recommendations
    echo ""
    print_header "Optimization Complete"
    print_success "BuildKit is now enabled for faster builds"
    print_success "Unused cache cleared"
    echo ""
    print_warning "Add to your shell profile for persistent BuildKit:"
    echo "  export DOCKER_BUILDKIT=1"
    echo "  export COMPOSE_DOCKER_CLI_BUILD=1"
}

# Prune everything
prune_all() {
    print_warning "This will remove ALL unused Docker resources!"
    read -p "Are you sure? (type 'yes' to confirm): " confirm
    
    if [ "$confirm" != "yes" ]; then
        echo "Cancelled."
        return
    fi
    
    print_header "Removing ALL unused resources"
    
    docker builder prune --all --force
    docker system prune --all --force --volumes
    
    print_success "All unused resources removed"
    show_status
}

# Monitor cache growth
monitor_cache() {
    print_header "Cache Usage Monitoring"
    
    # Check if we can write to a monitoring file
    MONITOR_FILE="/tmp/docker_cache_monitor.txt"
    
    # Current timestamp
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Get current usage
    USAGE=$(docker system df --format "json" 2>/dev/null | \
        grep -o '"Size":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -z "$USAGE" ]; then
        USAGE="Unknown"
    fi
    
    echo "$TIMESTAMP - Cache Usage: $USAGE" >> "$MONITOR_FILE" 2>/dev/null || true
    
    echo "Current timestamp: $TIMESTAMP"
    echo "Estimated cache usage recorded"
    
    if [ -f "$MONITOR_FILE" ]; then
        echo ""
        print_header "Recent Cache History"
        tail -10 "$MONITOR_FILE"
    fi
}

# Main
case "${1:-status}" in
    status)
        show_status
        ;;
    clean)
        clean_cache
        ;;
    optimize)
        optimize
        ;;
    prune-all)
        prune_all
        ;;
    monitor)
        monitor_cache
        ;;
    help|--help|-h)
        show_usage
        ;;
    *)
        print_error "Unknown command: $1"
        show_usage
        exit 1
        ;;
esac

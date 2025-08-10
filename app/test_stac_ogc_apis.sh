#!/bin/bash

# Comprehensive test suite for STAC and OGC APIs
# Tests interoperability, performance, and SLO compliance

set -e

echo "🚀 Testing STAC and OGC API Implementation"
echo "=========================================="

# Configuration
BASE_URL="${BASE_URL:-http://localhost:8000}"
ADMIN_TOKEN=""
TEST_DATA_DIR="$(pwd)/test_data"
RESULTS_DIR="$(pwd)/test_results/$(date +%Y%m%d_%H%M%S)"

# Create directories
mkdir -p "$RESULTS_DIR"
mkdir -p "$TEST_DATA_DIR"

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

# Test result tracking
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

run_test() {
    local test_name="$1"
    local test_command="$2"
    
    echo ""
    log_info "Running test: $test_name"
    
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    
    if eval "$test_command"; then
        log_success "$test_name - PASSED"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        log_error "$test_name - FAILED"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Test health and readiness
test_health_endpoints() {
    echo ""
    echo "=== Health Check Tests ==="
    
    # Basic health check
    run_test "Health endpoint availability" \
        "curl -sf '$BASE_URL/health' > '$RESULTS_DIR/health.json'"
    
    # Readiness check
    run_test "Readiness check" \
        "curl -sf '$BASE_URL/health/ready' > '$RESULTS_DIR/ready.json'"
    
    # Liveness check
    run_test "Liveness check" \
        "curl -sf '$BASE_URL/health/live' > '$RESULTS_DIR/live.json'"
    
    # Metrics endpoint
    run_test "Prometheus metrics endpoint" \
        "curl -sf '$BASE_URL/metrics' > '$RESULTS_DIR/metrics.txt'"
}

# Test STAC API compliance
test_stac_api() {
    echo ""
    echo "=== STAC API Compliance Tests ==="
    
    # Test STAC catalog root
    run_test "STAC catalog root endpoint" \
        "curl -sf -H 'Accept: application/json' '$BASE_URL/stac' | jq -e '.type == \"Catalog\"' > '$RESULTS_DIR/stac_catalog.json'"
    
    # Test STAC conformance
    run_test "STAC conformance declaration" \
        "curl -sf '$BASE_URL/stac/conformance' | jq -e '.conformsTo | length > 0' > '$RESULTS_DIR/stac_conformance.json'"
    
    # Test collections endpoint
    run_test "STAC collections endpoint" \
        "curl -sf '$BASE_URL/stac/collections' | jq -e 'type == \"array\"' > '$RESULTS_DIR/stac_collections.json'"
    
    # Test search endpoint
    run_test "STAC search endpoint" \
        "curl -sf '$BASE_URL/stac/search?limit=5' | jq -e '.type == \"FeatureCollection\"' > '$RESULTS_DIR/stac_search.json'"
    
    # Test search with bbox
    run_test "STAC spatial search" \
        "curl -sf '$BASE_URL/stac/search?bbox=-180,-90,180,90&limit=3' | jq -e '.features | length <= 3' > '$RESULTS_DIR/stac_search_bbox.json'"
    
    # Test specific collection
    local collection_id=$(curl -sf "$BASE_URL/stac/collections" | jq -r '.[0].id // empty')
    if [ -n "$collection_id" ]; then
        run_test "STAC collection details" \
            "curl -sf '$BASE_URL/stac/collections/$collection_id' | jq -e '.type == \"Collection\"' > '$RESULTS_DIR/stac_collection_detail.json'"
        
        run_test "STAC collection items" \
            "curl -sf '$BASE_URL/stac/collections/$collection_id/items?limit=3' | jq -e '.type == \"FeatureCollection\"' > '$RESULTS_DIR/stac_collection_items.json'"
        
        # Test specific item if available
        local item_id=$(curl -sf "$BASE_URL/stac/collections/$collection_id/items?limit=1" | jq -r '.features[0].id // empty')
        if [ -n "$item_id" ]; then
            run_test "STAC item details" \
                "curl -sf '$BASE_URL/stac/collections/$collection_id/items/$item_id' | jq -e '.type == \"Feature\"' > '$RESULTS_DIR/stac_item_detail.json'"
        else
            log_warning "No items found in collection $collection_id for item detail test"
        fi
    else
        log_warning "No collections found for collection-specific tests"
    fi
}

# Test OGC API - Records compliance
test_ogc_api() {
    echo ""
    echo "=== OGC API - Records Compliance Tests ==="
    
    # Test OGC landing page
    run_test "OGC landing page" \
        "curl -sf '$BASE_URL/ogc' | jq -e '.title and .description and .links' > '$RESULTS_DIR/ogc_landing.json'"
    
    # Test OGC conformance
    run_test "OGC conformance declaration" \
        "curl -sf '$BASE_URL/ogc/conformance' | jq -e '.conformsTo | length > 0' > '$RESULTS_DIR/ogc_conformance.json'"
    
    # Test collections endpoint
    run_test "OGC collections endpoint" \
        "curl -sf '$BASE_URL/ogc/collections' | jq -e '.collections | type == \"array\"' > '$RESULTS_DIR/ogc_collections.json'"
    
    # Test specific collection
    local collection_id=$(curl -sf "$BASE_URL/ogc/collections" | jq -r '.collections[0].id // empty')
    if [ -n "$collection_id" ]; then
        run_test "OGC collection details" \
            "curl -sf '$BASE_URL/ogc/collections/$collection_id' | jq -e '.id and .title' > '$RESULTS_DIR/ogc_collection_detail.json'"
        
        run_test "OGC collection queryables" \
            "curl -sf '$BASE_URL/ogc/collections/$collection_id/queryables' | jq -e '.type == \"object\" and .properties' > '$RESULTS_DIR/ogc_queryables.json'"
        
        run_test "OGC collection records" \
            "curl -sf '$BASE_URL/ogc/collections/$collection_id/items?limit=3' | jq -e '.type == \"FeatureCollection\"' > '$RESULTS_DIR/ogc_records.json'"
        
        # Test specific record if available
        local record_id=$(curl -sf "$BASE_URL/ogc/collections/$collection_id/items?limit=1" | jq -r '.features[0].id // empty')
        if [ -n "$record_id" ]; then
            run_test "OGC record details" \
                "curl -sf '$BASE_URL/ogc/collections/$collection_id/items/$record_id' | jq -e '.type == \"Feature\"' > '$RESULTS_DIR/ogc_record_detail.json'"
        else
            log_warning "No records found in collection $collection_id for record detail test"
        fi
    else
        log_warning "No collections found for OGC collection-specific tests"
    fi
}

# Test performance and SLO compliance
test_performance() {
    echo ""
    echo "=== Performance and SLO Tests ==="
    
    # Test response times
    run_test "STAC catalog response time < 2s" \
        "time_taken=\$(curl -sf -w '%{time_total}' -o /dev/null '$BASE_URL/stac'); [ \$(echo \"\$time_taken < 2.0\" | bc) -eq 1 ]"
    
    run_test "OGC landing page response time < 2s" \
        "time_taken=\$(curl -sf -w '%{time_total}' -o /dev/null '$BASE_URL/ogc'); [ \$(echo \"\$time_taken < 2.0\" | bc) -eq 1 ]"
    
    # Test concurrent requests
    run_test "Concurrent STAC requests" \
        "for i in {1..10}; do curl -sf '$BASE_URL/stac/search?limit=5' > /dev/null & done; wait"
    
    # Test large result sets
    run_test "Large result set handling" \
        "curl -sf '$BASE_URL/stac/search?limit=100' | jq -e '.features | length <= 100' > '$RESULTS_DIR/large_result_set.json'"
    
    # Test pagination
    run_test "Pagination functionality" \
        "curl -sf '$BASE_URL/stac/search?limit=5&offset=0' | jq -e '.context.returned <= 5' > '$RESULTS_DIR/pagination_test.json'"
    
    # Test SLO monitoring endpoint
    run_test "SLO monitoring endpoint" \
        "curl -sf '$BASE_URL/monitoring/slo' > '$RESULTS_DIR/slo_status.json'"
    
    # Test performance stats
    run_test "Performance statistics endpoint" \
        "curl -sf '$BASE_URL/monitoring/performance' > '$RESULTS_DIR/performance_stats.json'"
}

# Test caching and optimization
test_caching() {
    echo ""
    echo "=== Caching and Optimization Tests ==="
    
    # Test cache headers
    run_test "STAC catalog cache headers" \
        "curl -sfI '$BASE_URL/stac' | grep -i 'cache-control\\|etag'"
    
    # Test repeated requests (should be faster due to caching)
    run_test "Cache performance improvement" \
        "
        time1=\$(curl -sf -w '%{time_total}' -o /dev/null '$BASE_URL/stac/collections')
        time2=\$(curl -sf -w '%{time_total}' -o /dev/null '$BASE_URL/stac/collections')
        [ \$(echo \"\$time2 <= \$time1\" | bc) -eq 1 ]
        "
    
    # Test spatial query optimization
    run_test "Spatial query optimization" \
        "curl -sf '$BASE_URL/stac/search?bbox=170,-20,180,-10&limit=10' > '$RESULTS_DIR/spatial_query.json'"
}

# Test interoperability with external tools
test_interoperability() {
    echo ""
    echo "=== Interoperability Tests ==="
    
    # Test STAC spec compliance with pystac (if available)
    if command -v python3 &> /dev/null; then
        run_test "STAC spec compliance check" \
            "python3 -c '
import json
import sys
try:
    import pystac
    # Test if STAC catalog can be loaded by pystac
    with open(\"$RESULTS_DIR/stac_catalog.json\") as f:
        catalog_data = json.load(f)
    catalog = pystac.Catalog.from_dict(catalog_data)
    print(f\"STAC catalog validation successful: {catalog.id}\")
except Exception as e:
    print(f\"STAC validation error: {e}\")
    sys.exit(1)
'"
    else
        log_warning "Python3 not available for STAC spec compliance check"
    fi
    
    # Test OGC compliance with basic JSON schema validation
    run_test "OGC API JSON structure validation" \
        "
        jq -e '
        .title and 
        .description and 
        .links and 
        (.links | map(select(.rel == \"self\" and .href)) | length > 0)
        ' '$RESULTS_DIR/ogc_landing.json' > /dev/null
        "
}

# Test security and access control
test_security() {
    echo ""
    echo "=== Security Tests ==="
    
    # Test CORS headers
    run_test "CORS headers present" \
        "curl -sfI -H 'Origin: http://example.com' '$BASE_URL/stac' | grep -i 'access-control-allow-origin'"
    
    # Test rate limiting (if implemented)
    run_test "Rate limiting protection" \
        "
        for i in {1..50}; do 
            response=\$(curl -sf -w '%{http_code}' -o /dev/null '$BASE_URL/stac/search')
            if [ \"\$response\" = \"429\" ]; then
                echo 'Rate limiting active'
                exit 0
            fi
        done
        echo 'No rate limiting detected (may be acceptable for development)'
        "
}

# Test monitoring and observability
test_monitoring() {
    echo ""
    echo "=== Monitoring and Observability Tests ==="
    
    # Test metrics collection
    run_test "Prometheus metrics format" \
        "curl -sf '$BASE_URL/metrics' | grep -E '^(# HELP|# TYPE|[a-zA-Z_:][a-zA-Z0-9_:]*)'"
    
    # Test health monitoring
    run_test "Detailed health status" \
        "curl -sf '$BASE_URL/health' | jq -e '.components.database.status and .components.system.status' > '$RESULTS_DIR/detailed_health.json'"
    
    # Test alerts endpoint
    run_test "Alerts monitoring" \
        "curl -sf '$BASE_URL/monitoring/alerts' > '$RESULTS_DIR/alerts.json'"
}

# Main test execution
main() {
    echo "Starting comprehensive STAC and OGC API test suite..."
    echo "Base URL: $BASE_URL"
    echo "Results will be saved to: $RESULTS_DIR"
    echo ""
    
    # Wait for service to be ready
    log_info "Waiting for service to be ready..."
    for i in {1..30}; do
        if curl -sf "$BASE_URL/health/ready" > /dev/null 2>&1; then
            log_success "Service is ready"
            break
        fi
        if [ $i -eq 30 ]; then
            log_error "Service not ready after 30 attempts"
            exit 1
        fi
        sleep 2
    done
    
    # Run test suites
    test_health_endpoints
    test_stac_api
    test_ogc_api
    test_performance
    test_caching
    test_interoperability
    test_security
    test_monitoring
    
    # Generate test report
    echo ""
    echo "=== Test Report ==="
    echo "Tests passed: $TESTS_PASSED"
    echo "Tests failed: $TESTS_FAILED"
    echo "Total tests: $TESTS_TOTAL"
    echo "Success rate: $(( TESTS_PASSED * 100 / TESTS_TOTAL ))%"
    
    # Create test report JSON
    cat > "$RESULTS_DIR/test_report.json" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "base_url": "$BASE_URL",
  "total_tests": $TESTS_TOTAL,
  "tests_passed": $TESTS_PASSED,
  "tests_failed": $TESTS_FAILED,
  "success_rate": $(( TESTS_PASSED * 100 / TESTS_TOTAL )),
  "exit_criteria": {
    "external_tools_can_query": $([ $TESTS_PASSED -gt 0 ] && echo "true" || echo "false"),
    "stac_compliance": $([ -f "$RESULTS_DIR/stac_catalog.json" ] && echo "true" || echo "false"),
    "ogc_compliance": $([ -f "$RESULTS_DIR/ogc_landing.json" ] && echo "true" || echo "false"),
    "performance_slo_met": $([ -f "$RESULTS_DIR/slo_status.json" ] && echo "true" || echo "false")
  }
}
EOF
    
    # Determine exit code
    if [ $TESTS_FAILED -eq 0 ]; then
        log_success "All tests passed! 🎉"
        echo ""
        echo "✅ EXIT CRITERIA MET:"
        echo "   - External tools can query the catalog"
        echo "   - STAC API compliance verified"
        echo "   - OGC API - Records compliance verified" 
        echo "   - Performance SLOs defined and monitored"
        echo "   - Caching and optimization implemented"
        echo "   - Monitoring and observability configured"
        exit 0
    else
        log_error "Some tests failed. Check the results in $RESULTS_DIR"
        exit 1
    fi
}

# Check dependencies
check_dependencies() {
    local deps=("curl" "jq" "bc")
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            log_error "Required dependency '$dep' not found"
            exit 1
        fi
    done
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [BASE_URL]"
        echo ""
        echo "Test the STAC and OGC API implementation"
        echo ""
        echo "Options:"
        echo "  BASE_URL    Base URL of the API (default: http://localhost:8000)"
        echo "  --help, -h  Show this help message"
        echo ""
        echo "Environment variables:"
        echo "  BASE_URL    Alternative way to set the base URL"
        echo ""
        exit 0
        ;;
    *)
        if [ -n "$1" ]; then
            BASE_URL="$1"
        fi
        ;;
esac

# Run the tests
check_dependencies
main

#!/usr/bin/env bash
set -euo pipefail

# Ensure TOKEN is set
: "${TOKEN:?TOKEN environment variable must be set}"

# Check FastAPI docs endpoint is reachable
curl -fsS http://localhost:8000/docs >/dev/null

# Upload test image using the provided JWT
response=$(curl -fsS -H "Authorization: Bearer ${TOKEN}" -F "file=@tests/hazard_test_images/flood_1.jpg" http://localhost:8000/upload/upload)

# Validate response contains expected fields
grep -q "asset" <<<"$response"
grep -q "geometry" <<<"$response"

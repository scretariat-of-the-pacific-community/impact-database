#!/bin/bash
set -e

echo "Verifying FFmpeg installation..."

# Check FFmpeg version
docker-compose run --rm api ffmpeg -version | grep "ffmpeg version"

# Check required codecs
REQUIRED_CODECS=("libx264" "libvpx-vp9" "libopus" "aac")
for codec in "${REQUIRED_CODECS[@]}"; do
    if docker-compose run --rm api ffmpeg -codecs 2>&1 | grep -q "$codec"; then
        echo "OK: Codec $codec found"
    else
        echo "ERROR: Codec $codec NOT found"
        exit 1
    fi
done

echo "OK: FFmpeg verification complete"

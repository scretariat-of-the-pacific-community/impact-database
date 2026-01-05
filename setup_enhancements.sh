#!/bin/bash
# Setup script for enhanced photo geotagging features

echo "=========================================="
echo "Enhanced Photo Geotagging Setup"
echo "=========================================="
echo ""

# Check if running in Docker
if [ -f /.dockerenv ]; then
    echo "✓ Running in Docker container"
    PIP_CMD="pip"
else
    echo "✓ Running on host system"
    # Try different pip commands
    if command -v pip3 &> /dev/null; then
        PIP_CMD="pip3"
    elif command -v pip &> /dev/null; then
        PIP_CMD="pip"
    else
        echo "✗ Error: pip not found. Please install Python pip first:"
        echo "  sudo apt install python3-pip"
        exit 1
    fi
fi

echo ""
echo "Installing Python dependencies..."
echo "-----------------------------------"

# Install Python packages
$PIP_CMD install exifread python-xmp-toolkit pillow-heif httpx

if [ $? -ne 0 ]; then
    echo "✗ Failed to install Python packages"
    exit 1
fi

echo "✓ Python packages installed"
echo ""

# Check for system dependencies
echo "Checking system dependencies..."
echo "-----------------------------------"

# Check for libexempi (needed for XMP)
if ldconfig -p | grep -q libexempi; then
    echo "✓ libexempi found"
else
    echo "⚠ libexempi not found (needed for XMP extraction)"
    echo "  Install with: sudo apt-get install libexempi8"
fi

echo ""

# Check if Alembic is available
if command -v alembic &> /dev/null || $PIP_CMD show alembic &> /dev/null; then
    echo "✓ Alembic found"
    
    read -p "Run database migration now? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd app
        if command -v alembic &> /dev/null; then
            alembic upgrade head
        elif python3 -m alembic upgrade head; then
            echo "✓ Migration completed"
        else
            echo "⚠ Could not run migration. Run manually with:"
            echo "  cd app && alembic upgrade head"
        fi
        cd ..
    fi
else
    echo "⚠ Alembic not found"
    echo "  Install with: $PIP_CMD install alembic"
fi

echo ""
echo "=========================================="
echo "Setup Summary"
echo "=========================================="
echo ""
echo "✓ Dependencies added to requirements.txt"
echo "✓ Python packages installed"
echo ""
echo "Next Steps:"
echo "-----------------------------------"
echo "1. Run migration (if not done):"
echo "   cd app && alembic upgrade head"
echo ""
echo "2. Install system package for XMP support:"
echo "   sudo apt-get install libexempi8"
echo ""
echo "3. Start Celery worker for batch uploads:"
echo "   celery -A app.workers.batch_upload_tasks worker --loglevel=info"
echo ""
echo "4. Configure settings in .env:"
echo "   EXIF_LIBRARY=PIL  # or exifread"
echo "   ENABLE_XMP_EXTRACTION=false"
echo "   AUTO_CONVERT_HEIF=true"
echo ""
echo "5. Review implementation guide:"
echo "   cat ENHANCEMENTS_SUMMARY.md"
echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="

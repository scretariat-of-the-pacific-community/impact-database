#!/bin/bash

# Simple FastAPI Application Runner
# This script runs the Impact Database API with minimal dependencies

set -e

echo "🚀 Starting Impact Database Application (Simplified Mode)"
echo "=========================================================="

# Navigate to the app directory
cd "$(dirname "$0")/app"

# Check if virtual environment is activated
if [[ "$VIRTUAL_ENV" == "" ]]; then
    echo "⚠️  Virtual environment not detected. Activating fresh_venv..."
    cd ..
    source fresh_venv/bin/activate
    cd app
fi

echo "✅ Virtual environment activated: $VIRTUAL_ENV"

# Set environment for local development
export ENVIRONMENT=development
export DEBUG=true
export DATABASE_URL=sqlite:///./app.db
export SECRET_KEY=dev-secret-key-for-local-testing-32-chars-minimum

echo "📝 Configuration:"
echo "  Environment: $ENVIRONMENT"
echo "  Database: SQLite (local file)"
echo "  Debug: $DEBUG"

# Create local storage directory
mkdir -p uploads
echo "📁 Created local storage directory: uploads/"

# Check if we can import our modules
echo "🔍 Validating application modules..."
python3 -c "
try:
    from core.config import Settings
    settings = Settings()
    print('✅ Configuration loaded successfully')
    print(f'  Environment: {settings.ENVIRONMENT}')
    print(f'  Database URL: {settings.DATABASE_URL}')
except Exception as e:
    print(f'❌ Configuration error: {e}')
    exit(1)
"

echo ""
echo "🎯 Starting FastAPI server..."
echo "   API: http://localhost:8000"
echo "   Docs: http://localhost:8000/docs"
echo "   Health: http://localhost:8000/health"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the FastAPI server using the simplified main application
python3 -m uvicorn core.main_simple:app --host 0.0.0.0 --port 8000 --reload --log-level info

#!/bin/bash
# Run database migration to add user data tables

echo "========================================="
echo "Running Database Migration"
echo "Adding user_profiles, user_settings, and api_tokens tables"
echo "========================================="

cd "$(dirname "$0")"

# Check if alembic is available
if ! command -v alembic &> /dev/null; then
    echo "Error: alembic not found. Installing dependencies..."
    pip install alembic
fi

# Run the migration
echo ""
echo "Running Alembic migration..."
alembic upgrade head

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "New tables created:"
    echo "  - user_profiles: Extended user profile information"
    echo "  - user_settings: User preferences and settings (JSONB)"
    echo "  - api_tokens: API token management with expiration"
    echo ""
    echo "The following features are now available:"
    echo "  ✅ Persistent user settings (no longer in-memory)"
    echo "  ✅ API token generation with expiration (90 days default)"
    echo "  ✅ Rate limiting (10 requests/minute per user)"
    echo "  ✅ Input validation on all PUT/POST endpoints"
    echo ""
else
    echo ""
    echo "❌ Migration failed. Check error messages above."
    exit 1
fi

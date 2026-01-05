#!/bin/bash
# Clear all caches for the frontend

echo "🧹 Clearing all caches..."

# Stop frontend
echo "1. Stopping frontend container..."
docker compose stop frontend

# Remove .next build cache
echo "2. Removing .next build cache..."
rm -rf frontend/.next

# Remove node_modules/.cache if exists
echo "3. Removing node_modules cache..."
rm -rf frontend/node_modules/.cache

# Clear Docker build cache for frontend
echo "4. Clearing Docker build cache..."
docker builder prune -f

# Restart frontend
echo "5. Starting frontend container..."
docker compose up -d frontend

echo ""
echo "✅ Cache cleared! Please:"
echo "   1. Open your browser DevTools (F12)"
echo "   2. Right-click the refresh button"
echo "   3. Select 'Empty Cache and Hard Reload'"
echo "   4. Or use: Ctrl+Shift+Delete → Clear browsing data → Cached images and files"
echo ""
echo "If the error persists, unregister the service worker:"
echo "   1. Open DevTools → Application tab"
echo "   2. Service Workers section"
echo "   3. Click 'Unregister' for all service workers"
echo "   4. Close all tabs with localhost:3000"
echo "   5. Reopen the site"

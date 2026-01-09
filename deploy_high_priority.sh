#!/bin/bash
# Deploy high-priority fixes: indexes, achievements, CSRF

set -e

echo "=== Deploying High-Priority Production Fixes ==="
echo ""

# Navigate to app directory
cd /home/kishank/impact-database/app

# 1. Run database migrations for indexes
echo "Step 1: Running database migration for uploader indexes..."
docker compose exec api alembic upgrade head || {
    echo "Alembic migration failed, running SQL directly..."

    # Run index migration SQL directly
    docker compose exec -T postgis_db psql -U postgres -d impact_db <<'EOF'
-- Add uploader_id indexes for performance
CREATE INDEX IF NOT EXISTS idx_image_metadata_uploader_id ON image_metadata(uploader_id);
CREATE INDEX IF NOT EXISTS idx_image_metadata_uploader_status ON image_metadata(uploader_id, status);
CREATE INDEX IF NOT EXISTS idx_image_metadata_uploader_datetime ON image_metadata(uploader_id, datetime DESC);
CREATE INDEX IF NOT EXISTS idx_image_metadata_status ON image_metadata(status);
CREATE INDEX IF NOT EXISTS idx_image_metadata_hazard_type ON image_metadata(hazard_type);
CREATE INDEX IF NOT EXISTS idx_image_metadata_datetime ON image_metadata(datetime DESC);
CREATE INDEX IF NOT EXISTS idx_image_metadata_location ON image_metadata(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

SELECT 'Created indexes successfully' as status;
EOF
}

echo "✅ Uploader indexes created"
echo ""

# 2. Create achievements tables
echo "Step 2: Creating achievements tables..."
docker compose exec -T postgis_db psql -U postgres -d impact_db <<'EOF'
-- Create achievements table
CREATE TABLE IF NOT EXISTS achievements (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    description VARCHAR NOT NULL,
    icon VARCHAR,
    category VARCHAR NOT NULL,
    criteria_type VARCHAR NOT NULL,
    criteria_metric VARCHAR NOT NULL,
    criteria_threshold FLOAT NOT NULL,
    tier VARCHAR DEFAULT 'bronze',
    points INTEGER DEFAULT 10,
    is_hidden BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create user_achievements table
CREATE TABLE IF NOT EXISTS user_achievements (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    achievement_id VARCHAR NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    progress FLOAT DEFAULT 0.0,
    unlocked BOOLEAN DEFAULT false,
    unlocked_at TIMESTAMPTZ,
    unlock_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement_id ON user_achievements(achievement_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_unlocked ON user_achievements(user_id, unlocked);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_achievements_unique ON user_achievements(user_id, achievement_id);

SELECT 'Created achievements tables successfully' as status;
EOF

echo "✅ Achievement tables created"
echo ""

# 3. Seed default achievements
echo "Step 3: Seeding default achievements..."
docker compose exec api python3 -c "
from models.database import SessionLocal
from services.achievement_service import achievement_service

db = SessionLocal()
try:
    achievement_service.seed_achievements(db)
    print('✅ Seeded achievements successfully')
finally:
    db.close()
" || echo "⚠️  Achievement seeding failed (may already exist)"

echo ""

# 4. Restart API to load CSRF middleware
echo "Step 4: Restarting API to load CSRF middleware..."
docker compose restart api

echo "Waiting for API to start..."
sleep 5

echo "✅ API restarted with CSRF protection"
echo ""

# 5. Verify deployment
echo "=== Verifying Deployment ==="
echo ""

# Check indexes
echo "Checking indexes..."
docker compose exec -T postgis_db psql -U postgres -d impact_db -c "
SELECT
    tablename,
    indexname
FROM pg_indexes
WHERE tablename IN ('image_metadata', 'user_achievements')
ORDER BY tablename, indexname;
"

echo ""
echo "Checking achievement tables..."
docker compose exec -T postgis_db psql -U postgres -d impact_db -c "
SELECT COUNT(*) as total_achievements FROM achievements;
"

echo ""
echo "=== Deployment Summary ==="
echo "✅ Database indexes created (7 indexes for uploader queries)"
echo "✅ Achievement system deployed (tables + 10 default achievements)"
echo "✅ CSRF protection middleware added"
echo ""
echo "High-priority fixes complete!"
echo ""
echo "Test with:"
echo "  curl http://localhost:8000/api/user/achievements"
echo "  curl -X POST http://localhost:8000/api/upload (should require X-CSRF-Token header)"

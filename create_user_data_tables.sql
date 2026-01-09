-- Manual SQL script to create user data tables
-- Run this if Alembic migration fails due to connection issues
-- Execute: docker compose exec postgis_db psql -U postgres -d impact_db -f /path/to/this/file.sql

-- user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR UNIQUE NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    bio TEXT,
    avatar_url VARCHAR,
    organization VARCHAR,
    location VARCHAR,
    website VARCHAR,
    orcid VARCHAR,
    twitter_handle VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_user_profiles_user_id ON user_profiles(user_id);

-- user_settings table
CREATE TABLE IF NOT EXISTS user_settings (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR UNIQUE NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    profile_settings JSONB NOT NULL DEFAULT '{}',
    privacy_settings JSONB NOT NULL DEFAULT '{}',
    notification_settings JSONB NOT NULL DEFAULT '{}',
    default_metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_user_settings_user_id ON user_settings(user_id);

-- api_tokens table
CREATE TABLE IF NOT EXISTS api_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    name VARCHAR NOT NULL,
    token_hash VARCHAR UNIQUE NOT NULL,
    token_prefix VARCHAR(10) NOT NULL,
    scopes JSONB NOT NULL DEFAULT '["read"]',
    last_used_at TIMESTAMP WITH TIME ZONE,
    usage_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS ix_api_tokens_user_id ON api_tokens(user_id);
CREATE INDEX IF NOT EXISTS ix_api_tokens_token_hash ON api_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_api_tokens_user_active ON api_tokens(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_api_tokens_expiry ON api_tokens(expires_at);

-- Verify tables were created
SELECT 'user_profiles' as table_name, COUNT(*) as row_count FROM user_profiles
UNION ALL
SELECT 'user_settings', COUNT(*) FROM user_settings
UNION ALL
SELECT 'api_tokens', COUNT(*) FROM api_tokens;

-- Show table structures
\d user_profiles
\d user_settings
\d api_tokens

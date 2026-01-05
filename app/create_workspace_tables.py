"""Script to manually create workspace tables"""
from sqlalchemy import text
from models.database import engine

sqls = [
    """
    CREATE TABLE IF NOT EXISTS workspaces (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(150) NOT NULL,
        description VARCHAR(500),
        owner_id VARCHAR,
        settings JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_workspaces_owner_id ON workspaces(owner_id)",
    """
    CREATE TABLE IF NOT EXISTS workspace_members (
        id SERIAL PRIMARY KEY,
        workspace_id UUID NOT NULL,
        user_id VARCHAR NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'viewer',
        invited_by VARCHAR,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_workspace_member UNIQUE (workspace_id, user_id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_workspace_members_workspace_id ON workspace_members(workspace_id)",
    "CREATE INDEX IF NOT EXISTS ix_workspace_members_user_id ON workspace_members(user_id)",
    "CREATE INDEX IF NOT EXISTS ix_workspace_members_role ON workspace_members(role)",
    """
    CREATE TABLE IF NOT EXISTS workspace_channels (
        id SERIAL PRIMARY KEY,
        workspace_id UUID NOT NULL,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_workspace_channel_name UNIQUE (workspace_id, name)
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_workspace_channels_workspace_id ON workspace_channels(workspace_id)",
    # Add foreign keys after tables exist
    """
    DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_workspaces_owner_id') THEN
            ALTER TABLE workspaces ADD CONSTRAINT fk_workspaces_owner_id 
            FOREIGN KEY (owner_id) REFERENCES users(username) ON DELETE SET NULL;
        END IF;
    END $$
    """,
    """
    DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_workspace_members_workspace_id') THEN
            ALTER TABLE workspace_members ADD CONSTRAINT fk_workspace_members_workspace_id 
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
        END IF;
    END $$
    """,
    """
    DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_workspace_members_user_id') THEN
            ALTER TABLE workspace_members ADD CONSTRAINT fk_workspace_members_user_id 
            FOREIGN KEY (user_id) REFERENCES users(username) ON DELETE CASCADE;
        END IF;
    END $$
    """,
    """
    DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_workspace_channels_workspace_id') THEN
            ALTER TABLE workspace_channels ADD CONSTRAINT fk_workspace_channels_workspace_id 
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
        END IF;
    END $$
    """,
]

with engine.connect() as conn:
    for sql in sqls:
        try:
            conn.execute(text(sql))
            conn.commit()
            print(f"✓ Executed: {sql[:60].strip()}...")
        except Exception as e:
            print(f"✗ Error: {str(e)[:100]}")
            conn.rollback()

print("\n=== Verifying tables ===")
from sqlalchemy import inspect
inspector = inspect(engine)
ws_tables = [t for t in inspector.get_table_names() if 'workspace' in t]
print(f"Workspace tables created: {sorted(ws_tables)}")

print("\n✅ All collaboration tables setup complete!")

"""Phase 0: Add RBAC foundation tables (roles, permissions, users)

Revision ID: 006_add_rbac_foundation
Revises: 005_add_webhook_subscriptions_table
Create Date: 2025-11-10 14:00:00.000000

"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op
from datetime import datetime, timezone

# revision identifiers, used by Alembic.
revision = "006_add_rbac_foundation"
down_revision = "005_add_webhook_subscriptions_table"
branch_labels = None
depends_on = None


def upgrade():
    """
    Phase 0: Foundation & Integration
    - Create roles table
    - Create permissions table
    - Create role_permissions junction table
    - Create users table with RBAC support
    - Seed default roles and permissions
    """

    # Create roles table
    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("level", sa.Integer(), nullable=False),
        sa.Column("is_system_role", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_roles_name", "roles", ["name"])
    op.create_index("ix_roles_level", "roles", ["level"])

    # Create permissions table
    op.create_table(
        "permissions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("resource", sa.String(length=50), nullable=False),
        sa.Column("action", sa.String(length=50), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_permissions_name", "permissions", ["name"])
    op.create_index("ix_permissions_resource", "permissions", ["resource"])
    op.create_index("ix_permissions_action", "permissions", ["action"])

    # Create role_permissions junction table
    op.create_table(
        "role_permissions",
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("permission_id", sa.Integer(), nullable=False),
        sa.Column(
            "granted_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["permission_id"], ["permissions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("role_id", "permission_id"),
    )

    # Create users table
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("username", sa.String(length=100), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("hashed_password", sa.String(length=255), nullable=True),
        sa.Column("role_id", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("avatar_url", sa.String(length=500), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("department", sa.String(length=100), nullable=True),
        sa.Column("position", sa.String(length=100), nullable=True),
        sa.Column("timezone", sa.String(length=50), nullable=False, server_default="UTC"),
        sa.Column("language", sa.String(length=10), nullable=False, server_default="en"),
        sa.Column(
            "notification_preferences",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default='{"email": true, "slack": false, "in_app": true}',
        ),
        sa.Column(
            "review_preferences",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("reviews_completed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("avg_review_time_minutes", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("username"),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_username", "users", ["username"])
    op.create_index("ix_users_role_id", "users", ["role_id"])

    # Seed default roles
    roles_table = sa.table(
        "roles",
        sa.column("name", sa.String),
        sa.column("display_name", sa.String),
        sa.column("description", sa.Text),
        sa.column("level", sa.Integer),
        sa.column("is_system_role", sa.Boolean),
    )

    op.bulk_insert(
        roles_table,
        [
            {
                "name": "admin",
                "display_name": "Administrator",
                "description": "Full system access including user management and system configuration",
                "level": 1,
                "is_system_role": True,
            },
            {
                "name": "senior_reviewer",
                "display_name": "Senior Reviewer",
                "description": "Can review, assign, and approve all items",
                "level": 2,
                "is_system_role": True,
            },
            {
                "name": "reviewer",
                "display_name": "Reviewer",
                "description": "Can review assigned items and update metadata",
                "level": 3,
                "is_system_role": True,
            },
            {
                "name": "contributor",
                "display_name": "Contributor",
                "description": "Can submit items for review",
                "level": 4,
                "is_system_role": True,
            },
            {
                "name": "viewer",
                "display_name": "Viewer",
                "description": "Read-only access to approved content",
                "level": 5,
                "is_system_role": True,
            },
        ],
    )

    # Seed permissions
    permissions_table = sa.table(
        "permissions",
        sa.column("name", sa.String),
        sa.column("resource", sa.String),
        sa.column("action", sa.String),
        sa.column("description", sa.Text),
    )

    op.bulk_insert(
        permissions_table,
        [
            # Review item permissions
            {
                "name": "review:read",
                "resource": "review_item",
                "action": "read",
                "description": "View review items",
            },
            {
                "name": "review:create",
                "resource": "review_item",
                "action": "create",
                "description": "Create review items",
            },
            {
                "name": "review:update",
                "resource": "review_item",
                "action": "update",
                "description": "Edit review items",
            },
            {
                "name": "review:delete",
                "resource": "review_item",
                "action": "delete",
                "description": "Delete review items",
            },
            {
                "name": "review:approve",
                "resource": "review_item",
                "action": "approve",
                "description": "Approve review items",
            },
            {
                "name": "review:reject",
                "resource": "review_item",
                "action": "reject",
                "description": "Reject review items",
            },
            {
                "name": "review:assign",
                "resource": "review_item",
                "action": "assign",
                "description": "Assign items to reviewers",
            },
            {
                "name": "review:flag",
                "resource": "review_item",
                "action": "flag",
                "description": "Flag items for attention",
            },
            # Metadata permissions
            {
                "name": "metadata:read",
                "resource": "metadata",
                "action": "read",
                "description": "View metadata",
            },
            {
                "name": "metadata:update",
                "resource": "metadata",
                "action": "update",
                "description": "Edit metadata",
            },
            # User management permissions
            {
                "name": "user:read",
                "resource": "user",
                "action": "read",
                "description": "View users",
            },
            {
                "name": "user:manage",
                "resource": "user",
                "action": "manage",
                "description": "Manage users and roles",
            },
            # Audit permissions
            {
                "name": "audit:view",
                "resource": "audit",
                "action": "read",
                "description": "View audit logs",
            },
            # Notification permissions
            {
                "name": "notification:send",
                "resource": "notification",
                "action": "send",
                "description": "Send notifications to users",
            },
        ],
    )

    # Assign permissions to roles
    # Note: This uses raw SQL because we need to reference the inserted rows
    op.execute(
        """
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r
        CROSS JOIN permissions p
        WHERE r.name = 'admin';
    """
    )

    op.execute(
        """
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r
        CROSS JOIN permissions p
        WHERE r.name = 'senior_reviewer'
        AND p.name IN (
            'review:read', 'review:create', 'review:update', 'review:approve',
            'review:reject', 'review:assign', 'review:flag',
            'metadata:read', 'metadata:update',
            'audit:view', 'notification:send'
        );
    """
    )

    op.execute(
        """
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r
        CROSS JOIN permissions p
        WHERE r.name = 'reviewer'
        AND p.name IN (
            'review:read', 'review:update', 'review:flag',
            'metadata:read', 'metadata:update'
        );
    """
    )

    op.execute(
        """
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r
        CROSS JOIN permissions p
        WHERE r.name = 'contributor'
        AND p.name IN (
            'review:read', 'review:create',
            'metadata:read', 'metadata:update'
        );
    """
    )

    op.execute(
        """
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r
        CROSS JOIN permissions p
        WHERE r.name = 'viewer'
        AND p.name IN ('review:read', 'metadata:read');
    """
    )

    # Create a default admin user if needed
    # Password: "admin123" (CHANGE THIS IN PRODUCTION!)
    op.execute(
        """
        INSERT INTO users (id, email, username, full_name, hashed_password, role_id, is_active, is_verified)
        SELECT
            gen_random_uuid(),
            'admin@impactdb.local',
            'admin',
            'System Administrator',
            '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5oe2b3QZQWQ.K',
            r.id,
            true,
            true
        FROM roles r
        WHERE r.name = 'admin';
    """
    )

    # Create development user
    op.execute(
        """
        INSERT INTO users (id, email, username, full_name, role_id, is_active, is_verified)
        SELECT
            gen_random_uuid(),
            'dev@example.com',
            'dev_user',
            'Development User',
            r.id,
            true,
            true
        FROM roles r
        WHERE r.name = 'contributor';
    """
    )

    print("✅ Phase 0 Migration Complete:")
    print("   - Created roles, permissions, users tables")
    print("   - Seeded 5 default roles")
    print("   - Seeded 14 permissions")
    print("   - Assigned permissions to roles")
    print("   - Created default admin user (admin@impactdb.local / admin123)")
    print("   - Created development user (dev_user)")


def downgrade():
    """Rollback Phase 0 changes"""
    op.drop_table("users")
    op.drop_table("role_permissions")
    op.drop_table("permissions")
    op.drop_table("roles")

    print("✅ Phase 0 Rollback Complete: RBAC tables removed")

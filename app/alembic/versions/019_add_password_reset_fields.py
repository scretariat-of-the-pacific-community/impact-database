"""Add password reset fields to users table

Revision ID: 019_add_password_reset_fields
Revises: 018_add_is_locked_to_users
Create Date: 2025-01-13 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "019_add_password_reset_fields"
down_revision = "018_add_is_locked_to_users"
branch_labels = None
depends_on = None


def upgrade():
    """Add password reset token and expiration fields to users table"""
    from alembic import context
    conn = context.get_bind()
    
    # Check if columns already exist
    result = conn.execute(sa.text("""
        SELECT column_name FROM information_schema.columns 
        WHERE table_name='users' AND column_name IN ('password_reset_token', 'password_reset_expires')
    """))
    existing_columns = {row[0] for row in result}
    
    # Add password_reset_token column if it doesn't exist
    if 'password_reset_token' not in existing_columns:
        op.add_column(
            "users",
            sa.Column("password_reset_token", sa.String(length=255), nullable=True),
        )
    
    # Add password_reset_expires column if it doesn't exist
    if 'password_reset_expires' not in existing_columns:
        op.add_column(
            "users",
            sa.Column("password_reset_expires", sa.DateTime(timezone=True), nullable=True),
        )
    
    # Check if index exists
    result = conn.execute(sa.text("""
        SELECT indexname FROM pg_indexes 
        WHERE tablename='users' AND indexname='ix_users_password_reset_token'
    """))
    index_exists = result.fetchone() is not None
    
    # Add indexes for password reset fields (for efficient lookups) if not exists
    if not index_exists:
        op.create_index(
            "ix_users_password_reset_token",
            "users",
            ["password_reset_token"],
            unique=False,
        )


def downgrade():
    """Remove password reset fields from users table"""
    
    # Drop indexes
    op.drop_index("ix_users_password_reset_token", table_name="users")
    
    # Drop columns
    op.drop_column("users", "password_reset_expires")
    op.drop_column("users", "password_reset_token")

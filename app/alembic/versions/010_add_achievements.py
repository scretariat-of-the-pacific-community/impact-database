"""Add achievements tables

Revision ID: 010_add_achievements
Revises: 009_add_uploader_indexes
Create Date: 2024-01-15 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

# revision identifiers, used by Alembic.
revision = '010_add_achievements'
down_revision = '009_add_uploader_indexes'
branch_labels = None
depends_on = None


def upgrade():
    # Create achievements table
    op.create_table(
        'achievements',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=False),
        sa.Column('icon', sa.String(), nullable=True),
        sa.Column('category', sa.String(), nullable=False),
        sa.Column('criteria_type', sa.String(), nullable=False),
        sa.Column('criteria_metric', sa.String(), nullable=False),
        sa.Column('criteria_threshold', sa.Float(), nullable=False),
        sa.Column('tier', sa.String(), nullable=True, server_default='bronze'),
        sa.Column('points', sa.Integer(), nullable=True, server_default='10'),
        sa.Column('is_hidden', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create user_achievements table
    op.create_table(
        'user_achievements',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('achievement_id', sa.String(), nullable=False),
        sa.Column('progress', sa.Float(), nullable=True, server_default='0.0'),
        sa.Column('unlocked', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('unlocked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('unlock_metadata', JSONB(), nullable=True, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.username'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['achievement_id'], ['achievements.id'], ondelete='CASCADE')
    )
    
    # Create indexes
    op.create_index('idx_user_achievements_user_id', 'user_achievements', ['user_id'])
    op.create_index('idx_user_achievements_achievement_id', 'user_achievements', ['achievement_id'])
    op.create_index('idx_user_achievements_user_unlocked', 'user_achievements', ['user_id', 'unlocked'])
    op.create_index('idx_user_achievements_unique', 'user_achievements', ['user_id', 'achievement_id'], unique=True)


def downgrade():
    op.drop_index('idx_user_achievements_unique', 'user_achievements')
    op.drop_index('idx_user_achievements_user_unlocked', 'user_achievements')
    op.drop_index('idx_user_achievements_achievement_id', 'user_achievements')
    op.drop_index('idx_user_achievements_user_id', 'user_achievements')
    op.drop_table('user_achievements')
    op.drop_table('achievements')

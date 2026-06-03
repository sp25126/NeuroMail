"""phase6_llm_backbone

Revision ID: e8a8b1c47df1
Revises: a8447d283684
Create Date: 2026-05-31 23:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8a8b1c47df1'
down_revision: Union[str, Sequence[str], None] = 'a8447d283684'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create tenant_llm_configs table
    op.create_table('tenant_llm_configs',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('tenant_id', sa.String(), nullable=False),
    sa.Column('provider', sa.String(), nullable=False),
    sa.Column('model_name', sa.String(), nullable=False),
    sa.Column('encrypted_api_key', sa.Text(), nullable=True),
    sa.Column('temperature', sa.Float(), nullable=False, server_default='0.0'),
    sa.Column('max_tokens', sa.Integer(), nullable=False, server_default='1000'),
    sa.Column('auto_routing_enabled', sa.Boolean(), nullable=False, server_default='0'),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tenant_id')
    )
    op.create_index(op.f('ix_tenant_llm_configs_id'), 'tenant_llm_configs', ['id'], unique=False)

    # Create tenant_token_usages table
    op.create_table('tenant_token_usages',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('tenant_id', sa.String(), nullable=False),
    sa.Column('provider', sa.String(), nullable=False),
    sa.Column('model_name', sa.String(), nullable=False),
    sa.Column('prompt_tokens', sa.Integer(), nullable=False, server_default='0'),
    sa.Column('completion_tokens', sa.Integer(), nullable=False, server_default='0'),
    sa.Column('total_tokens', sa.Integer(), nullable=False, server_default='0'),
    sa.Column('feature_name', sa.String(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_tenant_token_usages_id'), 'tenant_token_usages', ['id'], unique=False)

    # Create ai_feedback_signals table
    op.create_table('ai_feedback_signals',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('tenant_id', sa.String(), nullable=False),
    sa.Column('feature', sa.String(), nullable=False),
    sa.Column('original_value', sa.JSON(), nullable=False),
    sa.Column('corrected_value', sa.JSON(), nullable=False),
    sa.Column('context', sa.JSON(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_ai_feedback_signals_id'), 'ai_feedback_signals', ['id'], unique=False)

    # Add columns to identifiers table
    with op.batch_alter_table('identifiers', schema=None) as batch_op:
        batch_op.add_column(sa.Column('confidence', sa.Float(), nullable=False, server_default='1.0'))

    # Add columns to ai_enrichment_caches table
    with op.batch_alter_table('ai_enrichment_caches', schema=None) as batch_op:
        batch_op.add_column(sa.Column('urgency_score', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('priority_label', sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('ai_enrichment_caches', schema=None) as batch_op:
        batch_op.drop_column('priority_label')
        batch_op.drop_column('urgency_score')

    with op.batch_alter_table('identifiers', schema=None) as batch_op:
        batch_op.drop_column('confidence')

    op.drop_index(op.f('ix_ai_feedback_signals_id'), table_name='ai_feedback_signals')
    op.drop_table('ai_feedback_signals')

    op.drop_index(op.f('ix_tenant_token_usages_id'), table_name='tenant_token_usages')
    op.drop_table('tenant_token_usages')

    op.drop_index(op.f('ix_tenant_llm_configs_id'), table_name='tenant_llm_configs')
    op.drop_table('tenant_llm_configs')

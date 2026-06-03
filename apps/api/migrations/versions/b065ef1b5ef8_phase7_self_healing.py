"""phase7_self_healing

Revision ID: b065ef1b5ef8
Revises: e8a8b1c47df1
Create Date: 2026-06-02 13:02:48.617202

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b065ef1b5ef8'
down_revision: Union[str, Sequence[str], None] = 'e8a8b1c47df1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if 'dead_letter_queue' not in tables:
        op.create_table('dead_letter_queue',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('tenant_id', sa.String(), nullable=False),
        sa.Column('job_type', sa.String(), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('retry_count', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_dead_letter_queue_id'), 'dead_letter_queue', ['id'], unique=False)

    if 'tenant_quota_usages' not in tables:
        op.create_table('tenant_quota_usages',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('tenant_id', sa.String(), nullable=False),
        sa.Column('usage_date', sa.Date(), nullable=False),
        sa.Column('emails_ingested', sa.Integer(), nullable=False),
        sa.Column('llm_tokens_used', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tenant_id', 'usage_date', name='uq_tenant_quota_usage_date')
        )
        op.create_index(op.f('ix_tenant_quota_usages_id'), 'tenant_quota_usages', ['id'], unique=False)
        op.create_index(op.f('ix_tenant_quota_usages_usage_date'), 'tenant_quota_usages', ['usage_date'], unique=False)

    if 'tenant_quotas' not in tables:
        op.create_table('tenant_quotas',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('tenant_id', sa.String(), nullable=False),
        sa.Column('max_emails_per_day', sa.Integer(), nullable=False),
        sa.Column('max_llm_tokens_per_day', sa.Integer(), nullable=False),
        sa.Column('max_rules_per_tenant', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tenant_id')
        )
        op.create_index(op.f('ix_tenant_quotas_id'), 'tenant_quotas', ['id'], unique=False)

    mailbox_columns = [col['name'] for col in inspector.get_columns('mailboxes')]
    if 'health_score' not in mailbox_columns:
        op.add_column('mailboxes', sa.Column('health_score', sa.Float(), nullable=False, server_default='100.0'))
    if 'consecutive_failures' not in mailbox_columns:
        op.add_column('mailboxes', sa.Column('consecutive_failures', sa.Integer(), nullable=False, server_default='0'))
    if 'last_failure_reason' not in mailbox_columns:
        op.add_column('mailboxes', sa.Column('last_failure_reason', sa.Text(), nullable=True))
    if 'last_webhook_received_at' not in mailbox_columns:
        op.add_column('mailboxes', sa.Column('last_webhook_received_at', sa.DateTime(), nullable=True))
    if 'circuit_breaker_tripped' not in mailbox_columns:
        op.add_column('mailboxes', sa.Column('circuit_breaker_tripped', sa.Boolean(), nullable=False, server_default='0'))
    if 'circuit_breaker_tripped_at' not in mailbox_columns:
        op.add_column('mailboxes', sa.Column('circuit_breaker_tripped_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    mailbox_columns = [col['name'] for col in inspector.get_columns('mailboxes')]
    if 'circuit_breaker_tripped_at' in mailbox_columns:
        op.drop_column('mailboxes', 'circuit_breaker_tripped_at')
    if 'circuit_breaker_tripped' in mailbox_columns:
        op.drop_column('mailboxes', 'circuit_breaker_tripped')
    if 'last_webhook_received_at' in mailbox_columns:
        op.drop_column('mailboxes', 'last_webhook_received_at')
    if 'last_failure_reason' in mailbox_columns:
        op.drop_column('mailboxes', 'last_failure_reason')
    if 'consecutive_failures' in mailbox_columns:
        op.drop_column('mailboxes', 'consecutive_failures')
    if 'health_score' in mailbox_columns:
        op.drop_column('mailboxes', 'health_score')

    if 'tenant_quotas' in tables:
        op.drop_index(op.f('ix_tenant_quotas_id'), table_name='tenant_quotas')
        op.drop_table('tenant_quotas')
    if 'tenant_quota_usages' in tables:
        op.drop_index(op.f('ix_tenant_quota_usages_usage_date'), table_name='tenant_quota_usages')
        op.drop_index(op.f('ix_tenant_quota_usages_id'), table_name='tenant_quota_usages')
        op.drop_table('tenant_quota_usages')
    if 'dead_letter_queue' in tables:
        op.drop_index(op.f('ix_dead_letter_queue_id'), table_name='dead_letter_queue')
        op.drop_table('dead_letter_queue')

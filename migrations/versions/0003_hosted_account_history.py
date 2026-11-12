"""Add encrypted display metadata and version lineage for hosted snapshots."""

import sqlalchemy as sa
from alembic import op

revision = "0003_hosted_account_history"
down_revision = "0002_hosted_sessions"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("hosted_statements", sa.Column("history", sa.LargeBinary(), nullable=True))
    op.add_column("hosted_statements", sa.Column("lineage_id", sa.Uuid(), nullable=True))
    op.add_column("hosted_statements", sa.Column("version", sa.Integer(), nullable=True))
    op.add_column("hosted_statements", sa.Column("saved_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_hosted_statement_lineage", "hosted_statements", ["owner_id", "lineage_id", "version"])


def downgrade():
    op.drop_index("ix_hosted_statement_lineage", table_name="hosted_statements")
    for column in ("saved_at", "version", "lineage_id", "history"):
        op.drop_column("hosted_statements", column)

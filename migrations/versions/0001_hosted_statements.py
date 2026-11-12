"""Create owner-scoped, encrypted statement snapshots."""

import sqlalchemy as sa
from alembic import op

revision = "0001_hosted_statements"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "hosted_statements",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload", sa.LargeBinary(), nullable=False),
    )
    op.create_index("ix_hosted_statements_owner_expiry", "hosted_statements", ["owner_id", "expires_at"])
    op.create_index("ix_hosted_statements_expiry", "hosted_statements", ["expires_at"])


def downgrade():
    op.drop_index("ix_hosted_statements_expiry", table_name="hosted_statements")
    op.drop_index("ix_hosted_statements_owner_expiry", table_name="hosted_statements")
    op.drop_table("hosted_statements")

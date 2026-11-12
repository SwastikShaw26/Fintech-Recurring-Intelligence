"""Add expiring, revocable hosted session digests."""

import sqlalchemy as sa
from alembic import op

revision = "0002_hosted_sessions"
down_revision = "0001_hosted_statements"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "hosted_sessions",
        sa.Column("token_digest", sa.LargeBinary(32), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("length(token_digest) = 32", name="ck_hosted_sessions_digest_length"),
    )
    op.create_index("ix_hosted_sessions_owner_expiry", "hosted_sessions", ["owner_id", "expires_at"])
    op.create_index("ix_hosted_sessions_expiry", "hosted_sessions", ["expires_at"])


def downgrade():
    op.drop_table("hosted_sessions")

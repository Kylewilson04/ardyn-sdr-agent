"""Initial migration — create all SDR agent tables with pgvector support.

Revision ID: 001_initial
Revises:
Create Date: 2026-10-11
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"")

    # ── Leads ────────────────────────────────────────────────
    op.create_table(
        "leads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_name", sa.String(255), nullable=False, index=True),
        sa.Column("contact_name", sa.String(255)),
        sa.Column("email", sa.String(320), index=True),
        sa.Column("linkedin_url", sa.String(2048)),
        sa.Column("title", sa.String(255)),
        sa.Column("industry", sa.String(128), index=True),
        sa.Column(
            "status",
            sa.Enum(
                "new",
                "researching",
                "contacted",
                "replied",
                "interested",
                "not_interested",
                "bounced",
                "do_not_contact",
                "converted",
                "archived",
                name="lead_status",
                create_type=False,
            ),
            nullable=False,
            server_default="new",
        ),
        sa.Column("custom_fields", postgresql.JSONB, server_default=sa.text("'{}'::jsonb")),
        sa.Column("embedding", postgresql.ARRAY(sa.Float), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
        ),
    )

    # Create leads enum type
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE lead_status AS ENUM (
                'new', 'researching', 'contacted', 'replied',
                'interested', 'not_interested', 'bounced',
                'do_not_contact', 'converted', 'archived'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # Cast the column to use the proper enum after creation
    op.execute("""
        ALTER TABLE leads
        ALTER COLUMN status DROP DEFAULT,
        ALTER COLUMN status TYPE lead_status USING status::lead_status,
        ALTER COLUMN status SET DEFAULT 'new'::lead_status
    """)

    # ── Campaigns ────────────────────────────────────────────
    op.create_table(
        "campaigns",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False, index=True),
        sa.Column(
            "status",
            sa.String(32),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("target_audience", postgresql.JSONB, server_default=sa.text("'[]'::jsonb")),
        sa.Column("template_id", postgresql.UUID(as_uuid=True)),
        sa.Column("schedule", postgresql.JSONB, server_default=sa.text("'{}'::jsonb")),
        sa.Column("settings", postgresql.JSONB, server_default=sa.text("'{}'::jsonb")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
        ),
    )

    # ── Sequences ────────────────────────────────────────────
    op.create_table(
        "sequences",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "campaign_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("campaigns.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "lead_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("leads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("step_number", sa.Integer(), nullable=False),
        sa.Column(
            "channel",
            sa.String(16),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(16),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("subject", sa.String(500)),
        sa.Column("body", sa.Text()),
        sa.Column("generated_email_id", sa.String(255)),
        sa.Column("scheduled_at", sa.DateTime(timezone=True)),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column(
            "reply_status",
            sa.String(32),
            server_default="none",
        ),
        sa.Column("reply_text", sa.Text()),
        sa.Column("reply_received_at", sa.DateTime(timezone=True)),
        sa.Column("metadata", postgresql.JSONB, server_default=sa.text("'{}'::jsonb")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
        ),
        sa.UniqueConstraint(
            "campaign_id", "lead_id", "step_number",
            name="uq_sequence_step",
        ),
    )

    # ── Knowledge Base ───────────────────────────────────────
    op.create_table(
        "knowledge_base",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False, index=True),
        sa.Column("source_type", sa.String(16), nullable=False),
        sa.Column("source_url", sa.String(2048)),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(64), index=True),
        sa.Column("embedding", postgresql.ARRAY(sa.Float), nullable=True),
        sa.Column("metadata", postgresql.JSONB, server_default=sa.text("'{}'::jsonb")),
        sa.Column("chunk_index", sa.Integer(), server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
        ),
    )

    # ── Analytics ────────────────────────────────────────────
    op.create_table(
        "analytics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("lead_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("sequence_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("event_type", sa.String(64), nullable=False, index=True),
        sa.Column("event_data", postgresql.JSONB, server_default=sa.text("'{}'::jsonb")),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
            index=True,
        ),
    )

    # ── pgvector index (IVFFlat for cosine distance) ─────────
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_leads_embedding
        ON leads USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100);
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding
        ON knowledge_base USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100);
    """)

    # ── Composite indexes ────────────────────────────────────
    op.create_index("idx_sequences_campaign_status", "sequences", ["campaign_id", "status"])
    op.create_index("idx_sequences_lead_status", "sequences", ["lead_id", "status"])
    op.create_index("idx_analytics_lead_event", "analytics", ["lead_id", "event_type"])
    op.create_index("idx_analytics_campaign_timestamp", "analytics", ["campaign_id", "timestamp"])


def downgrade() -> None:
    op.drop_index("idx_analytics_campaign_timestamp")
    op.drop_index("idx_analytics_lead_event")
    op.drop_index("idx_sequences_lead_status")
    op.drop_index("idx_sequences_campaign_status")
    op.execute("DROP INDEX IF EXISTS idx_knowledge_base_embedding")
    op.execute("DROP INDEX IF EXISTS idx_leads_embedding")
    op.drop_table("analytics")
    op.drop_table("knowledge_base")
    op.drop_table("sequences")
    op.drop_table("campaigns")
    op.drop_table("leads")
    op.execute("DROP TYPE IF EXISTS lead_status")
"""
Ardyn SDR Agent — SQLAlchemy Models

All models use UUID primary keys and async-compatible declarative base.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


# ── Helpers ──────────────────────────────────────────────────────
def _uuid_pk() -> Column:
    return Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _fk(table: str, *, nullable: bool = False) -> Column:
    return Column(UUID(as_uuid=True), ForeignKey(table), nullable=nullable)


def _ts() -> Column:
    return Column(DateTime(timezone=True), default=utcnow, nullable=False)


# ══════════════════════════════════════════════════════════════════
#  Models
# ══════════════════════════════════════════════════════════════════

class Lead(Base):
    __tablename__ = "leads"

    id = _uuid_pk()
    company_name = Column(String(255), nullable=False, index=True)
    contact_name = Column(String(255))
    email = Column(String(320), index=True)
    linkedin_url = Column(String(2048))
    title = Column(String(255))
    industry = Column(String(128), index=True)
    status = Column(
        Enum(
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
        ),
        default="new",
        nullable=False,
        index=True,
    )
    custom_fields = Column(JSONB, default=dict)
    embedding = Column(Vector(1536))

    # Metadata
    created_at = _ts()
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Relationships
    sequences = relationship("Sequence", back_populates="lead")
    analytics_events = relationship("Analytics", back_populates="lead")

    def __repr__(self) -> str:
        return f"<Lead {self.company_name} ({self.status})>"


class Campaign(Base):
    __tablename__ = "campaigns"

    id = _uuid_pk()
    name = Column(String(255), nullable=False, index=True)
    status = Column(
        Enum(
            "draft",
            "ready",
            "running",
            "paused",
            "completed",
            "failed",
            name="campaign_status",
        ),
        default="draft",
        nullable=False,
        index=True,
    )
    target_audience = Column(JSONB, default=list)  # filters: industry, title, company_size, etc.
    template_id = Column(UUID(as_uuid=True), nullable=True)  # email template reference
    schedule = Column(JSONB, default=dict)  # {"start_at": ISO, "end_at": ISO, "sends_per_day": 50}
    settings = Column(JSONB, default=dict)  # A/B test config, follow-up rules

    created_at = _ts()
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Relationships
    sequences = relationship("Sequence", back_populates="campaign")
    analytics_events = relationship("Analytics", back_populates="campaign")

    def __repr__(self) -> str:
        return f"<Campaign {self.name} ({self.status})>"


class Sequence(Base):
    __tablename__ = "sequences"

    id = _uuid_pk()
    campaign_id = _fk("campaigns.id")
    lead_id = _fk("leads.id")

    step_number = Column(Integer, nullable=False)
    channel = Column(
        Enum("email", "linkedin", "call", name="sequence_channel"),
        nullable=False,
    )
    status = Column(
        Enum(
            "pending",
            "scheduled",
            "sent",
            "delivered",
            "opened",
            "clicked",
            "replied",
            "bounced",
            "failed",
            "skipped",
            name="sequence_status",
        ),
        default="pending",
        nullable=False,
    )
    subject = Column(String(500))
    body = Column(Text)
    generated_email_id = Column(String(255))  # Postal message ID

    scheduled_at = Column(DateTime(timezone=True))
    sent_at = Column(DateTime(timezone=True))
    reply_status = Column(
        Enum(
            "none",
            "positive",
            "neutral",
            "negative",
            "out_of_office",
            name="reply_status_type",
        ),
        default="none",
    )
    reply_text = Column(Text)
    reply_received_at = Column(DateTime(timezone=True))

    metadata_ = Column("metadata", JSONB, default=dict)

    created_at = _ts()
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Relationships
    lead = relationship("Lead", back_populates="sequences")
    campaign = relationship("Campaign", back_populates="sequences")

    __table_args__ = (
        UniqueConstraint("campaign_id", "lead_id", "step_number", name="uq_sequence_step"),
    )

    def __repr__(self) -> str:
        return f"<Sequence step={self.step_number} {self.channel} → {self.status}>"


class KnowledgeBase(Base):
    __tablename__ = "knowledge_base"

    id = _uuid_pk()
    name = Column(String(255), nullable=False, index=True)
    source_type = Column(
        Enum("url", "file", "text", "api", name="kb_source_type"),
        nullable=False,
    )
    source_url = Column(String(2048))
    content = Column(Text, nullable=False)
    content_hash = Column(String(64), index=True)  # SHA-256
    embedding = Column(Vector(1536))
    metadata_ = Column("metadata", JSONB, default=dict)

    chunk_index = Column(Integer, default=0)  # 0 for non-chunked

    created_at = _ts()
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    def __repr__(self) -> str:
        return f"<KnowledgeBase {self.name} ({self.source_type})>"


class Analytics(Base):
    __tablename__ = "analytics"

    id = _uuid_pk()
    lead_id = _fk("leads.id", nullable=True)
    campaign_id = _fk("campaigns.id", nullable=True)
    sequence_id = Column(UUID(as_uuid=True), nullable=True)

    event_type = Column(
        String(64),
        nullable=False,
        index=True,
        # Common events:
        # lead_created, lead_imported, lead_status_changed
        # campaign_created, campaign_started, campaign_paused, campaign_completed
        # sequence_sent, sequence_opened, sequence_clicked, sequence_replied, sequence_bounced
        # email_generated, research_completed
    )
    event_data = Column(JSONB, default=dict)

    timestamp = Column(
        DateTime(timezone=True),
        default=utcnow,
        nullable=False,
        index=True,
    )

    # Relationships
    lead = relationship("Lead", back_populates="analytics_events")
    campaign = relationship("Campaign", back_populates="analytics_events")

    def __repr__(self) -> str:
        return f"<Analytics {self.event_type} @ {self.timestamp}>"
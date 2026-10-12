"""
Ardyn SDR Agent — Pydantic Schemas
Request / Response models for every endpoint.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, EmailStr, Field, field_validator


# ══════════════════════════════════════════════════════════════════
#  Enums
# ══════════════════════════════════════════════════════════════════

class LeadStatus(str, Enum):
    new = "new"
    researching = "researching"
    contacted = "contacted"
    replied = "replied"
    interested = "interested"
    not_interested = "not_interested"
    bounced = "bounced"
    do_not_contact = "do_not_contact"
    converted = "converted"
    archived = "archived"


class CampaignStatus(str, Enum):
    draft = "draft"
    ready = "ready"
    running = "running"
    paused = "paused"
    completed = "completed"
    failed = "failed"


class SequenceChannel(str, Enum):
    email = "email"
    linkedin = "linkedin"
    call = "call"


class SequenceStatus(str, Enum):
    pending = "pending"
    scheduled = "scheduled"
    sent = "sent"
    delivered = "delivered"
    opened = "opened"
    clicked = "clicked"
    replied = "replied"
    bounced = "bounced"
    failed = "failed"
    skipped = "skipped"


class ReplyStatus(str, Enum):
    none = "none"
    positive = "positive"
    neutral = "neutral"
    negative = "negative"
    out_of_office = "out_of_office"


class KnowledgeSourceType(str, Enum):
    url = "url"
    file = "file"
    text = "text"
    api = "api"


# ══════════════════════════════════════════════════════════════════
#  Base / Mixins
# ══════════════════════════════════════════════════════════════════

class OrmModel(BaseModel):
    model_config = {"from_attributes": True}


class PaginatedResponse(OrmModel):
    items: list[Any]
    total: int
    page: int
    page_size: int
    pages: int


# ══════════════════════════════════════════════════════════════════
#  Lead Schemas
# ══════════════════════════════════════════════════════════════════

class LeadCreate(OrmModel):
    company_name: str = Field(..., min_length=1, max_length=255)
    contact_name: str | None = Field(None, max_length=255)
    email: EmailStr | None = None
    linkedin_url: str | None = Field(None, max_length=2048)
    title: str | None = Field(None, max_length=255)
    industry: str | None = Field(None, max_length=128)
    custom_fields: dict[str, Any] = Field(default_factory=dict)

    @field_validator("linkedin_url")
    @classmethod
    def validate_linkedin(cls, v: str | None) -> str | None:
        if v and "linkedin.com" not in v.lower():
            raise ValueError("Must be a LinkedIn URL")
        return v


class LeadUpdate(OrmModel):
    company_name: str | None = Field(None, min_length=1, max_length=255)
    contact_name: str | None = Field(None, max_length=255)
    email: EmailStr | None = None
    linkedin_url: str | None = Field(None, max_length=2048)
    title: str | None = Field(None, max_length=255)
    industry: str | None = Field(None, max_length=128)
    status: LeadStatus | None = None
    custom_fields: dict[str, Any] | None = None


class LeadResponse(OrmModel):
    id: uuid.UUID
    company_name: str
    contact_name: str | None
    email: str | None
    linkedin_url: str | None
    title: str | None
    industry: str | None
    status: LeadStatus
    custom_fields: dict[str, Any]
    created_at: datetime
    updated_at: datetime | None


class LeadSearchRequest(OrmModel):
    query: str = Field(..., min_length=1, max_length=1000)
    search_type: str = Field(default="semantic")  # semantic | text | hybrid
    limit: int = Field(default=20, ge=1, le=100)
    min_similarity: float = Field(default=0.4, ge=0.0, le=1.0)


# ══════════════════════════════════════════════════════════════════
#  Campaign Schemas
# ══════════════════════════════════════════════════════════════════

class CampaignCreate(OrmModel):
    name: str = Field(..., min_length=1, max_length=255)
    target_audience: dict[str, Any] = Field(default_factory=dict)
    template_id: uuid.UUID | None = None
    schedule: dict[str, Any] = Field(default_factory=dict)


class CampaignUpdate(OrmModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    status: CampaignStatus | None = None
    target_audience: dict[str, Any] | None = None
    template_id: uuid.UUID | None = None
    schedule: dict[str, Any] | None = None
    settings: dict[str, Any] | None = None


class CampaignResponse(OrmModel):
    id: uuid.UUID
    name: str
    status: CampaignStatus
    target_audience: dict[str, Any]
    template_id: uuid.UUID | None
    schedule: dict[str, Any]
    settings: dict[str, Any]
    created_at: datetime
    updated_at: datetime | None


# ══════════════════════════════════════════════════════════════════
#  Sequence Schemas
# ══════════════════════════════════════════════════════════════════

class SequenceCreate(OrmModel):
    campaign_id: uuid.UUID
    lead_id: uuid.UUID
    step_number: int = Field(..., ge=1)
    channel: SequenceChannel
    scheduled_at: datetime | None = None


class SequenceUpdate(OrmModel):
    status: SequenceStatus | None = None
    subject: str | None = None
    body: str | None = None
    scheduled_at: datetime | None = None
    sent_at: datetime | None = None
    reply_status: ReplyStatus | None = None
    reply_text: str | None = None


class SequenceResponse(OrmModel):
    id: uuid.UUID
    campaign_id: uuid.UUID
    lead_id: uuid.UUID
    step_number: int
    channel: SequenceChannel
    status: SequenceStatus
    subject: str | None
    body: str | None
    scheduled_at: datetime | None
    sent_at: datetime | None
    reply_status: ReplyStatus
    reply_text: str | None
    reply_received_at: datetime | None
    created_at: datetime
    updated_at: datetime | None


class SequenceBatchCreate(OrmModel):
    campaign_id: uuid.UUID
    lead_ids: list[uuid.UUID] = Field(..., min_length=1, max_length=500)
    channel: SequenceChannel = SequenceChannel.email


# ══════════════════════════════════════════════════════════════════
#  Knowledge Base Schemas
# ══════════════════════════════════════════════════════════════════

class KnowledgeCreate(OrmModel):
    name: str = Field(..., min_length=1, max_length=255)
    source_type: KnowledgeSourceType
    source_url: str | None = Field(None, max_length=2048)
    content: str = Field(..., min_length=1)


class KnowledgeUpdate(OrmModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    content: str | None = Field(None, min_length=1)


class KnowledgeResponse(OrmModel):
    id: uuid.UUID
    name: str
    source_type: str
    source_url: str | None
    content: str
    chunk_index: int
    created_at: datetime
    updated_at: datetime | None


class KnowledgeSearchRequest(OrmModel):
    query: str = Field(..., min_length=1, max_length=2000)
    limit: int = Field(default=10, ge=1, le=50)
    min_similarity: float = Field(default=0.5, ge=0.0, le=1.0)


class KnowledgeSearchResult(OrmModel):
    id: uuid.UUID
    name: str
    source_type: str
    source_url: str | None
    content: str
    similarity: float


# ══════════════════════════════════════════════════════════════════
#  Agent Schemas
# ══════════════════════════════════════════════════════════════════

class AgentResearchRequest(OrmModel):
    lead_id: uuid.UUID
    prompt_override: str | None = None


class AgentResearchResponse(OrmModel):
    lead_id: uuid.UUID
    research_summary: str
    company_info: dict[str, Any]
    key_points: list[str]
    suggested_angle: str | None


class AgentGenerateEmailRequest(OrmModel):
    lead_id: uuid.UUID
    campaign_id: uuid.UUID | None = None
    knowledge_ids: list[uuid.UUID] = Field(default_factory=list)
    tone: str = Field(default="professional")  # professional | casual | bold | consultative
    max_length: int = Field(default=500, ge=100, le=5000)


class AgentGenerateEmailResponse(OrmModel):
    lead_id: uuid.UUID
    subject: str
    body: str
    metadata: dict[str, Any]


class AgentClassifyReplyRequest(OrmModel):
    sequence_id: uuid.UUID
    reply_text: str
    original_email: str | None = None


class AgentClassifyReplyResponse(OrmModel):
    sequence_id: uuid.UUID
    classification: ReplyStatus
    confidence: float
    reasoning: str
    suggested_response: str | None


# ══════════════════════════════════════════════════════════════════
#  Analytics Schemas
# ══════════════════════════════════════════════════════════════════

class AnalyticsEvent(OrmModel):
    event_type: str
    lead_id: uuid.UUID | None = None
    campaign_id: uuid.UUID | None = None
    sequence_id: uuid.UUID | None = None
    event_data: dict[str, Any] = Field(default_factory=dict)


class AnalyticsResponse(OrmModel):
    id: uuid.UUID
    lead_id: uuid.UUID | None
    campaign_id: uuid.UUID | None
    event_type: str
    event_data: dict[str, Any]
    timestamp: datetime


# ══════════════════════════════════════════════════════════════════
#  Webhook Schemas
# ══════════════════════════════════════════════════════════════════

class InboundEmailWebhook(OrmModel):
    """Postal inbound email webhook payload."""
    id: str
    rcpt_to: str
    mail_from: str
    subject: str
    plain_body: str | None = None
    html_body: str | None = None
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    bounce: bool = False
    spam_status: str | None = None


class CRMWebhook(OrmModel):
    """Nango.dev CRM sync webhook payload."""
    operation: str  # create | update | delete
    integration_id: str
    connection_id: str
    model: str  # contact | lead | opportunity
    record: dict[str, Any]
    sync_id: str | None = None


# ══════════════════════════════════════════════════════════════════
#  Generic / Health
# ══════════════════════════════════════════════════════════════════

class HealthResponse(OrmModel):
    status: str
    version: str
    database: str
    uptime_seconds: float


class ErrorResponse(OrmModel):
    detail: str
    error_code: str | None = None
    errors: list[dict[str, Any]] | None = None
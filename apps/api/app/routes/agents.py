"""
Ardyn SDR Agent — Agent Routes
LangGraph agent pipeline endpoints: research, email generation, reply classification.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.schemas import (
    AgentClassifyReplyRequest,
    AgentClassifyReplyResponse,
    AgentGenerateEmailRequest,
    AgentGenerateEmailResponse,
    AgentResearchRequest,
    AgentResearchResponse,
    ErrorResponse,
)
from app.services.agent_service import AgentService
from app.services.vector_service import VectorService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agents", tags=["agents"])

_agent_service = AgentService()
_vector_service = VectorService()


# ── Research ─────────────────────────────────────────────────────

@router.post(
    "/research",
    response_model=AgentResearchResponse,
    responses={404: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def research_lead(
    payload: AgentResearchRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """
    Research a lead: gather company info, recent news, pain points,
    and personalization hooks. Returns structured research data.
    """
    # Get lead
    result = await session.execute(
        text(
            """
            SELECT id, company_name, contact_name, title, industry,
                   linkedin_url, email, custom_fields
            FROM leads WHERE id = :id
            """
        ),
        {"id": payload.lead_id},
    )
    lead = result.mappings().first()

    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Gather relevant knowledge context
    lead_text = (
        f"{lead['company_name']} {lead['industry'] or ''} "
        f"{lead['title'] or ''} {lead['contact_name'] or ''}"
    )
    embedding = await _vector_service.embed_text(lead_text)
    knowledge_results = await _vector_service.search_knowledge(
        session, embedding, limit=5, min_similarity=0.5
    )
    knowledge_context = [k["content"] for k in knowledge_results]

    # Run agent research
    result = await _agent_service.research_lead(
        lead_id=payload.lead_id,
        company_name=lead["company_name"],
        contact_name=lead["contact_name"],
        title=lead["title"],
        industry=lead["industry"],
        linkedin_url=lead["linkedin_url"],
        knowledge_context=knowledge_context,
        prompt_override=payload.prompt_override,
    )

    # Store research as a custom field on the lead
    await session.execute(
        text(
            """
            UPDATE leads SET
                custom_fields = jsonb_set(
                    COALESCE(custom_fields, '{}'),
                    '{research}',
                    :research::jsonb
                ),
                status = CASE
                    WHEN status = 'new' THEN 'researching'
                    ELSE status
                END,
                updated_at = NOW()
            WHERE id = :id
            """
        ),
        {
            "id": payload.lead_id,
            "research": __import__("json").dumps(result),
        },
    )

    return result


# ── Generate Email ───────────────────────────────────────────────

@router.post(
    "/generate-email",
    response_model=AgentGenerateEmailResponse,
    responses={404: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def generate_email(
    payload: AgentGenerateEmailRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """
    Generate a personalized outreach email for a lead.
    Uses research data + knowledge base context.
    """
    result = await session.execute(
        text(
            """
            SELECT id, company_name, contact_name, title, industry,
                   email, custom_fields
            FROM leads WHERE id = :id
            """
        ),
        {"id": payload.lead_id},
    )
    lead = result.mappings().first()

    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Gather knowledge context
    knowledge_texts: list[str] = []
    if payload.knowledge_ids:
        kb_result = await session.execute(
            text(
                "SELECT content FROM knowledge_base WHERE id = ANY(:ids)"
            ),
            {"ids": [str(kid) for kid in payload.knowledge_ids]},
        )
        knowledge_texts = [row[0] for row in kb_result]

    # Extract research data if available
    research_data = None
    custom = lead["custom_fields"] or {}
    if "research" in custom:
        research_data = custom["research"]

    lead_context = {
        "company_name": lead["company_name"],
        "contact_name": lead["contact_name"],
        "title": lead["title"],
        "industry": lead["industry"],
    }

    # Get campaign context if specified
    campaign_context = None
    if payload.campaign_id:
        campaign_result = await session.execute(
            text("SELECT name, target_audience FROM campaigns WHERE id = :id"),
            {"id": payload.campaign_id},
        )
        campaign = campaign_result.mappings().first()
        if campaign:
            campaign_context = dict(campaign)

    result = await _agent_service.generate_email(
        lead_id=payload.lead_id,
        lead_context=lead_context,
        research=research_data,
        knowledge=knowledge_texts,
        campaign_context=campaign_context,
        tone=payload.tone,
        max_length=payload.max_length,
    )

    return result


# ── Classify Reply ───────────────────────────────────────────────

@router.post(
    "/classify-reply",
    response_model=AgentClassifyReplyResponse,
    responses={404: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def classify_reply(
    payload: AgentClassifyReplyRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """
    Classify an inbound email reply: positive, neutral, negative, out_of_office.
    Updates the sequence with classification results.
    """
    seq_result = await session.execute(
        text("SELECT * FROM sequences WHERE id = :id"),
        {"id": payload.sequence_id},
    )
    sequence = seq_result.mappings().first()

    if not sequence:
        raise HTTPException(status_code=404, detail="Sequence not found")

    result = await _agent_service.classify_reply(
        sequence_id=payload.sequence_id,
        reply_text=payload.reply_text,
        original_email=payload.original_email,
    )

    # Update sequence with classification
    await session.execute(
        text("""
            UPDATE sequences SET
                reply_status = :reply_status,
                reply_text = :reply_text,
                reply_received_at = NOW(),
                status = 'replied',
                updated_at = NOW()
            WHERE id = :id
        """),
        {
            "id": payload.sequence_id,
            "reply_status": result["classification"],
            "reply_text": payload.reply_text,
        },
    )

    # Update lead status based on classification
    classification = result["classification"]
    new_lead_status: dict[str, str] = {
        "positive": "interested",
        "neutral": "contacted",
        "negative": "not_interested",
        "out_of_office": "contacted",
    }

    if classification in new_lead_status:
        await session.execute(
            text("""
                UPDATE leads SET
                    status = :status,
                    updated_at = NOW()
                WHERE id = :lead_id
            """),
            {
                "status": new_lead_status[classification],
                "lead_id": sequence["lead_id"],
            },
        )

    return result


# ── Bulk Generate ────────────────────────────────────────────────

@router.post(
    "/generate-bulk",
    status_code=status.HTTP_200_OK,
)
async def generate_bulk_emails(
    campaign_id: uuid.UUID,
    limit: int = 50,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Generate emails for all pending sequences in a campaign."""
    # Get pending sequences
    seq_result = await session.execute(
        text("""
            SELECT s.id as sequence_id, s.lead_id,
                   l.company_name, l.contact_name, l.title, l.industry,
                   l.custom_fields
            FROM sequences s
            JOIN leads l ON s.lead_id = l.id
            WHERE s.campaign_id = :campaign_id
              AND s.status = 'pending'
              AND s.channel = 'email'
            LIMIT :limit
        """),
        {"campaign_id": campaign_id, "limit": limit},
    )
    sequences = [dict(row._mapping) for row in seq_result]

    generated = 0
    failed = 0
    results: list[dict[str, Any]] = []

    for seq in sequences:
        try:
            # Get research data
            custom = seq.get("custom_fields") or {}
            research_data = custom.get("research")

            lead_context = {
                "company_name": seq["company_name"],
                "contact_name": seq["contact_name"],
                "title": seq["title"],
                "industry": seq["industry"],
            }

            email = await _agent_service.generate_email(
                lead_id=seq["lead_id"],
                lead_context=lead_context,
                research=research_data,
            )

            # Update sequence with generated email
            await session.execute(
                text("""
                    UPDATE sequences SET
                        subject = :subject,
                        body = :body,
                        status = 'scheduled',
                        updated_at = NOW()
                    WHERE id = :id
                """),
                {
                    "id": seq["sequence_id"],
                    "subject": email["subject"],
                    "body": email["body"],
                },
            )

            generated += 1
            results.append(
                {
                    "sequence_id": str(seq["sequence_id"]),
                    "lead_id": str(seq["lead_id"]),
                    "subject": email["subject"],
                }
            )
        except Exception as exc:
            logger.exception(
                "Failed to generate email for sequence %s", seq["sequence_id"]
            )
            failed += 1
            results.append(
                {
                    "sequence_id": str(seq["sequence_id"]),
                    "lead_id": str(seq["lead_id"]),
                    "error": str(exc),
                }
            )

    return {
        "generated": generated,
        "failed": failed,
        "total": len(sequences),
        "results": results,
    }


# ── Agent Health ─────────────────────────────────────────────────

@router.get(
    "/health",
    status_code=status.HTTP_200_OK,
)
async def agent_health() -> dict[str, Any]:
    """Check if agent-core microservice is reachable."""
    try:
        import httpx

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "http://localhost:8001/health", timeout=5.0
            )
            return {
                "status": "connected" if resp.status_code == 200 else "unhealthy",
                "agent_core_status": resp.status_code,
            }
    except Exception:
        return {
            "status": "disconnected",
            "mode": "fallback",
            "note": "Using built-in fallbacks — agent-core not available",
        }
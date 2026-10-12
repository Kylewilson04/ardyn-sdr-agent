"""
Ardyn SDR Agent — Webhook Routes
Inbound email webhook (Postal), CRM sync webhooks (Nango.dev).
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_session
from app.schemas import (
    CRMWebhook,
    ErrorResponse,
    InboundEmailWebhook,
)
from app.services.agent_service import AgentService
from app.services.crm_service import CRMService
from app.services.email_service import EmailService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])

settings = get_settings()
_email_service = EmailService()
_agent_service = AgentService()
_crm_service = CRMService()


# ══════════════════════════════════════════════════════════════════
#  Inbound Email (Postal Webhook)
# ══════════════════════════════════════════════════════════════════

@router.post(
    "/email/inbound",
    status_code=status.HTTP_200_OK,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}},
)
async def inbound_email_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """
    Receive inbound email from Postal's webhook.
    Matches replies to sequences, classifies them, and triggers follow-up logic.
    """
    # Verify webhook secret if configured
    if settings.REPLY_WEBHOOK_SECRET:
        auth_header = request.headers.get("X-Webhook-Secret", "")
        if auth_header != settings.REPLY_WEBHOOK_SECRET:
            raise HTTPException(status_code=401, detail="Invalid webhook secret")

    try:
        raw_body = await request.body()
        payload = InboundEmailWebhook.model_validate_json(raw_body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid payload: {exc}")

    if payload.bounce:
        logger.info("Received bounce: %s → %s", payload.mail_from, payload.rcpt_to)
        # Find the sequence this bounce belongs to and mark it
        return await _handle_bounce(payload, session)

    # Parse reply text
    reply_text = payload.plain_body or ""
    parsed = _email_service.parse_inbound_email(
        f"From: {payload.mail_from}\n"
        f"To: {payload.rcpt_to}\n"
        f"Subject: {payload.subject}\n\n"
        f"{reply_text}"
    )

    # Match to sequence via email address
    cleaned_reply_text = parsed.get("reply_text", reply_text)
    sequence_match = await _match_reply_to_sequence(
        session, payload.mail_from, payload.rcpt_to
    )

    if not sequence_match:
        logger.info(
            "No matching sequence found for reply from %s", payload.mail_from
        )
        return {
            "status": "unmatched",
            "from": payload.mail_from,
            "message": "No matching sequence found — reply not linked",
        }

    # Classify the reply
    classification = await _agent_service.classify_reply(
        sequence_id=sequence_match["id"],
        reply_text=cleaned_reply_text,
        original_email=sequence_match.get("body"),
    )

    # Update the sequence
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
            "id": sequence_match["id"],
            "reply_status": classification["classification"],
            "reply_text": cleaned_reply_text,
        },
    )

    # Update lead status
    status_map = {
        "positive": "interested",
        "neutral": "contacted",
        "negative": "not_interested",
        "out_of_office": "contacted",
    }
    new_status = status_map.get(classification["classification"], "contacted")

    await session.execute(
        text("UPDATE leads SET status = :status, updated_at = NOW() WHERE id = :id"),
        {"status": new_status, "id": sequence_match["lead_id"]},
    )

    # Log analytics event
    analytics_id = uuid.uuid4()
    await session.execute(
        text("""
            INSERT INTO analytics (id, lead_id, campaign_id, sequence_id,
                                  event_type, event_data)
            VALUES (:id, :lead_id, :campaign_id, :sequence_id, 'sequence_replied', :data)
        """),
        {
            "id": analytics_id,
            "lead_id": sequence_match["lead_id"],
            "campaign_id": sequence_match.get("campaign_id"),
            "sequence_id": sequence_match["id"],
            "data": json.dumps({
                "classification": classification["classification"],
                "confidence": classification["confidence"],
                "from_address": payload.mail_from,
            }),
        },
    )

    return {
        "status": "matched",
        "sequence_id": str(sequence_match["id"]),
        "lead_id": str(sequence_match["lead_id"]),
        "classification": classification["classification"],
        "confidence": classification["confidence"],
        "lead_status": new_status,
    }


async def _match_reply_to_sequence(
    session: AsyncSession,
    from_address: str,
    to_address: str,
) -> dict[str, Any] | None:
    """Find the sequence this reply belongs to based on email addresses."""
    # Extract the base from address
    from_email = from_address.split("<")[-1].strip(">").strip().lower()

    # Find lead by email matching the 'from' address
    lead_result = await session.execute(
        text("SELECT id FROM leads WHERE LOWER(email) = :email"),
        {"email": from_email},
    )
    lead = lead_result.mappings().first()

    if not lead:
        # Try matching on the to_address — could be a tracking address
        # that encodes the sequence
        return None

    # Find the most recent sent sequence for this lead
    seq_result = await session.execute(
        text("""
            SELECT id, lead_id, campaign_id, body
            FROM sequences
            WHERE lead_id = :lead_id
              AND status IN ('sent', 'delivered', 'opened', 'clicked')
            ORDER BY sent_at DESC NULLS LAST
            LIMIT 1
        """),
        {"lead_id": lead["id"]},
    )
    sequence = seq_result.mappings().first()

    if not sequence:
        return None

    return dict(sequence)


async def _handle_bounce(
    payload: InboundEmailWebhook,
    session: AsyncSession,
) -> dict[str, Any]:
    """Mark a sequence as bounced and update the lead."""
    from_address = payload.mail_from.split("<")[-1].strip(">").strip().lower()

    lead_result = await session.execute(
        text("SELECT id FROM leads WHERE LOWER(email) = :email"),
        {"email": from_address},
    )
    lead = lead_result.mappings().first()

    if not lead:
        return {"status": "unmatched_bounce", "from": payload.mail_from}

    # Mark latest sequence as bounced
    await session.execute(
        text("""
            UPDATE sequences SET
                status = 'bounced',
                updated_at = NOW()
            WHERE lead_id = :lead_id
              AND status = 'sent'
              AND id = (
                  SELECT id FROM sequences
                  WHERE lead_id = :lead_id2 AND status = 'sent'
                  ORDER BY sent_at DESC LIMIT 1
              )
        """),
        {"lead_id": lead["id"], "lead_id2": lead["id"]},
    )

    await session.execute(
        text("UPDATE leads SET status = 'bounced', updated_at = NOW() WHERE id = :id"),
        {"id": lead["id"]},
    )

    return {"status": "bounced", "lead_id": str(lead["id"])}


# ══════════════════════════════════════════════════════════════════
#  CRM Sync (Nango Webhook)
# ══════════════════════════════════════════════════════════════════

@router.post(
    "/crm/sync",
    status_code=status.HTTP_200_OK,
    responses={401: {"model": ErrorResponse}, 400: {"model": ErrorResponse}},
)
async def crm_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """
    Receive CRM sync events from Nango.dev.
    Bidirectional sync: CRM → SDR and SDR → CRM.
    """
    # Verify signature
    raw_body = await request.body()
    signature = request.headers.get("X-Nango-Signature", "")
    if not _crm_service.verify_webhook(raw_body, signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        payload = CRMWebhook.model_validate_json(raw_body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid payload: {exc}")

    # Process the CRM event
    result = await _crm_service.process_webhook(
        operation=payload.operation,
        model=payload.model,
        record=payload.record,
    )

    # If a lead was created in the CRM, sync it back to our DB
    if result.get("action") == "lead_created" and "lead_data" in result:
        lead_data = result["lead_data"]
        email = lead_data.get("email")

        if email:
            # Check if lead already exists
            existing = await session.execute(
                text("SELECT id FROM leads WHERE email = :email"),
                {"email": email},
            )
            if not existing.scalar():
                lead_id = uuid.uuid4()
                await session.execute(
                    text("""
                        INSERT INTO leads
                            (id, company_name, contact_name, email, title, status)
                        VALUES (:id, :company_name, :contact_name, :email, :title, 'new')
                    """),
                    {
                        "id": lead_id,
                        "company_name": lead_data["company_name"],
                        "contact_name": lead_data["contact_name"],
                        "email": email,
                        "title": lead_data["title"],
                    },
                )
                result["synced_lead_id"] = str(lead_id)

    # Log analytics
    analytics_id = uuid.uuid4()
    await session.execute(
        text("""
            INSERT INTO analytics (id, event_type, event_data)
            VALUES (:id, 'crm_webhook_received', :data)
        """),
        {
            "id": analytics_id,
            "data": json.dumps({
                "operation": payload.operation,
                "model": payload.model,
                "integration_id": payload.integration_id,
                "connection_id": payload.connection_id,
            }),
        },
    )

    return {
        "status": "processed",
        "action": result["action"],
        **result,
    }


# ══════════════════════════════════════════════════════════════════
#  Open / Click Tracking (Postal)
# ══════════════════════════════════════════════════════════════════

@router.post(
    "/email/track/{event_type}",
    status_code=status.HTTP_200_OK,
)
async def email_tracking(
    event_type: str,  # opened | clicked | delivered
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """
    Receive email tracking events (opens, clicks) from Postal.
    Updates sequence status accordingly.
    """
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    message_id = payload.get("message_id", "")
    if not message_id:
        return {"status": "ignored", "reason": "No message_id"}

    # Map event type to sequence status
    event_status_map = {
        "opened": "opened",
        "clicked": "clicked",
        "delivered": "delivered",
    }
    new_status = event_status_map.get(event_type)
    if not new_status:
        return {"status": "ignored", "reason": f"Unknown event_type: {event_type}"}

    # Update sequence
    seq_result = await session.execute(
        text("""
            UPDATE sequences SET
                status = :status,
                updated_at = NOW()
            WHERE generated_email_id = :message_id
              AND status IN ('sent', 'delivered', 'opened')
            RETURNING id, lead_id, campaign_id
        """),
        {"status": new_status, "message_id": message_id},
    )
    seq = seq_result.mappings().first()

    if not seq:
        return {
            "status": "not_found",
            "message_id": message_id,
            "note": "No matching sequence found",
        }

    # Log analytics
    analytics_id = uuid.uuid4()
    await session.execute(
        text("""
            INSERT INTO analytics
                (id, lead_id, campaign_id, sequence_id, event_type, event_data)
            VALUES (:id, :lead_id, :campaign_id, :sequence_id, :event_type, :data)
        """),
        {
            "id": analytics_id,
            "lead_id": seq["lead_id"],
            "campaign_id": seq["campaign_id"],
            "sequence_id": seq["id"],
            "event_type": f"sequence_{event_type}",
            "data": json.dumps(payload),
        },
    )

    return {
        "status": "tracked",
        "sequence_id": str(seq["id"]),
        "event": event_type,
    }
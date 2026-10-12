"""
Ardyn SDR Agent — Agent Service
Wraps calls to the agent-core LangGraph pipeline.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class AgentService:
    """
    Orchestrator that calls the agent-core package for:
    - Lead research
    - Email generation
    - Reply classification
    - Suggested responses

    When the agent-core package isn't available, this falls back to
    direct LLM calls for development.
    """

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient(timeout=120.0)

    # ── Research ─────────────────────────────────────────────────

    async def research_lead(
        self,
        *,
        lead_id: uuid.UUID,
        company_name: str,
        contact_name: str | None = None,
        title: str | None = None,
        industry: str | None = None,
        linkedin_url: str | None = None,
        knowledge_context: list[str] | None = None,
        prompt_override: str | None = None,
    ) -> dict[str, Any]:
        """
        Research a lead: company background, pain points, personalization hooks.
        Returns structured research data.
        """
        # Try the agent-core service first
        try:
            response = await self._client.post(
                "http://localhost:8001/agent/research",
                json={
                    "lead_id": str(lead_id),
                    "company_name": company_name,
                    "contact_name": contact_name,
                    "title": title,
                    "industry": industry,
                    "linkedin_url": linkedin_url,
                    "knowledge_context": knowledge_context or [],
                    "prompt_override": prompt_override,
                },
                timeout=settings.AGENT_RESEARCH_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            return response.json()
        except httpx.ConnectError:
            logger.warning("agent-core unavailable, using fallback research")
        except httpx.HTTPStatusError as exc:
            logger.error("agent-core research error: %s", exc)
            raise

        # Fallback: return a structured placeholder
        return {
            "lead_id": str(lead_id),
            "research_summary": (
                f"Research for {company_name}: {industry or 'Unknown'} industry. "
                f"Contact: {contact_name or 'Unknown'}, {title or 'Unknown title'}."
            ),
            "company_info": {
                "name": company_name,
                "industry": industry,
                "size": "unknown",
                "key_products": [],
                "competitors": [],
            },
            "key_points": [
                f"{company_name} operates in the {industry or 'technology'} space",
                f"Contact {contact_name or 'the prospect'} holds a {title or 'leadership'} role",
            ],
            "suggested_angle": (
                f"How {company_name} can improve their {industry or 'business'} outcomes"
            ),
        }

    # ── Email Generation ─────────────────────────────────────────

    async def generate_email(
        self,
        *,
        lead_id: uuid.UUID,
        lead_context: dict[str, Any],
        research: dict[str, Any] | None = None,
        knowledge: list[str] | None = None,
        campaign_context: dict[str, Any] | None = None,
        tone: str = "professional",
        max_length: int = 500,
    ) -> dict[str, Any]:
        """
        Generate a personalized outreach email.
        """
        try:
            response = await self._client.post(
                "http://localhost:8001/agent/generate-email",
                json={
                    "lead_id": str(lead_id),
                    "lead_context": lead_context,
                    "research": research,
                    "knowledge": knowledge or [],
                    "campaign_context": campaign_context,
                    "tone": tone,
                    "max_length": max_length,
                },
                timeout=settings.AGENT_EMAIL_GENERATION_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            return response.json()
        except httpx.ConnectError:
            logger.warning("agent-core unavailable, using fallback email generation")

        # Fallback: generate a simple template email
        company = lead_context.get("company_name", "your company")
        contact = lead_context.get("contact_name", "there")
        first_name = (contact.split()[0] if contact else "there") or "there"

        subject_templates: dict[str, str] = {
            "professional": f"Quick question about {company}",
            "casual": f"Hey {first_name}, quick thought",
            "bold": f"Your {lead_context.get('industry', 'team')} deserves better",
            "consultative": f"An idea for {company}",
        }

        body_templates: dict[str, str] = {
            "professional": (
                f"Hi {first_name},\n\n"
                f"I've been following {company} and wanted to reach out. "
                f"I have an idea that could help your team—would you be open to a brief chat?\n\n"
                f"Best,\n{settings.FROM_NAME}"
            ),
            "casual": (
                f"Hi {first_name},\n\n"
                f"Saw what you're doing at {company}—impressive stuff. "
                f"Got a quick idea that might be useful. Worth 10 minutes?\n\n"
                f"Cheers,\n{settings.FROM_NAME}"
            ),
            "bold": (
                f"Hi {first_name},\n\n"
                f"Most {lead_context.get('industry', '')} teams are leaving a lot on the table. "
                f"I'd love to show you what {company} could unlock in 15 minutes.\n\n"
                f"Let's talk,\n{settings.FROM_NAME}"
            ),
            "consultative": (
                f"Hi {first_name},\n\n"
                f"I've been thinking about {company}'s position in the market. "
                f"I have a specific idea I'd love to share—would a 10-minute call work?\n\n"
                f"Warmly,\n{settings.FROM_NAME}"
            ),
        }

        return {
            "lead_id": str(lead_id),
            "subject": subject_templates.get(tone, subject_templates["professional"]),
            "body": body_templates.get(tone, body_templates["professional"]),
            "metadata": {
                "tone": tone,
                "generated_by": "fallback",
            },
        }

    # ── Reply Classification ─────────────────────────────────────

    async def classify_reply(
        self,
        *,
        sequence_id: uuid.UUID,
        reply_text: str,
        original_email: str | None = None,
    ) -> dict[str, Any]:
        """
        Classify an inbound reply: positive, neutral, negative, out_of_office.
        """
        try:
            response = await self._client.post(
                "http://localhost:8001/agent/classify-reply",
                json={
                    "sequence_id": str(sequence_id),
                    "reply_text": reply_text,
                    "original_email": original_email,
                },
            )
            response.raise_for_status()
            return response.json()
        except httpx.ConnectError:
            logger.warning("agent-core unavailable, using heuristic reply classification")

        # Heuristic fallback
        reply_lower = reply_text.lower()

        # OOO detection
        ooo_keywords = [
            "out of office",
            "out of the office",
            "automatic reply",
            "vacation",
            "away from",
            "ooo",
            "limited access to email",
        ]
        if any(kw in reply_lower for kw in ooo_keywords):
            return {
                "sequence_id": str(sequence_id),
                "classification": "out_of_office",
                "confidence": 0.9,
                "reasoning": "Detected out-of-office language",
                "suggested_response": None,
            }

        # Positive signals
        positive_keywords = [
            "interested",
            "tell me more",
            "let's talk",
            "set up a call",
            "schedule",
            "sounds good",
            "sounds great",
            "would love to",
            "i'd like to learn",
            "yes",
            "count me in",
        ]
        positive_count = sum(1 for kw in positive_keywords if kw in reply_lower)

        # Negative signals
        negative_keywords = [
            "not interested",
            "unsubscribe",
            "stop emailing",
            "don't contact",
            "remove me",
            "no thanks",
            "no thank you",
            "leave me alone",
            "spam",
        ]
        negative_count = sum(1 for kw in negative_keywords if kw in reply_lower)

        if positive_count > negative_count:
            return {
                "sequence_id": str(sequence_id),
                "classification": "positive",
                "confidence": min(0.7 + positive_count * 0.1, 0.95),
                "reasoning": f"Found {positive_count} positive signal(s)",
                "suggested_response": "Schedule a call — they're interested!",
            }
        elif negative_count > positive_count:
            return {
                "sequence_id": str(sequence_id),
                "classification": "negative",
                "confidence": min(0.7 + negative_count * 0.1, 0.95),
                "reasoning": f"Found {negative_count} negative signal(s)",
                "suggested_response": "Mark as not interested, do not follow up.",
            }
        else:
            return {
                "sequence_id": str(sequence_id),
                "classification": "neutral",
                "confidence": 0.5,
                "reasoning": "No strong positive or negative signals detected",
                "suggested_response": (
                    "Monitor for follow-up — reply is neutral."
                ),
            }

    # ── Suggested Response ───────────────────────────────────────

    async def suggest_response(
        self,
        *,
        sequence_id: uuid.UUID,
        reply_text: str,
        classification: str,
        lead_context: dict[str, Any],
    ) -> dict[str, Any]:
        """Generate a suggested follow-up response to a reply."""
        try:
            response = await self._client.post(
                "http://localhost:8001/agent/suggest-response",
                json={
                    "sequence_id": str(sequence_id),
                    "reply_text": reply_text,
                    "classification": classification,
                    "lead_context": lead_context,
                },
            )
            response.raise_for_status()
            return response.json()
        except httpx.ConnectError:
            logger.warning("agent-core unavailable for suggested response")

        return {
            "sequence_id": str(sequence_id),
            "suggested_text": "",
            "confidence": 0.0,
            "note": "agent-core not available",
        }

    async def close(self) -> None:
        await self._client.aclose()
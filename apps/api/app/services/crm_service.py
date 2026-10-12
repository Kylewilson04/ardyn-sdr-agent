"""
Ardyn SDR Agent — CRM Service
Nango.dev integration for CRM sync (Salesforce, HubSpot, Pipedrive, etc.).
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class CRMService:
    """
    Syncs leads and activities with external CRMs via Nango.dev.
    Supports Salesforce, HubSpot, Pipedrive, Zoho, and others.
    """

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._enabled = settings.CRM_SYNC_ENABLED
        self._base_url = settings.NANGO_BASE_URL
        self._secret_key = settings.NANGO_SECRET_KEY
        self._integration_id = settings.NANGO_INTEGRATION_ID

        self._client = client or httpx.AsyncClient(
            base_url=self._base_url,
            headers={
                "Authorization": f"Bearer {self._secret_key}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

    def _verify_webhook_signature(
        self, payload: bytes, signature: str
    ) -> bool:
        """Verify Nango webhook HMAC signature."""
        expected = hmac.new(
            self._secret_key.encode(),
            payload,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)

    # ── Lead Sync ────────────────────────────────────────────────

    async def create_lead_in_crm(
        self,
        connection_id: str,
        *,
        first_name: str = "",
        last_name: str = "",
        email: str = "",
        company: str = "",
        title: str = "",
        linkedin_url: str = "",
        custom_fields: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Create a lead/contact in the connected CRM."""
        if not self._enabled:
            logger.debug("CRM sync disabled, skipping lead creation")
            return {"synced": False, "reason": "crm_disabled"}

        payload = {
            "firstName": first_name,
            "lastName": last_name,
            "email": email,
            "company": company,
            "title": title,
            "linkedinUrl": linkedin_url,
            "customFields": custom_fields or {},
        }

        try:
            response = await self._client.post(
                f"/v1/connection/{connection_id}/metadata",
                json=payload,
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            logger.error("CRM lead creation failed: %s", exc)
            return {"synced": False, "error": str(exc)}

    async def update_lead_in_crm(
        self,
        connection_id: str,
        crm_lead_id: str,
        *,
        updates: dict[str, Any],
    ) -> dict[str, Any]:
        """Update an existing lead/contact in the CRM."""
        if not self._enabled:
            return {"synced": False, "reason": "crm_disabled"}

        try:
            response = await self._client.put(
                f"/v1/connection/{connection_id}/metadata/{crm_lead_id}",
                json=updates,
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            logger.error("CRM lead update failed: %s", exc)
            return {"synced": False, "error": str(exc)}

    # ── Activity Sync ────────────────────────────────────────────

    async def log_activity(
        self,
        connection_id: str,
        crm_lead_id: str,
        *,
        activity_type: str,  # email_sent, email_opened, email_replied, call, meeting
        subject: str = "",
        body: str = "",
        timestamp: str | None = None,
    ) -> dict[str, Any]:
        """Log an activity against a CRM lead/contact."""
        if not self._enabled:
            return {"synced": False, "reason": "crm_disabled"}

        payload = {
            "type": activity_type,
            "subject": subject,
            "body": body,
            "timestamp": timestamp,
        }

        try:
            response = await self._client.post(
                f"/v1/connection/{connection_id}/activity",
                json=payload,
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            logger.error("CRM activity logging failed: %s", exc)
            return {"synced": False, "error": str(exc)}

    # ── Connection Management ────────────────────────────────────

    async def list_connections(self) -> list[dict[str, Any]]:
        """List active Nango connections."""
        if not self._enabled:
            return []

        try:
            response = await self._client.get(
                f"/v1/connections?integration_ids={self._integration_id}"
            )
            response.raise_for_status()
            return response.json().get("connections", [])
        except httpx.HTTPStatusError:
            return []

    async def get_connection(self, connection_id: str) -> dict[str, Any] | None:
        """Get a specific connection's details."""
        if not self._enabled:
            return None

        try:
            response = await self._client.get(
                f"/v1/connection/{connection_id}"
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError:
            return None

    # ── Webhook Handling ─────────────────────────────────────────

    def verify_webhook(self, raw_body: bytes, signature_header: str) -> bool:
        """Verify incoming Nango webhook signature."""
        return self._verify_webhook_signature(raw_body, signature_header)

    async def process_webhook(
        self, operation: str, model: str, record: dict[str, Any]
    ) -> dict[str, Any]:
        """Process a CRM webhook event — sync back to local DB."""
        result = {
            "operation": operation,
            "model": model,
            "action": "ignored",
            "message": f"No handler for {operation}:{model}",
        }

        if model in ("contact", "lead"):
            if operation == "create":
                result["action"] = "lead_created"
                result["lead_data"] = {
                    "company_name": record.get("company", ""),
                    "contact_name": (
                        f"{record.get('firstName', '')} {record.get('lastName', '')}"
                    ).strip(),
                    "email": record.get("email", ""),
                    "title": record.get("title", ""),
                }
            elif operation == "update":
                result["action"] = "lead_updated"
            elif operation == "delete":
                result["action"] = "lead_archived"

        return result

    async def close(self) -> None:
        await self._client.aclose()
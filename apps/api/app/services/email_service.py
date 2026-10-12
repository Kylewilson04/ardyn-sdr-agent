"""
Ardyn SDR Agent — Email Service
SMTP sending via Postal API and inbound email parsing.
"""

from __future__ import annotations

import email
import re
from email.message import Message
from typing import Any

import httpx

from app.config import get_settings

settings = get_settings()


class EmailService:
    """Sends and parses email. Integrates with Postal SMTP API."""

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient(
            base_url=settings.POSTAL_API_URL,
            headers={
                "X-Server-API-Key": settings.POSTAL_API_KEY,
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )
        self._from_email = settings.FROM_EMAIL
        self._from_name = settings.FROM_NAME

    # ── Postal API Sending ───────────────────────────────────────

    async def send_message(
        self,
        *,
        to: str,
        subject: str,
        plain_body: str,
        html_body: str | None = None,
        cc: str | None = None,
        bcc: str | None = None,
        reply_to: str | None = None,
        tag: str | None = None,
        message_id: str | None = None,  # for threading
        allow_fallback: bool = False,
    ) -> dict[str, Any]:
        """Send via Postal's send/raw API.

        Refuses to send content marked as fallback unless
        `allow_fallback=True` is passed explicitly.
        """
        # ── Guard: reject fallback content from reaching real inboxes ──
        if not allow_fallback:
            combined = f"{subject} {plain_body}"
            fallback_markers = [
                "[FALLBACK",
                "__DO_NOT_SEND__",
                "generation_source: fallback",
            ]
            for marker in fallback_markers:
                if marker.lower() in combined.lower():
                    raise EmailSendError(
                        f"Refusing to send fallback-generated content. "
                        f"Subject=['{subject[:80]}…']. "
                        f"Fix: ensure agent-core is running, or pass allow_fallback=True for testing."
                    )

        payload: dict[str, Any] = {
            "to": [to],
            "from": f"{self._from_name} <{self._from_email}>",
            "subject": subject,
            "plain_body": plain_body,
        }

        if html_body:
            payload["html_body"] = html_body

        if cc:
            payload["cc"] = [cc]
        if bcc:
            payload["bcc"] = [bcc]
        if reply_to:
            payload["reply_to"] = reply_to
        if tag:
            payload["tag"] = tag
        if message_id:
            payload["headers"] = {"Message-ID": message_id}

        response = await self._client.post(
            "/api/v1/send/message",
            json=payload,
        )
        response.raise_for_status()
        data = response.json()

        if data.get("status") != "success":
            raise EmailSendError(
                f"Postal send failed: {data.get('data', {}).get('message', 'Unknown error')}"
            )

        return data["data"]

    async def send_raw(
        self,
        *,
        to: str,
        raw_message: str,
        tag: str | None = None,
    ) -> dict[str, Any]:
        """Send a raw RFC 2822 message."""
        payload: dict[str, Any] = {
            "mail_from": self._from_email,
            "rcpt_to": [to],
            "data": raw_message,
            "bounce": False,
        }
        if tag:
            payload["tag"] = tag

        response = await self._client.post(
            "/api/v1/send/raw",
            json=payload,
        )
        response.raise_for_status()
        return response.json()

    # ── Email Building ───────────────────────────────────────────

    def build_message(
        self,
        *,
        to: str,
        to_name: str = "",
        subject: str,
        plain_body: str,
        html_body: str | None = None,
        reply_to: str | None = None,
    ) -> str:
        """Build a raw RFC 2822 message string."""
        msg = Message()
        msg["From"] = f"{self._from_name} <{self._from_email}>"
        msg["To"] = f"{to_name} <{to}>" if to_name else to
        msg["Subject"] = subject
        if reply_to:
            msg["Reply-To"] = reply_to

        msg.set_payload(plain_body)
        msg.set_type("text/plain")

        if html_body:
            msg.add_alternative(html_body, subtype="html")

        return msg.as_string()

    # ── Parsing ──────────────────────────────────────────────────

    def parse_inbound_email(self, raw_email: str) -> dict[str, Any]:
        """Parse raw inbound email into a structured dict."""
        msg = email.message_from_string(raw_email)

        body_plain = ""
        body_html = ""

        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                payload = part.get_payload(decode=True)
                if not payload:
                    continue
                charset = part.get_content_charset() or "utf-8"
                text = payload.decode(charset, errors="replace")

                if content_type == "text/plain":
                    body_plain += text
                elif content_type == "text/html":
                    body_html += text
        else:
            payload = msg.get_payload(decode=True) or b""
            charset = msg.get_content_charset() or "utf-8"
            body_plain = payload.decode(charset, errors="replace")

        # Try to find the reply text (strip quoted text / signatures)
        reply_text = self._extract_reply_text(body_plain)

        return {
            "from": msg.get("From", ""),
            "to": msg.get("To", ""),
            "subject": msg.get("Subject", ""),
            "date": msg.get("Date", ""),
            "message_id": msg.get("Message-ID", ""),
            "in_reply_to": msg.get("In-Reply-To", ""),
            "references": msg.get("References", ""),
            "body_plain": body_plain,
            "body_html": body_html,
            "reply_text": reply_text,
        }

    def _extract_reply_text(self, body: str) -> str:
        """Strip quoted text and signatures to get just the reply."""
        if not body:
            return ""

        # Common reply delimiter patterns
        patterns = [
            r"\n\s*On\s+.*wrote:\s*$",  # "On Mon, Jan 1, 2024 at 3:00 PM Someone wrote:"
            r"\n\s*>+\s*.*",  # Quoted lines starting with >
            r"\n\s*-{2,}\s*\n",  # Signature separator "-- \n"
            r"\n\s*_{2,}\s*\n",  # Underscore separator
            r"\n\s*Sent\s+from\s+.*",  # Mobile signature
            r"\n\s*Get\s+Outlook\s+for\s+.*",  # Outlook signature
        ]

        # Try splitting on "On ... wrote:" first (most reliable)
        for pattern in patterns:
            match = re.search(pattern, body, re.IGNORECASE | re.MULTILINE)
            if match:
                reply = body[: match.start()].strip()
                if reply:
                    return reply

        return body.strip()

    async def close(self) -> None:
        await self._client.aclose()


class EmailSendError(Exception):
    pass


class EmailParseError(Exception):
    pass
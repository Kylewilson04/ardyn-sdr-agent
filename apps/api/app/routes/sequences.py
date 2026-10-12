"""
Ardyn SDR Agent — Sequences Routes
View and manage outreach sequences, handle replies.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.schemas import (
    ErrorResponse,
    SequenceResponse,
    SequenceStatus,
    SequenceUpdate,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/sequences", tags=["sequences"])


@router.get(
    "",
    response_model=dict[str, Any],
)
async def list_sequences(
    campaign_id: uuid.UUID | None = Query(None),
    lead_id: uuid.UUID | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """List sequences with optional filters."""
    where_clauses = []
    params: dict[str, Any] = {}

    if campaign_id:
        where_clauses.append("s.campaign_id = :campaign_id")
        params["campaign_id"] = campaign_id
    if lead_id:
        where_clauses.append("s.lead_id = :lead_id")
        params["lead_id"] = lead_id
    if status:
        where_clauses.append("s.status = :status")
        params["status"] = status

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    count_result = await session.execute(
        text(f"SELECT COUNT(*) FROM sequences s {where_sql}"), params
    )
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    stmt = text(
        f"""
        SELECT s.*, l.company_name, l.email as lead_email,
               c.name as campaign_name
        FROM sequences s
        LEFT JOIN leads l ON s.lead_id = l.id
        LEFT JOIN campaigns c ON s.campaign_id = c.id
        {where_sql}
        ORDER BY s.scheduled_at ASC, s.created_at DESC
        LIMIT :limit OFFSET :offset
        """
    )
    result = await session.execute(
        stmt, {**params, "limit": page_size, "offset": offset}
    )
    rows = [dict(row._mapping) for row in result]

    return {
        "items": rows,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get(
    "/{sequence_id}",
    response_model=SequenceResponse,
    responses={404: {"model": ErrorResponse}},
)
async def get_sequence(
    sequence_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Get a sequence by ID."""
    result = await session.execute(
        text("SELECT * FROM sequences WHERE id = :id"), {"id": sequence_id}
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Sequence not found")
    return dict(row)


@router.patch(
    "/{sequence_id}",
    response_model=SequenceResponse,
    responses={404: {"model": ErrorResponse}},
)
async def update_sequence(
    sequence_id: uuid.UUID,
    payload: SequenceUpdate,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Update a sequence step (status, reply info, etc.)."""
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clauses = []
    params: dict[str, Any] = {"id": sequence_id}

    for key, value in updates.items():
        set_clauses.append(f"{key} = :{key}")
        params[key] = value

    set_clauses.append("updated_at = NOW()")

    result = await session.execute(
        text(f"UPDATE sequences SET {', '.join(set_clauses)} WHERE id = :id"),
        params,
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Sequence not found")

    result = await session.execute(
        text("SELECT * FROM sequences WHERE id = :id"), {"id": sequence_id}
    )
    return dict(result.mappings().first())


@router.delete(
    "/{sequence_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"model": ErrorResponse}},
)
async def delete_sequence(
    sequence_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete a sequence (only if pending)."""
    result = await session.execute(
        text("DELETE FROM sequences WHERE id = :id AND status = 'pending'"),
        {"id": sequence_id},
    )
    if result.rowcount == 0:
        raise HTTPException(
            status_code=404,
            detail="Sequence not found or not in pending status",
        )


# ── Sequence Actions ─────────────────────────────────────────────

@router.post(
    "/{sequence_id}/skip",
    status_code=status.HTTP_200_OK,
)
async def skip_sequence(
    sequence_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Skip a pending sequence step."""
    result = await session.execute(
        text("""
            UPDATE sequences SET status = 'skipped', updated_at = NOW()
            WHERE id = :id AND status = 'pending'
        """),
        {"id": sequence_id},
    )
    if result.rowcount == 0:
        raise HTTPException(
            status_code=404, detail="Sequence not found or not pending"
        )
    return {"status": "skipped"}


# ── Pending Queue ────────────────────────────────────────────────

@router.get(
    "/queue/pending",
    response_model=dict[str, Any],
)
async def get_pending_queue(
    limit: int = Query(50, ge=1, le=200),
    channel: str | None = Query(None, pattern="^(email|linkedin|call)$"),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """
    Get the next batch of sequences ready to send.
    Used by the scheduler/worker to pick up work.
    """
    where_clauses = [
        "s.status = 'pending'",
        "s.scheduled_at <= NOW()",
    ]
    params: dict[str, Any] = {"limit": limit}

    if channel:
        where_clauses.append("s.channel = :channel")
        params["channel"] = channel

    stmt = text(
        f"""
        SELECT s.*, l.company_name, l.email as lead_email,
               l.contact_name, l.title, l.industry
        FROM sequences s
        JOIN leads l ON s.lead_id = l.id
        WHERE {' AND '.join(where_clauses)}
        ORDER BY s.scheduled_at ASC
        LIMIT :limit
        """
    )
    result = await session.execute(stmt, params)
    rows = [dict(row._mapping) for row in result]

    return {
        "items": rows,
        "count": len(rows),
        "next_batch_available": len(rows) == limit,
    }


@router.post(
    "/queue/send/{sequence_id}",
    status_code=status.HTTP_200_OK,
)
async def mark_sequence_sent(
    sequence_id: uuid.UUID,
    generated_email_id: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Mark a sequence as sent (called after email dispatch)."""
    result = await session.execute(
        text("""
            UPDATE sequences SET
                status = 'sent',
                sent_at = NOW(),
                generated_email_id = :generated_email_id,
                updated_at = NOW()
            WHERE id = :id AND status = 'pending'
        """),
        {"id": sequence_id, "generated_email_id": generated_email_id},
    )
    if result.rowcount == 0:
        raise HTTPException(
            status_code=404, detail="Sequence not found or not pending"
        )
    return {"status": "sent", "sequence_id": str(sequence_id)}
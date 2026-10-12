"""
Ardyn SDR Agent — Campaigns Routes
Create, run, and manage outreach campaigns.
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
    CampaignCreate,
    CampaignResponse,
    CampaignUpdate,
    ErrorResponse,
    PaginatedResponse,
    SequenceBatchCreate,
    SequenceResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.get(
    "",
    response_model=PaginatedResponse,
)
async def list_campaigns(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """List campaigns with pagination."""
    where_clauses = []
    params: dict[str, Any] = {}

    if status:
        where_clauses.append("status = :status")
        params["status"] = status

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    count_result = await session.execute(
        text(f"SELECT COUNT(*) FROM campaigns {where_sql}"), params
    )
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    stmt = text(
        f"""
        SELECT * FROM campaigns {where_sql}
        ORDER BY created_at DESC
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
    "/{campaign_id}",
    response_model=CampaignResponse,
    responses={404: {"model": ErrorResponse}},
)
async def get_campaign(
    campaign_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Get a campaign by ID."""
    result = await session.execute(
        text("SELECT * FROM campaigns WHERE id = :id"), {"id": campaign_id}
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return dict(row)


@router.post(
    "",
    response_model=CampaignResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_campaign(
    payload: CampaignCreate,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Create a new campaign."""
    campaign_id = uuid.uuid4()

    await session.execute(
        text("""
            INSERT INTO campaigns (id, name, status, target_audience,
                                  template_id, schedule, settings)
            VALUES (:id, :name, :status, :target_audience,
                    :template_id, :schedule, :settings)
        """),
        {
            "id": campaign_id,
            "name": payload.name,
            "status": "draft",
            "target_audience": payload.target_audience,
            "template_id": payload.template_id,
            "schedule": payload.schedule,
            "settings": {},
        },
    )

    result = await session.execute(
        text("SELECT * FROM campaigns WHERE id = :id"), {"id": campaign_id}
    )
    return dict(result.mappings().first())


@router.patch(
    "/{campaign_id}",
    response_model=CampaignResponse,
    responses={404: {"model": ErrorResponse}},
)
async def update_campaign(
    campaign_id: uuid.UUID,
    payload: CampaignUpdate,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Update a campaign."""
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clauses = []
    params: dict[str, Any] = {"id": campaign_id}

    for key, value in updates.items():
        set_clauses.append(f"{key} = :{key}")
        params[key] = value

    set_clauses.append("updated_at = NOW()")

    result = await session.execute(
        text(f"UPDATE campaigns SET {', '.join(set_clauses)} WHERE id = :id"),
        params,
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Campaign not found")

    result = await session.execute(
        text("SELECT * FROM campaigns WHERE id = :id"), {"id": campaign_id}
    )
    return dict(result.mappings().first())


@router.delete(
    "/{campaign_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"model": ErrorResponse}},
)
async def delete_campaign(
    campaign_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete a campaign (only if draft)."""
    result = await session.execute(
        text("DELETE FROM campaigns WHERE id = :id AND status = 'draft'"),
        {"id": campaign_id},
    )
    if result.rowcount == 0:
        raise HTTPException(
            status_code=404,
            detail="Campaign not found or not in draft status",
        )


# ── Campaign Actions ─────────────────────────────────────────────

@router.post(
    "/{campaign_id}/run",
    status_code=status.HTTP_200_OK,
    responses={404: {"model": ErrorResponse}, 400: {"model": ErrorResponse}},
)
async def run_campaign(
    campaign_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """
    Start a campaign: generate sequences for matching leads.
    The campaign transitions to 'running' and sequences are created
    for leads matching the target audience filters.
    """
    # Get campaign
    campaign_result = await session.execute(
        text("SELECT * FROM campaigns WHERE id = :id"), {"id": campaign_id}
    )
    campaign = campaign_result.mappings().first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    if campaign["status"] not in ("draft", "ready"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot run campaign in '{campaign['status']}' status",
        )

    # Find matching leads
    audience = campaign["target_audience"] or {}
    where_clauses = ["status NOT IN ('do_not_contact', 'archived', 'converted')"]
    params: dict[str, Any] = {}

    if audience.get("industry"):
        where_clauses.append("industry = :industry")
        params["industry"] = audience["industry"]
    if audience.get("title_contains"):
        where_clauses.append("title ILIKE :title_pattern")
        params["title_pattern"] = f"%{audience['title_contains']}%"
    if audience.get("lead_ids"):
        where_clauses.append("id = ANY(:lead_ids)")
        params["lead_ids"] = [str(lid) for lid in audience["lead_ids"]]

    leads_result = await session.execute(
        text(
            f"SELECT id FROM leads WHERE {' AND '.join(where_clauses)} "
            f"LIMIT :limit"
        ),
        {**params, "limit": audience.get("max_leads", 100)},
    )
    matching_lead_ids = [row[0] for row in leads_result]

    if not matching_lead_ids:
        await session.execute(
            text("UPDATE campaigns SET status = 'completed', updated_at = NOW() WHERE id = :id"),
            {"id": campaign_id},
        )
        return {"status": "completed", "sequences_created": 0, "message": "No matching leads found"}

    # Create sequences (step 1: email)
    sequences_created = 0
    for lead_id in matching_lead_ids:
        await session.execute(
            text("""
                INSERT INTO sequences (id, campaign_id, lead_id, step_number,
                                      channel, status, scheduled_at)
                VALUES (:id, :campaign_id, :lead_id, 1, 'email', 'pending', NOW())
                ON CONFLICT (campaign_id, lead_id, step_number) DO NOTHING
            """),
            {
                "id": uuid.uuid4(),
                "campaign_id": campaign_id,
                "lead_id": lead_id,
            },
        )
        sequences_created += 1

    # Update campaign status
    await session.execute(
        text("UPDATE campaigns SET status = 'running', updated_at = NOW() WHERE id = :id"),
        {"id": campaign_id},
    )

    return {
        "status": "running",
        "sequences_created": sequences_created,
        "matching_leads": len(matching_lead_ids),
    }


@router.post(
    "/{campaign_id}/pause",
    status_code=status.HTTP_200_OK,
)
async def pause_campaign(
    campaign_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Pause a running campaign."""
    result = await session.execute(
        text(
            "UPDATE campaigns SET status = 'paused', updated_at = NOW() "
            "WHERE id = :id AND status = 'running'"
        ),
        {"id": campaign_id},
    )
    if result.rowcount == 0:
        raise HTTPException(
            status_code=404, detail="Campaign not found or not running"
        )
    return {"status": "paused"}


@router.post(
    "/{campaign_id}/resume",
    status_code=status.HTTP_200_OK,
)
async def resume_campaign(
    campaign_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Resume a paused campaign."""
    result = await session.execute(
        text(
            "UPDATE campaigns SET status = 'running', updated_at = NOW() "
            "WHERE id = :id AND status = 'paused'"
        ),
        {"id": campaign_id},
    )
    if result.rowcount == 0:
        raise HTTPException(
            status_code=404, detail="Campaign not found or not paused"
        )
    return {"status": "running"}


# ── Batch Sequence Creation ──────────────────────────────────────

@router.post(
    "/{campaign_id}/sequences",
    response_model=list[SequenceResponse],
    status_code=status.HTTP_201_CREATED,
)
async def create_campaign_sequences(
    campaign_id: uuid.UUID,
    payload: SequenceBatchCreate,
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    """Create sequences for specific leads in a campaign."""
    sequences = []
    for lead_id in payload.lead_ids:
        seq_id = uuid.uuid4()
        await session.execute(
            text("""
                INSERT INTO sequences (id, campaign_id, lead_id, step_number,
                                      channel, status)
                VALUES (:id, :campaign_id, :lead_id, 1, :channel, 'pending')
                ON CONFLICT (campaign_id, lead_id, step_number) DO NOTHING
            """),
            {
                "id": seq_id,
                "campaign_id": campaign_id,
                "lead_id": lead_id,
                "channel": payload.channel.value,
            },
        )
        sequences.append({"id": seq_id, "lead_id": lead_id})

    # Fetch created sequences
    result = await session.execute(
        text("""
            SELECT * FROM sequences
            WHERE campaign_id = :campaign_id AND id = ANY(:ids)
            ORDER BY created_at
        """),
        {
            "campaign_id": campaign_id,
            "ids": [str(s["id"]) for s in sequences],
        },
    )
    return [dict(row._mapping) for row in result]
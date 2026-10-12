"""
Ardyn SDR Agent — Leads Routes
CRUD, CSV upload, semantic & text search for leads.
"""

from __future__ import annotations

import csv
import io
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import Lead
from app.schemas import (
    ErrorResponse,
    LeadCreate,
    LeadResponse,
    LeadSearchRequest,
    LeadUpdate,
    PaginatedResponse,
)
from app.services.vector_service import VectorService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/leads", tags=["leads"])

_vector_service = VectorService()


# ── CRUD ─────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=PaginatedResponse,
    responses={500: {"model": ErrorResponse}},
)
async def list_leads(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: str | None = Query(None),
    industry: str | None = Query(None),
    sort: str = Query("created_at"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """List leads with pagination and optional filtering."""
    allowed_sorts = {"created_at", "company_name", "email", "updated_at"}
    if sort not in allowed_sorts:
        sort = "created_at"

    order_clause = f"{sort} {'ASC' if order == 'asc' else 'DESC'}"

    where_clauses = []
    params: dict[str, Any] = {}

    if status:
        where_clauses.append("status = :status")
        params["status"] = status
    if industry:
        where_clauses.append("industry = :industry")
        params["industry"] = industry

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    # Count total
    count_result = await session.execute(
        text(f"SELECT COUNT(*) FROM leads {where_sql}"),
        params,
    )
    total = count_result.scalar() or 0

    # Fetch page
    offset = (page - 1) * page_size
    stmt = text(
        f"""
        SELECT id, company_name, contact_name, email, linkedin_url,
               title, industry, status, custom_fields, created_at, updated_at
        FROM leads
        {where_sql}
        ORDER BY {order_clause}
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
    "/{lead_id}",
    response_model=LeadResponse,
    responses={404: {"model": ErrorResponse}},
)
async def get_lead(
    lead_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Get a single lead by ID."""
    stmt = text(
        """
        SELECT id, company_name, contact_name, email, linkedin_url,
               title, industry, status, custom_fields, created_at, updated_at
        FROM leads WHERE id = :id
        """
    )
    result = await session.execute(stmt, {"id": lead_id})
    row = result.mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Lead not found")

    return dict(row)


@router.post(
    "",
    response_model=LeadResponse,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"model": ErrorResponse}},
)
async def create_lead(
    payload: LeadCreate,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Create a new lead."""
    # Check for duplicate email
    if payload.email:
        existing = await session.execute(
            text("SELECT id FROM leads WHERE email = :email"),
            {"email": payload.email},
        )
        if existing.scalar():
            raise HTTPException(
                status_code=409,
                detail="A lead with this email already exists",
            )

    lead_id = uuid.uuid4()

    stmt = text(
        """
        INSERT INTO leads (id, company_name, contact_name, email, linkedin_url,
                          title, industry, status, custom_fields)
        VALUES (:id, :company_name, :contact_name, :email, :linkedin_url,
                :title, :industry, :status, :custom_fields)
        """
    )
    await session.execute(
        stmt,
        {
            "id": lead_id,
            "company_name": payload.company_name,
            "contact_name": payload.contact_name,
            "email": payload.email,
            "linkedin_url": payload.linkedin_url,
            "title": payload.title,
            "industry": payload.industry,
            "status": "new",
            "custom_fields": payload.custom_fields,
        },
    )

    # Generate embedding in background
    try:
        embedding = await _vector_service.embed_lead(payload.model_dump())
        await _vector_service.index_lead(session, str(lead_id), embedding)
    except Exception:
        logger.exception("Failed to generate lead embedding")

    # Return the created lead
    result = await session.execute(
        text("SELECT * FROM leads WHERE id = :id"),
        {"id": lead_id},
    )
    return dict(result.mappings().first())


@router.patch(
    "/{lead_id}",
    response_model=LeadResponse,
    responses={404: {"model": ErrorResponse}},
)
async def update_lead(
    lead_id: uuid.UUID,
    payload: LeadUpdate,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Update a lead (partial update)."""
    updates = payload.model_dump(exclude_unset=True)

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clauses = []
    params: dict[str, Any] = {"id": lead_id}

    for key, value in updates.items():
        set_clauses.append(f"{key} = :{key}")
        params[key] = value

    set_clauses.append("updated_at = NOW()")
    set_sql = ", ".join(set_clauses)

    stmt = text(f"UPDATE leads SET {set_sql} WHERE id = :id")
    result = await session.execute(stmt, params)

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Refresh
    result = await session.execute(
        text("SELECT * FROM leads WHERE id = :id"),
        {"id": lead_id},
    )
    return dict(result.mappings().first())


@router.delete(
    "/{lead_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"model": ErrorResponse}},
)
async def delete_lead(
    lead_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Archive (soft-delete) a lead."""
    result = await session.execute(
        text("UPDATE leads SET status = 'archived', updated_at = NOW() WHERE id = :id"),
        {"id": lead_id},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Lead not found")


# ── CSV Upload ───────────────────────────────────────────────────

@router.post(
    "/upload/csv",
    status_code=status.HTTP_200_OK,
    responses={400: {"model": ErrorResponse}},
)
async def upload_csv(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Upload leads via CSV file."""
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    content = await file.read()
    text_content = content.decode("utf-8-sig")

    reader = csv.DictReader(io.StringIO(text_content))

    created = 0
    skipped = 0
    errors: list[dict[str, Any]] = []

    for row_num, row in enumerate(reader, start=2):
        email = row.get("email", "").strip()
        company = row.get("company_name", "").strip()

        if not company:
            errors.append(
                {"row": row_num, "error": "company_name is required"}
            )
            skipped += 1
            continue

        # Check duplicate
        if email:
            existing = await session.execute(
                text("SELECT id FROM leads WHERE email = :email"),
                {"email": email},
            )
            if existing.scalar():
                skipped += 1
                continue

        lead_id = uuid.uuid4()
        await session.execute(
            text("""
                INSERT INTO leads (id, company_name, contact_name, email,
                                  linkedin_url, title, industry, status, custom_fields)
                VALUES (:id, :company_name, :contact_name, :email,
                        :linkedin_url, :title, :industry, :status, :custom_fields)
            """),
            {
                "id": lead_id,
                "company_name": company,
                "contact_name": row.get("contact_name", "").strip() or None,
                "email": email or None,
                "linkedin_url": row.get("linkedin_url", "").strip() or None,
                "title": row.get("title", "").strip() or None,
                "industry": row.get("industry", "").strip() or None,
                "status": "new",
                "custom_fields": {},
            },
        )
        created += 1

    return {
        "created": created,
        "skipped": skipped,
        "total": created + skipped,
        "errors": errors,
    }


# ── Search ───────────────────────────────────────────────────────

@router.post(
    "/search",
    response_model=dict[str, Any],
    responses={400: {"model": ErrorResponse}},
)
async def search_leads(
    payload: LeadSearchRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Search leads semantically or via text match."""
    if payload.search_type == "semantic":
        embedding = await _vector_service.embed_text(payload.query)
        results = await _vector_service.search_leads(
            session,
            embedding,
            limit=payload.limit,
            min_similarity=payload.min_similarity,
        )
    elif payload.search_type == "text":
        results = await _vector_service.text_search_leads(
            session,
            payload.query,
            limit=payload.limit,
        )
    elif payload.search_type == "hybrid":
        # Run both, deduplicate by ID
        embedding = await _vector_service.embed_text(payload.query)
        semantic_results = await _vector_service.search_leads(
            session,
            embedding,
            limit=payload.limit,
            min_similarity=payload.min_similarity,
        )
        text_results = await _vector_service.text_search_leads(
            session,
            payload.query,
            limit=payload.limit,
        )

        seen: set[str] = set()
        merged: list[dict[str, Any]] = []
        for r in semantic_results:
            rid = str(r["id"])
            if rid not in seen:
                seen.add(rid)
                merged.append(r)
        for r in text_results:
            rid = str(r["id"])
            if rid not in seen:
                seen.add(rid)
                merged.append(r)

        results = merged[:payload.limit]
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid search_type: {payload.search_type}. Use 'semantic', 'text', or 'hybrid'",
        )

    return {
        "query": payload.query,
        "search_type": payload.search_type,
        "results": results,
        "count": len(results),
    }


# ── Bulk Status Update ───────────────────────────────────────────

@router.post(
    "/bulk/status",
    status_code=status.HTTP_200_OK,
)
async def bulk_update_status(
    lead_ids: list[uuid.UUID],
    new_status: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Bulk update lead statuses."""
    valid_statuses = {
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
    }
    if new_status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status: {new_status}. Must be one of {valid_statuses}",
        )

    # Use bindparam for list
    stmt = text("""
        UPDATE leads SET status = :status, updated_at = NOW()
        WHERE id = ANY(:ids)
    """)
    await session.execute(
        stmt,
        {"status": new_status, "ids": [str(lid) for lid in lead_ids]},
    )

    return {"updated": len(lead_ids), "status": new_status}
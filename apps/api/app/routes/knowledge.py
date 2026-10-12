"""
Ardyn SDR Agent — Knowledge Routes
Upload documents/websites, semantic search.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.schemas import (
    ErrorResponse,
    KnowledgeCreate,
    KnowledgeResponse,
    KnowledgeSearchRequest,
    KnowledgeSearchResult,
    KnowledgeUpdate,
    PaginatedResponse,
)
from app.services.vector_service import VectorService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/knowledge", tags=["knowledge"])

_vector_service = VectorService()


@router.get(
    "",
    response_model=PaginatedResponse,
)
async def list_knowledge(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    source_type: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """List knowledge base entries."""
    where_clauses = []
    params: dict[str, Any] = {}

    if source_type:
        where_clauses.append("source_type = :source_type")
        params["source_type"] = source_type

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    count_result = await session.execute(
        text(f"SELECT COUNT(*) FROM knowledge_base {where_sql}"), params
    )
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    stmt = text(
        f"""
        SELECT id, name, source_type, source_url, chunk_index,
               created_at, updated_at
        FROM knowledge_base
        {where_sql}
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
    "/{kb_id}",
    response_model=KnowledgeResponse,
    responses={404: {"model": ErrorResponse}},
)
async def get_knowledge(
    kb_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Get a knowledge base entry by ID."""
    result = await session.execute(
        text("SELECT * FROM knowledge_base WHERE id = :id"), {"id": kb_id}
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Knowledge entry not found")
    return dict(row)


@router.post(
    "",
    response_model=KnowledgeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_knowledge(
    payload: KnowledgeCreate,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Create a knowledge base entry with embedding."""
    kb_id = uuid.uuid4()
    content_hash = _vector_service.content_hash(payload.content)

    # Check for duplicate content
    existing = await session.execute(
        text("SELECT id FROM knowledge_base WHERE content_hash = :hash"),
        {"hash": content_hash},
    )
    if existing.scalar():
        raise HTTPException(
            status_code=409,
            detail="Duplicate content — this exact text already exists",
        )

    # Chunk large content
    chunks = await _vector_service.chunk_text(payload.content)

    first_id = None
    for i, chunk in enumerate(chunks):
        chunk_id = uuid.uuid4() if i > 0 else kb_id
        if i == 0:
            first_id = chunk_id

        embedding = await _vector_service.embed_text(chunk)

        await session.execute(
            text("""
                INSERT INTO knowledge_base
                    (id, name, source_type, source_url, content, content_hash,
                     embedding, chunk_index)
                VALUES (:id, :name, :source_type, :source_url, :content, :content_hash,
                        :embedding, :chunk_index)
            """),
            {
                "id": chunk_id,
                "name": payload.name,
                "source_type": payload.source_type.value,
                "source_url": payload.source_url,
                "content": chunk,
                "content_hash": content_hash,
                "embedding": embedding,
                "chunk_index": i,
            },
        )

    result = await session.execute(
        text("SELECT * FROM knowledge_base WHERE id = :id"),
        {"id": first_id},
    )
    return dict(result.mappings().first())


@router.patch(
    "/{kb_id}",
    response_model=KnowledgeResponse,
    responses={404: {"model": ErrorResponse}},
)
async def update_knowledge(
    kb_id: uuid.UUID,
    payload: KnowledgeUpdate,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Update a knowledge entry."""
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clauses = []
    params: dict[str, Any] = {"id": kb_id}

    for key, value in updates.items():
        if key == "content":
            # Re-embed if content changes
            set_clauses.append("content = :content")
            set_clauses.append("content_hash = :content_hash")
            set_clauses.append("embedding = :embedding")
            params["content"] = value
            params["content_hash"] = _vector_service.content_hash(value)
            params["embedding"] = await _vector_service.embed_text(value)
        else:
            set_clauses.append(f"{key} = :{key}")
            params[key] = value

    set_clauses.append("updated_at = NOW()")

    result = await session.execute(
        text(
            f"UPDATE knowledge_base SET {', '.join(set_clauses)} WHERE id = :id"
        ),
        params,
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Knowledge entry not found")

    result = await session.execute(
        text("SELECT * FROM knowledge_base WHERE id = :id"), {"id": kb_id}
    )
    return dict(result.mappings().first())


@router.delete(
    "/{kb_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"model": ErrorResponse}},
)
async def delete_knowledge(
    kb_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete a knowledge entry."""
    result = await session.execute(
        text("DELETE FROM knowledge_base WHERE id = :id"), {"id": kb_id}
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Knowledge entry not found")


# ── URL Import ───────────────────────────────────────────────────

@router.post(
    "/url",
    status_code=status.HTTP_200_OK,
)
async def import_url(
    url: str = Query(...),
    name: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Import a webpage into the knowledge base."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, follow_redirects=True)
            response.raise_for_status()
            content = response.text
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=400, detail=f"Failed to fetch URL: {exc}"
        )

    # Extract text from HTML (basic)
    from html.parser import HTMLParser

    class TextExtractor(HTMLParser):
        def __init__(self) -> None:
            super().__init__()
            self.text: list[str] = []
            self.skip_tags = {"script", "style", "noscript", "iframe"}

        def handle_data(self, data: str) -> None:
            tag = getattr(self, "_current_tag", "")
            if tag not in self.skip_tags:
                self.text.append(data.strip())

    extractor = TextExtractor()
    extractor.feed(content)
    text_content = "\n".join(line for line in extractor.text if line)

    if not text_content.strip():
        raise HTTPException(status_code=400, detail="No extractable text from URL")

    kb_id = uuid.uuid4()
    content_hash = _vector_service.content_hash(text_content)
    entry_name = name or url

    embedding = await _vector_service.embed_text(text_content[:8000])

    await session.execute(
        text("""
            INSERT INTO knowledge_base
                (id, name, source_type, source_url, content, content_hash, embedding)
            VALUES (:id, :name, 'url', :source_url, :content, :content_hash, :embedding)
        """),
        {
            "id": kb_id,
            "name": entry_name,
            "source_url": url,
            "content": text_content,
            "content_hash": content_hash,
            "embedding": embedding,
        },
    )

    return {
        "id": str(kb_id),
        "name": entry_name,
        "source_url": url,
        "content_length": len(text_content),
    }


# ── File Upload ──────────────────────────────────────────────────

@router.post(
    "/upload",
    status_code=status.HTTP_200_OK,
)
async def upload_file(
    file: UploadFile = File(...),
    name: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Upload a text file into the knowledge base."""
    content_bytes = await file.read()

    try:
        text_content = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        text_content = content_bytes.decode("latin-1", errors="replace")

    if not text_content.strip():
        raise HTTPException(status_code=400, detail="File is empty")

    kb_id = uuid.uuid4()
    content_hash = _vector_service.content_hash(text_content)
    entry_name = name or file.filename or "uploaded file"

    embedding = await _vector_service.embed_text(text_content[:8000])

    await session.execute(
        text("""
            INSERT INTO knowledge_base
                (id, name, source_type, source_url, content, content_hash, embedding)
            VALUES (:id, :name, 'file', :source_url, :content, :content_hash, :embedding)
        """),
        {
            "id": kb_id,
            "name": entry_name,
            "source_url": file.filename,
            "content": text_content,
            "content_hash": content_hash,
            "embedding": embedding,
        },
    )

    return {
        "id": str(kb_id),
        "name": entry_name,
        "filename": file.filename,
        "content_length": len(text_content),
    }


# ── Search ───────────────────────────────────────────────────────

@router.post(
    "/search",
    response_model=dict[str, Any],
)
async def search_knowledge(
    payload: KnowledgeSearchRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Semantic search across the knowledge base."""
    embedding = await _vector_service.embed_text(payload.query)
    results = await _vector_service.search_knowledge(
        session,
        embedding,
        limit=payload.limit,
        min_similarity=payload.min_similarity,
    )

    return {
        "query": payload.query,
        "results": results,
        "count": len(results),
    }
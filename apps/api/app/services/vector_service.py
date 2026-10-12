"""
Ardyn SDR Agent — Vector Service
pgvector embedding generation and semantic search.
"""

from __future__ import annotations

import hashlib
from typing import Any

from openai import AsyncOpenAI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import KnowledgeBase, Lead

settings = get_settings()


class VectorService:
    """Generates embeddings via OpenAI and performs pgvector similarity search."""

    def __init__(self, client: AsyncOpenAI | None = None) -> None:
        self._client = client or AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self._model = settings.OPENAI_EMBEDDING_MODEL
        self._dimensions = settings.VECTOR_DIMENSIONS

    async def embed_text(self, text: str) -> list[float]:
        """Generate an embedding vector for a single text string."""
        text = text[:8000]  # OpenAI token limit safety
        response = await self._client.embeddings.create(
            model=self._model,
            input=text,
        )
        return response.data[0].embedding

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a batch of texts."""
        texts = [t[:8000] for t in texts]
        response = await self._client.embeddings.create(
            model=self._model,
            input=texts,
        )
        return [item.embedding for item in response.data]

    def _build_embedding_text(self, lead: dict[str, Any]) -> str:
        """Build a rich text representation of a lead for embedding."""
        parts = [
            lead.get("company_name", ""),
            f"Contact: {lead.get('contact_name', '')}",
            f"Title: {lead.get('title', '')}",
            f"Industry: {lead.get('industry', '')}",
        ]
        custom = lead.get("custom_fields", {})
        if custom:
            parts.extend(f"{k}: {v}" for k, v in custom.items())
        return " | ".join(filter(None, parts))

    async def embed_lead(self, lead: dict[str, Any]) -> list[float]:
        """Embed a lead record."""
        text = self._build_embedding_text(lead)
        return await self.embed_text(text)

    async def search_leads(
        self,
        session: AsyncSession,
        query_embedding: list[float],
        *,
        limit: int = 20,
        min_similarity: float = 0.4,
    ) -> list[dict[str, Any]]:
        """Semantic search leads by embedding similarity."""
        stmt = text("""
            SELECT
                id,
                company_name,
                contact_name,
                email,
                title,
                industry,
                status,
                custom_fields,
                created_at,
                updated_at,
                1 - (embedding <=> :embedding) AS similarity
            FROM leads
            WHERE embedding IS NOT NULL
              AND 1 - (embedding <=> :embedding) > :min_similarity
            ORDER BY embedding <=> :embedding
            LIMIT :limit
        """)

        result = await session.execute(
            stmt,
            {
                "embedding": query_embedding,
                "min_similarity": min_similarity,
                "limit": limit,
            },
        )
        return [dict(row._mapping) for row in result]

    async def search_knowledge(
        self,
        session: AsyncSession,
        query_embedding: list[float],
        *,
        limit: int = 10,
        min_similarity: float = 0.5,
    ) -> list[dict[str, Any]]:
        """Semantic search knowledge base by embedding similarity."""
        stmt = text("""
            SELECT
                id,
                name,
                source_type,
                source_url,
                content,
                chunk_index,
                1 - (embedding <=> :embedding) AS similarity
            FROM knowledge_base
            WHERE embedding IS NOT NULL
              AND 1 - (embedding <=> :embedding) > :min_similarity
            ORDER BY embedding <=> :embedding
            LIMIT :limit
        """)

        result = await session.execute(
            stmt,
            {
                "embedding": query_embedding,
                "min_similarity": min_similarity,
                "limit": limit,
            },
        )
        return [dict(row._mapping) for row in result]

    async def text_search_leads(
        self,
        session: AsyncSession,
        query: str,
        *,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Full-text search leads across text fields."""
        stmt = text("""
            SELECT
                id, company_name, contact_name, email, title, industry,
                status, custom_fields, created_at, updated_at
            FROM leads
            WHERE
                company_name ILIKE :pattern
                OR contact_name ILIKE :pattern
                OR email ILIKE :pattern
                OR title ILIKE :pattern
                OR industry ILIKE :pattern
            ORDER BY created_at DESC
            LIMIT :limit
        """)

        result = await session.execute(
            stmt,
            {"pattern": f"%{query}%", "limit": limit},
        )
        return [dict(row._mapping) for row in result]

    async def index_lead(
        self, session: AsyncSession, lead_id: str, embedding: list[float]
    ) -> None:
        """Update a lead's embedding vector."""
        stmt = text("UPDATE leads SET embedding = :embedding WHERE id = :id")
        await session.execute(stmt, {"embedding": embedding, "id": lead_id})

    async def index_knowledge(
        self, session: AsyncSession, kb_id: str, embedding: list[float]
    ) -> None:
        """Update a knowledge-base entry's embedding vector."""
        stmt = text("UPDATE knowledge_base SET embedding = :embedding WHERE id = :id")
        await session.execute(stmt, {"embedding": embedding, "id": kb_id})

    def content_hash(self, content: str) -> str:
        """SHA-256 hash for deduplication."""
        return hashlib.sha256(content.encode("utf-8")).hexdigest()

    async def chunk_text(
        self, text: str, chunk_size: int = 1000, overlap: int = 200
    ) -> list[str]:
        """Split long text into overlapping chunks for embedding."""
        if len(text) <= chunk_size:
            return [text]
        chunks: list[str] = []
        start = 0
        while start < len(text):
            end = min(start + chunk_size, len(text))
            chunks.append(text[start:end])
            start += chunk_size - overlap
        return chunks
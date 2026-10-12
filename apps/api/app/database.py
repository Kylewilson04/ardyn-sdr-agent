"""
Ardyn SDR Agent — Async Database Engine & Session
PostgreSQL + pgvector via SQLAlchemy async.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool, QueuePool

from app.config import get_settings

settings = get_settings()

# ── Engine ───────────────────────────────────────────────────────
_engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DATABASE_ECHO,
    pool_size=settings.DATABASE_POOL_SIZE,
    max_overflow=settings.DATABASE_MAX_OVERFLOW,
    pool_timeout=settings.DATABASE_POOL_TIMEOUT,
    pool_pre_ping=True,
    poolclass=NullPool if settings.ENVIRONMENT == "test" else QueuePool,
)

# ── Async Session Factory ────────────────────────────────────────
async_session_factory = async_sessionmaker(
    _engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_session() -> AsyncSession:  # type: ignore[misc]
    """Dependency: yield a fresh async session per request."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def check_database_connection() -> bool:
    """Health-check: can we reach the database?"""
    try:
        async with _engine.connect() as conn:
            await conn.execute(
                __import__("sqlalchemy").text("SELECT 1")
            )
        return True
    except Exception:
        return False


async def dispose_engine() -> None:
    """Graceful shutdown: dispose the engine."""
    await _engine.dispose()
"""
Ardyn SDR Agent — FastAPI Application
Main entry point with CORS, middleware, router mounting, and lifecycle.
"""

from __future__ import annotations

import time
import uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.database import check_database_connection, dispose_engine
from app.routes import agents, campaigns, knowledge, leads, sequences, webhooks

settings = get_settings()
logger = structlog.get_logger()

# ── Startup Time ─────────────────────────────────────────────────
_start_time = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifecycle: startup and shutdown."""
    logger.info(
        "Starting Ardyn SDR Agent API",
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
    )

    # Verify database connection
    db_ok = await check_database_connection()
    if db_ok:
        logger.info("Database connection established")
    else:
        logger.warning(
            "Database connection failed — check DATABASE_URL and that PostgreSQL is running"
        )

    yield

    # Shutdown
    await dispose_engine()
    logger.info("Ardyn SDR Agent API shut down")


# ── Application ──────────────────────────────────────────────────

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Open-source AI SDR agent — backend API",
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-RateLimit-Remaining"],
)

# ── Middleware ───────────────────────────────────────────────────


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    """Add X-Request-ID to every request and response."""
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    request.state.request_id = request_id
    request.state.start_time = time.time()

    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id

    duration_ms = (time.time() - request.state.start_time) * 1000
    response.headers["X-Response-Time-Ms"] = f"{duration_ms:.1f}"

    return response


@app.middleware("http")
async def api_key_auth(request: Request, call_next):
    """Validate X-API-Key for protected endpoints (stub)."""
    # Skip auth for docs, health, and webhooks
    path = request.url.path
    if path in ("/health", "/api/health", "/docs", "/redoc", "/openapi.json") or path.startswith(
        "/webhooks/"
    ):
        return await call_next(request)

    # API key auth — optional, skip if no keys configured
    api_key = request.headers.get(settings.API_KEY_HEADER)
    if settings.api_key_set and api_key not in settings.api_key_set:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Invalid or missing API key"},
        )

    return await call_next(request)


@app.middleware("http")
async def structured_logging(request: Request, call_next):
    """Log every request with structured fields."""
    logger.info(
        "request",
        method=request.method,
        path=request.url.path,
        client=request.client.host if request.client else "unknown",
    )

    try:
        response = await call_next(request)
    except Exception:
        logger.exception(
            "request_failed",
            method=request.method,
            path=request.url.path,
        )
        raise

    logger.info(
        "response",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration_ms=round(
            (time.time() - getattr(request.state, "start_time", time.time())) * 1000,
            1,
        ),
    )

    return response


# ── Routers ──────────────────────────────────────────────────────

app.include_router(leads.router)
app.include_router(campaigns.router)
app.include_router(sequences.router)
app.include_router(knowledge.router)
app.include_router(agents.router)
app.include_router(webhooks.router)


# ── Health Check ─────────────────────────────────────────────────

@app.get("/health", tags=["health"])
async def health_check() -> dict:
    """Kubernetes-style health check."""
    db_status = "connected" if await check_database_connection() else "disconnected"

    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "database": db_status,
        "uptime_seconds": round(time.time() - _start_time, 1),
    }


# ── Exception Handlers ───────────────────────────────────────────

@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": str(exc)},
    )


@app.exception_handler(404)
async def not_found_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"detail": "Endpoint not found"},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(
        "unhandled_exception",
        path=request.url.path,
        method=request.method,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Internal server error",
            "error_code": "INTERNAL_ERROR",
        },
    )
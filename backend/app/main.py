"""SPUNI API application factory."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import SecurityHeadersMiddleware
from app.db.bootstrap import prepare_database
from app.services.email import email_worker
from app.services.jobs import scheduler

logger = logging.getLogger("spuni")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings.media_root.mkdir(parents=True, exist_ok=True)
    if settings.environment != "test" and settings.auto_setup_db:
        await prepare_database()
    if settings.environment != "test":
        email_worker.start()
        scheduler.start()
    logger.info("SPUNI API started (env=%s, payments=%s, email=%s)", settings.environment,
                settings.payment_mode, settings.email_backend)
    yield
    await scheduler.stop()
    await email_worker.stop()


def create_app() -> FastAPI:
    configure_logging()
    app = FastAPI(
        title="SPUNI API",
        version="1.0.0",
        description="Backend for the SPUNI leather storefront and admin.",
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else f"{settings.api_prefix}/openapi.json",
    )

    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Requested-With", "Idempotency-Key"],
        max_age=600,
    )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_hosts)
    app.add_middleware(SecurityHeadersMiddleware)

    register_exception_handlers(app)
    app.include_router(api_router, prefix=settings.api_prefix)
    app.mount(settings.media_url, StaticFiles(directory=settings.media_root, check_dir=False), name="media")

    @app.get("/health", tags=["meta"], include_in_schema=False)
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()

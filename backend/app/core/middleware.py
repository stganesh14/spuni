"""Security headers and request-id middleware (pure ASGI for low overhead)."""

import logging
import time
import uuid

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import settings

logger = logging.getLogger("spuni.request")

SECURITY_HEADERS = {
    b"x-content-type-options": b"nosniff",
    b"x-frame-options": b"DENY",
    b"referrer-policy": b"strict-origin-when-cross-origin",
    b"permissions-policy": b"camera=(), microphone=(), geolocation=()",
    b"cross-origin-opener-policy": b"same-origin",
    b"content-security-policy": b"default-src 'none'; frame-ancestors 'none'; img-src 'self' data:",
}


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = uuid.uuid4().hex[:16]
        started = time.perf_counter()
        path: str = scope.get("path", "")
        is_docs = path.startswith(("/docs", "/redoc")) or path.endswith("openapi.json")
        status_holder = {"code": 500}

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                status_holder["code"] = message["status"]
                headers = list(message.get("headers", []))
                existing = {k.lower() for k, _ in headers}
                for key, value in SECURITY_HEADERS.items():
                    if key == b"content-security-policy" and (is_docs or path.startswith(settings.media_url)):
                        continue
                    if key not in existing:
                        headers.append((key, value))
                if settings.is_production:
                    headers.append((b"strict-transport-security", b"max-age=63072000; includeSubDomains"))
                if path.startswith(settings.api_prefix):
                    headers.append((b"cache-control", b"no-store"))
                headers.append((b"x-request-id", request_id.encode()))
                message["headers"] = headers
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            elapsed = (time.perf_counter() - started) * 1000
            logger.info("%s %s %s %.1fms rid=%s", scope.get("method"), path, status_holder["code"], elapsed,
                        request_id)

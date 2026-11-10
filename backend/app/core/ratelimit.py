"""Small sliding-window rate limiter.

In-process by default. For multi-instance deployments put a shared limiter at
the proxy (nginx ``limit_req``) as well; OTP limits are additionally enforced
in the database so they hold across instances.
"""

import asyncio
import time
from collections import defaultdict, deque

from fastapi import Request

from app.core.config import settings
from app.core.errors import TooManyRequests


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def hit(self, key: str, limit: int, window_seconds: int) -> None:
        now = time.monotonic()
        async with self._lock:
            bucket = self._hits[key]
            while bucket and bucket[0] <= now - window_seconds:
                bucket.popleft()
            if len(bucket) >= limit:
                retry_after = int(window_seconds - (now - bucket[0])) + 1
                raise TooManyRequests(
                    "Too many requests. Please slow down and try again shortly.",
                    details={"retry_after": retry_after},
                )
            bucket.append(now)
            if len(self._hits) > 50_000:  # crude memory guard
                for stale in [k for k, v in self._hits.items() if not v][:10_000]:
                    self._hits.pop(stale, None)

    def reset(self) -> None:
        self._hits.clear()


limiter = SlidingWindowLimiter()


def client_ip(request: Request) -> str:
    # Trust X-Forwarded-For only when running behind our own proxy (uvicorn --proxy-headers
    # rewrites request.client from it), so read request.client directly.
    return request.client.host if request.client else "unknown"


def rate_limit(name: str, limit: int, window_seconds: int):
    """FastAPI dependency factory: ``Depends(rate_limit("otp", 10, 600))``."""

    async def _dependency(request: Request) -> None:
        if settings.environment == "test":
            return
        await limiter.hit(f"{name}:{client_ip(request)}", limit, window_seconds)

    return _dependency

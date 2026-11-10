"""Periodic maintenance jobs run inside the API process."""

import asyncio
import contextlib
import logging

logger = logging.getLogger("spuni.jobs")


class Scheduler:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None

    async def _run(self) -> None:
        from app.services.maintenance import run_maintenance

        while True:
            try:
                await run_maintenance()
            except Exception:  # noqa: BLE001
                logger.exception("Maintenance job failed")
            await asyncio.sleep(60)

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run(), name="maintenance")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._task
            self._task = None


scheduler = Scheduler()

"""Transactional email: outbox enqueue, rendering and the delivery worker."""

import asyncio
import contextlib
import html
import logging
import re
from datetime import timedelta
from email.message import EmailMessage
from typing import Any

import aiosmtplib
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import BASE_DIR, settings
from app.core.security import utcnow
from app.db.session import SessionLocal
from app.models import EmailOutbox
from app.models.enums import EmailStatus

logger = logging.getLogger("spuni.email")

TEMPLATE_DIR = BASE_DIR / "app" / "templates" / "email"
SENSITIVE_KEYS = {"code", "gift_code"}

_env = Environment(
    loader=FileSystemLoader(TEMPLATE_DIR),
    autoescape=select_autoescape(["html"]),
    undefined=StrictUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
)


def rupees(paise: int | None) -> str:
    if paise is None:
        return "-"
    value = paise / 100
    whole, frac = divmod(round(value * 100), 100)
    # Indian digit grouping: 12,34,567.00
    s = str(whole)
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        head = re.sub(r"(\d)(?=(\d{2})+$)", r"\1,", head)
        s = f"{head},{tail}"
    return f"₹{s}.{frac:02d}" if frac else f"₹{s}"


_env.filters["rupees"] = rupees


def _base_context() -> dict[str, Any]:
    return {
        "brand": settings.app_name,
        "storefront_url": settings.storefront_url.rstrip("/"),
        "support_email": settings.email_reply_to or "spunileathers@gmail.com",
        "year": utcnow().year,
    }


def render(template: str, context: dict[str, Any]) -> tuple[str, str]:
    html_body = _env.get_template(f"{template}.html").render(**_base_context(), **context)
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html_body, flags=re.S | re.I)
    text = re.sub(r"<br\s*/?>|</p>|</tr>|</h[1-6]>", "\n", text, flags=re.I)
    text = html.unescape(re.sub(r"<[^>]+>", "", text))
    text = "\n".join(line.strip() for line in text.splitlines())
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return html_body, text


async def enqueue_email(
    db: AsyncSession, *, to: str, subject: str, template: str, context: dict[str, Any] | None = None,
    delay_seconds: int = 0,
) -> EmailOutbox:
    """Add an email to the outbox. It is sent after the caller's transaction commits."""
    # Render once now so template errors surface in the request, not in the worker.
    render(template, context or {})
    item = EmailOutbox(
        to_email=to.lower(),
        subject=subject[:200],
        template=template,
        context=context or {},
        send_after=utcnow() + timedelta(seconds=delay_seconds),
    )
    db.add(item)
    email_worker.wake()
    return item


async def _deliver(to: str, subject: str, html_body: str, text_body: str) -> None:
    if settings.email_backend == "console":
        logger.info("\n==== EMAIL to=%s ====\nSubject: %s\n\n%s\n==== END EMAIL ====", to, subject, text_body)
        return

    message = EmailMessage()
    message["From"] = settings.email_from
    message["To"] = to
    message["Subject"] = subject
    if settings.email_reply_to:
        message["Reply-To"] = settings.email_reply_to
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")

    await aiosmtplib.send(
        message,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_username,
        password=settings.smtp_password.get_secret_value() if settings.smtp_password else None,
        use_tls=settings.smtp_use_tls,
        start_tls=settings.smtp_start_tls if not settings.smtp_use_tls else False,
        timeout=20,
    )


def _scrub(context: dict[str, Any]) -> dict[str, Any]:
    return {k: ("[redacted]" if k in SENSITIVE_KEYS else v) for k, v in context.items()}


async def process_outbox_batch(batch_size: int = 20) -> int:
    """Claim and send one batch. Safe to run on several instances (SKIP LOCKED)."""
    async with SessionLocal() as db:
        rows = (
            await db.execute(
                select(EmailOutbox)
                .where(EmailOutbox.status == EmailStatus.PENDING, EmailOutbox.send_after <= utcnow())
                .order_by(EmailOutbox.id)
                .limit(batch_size)
                .with_for_update(skip_locked=True)
            )
        ).scalars().all()
        if not rows:
            return 0
        for row in rows:
            row.status = EmailStatus.SENDING
            row.attempts += 1
        await db.commit()

        for row in rows:
            try:
                html_body, text_body = render(row.template, row.context)
                await _deliver(row.to_email, row.subject, html_body, text_body)
            except Exception as exc:  # noqa: BLE001 - we record and retry any delivery failure
                logger.warning("Email %s to %s failed (attempt %s): %s", row.id, row.to_email, row.attempts, exc)
                row.last_error = str(exc)[:500]
                if row.attempts >= settings.email_max_attempts:
                    row.status = EmailStatus.FAILED
                    row.context = _scrub(row.context)
                else:
                    row.status = EmailStatus.PENDING
                    row.send_after = utcnow() + timedelta(seconds=30 * 2 ** (row.attempts - 1))
            else:
                row.status = EmailStatus.SENT
                row.sent_at = utcnow()
                row.last_error = None
                row.context = _scrub(row.context)
        await db.commit()
        return len(rows)


async def recover_stuck_emails() -> None:
    """Emails left in 'sending' by a crashed worker go back to the queue."""
    async with SessionLocal() as db:
        await db.execute(
            update(EmailOutbox)
            .where(EmailOutbox.status == EmailStatus.SENDING)
            .values(status=EmailStatus.PENDING)
        )
        await db.commit()


class EmailWorker:
    def __init__(self) -> None:
        self._event = asyncio.Event()
        self._task: asyncio.Task | None = None
        self._stopping = False

    def wake(self) -> None:
        # Called inside request handlers before commit; the short delay in the loop
        # lets the transaction commit before we look for new rows.
        self._event.set()

    async def _run(self) -> None:
        await recover_stuck_emails()
        while not self._stopping:
            try:
                sent = await process_outbox_batch()
                if sent:
                    continue
            except Exception:  # noqa: BLE001
                logger.exception("Email worker iteration failed")
            try:
                await asyncio.wait_for(self._event.wait(), timeout=settings.email_worker_interval_seconds)
                await asyncio.sleep(0.3)
            except TimeoutError:
                pass
            self._event.clear()

    def start(self) -> None:
        if self._task is None:
            self._stopping = False
            self._task = asyncio.create_task(self._run(), name="email-worker")

    async def stop(self) -> None:
        self._stopping = True
        self._event.set()
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._task
            self._task = None


email_worker = EmailWorker()

"""What's new: launch subscriptions and admin-triggered notifications."""

import logging

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.errors import AppError, NotFound
from app.core.security import new_url_token, utcnow
from app.models import Launch, LaunchSubscription, User
from app.models.enums import LaunchStatus
from app.services.email import enqueue_email

logger = logging.getLogger("spuni.launches")


def _absolute(url: str | None) -> str | None:
    if url and url.startswith("/"):
        return settings.public_api_url.rstrip("/") + url
    return url


async def subscribe(db: AsyncSession, *, slug: str, email: str, user: User | None) -> bool:
    launch = (await db.execute(select(Launch).where(Launch.slug == slug))).scalar_one_or_none()
    if launch is None or launch.status not in (LaunchStatus.UPCOMING, LaunchStatus.LAUNCHED):
        raise NotFound("This launch is not available.")
    if launch.status == LaunchStatus.LAUNCHED:
        raise AppError("This has already launched. You can shop it now.", code="already_launched")
    token = new_url_token(24)
    result = await db.execute(
        insert(LaunchSubscription)
        .values(launch_id=launch.id, email=email.lower(), user_id=user.id if user else None,
                unsubscribe_token=token)
        .on_conflict_do_update(
            index_elements=["launch_id", "email"],
            set_={"unsubscribed_at": None},
            where=LaunchSubscription.unsubscribed_at.is_not(None),
        )
        .returning(LaunchSubscription.unsubscribe_token)
    )
    row = result.first()
    if row is None:
        await db.commit()
        return False  # already subscribed
    await enqueue_email(
        db, to=email, subject=f"You'll be first to know: {launch.title}", template="launch_subscribed",
        context={
            "title": launch.title,
            "launch_date": f"{launch.launch_at:%d %B %Y}" if launch.launch_at else None,
            "unsubscribe_url": f"{settings.storefront_url.rstrip('/')}/unsubscribe?token={row[0]}",
        },
    )
    await db.commit()
    return True


async def unsubscribe(db: AsyncSession, token: str) -> bool:
    sub = (
        await db.execute(select(LaunchSubscription).where(LaunchSubscription.unsubscribe_token == token))
    ).scalar_one_or_none()
    if sub is None:
        return False
    sub.unsubscribed_at = sub.unsubscribed_at or utcnow()
    await db.commit()
    return True


async def notify_subscribers(db: AsyncSession, launch_id: int, *, message: str | None, mark_launched: bool) -> int:
    """Queue a launch email to every subscriber not yet notified. Safe to call twice."""
    launch = (
        await db.execute(
            select(Launch).where(Launch.id == launch_id).options(selectinload(Launch.product),
                                                                  selectinload(Launch.category))
            .with_for_update(of=Launch)
        )
    ).scalar_one_or_none()
    if launch is None:
        raise NotFound("Launch not found.")
    if launch.status in (LaunchStatus.DRAFT, LaunchStatus.ARCHIVED):
        raise AppError("Publish the launch before notifying subscribers.", code="launch_not_published")
    if mark_launched:
        launch.status = LaunchStatus.LAUNCHED
        launch.launch_at = launch.launch_at if launch.launch_at and launch.launch_at <= utcnow() else utcnow()

    base = settings.storefront_url.rstrip("/")
    if launch.product and launch.product.is_active:
        url = f"{base}/product/{launch.product.slug}"
    elif launch.category:
        url = f"{base}/category/{launch.category.slug}"
    else:
        url = f"{base}/whats-new"

    subs = (
        await db.execute(
            select(LaunchSubscription)
            .where(LaunchSubscription.launch_id == launch.id, LaunchSubscription.notified_at.is_(None),
                   LaunchSubscription.unsubscribed_at.is_(None))
            .with_for_update(skip_locked=True)
        )
    ).scalars().all()
    now = utcnow()
    for sub in subs:
        await enqueue_email(
            db, to=sub.email, subject=f"Just launched: {launch.title}", template="launch_live",
            context={
                "title": launch.title,
                "message": message or launch.tagline or "The wait is over. It's live now at SPUNI.",
                "image_url": _absolute(launch.image_url),
                "url": url,
                "unsubscribe_url": f"{base}/unsubscribe?token={sub.unsubscribe_token}",
            },
        )
        sub.notified_at = now
    launch.notified_at = now
    launch.notify_count += len(subs)
    await db.commit()
    logger.info("Queued %s launch emails for launch %s", len(subs), launch.id)
    return len(subs)

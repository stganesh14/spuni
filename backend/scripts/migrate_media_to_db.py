"""Move referenced non-video /media files into media_assets and keep videos local."""

import asyncio
import hashlib
import mimetypes
from pathlib import Path

from sqlalchemy import select

from app.core.config import BASE_DIR
from app.db.session import SessionLocal
from app.models import Banner, Category, CustomizationFile, Launch, MediaAsset, OrderItem, ProductImage, StoreSettings


async def migrate() -> None:
    root = BASE_DIR / "media"
    async with SessionLocal() as db:
        cache: dict[str, int] = {}
        migrated_files: set[Path] = set()

        async def migrate_url(url: str | None) -> str | None:
            if not url or not url.startswith("/media/"):
                return url
            path = (root / url.removeprefix("/media/")).resolve()
            if root.resolve() not in path.parents or not path.is_file():
                return url
            content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            if content_type.startswith("video/"):
                return url
            if url in cache:
                migrated_files.add(path)
                return f"/api/v1/media/{cache[url]}"
            data = path.read_bytes()
            digest = hashlib.sha256(data).hexdigest()
            asset = (
                await db.execute(select(MediaAsset).where(MediaAsset.sha256 == digest))
            ).scalar_one_or_none()
            if asset is None:
                asset = MediaAsset(
                    data=data,
                    content_type=content_type,
                    original_name=path.name,
                    size_bytes=len(data),
                    sha256=digest,
                )
                db.add(asset)
                await db.flush()
            cache[url] = asset.id
            migrated_files.add(path)
            return f"/api/v1/media/{asset.id}"

        for model in (Banner, Category, Launch):
            rows = (await db.execute(select(model))).scalars().all()
            for row in rows:
                for field in ("image_url", "banner_url"):
                    if hasattr(row, field):
                        value = getattr(row, field)
                        migrated = await migrate_url(value)
                        if migrated != value:
                            setattr(row, field, migrated)

        images = (await db.execute(select(ProductImage))).scalars().all()
        for image in images:
            migrated = await migrate_url(image.url)
            if migrated != image.url:
                image.url = migrated

        order_items = (await db.execute(select(OrderItem))).scalars().all()
        for item in order_items:
            migrated = await migrate_url(item.image_url)
            if migrated != item.image_url:
                item.image_url = migrated

        customization_files = (await db.execute(select(CustomizationFile))).scalars().all()
        for file in customization_files:
            migrated = await migrate_url(file.url)
            if migrated != file.url:
                file.url = migrated

        settings_row = await db.scalar(select(StoreSettings).where(StoreSettings.id == 1))
        if settings_row and settings_row.home_media:
            settings_row.home_media = {
                key: await migrate_url(value)
                for key, value in settings_row.home_media.items()
            }

        for path in root.rglob("*"):
            if path.is_file():
                await migrate_url(f"/media/{path.relative_to(root).as_posix()}")

        await db.commit()
        for path in migrated_files:
            path.unlink(missing_ok=True)
        for directory in sorted((path for path in root.rglob("*") if path.is_dir()), reverse=True):
            try:
                directory.rmdir()
            except OSError:
                pass
        print(f"Migrated {len(cache)} non-video media files into database; video files remain local.")


if __name__ == "__main__":
    asyncio.run(migrate())

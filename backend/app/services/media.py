"""Validated database storage for images and customization PDFs.

Images are decoded with Pillow (rejecting anything that is not a real image),
EXIF/metadata is stripped, oversized images are downscaled and everything is
re-encoded to WebP before being stored in ``media_assets``. Client-supplied names
and content types are never trusted for storage.
"""

import hashlib
import io
import logging
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import AppError
from app.models import MediaAsset

logger = logging.getLogger("spuni.media")

Image.MAX_IMAGE_PIXELS = 40_000_000  # guard against decompression bombs

ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}
MAX_DIMENSION = 2400


@dataclass
class StoredFile:
    url: str
    content_type: str
    size_bytes: int
    original_name: str


async def _read_limited(upload: UploadFile, max_bytes: int) -> bytes:
    data = await upload.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise AppError(f"File is too large. Maximum size is {max_bytes // (1024 * 1024)} MB.", code="file_too_large")
    if not data:
        raise AppError("File is empty.", code="file_empty")
    return data


def _safe_original_name(name: str | None) -> str:
    base = Path(name or "upload").name
    cleaned = "".join(ch for ch in base if ch.isalnum() or ch in "._- ")[:180]
    return cleaned or "upload"


def _encode_image(data: bytes, original_name: str) -> tuple[bytes, str]:
    try:
        with Image.open(io.BytesIO(data)) as probe:
            probe.verify()
        image = Image.open(io.BytesIO(data))
        if image.format not in ALLOWED_IMAGE_FORMATS:
            raise AppError("Only JPEG, PNG or WebP images are allowed.", code="unsupported_image")
        image = ImageOps.exif_transpose(image)
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError):
        raise AppError("The file is not a valid image.", code="invalid_image") from None

    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
    image.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.Resampling.LANCZOS)

    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=84, method=5)
    return buffer.getvalue(), _safe_original_name(original_name)


async def save_image(upload: UploadFile, folder: str, db: AsyncSession) -> StoredFile:
    data = await _read_limited(upload, settings.max_upload_mb * 1024 * 1024)
    return await store_image_bytes(data, folder, upload.filename or "image", db)


async def store_image_bytes(data: bytes, folder: str, original_name: str, db: AsyncSession) -> StoredFile:
    if folder not in {"products", "categories", "launches", "banners", "blogs", "customizations", "homepage"}:
        raise ValueError("Unknown media folder")
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise AppError(f"File is too large. Maximum size is {settings.max_upload_mb} MB.", code="file_too_large")
    encoded, safe_name = _encode_image(data, original_name)
    return await _store_image_asset(encoded, safe_name, db)


async def _store_image_asset(data: bytes, original_name: str, db: AsyncSession) -> StoredFile:
    return await _store_asset(data, "image/webp", original_name, db)


async def _store_asset(data: bytes, content_type: str, original_name: str, db: AsyncSession) -> StoredFile:
    digest = hashlib.sha256(data).hexdigest()
    existing = await db.scalar(select(MediaAsset).where(MediaAsset.sha256 == digest).limit(1))
    if existing is not None:
        return StoredFile(
            url=f"/api/v1/media/{existing.id}",
            content_type=existing.content_type,
            size_bytes=existing.size_bytes,
            original_name=existing.original_name,
        )
    asset = MediaAsset(
        data=data,
        content_type=content_type,
        original_name=original_name,
        size_bytes=len(data),
        sha256=digest,
    )
    db.add(asset)
    await db.flush()
    return StoredFile(
        url=f"/api/v1/media/{asset.id}",
        content_type=asset.content_type,
        size_bytes=asset.size_bytes,
        original_name=asset.original_name,
    )


async def save_customer_file(upload: UploadFile, db: AsyncSession) -> StoredFile:
    """Images (re-encoded) or PDFs (magic-byte checked) for customization requests."""
    data = await _read_limited(upload, settings.max_upload_mb * 1024 * 1024)
    if data[:5] == b"%PDF-":
        if b"/JavaScript" in data or b"/JS" in data or b"/Launch" in data:
            raise AppError("This PDF contains active content and cannot be accepted.", code="unsafe_pdf")
        return await _store_asset(data, "application/pdf", _safe_original_name(upload.filename), db)
    return await store_image_bytes(data, "customizations", upload.filename or "image", db)


def delete_media(url: str | None) -> None:
    """Best-effort removal of a file we own (ignores external URLs)."""
    if not url or not url.startswith(settings.media_url + "/"):
        return
    relative = url[len(settings.media_url) + 1:]
    path = (settings.media_root / relative).resolve()
    if settings.media_root.resolve() not in path.parents:
        return
    try:
        path.unlink(missing_ok=True)
    except OSError:
        logger.warning("Could not delete media file %s", path)

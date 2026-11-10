"""Validated file storage for product images and customer uploads.

Images are decoded with Pillow (rejecting anything that is not a real image),
EXIF/metadata is stripped, oversized images are downscaled and everything is
re-encoded to WebP under a random name. Client-supplied names and content types
are never trusted for storage paths.
"""

import io
import logging
import uuid
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import settings
from app.core.errors import AppError

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


def _target(folder: str, extension: str) -> tuple[Path, str]:
    if folder not in {"products", "categories", "launches", "banners", "customizations"}:
        raise ValueError("Unknown media folder")
    directory = settings.media_root / folder
    directory.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.{extension}"
    return directory / name, f"{settings.media_url}/{folder}/{name}"


def store_image_bytes(data: bytes, folder: str, original_name: str = "image") -> StoredFile:
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

    path, url = _target(folder, "webp")
    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=84, method=5)
    path.write_bytes(buffer.getvalue())
    return StoredFile(url=url, content_type="image/webp", size_bytes=buffer.tell(),
                      original_name=_safe_original_name(original_name))


async def save_image(upload: UploadFile, folder: str) -> StoredFile:
    data = await _read_limited(upload, settings.max_upload_mb * 1024 * 1024)
    return store_image_bytes(data, folder, upload.filename or "image")


async def save_customer_file(upload: UploadFile) -> StoredFile:
    """Images (re-encoded) or PDFs (magic-byte checked) for customization requests."""
    data = await _read_limited(upload, settings.max_upload_mb * 1024 * 1024)
    if data[:5] == b"%PDF-":
        if b"/JavaScript" in data or b"/JS" in data or b"/Launch" in data:
            raise AppError("This PDF contains active content and cannot be accepted.", code="unsafe_pdf")
        path, url = _target("customizations", "pdf")
        path.write_bytes(data)
        return StoredFile(url=url, content_type="application/pdf", size_bytes=len(data),
                          original_name=_safe_original_name(upload.filename))
    stored = store_image_bytes(data, "customizations", upload.filename or "image")
    return stored


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

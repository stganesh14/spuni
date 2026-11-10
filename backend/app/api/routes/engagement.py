"""Customization requests and contact messages."""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import DB, Customer, OptionalCustomer
from app.core.config import settings
from app.core.errors import AppError, NotFound
from app.core.ratelimit import rate_limit
from app.core.security import utcnow
from app.models import ContactMessage, CustomizationFile, CustomizationRequest, Product
from app.models.enums import ContactPreference, CustomizationKind
from app.schemas.common import Message
from app.schemas.engagement import ContactIn, CustomizationFileOut, CustomizationOut
from app.services import media
from app.services.email import enqueue_email
from app.services.orders import _admin_alert, _random_code

router = APIRouter(tags=["engagement"])

KIND_LABEL = {
    CustomizationKind.CATALOG: "personalisation request",
    CustomizationKind.UPLOAD: "design and reference files",
    CustomizationKind.EXPERT: "consultation request",
}


def customization_out(row: CustomizationRequest) -> CustomizationOut:
    return CustomizationOut(
        reference=row.reference, kind=row.kind, product_id=row.product_id,
        product_name=row.product.name if row.product else None,
        product_slug=row.product.slug if row.product else None,
        details=row.details, personalization_text=row.personalization_text, budget_paise=row.budget_paise,
        preferred_contact=row.preferred_contact, phone=row.phone, preferred_time=row.preferred_time,
        status=row.status, quoted_price_paise=row.quoted_price_paise,
        customer_visible_note=row.customer_visible_note,
        files=[CustomizationFileOut.model_validate(f) for f in row.files],
        created_at=row.created_at, updated_at=row.updated_at,
    )


def _clean(value: str | None, max_length: int) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    if len(value) > max_length or any(ord(ch) < 32 and ch not in "\n\r\t" for ch in value):
        raise AppError("Some fields are invalid.", code="validation_error")
    return value


@router.post("/customizations", response_model=CustomizationOut, status_code=201,
             dependencies=[Depends(rate_limit("customization", 6, 3600))])
async def create_customization(
    db: DB,
    user: Customer,
    kind: Annotated[CustomizationKind, Form()],
    details: Annotated[str, Form(min_length=10, max_length=2000)],
    preferred_contact: Annotated[ContactPreference, Form()] = ContactPreference.EMAIL,
    product_id: Annotated[int | None, Form(gt=0)] = None,
    personalization_text: Annotated[str | None, Form(max_length=60)] = None,
    budget_paise: Annotated[int | None, Form(gt=0, le=100_000_000)] = None,
    phone: Annotated[str | None, Form(max_length=20)] = None,
    preferred_time: Annotated[str | None, Form(max_length=80)] = None,
    files: Annotated[list[UploadFile] | None, File()] = None,
) -> CustomizationOut:
    from app.schemas.common import _check_phone, _normalize_phone

    files = [f for f in (files or []) if f.filename]
    if len(files) > settings.max_customization_files:
        raise AppError(f"Attach up to {settings.max_customization_files} files.", code="too_many_files")
    if kind == CustomizationKind.UPLOAD and not files:
        raise AppError("Attach at least one image or PDF of your design.", code="files_required")
    try:
        normalized_phone = _check_phone(_normalize_phone(phone))  # type: ignore[arg-type]
    except ValueError as exc:
        raise AppError(str(exc), code="validation_error") from None
    if preferred_contact != ContactPreference.EMAIL and not normalized_phone:
        raise AppError("Add a phone number so our expert can reach you.", code="phone_required")

    product = None
    if product_id is not None:
        product = await db.get(Product, product_id)
        if product is None or not product.is_active:
            raise NotFound("Product not found.")
    if kind == CustomizationKind.CATALOG and product is None:
        raise AppError("Choose the product you want customised.", code="product_required")

    stored = [await media.save_customer_file(f) for f in files]
    row = CustomizationRequest(
        reference=f"CUS{utcnow():%y%m}-{_random_code(5)}",
        user_id=user.id, kind=kind, product_id=product.id if product else None,
        details=_clean(details, 2000) or "", personalization_text=_clean(personalization_text, 60),
        budget_paise=budget_paise, preferred_contact=preferred_contact, phone=normalized_phone,
        preferred_time=_clean(preferred_time, 80),
        files=[CustomizationFile(url=s.url, original_name=s.original_name, content_type=s.content_type,
                                 size_bytes=s.size_bytes) for s in stored],
    )
    if normalized_phone and not user.phone:
        user.phone = normalized_phone
    db.add(row)
    await db.flush()
    await enqueue_email(
        db, to=user.email, subject=f"We received your customization request · {row.reference}",
        template="customization_received",
        context={"reference": row.reference, "name": user.full_name, "kind_label": KIND_LABEL[kind],
                 "preferred_contact": preferred_contact.value, "phone": normalized_phone},
    )
    await _admin_alert(
        db, f"New customization request {row.reference}",
        [f"Type: {KIND_LABEL[kind]}", f"From: {user.full_name or ''} <{user.email}>",
         f"Contact via: {preferred_contact.value} {normalized_phone or ''}", details[:300]],
        f"/customizations/{row.reference}",
    )
    await db.commit()
    row = (
        await db.execute(select(CustomizationRequest).where(CustomizationRequest.id == row.id)
                         .options(selectinload(CustomizationRequest.files),
                                  selectinload(CustomizationRequest.product)))
    ).scalar_one()
    return customization_out(row)


@router.get("/customizations", response_model=list[CustomizationOut])
async def my_customizations(db: DB, user: Customer) -> list[CustomizationOut]:
    rows = (
        await db.execute(
            select(CustomizationRequest).where(CustomizationRequest.user_id == user.id)
            .options(selectinload(CustomizationRequest.files), selectinload(CustomizationRequest.product))
            .order_by(CustomizationRequest.created_at.desc()).limit(50)
        )
    ).scalars().all()
    return [customization_out(r) for r in rows]


@router.post("/contact", response_model=Message, dependencies=[Depends(rate_limit("contact", 5, 3600))])
async def contact(body: ContactIn, db: DB, user: OptionalCustomer) -> Message:
    if body.website:  # honeypot tripped: pretend success
        return Message(message="Thank you. We'll get back to you soon.")
    db.add(ContactMessage(name=body.name, email=body.email, phone=body.phone, subject=body.subject,
                          message=body.message, user_id=user.id if user else None))
    await _admin_alert(db, f"Contact form: {body.subject}",
                       [f"From: {body.name} <{body.email}> {body.phone or ''}", body.message[:500]], "/messages")
    await db.commit()
    return Message(message="Thank you. We'll get back to you within one working day.")

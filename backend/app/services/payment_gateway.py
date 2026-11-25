"""Razorpay Orders API, payment verification, webhooks, and refunds."""

import hashlib
import hmac
import logging
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings
from app.core.errors import AppError

logger = logging.getLogger("spuni.payments")

RAZORPAY_API = "https://api.razorpay.com/v1"


@dataclass
class GatewayOrder:
    provider: str
    provider_order_id: str
    amount_paise: int
    raw: dict[str, Any]


def sign(provider_order_id: str, provider_payment_id: str) -> str:
    message = f"{provider_order_id}|{provider_payment_id}".encode()
    return hmac.new(
        settings.razorpay_key_secret.get_secret_value().encode(), message, "sha256"
    ).hexdigest()


def verify_signature(provider_order_id: str, provider_payment_id: str, signature: str) -> bool:
    return hmac.compare_digest(sign(provider_order_id, provider_payment_id), signature)


def verify_webhook(body: bytes, signature: str | None) -> bool:
    secret = settings.razorpay_webhook_secret.get_secret_value()
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def _gateway_error(response: httpx.Response) -> tuple[str | None, str | None]:
    try:
        body = response.json()
    except ValueError:
        return None, None
    error = body.get("error") if isinstance(body, dict) else None
    if not isinstance(error, dict):
        return None, None
    code = error.get("code")
    description = error.get("description")
    return (str(code)[:64] if code else None, str(description)[:500] if description else None)


async def create_order(*, amount_paise: int, receipt: str, notes: dict[str, str]) -> GatewayOrder:
    payload = {"amount": amount_paise, "currency": "INR", "receipt": receipt, "notes": notes}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                f"{RAZORPAY_API}/orders",
                json=payload,
                auth=(settings.razorpay_key_id, settings.razorpay_key_secret.get_secret_value()),
            )
    except httpx.HTTPError as exc:
        logger.error("Razorpay order creation failed: %s", type(exc).__name__)
        raise AppError("Payment service is unavailable. Please try again.", code="gateway_unavailable",
                       status_code=503) from None
    if response.status_code >= 300:
        code, _ = _gateway_error(response)
        logger.error("Razorpay order creation rejected: status=%s code=%s", response.status_code, code)
        raise AppError("Payment could not be started. Please try again.", code="gateway_error", status_code=502)
    try:
        data = response.json()
        returned_amount = int(data.get("amount", -1))
    except (ValueError, TypeError, AttributeError):
        data, returned_amount = {}, -1
    if (
        not isinstance(data.get("id"), str)
        or not data["id"].startswith("order_")
        or returned_amount != amount_paise
        or data.get("currency") != "INR"
        or data.get("status") != "created"
    ):
        logger.error("Razorpay returned an invalid order response.")
        raise AppError("Payment amount mismatch.", code="gateway_amount_mismatch", status_code=502)
    return GatewayOrder("razorpay", data["id"], amount_paise, data)


async def fetch_payment(provider_payment_id: str) -> dict[str, Any]:
    """Fetch payment details server-to-server before accepting a payment."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                f"{RAZORPAY_API}/payments/{provider_payment_id}",
                auth=(settings.razorpay_key_id, settings.razorpay_key_secret.get_secret_value()),
            )
    except httpx.HTTPError as exc:
        logger.error("Razorpay payment fetch failed: %s", type(exc).__name__)
        raise AppError("Could not confirm the payment yet. If money was deducted it will be confirmed shortly.",
                       code="gateway_unavailable", status_code=503) from None
    if response.status_code >= 300:
        code, _ = _gateway_error(response)
        logger.error("Razorpay payment lookup rejected: status=%s code=%s", response.status_code, code)
        raise AppError("Payment could not be confirmed.", code="gateway_error", status_code=502)
    try:
        data = response.json()
    except ValueError:
        raise AppError("Payment details could not be confirmed.", code="gateway_invalid_response",
                       status_code=502) from None
    if not isinstance(data, dict) or data.get("id") != provider_payment_id:
        raise AppError("Payment details could not be confirmed.", code="gateway_invalid_response",
                       status_code=502)
    return data


async def fetch_order_payments(provider_order_id: str) -> list[dict[str, Any]]:
    """Fetch payment attempts for an order to recover a checkout interrupted before its callback."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                f"{RAZORPAY_API}/orders/{provider_order_id}/payments?count=100",
                auth=(settings.razorpay_key_id, settings.razorpay_key_secret.get_secret_value()),
            )
    except httpx.HTTPError as exc:
        logger.error("Razorpay order payment lookup failed: %s", type(exc).__name__)
        raise AppError("Could not check the payment status yet. Please try again.",
                       code="gateway_unavailable", status_code=503) from None
    if response.status_code >= 300:
        code, _ = _gateway_error(response)
        logger.error("Razorpay order payment lookup rejected: status=%s code=%s", response.status_code, code)
        raise AppError("Could not check the payment status yet. Please try again.",
                       code="gateway_error", status_code=502)
    try:
        data = response.json()
    except ValueError:
        raise AppError("Razorpay returned invalid payment details.", code="gateway_invalid_response",
                       status_code=502) from None
    if not isinstance(data, dict) or not isinstance(data.get("items"), list):
        raise AppError("Razorpay returned invalid payment details.", code="gateway_invalid_response",
                       status_code=502)
    if any(not isinstance(item, dict) for item in data["items"]):
        raise AppError("Razorpay returned invalid payment details.", code="gateway_invalid_response",
                       status_code=502)
    return data["items"]


async def refund(provider_payment_id: str, amount_paise: int, notes: dict[str, str]) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"{RAZORPAY_API}/payments/{provider_payment_id}/refund",
                json={"amount": amount_paise, "notes": notes},
                auth=(settings.razorpay_key_id, settings.razorpay_key_secret.get_secret_value()),
            )
    except httpx.HTTPError as exc:
        logger.error("Razorpay refund request failed: %s", type(exc).__name__)
        raise AppError("Refund could not be issued right now. Try again.", code="gateway_unavailable",
                       status_code=503) from None
    if response.status_code >= 300:
        code, description = _gateway_error(response)
        logger.error("Razorpay refund rejected: status=%s code=%s", response.status_code, code)
        if response.status_code >= 500:
            raise AppError(
                "Refund outcome could not be confirmed. Reconcile it in Razorpay.",
                code="gateway_unavailable",
                status_code=503,
            )
        raise AppError(
            "The payment gateway rejected the refund.",
            code="refund_rejected",
            status_code=502,
            details={"gateway_code": code, "gateway_description": description},
        )
    try:
        data = response.json()
        returned_amount = int(data.get("amount", -1))
    except (ValueError, TypeError, AttributeError):
        data, returned_amount = {}, -1
    if (
        not isinstance(data.get("id"), str)
        or not data["id"].startswith("rfnd_")
        or data.get("payment_id") != provider_payment_id
        or returned_amount != amount_paise
        or data.get("status") not in {"pending", "processed"}
    ):
        raise AppError("The payment gateway returned an invalid refund response.",
                       code="refund_invalid_response", status_code=502)
    return data

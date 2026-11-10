"""Payment gateway adapters.

``razorpay``: real Razorpay Orders API + signature verification.
``mock``: a local stand-in with the *same* contract (order id, payment id and an
HMAC signature checked by the same verification code), so switching to the real
gateway later is a configuration change: set PAYMENT_MODE=razorpay and the keys.
"""

import hashlib
import hmac
import logging
import secrets
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


def _mock_secret() -> bytes:
    return hashlib.sha256(b"mock-gateway|" + settings.secret_key.get_secret_value().encode()).digest()


def _secret() -> bytes:
    if settings.payment_mode == "mock":
        return _mock_secret()
    return settings.razorpay_key_secret.get_secret_value().encode()


def sign(provider_order_id: str, provider_payment_id: str) -> str:
    message = f"{provider_order_id}|{provider_payment_id}".encode()
    return hmac.new(_secret(), message, hashlib.sha256).hexdigest()


def verify_signature(provider_order_id: str, provider_payment_id: str, signature: str) -> bool:
    return hmac.compare_digest(sign(provider_order_id, provider_payment_id), signature)


def verify_webhook(body: bytes, signature: str | None) -> bool:
    secret = settings.razorpay_webhook_secret.get_secret_value()
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


async def create_order(*, amount_paise: int, receipt: str, notes: dict[str, str]) -> GatewayOrder:
    if settings.payment_mode == "mock":
        order_id = f"order_mock{secrets.token_hex(8)}"
        return GatewayOrder("mock", order_id, amount_paise, {"id": order_id, "amount": amount_paise})

    payload = {"amount": amount_paise, "currency": "INR", "receipt": receipt, "notes": notes,
               "payment_capture": 1}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                f"{RAZORPAY_API}/orders",
                json=payload,
                auth=(settings.razorpay_key_id, settings.razorpay_key_secret.get_secret_value()),
            )
    except httpx.HTTPError as exc:
        logger.error("Razorpay order creation failed: %s", exc)
        raise AppError("Payment service is unavailable. Please try again.", code="gateway_unavailable",
                       status_code=503) from None
    if response.status_code >= 300:
        logger.error("Razorpay order creation rejected: %s %s", response.status_code, response.text[:300])
        raise AppError("Payment could not be started. Please try again.", code="gateway_error", status_code=502)
    data = response.json()
    if int(data.get("amount", -1)) != amount_paise:
        raise AppError("Payment amount mismatch.", code="gateway_amount_mismatch", status_code=502)
    return GatewayOrder("razorpay", data["id"], amount_paise, data)


async def fetch_payment(provider_payment_id: str) -> dict[str, Any] | None:
    """Server-to-server confirmation of a payment (Razorpay only)."""
    if settings.payment_mode == "mock":
        return None
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                f"{RAZORPAY_API}/payments/{provider_payment_id}",
                auth=(settings.razorpay_key_id, settings.razorpay_key_secret.get_secret_value()),
            )
    except httpx.HTTPError as exc:
        logger.error("Razorpay payment fetch failed: %s", exc)
        raise AppError("Could not confirm the payment yet. If money was deducted it will be confirmed shortly.",
                       code="gateway_unavailable", status_code=503) from None
    if response.status_code >= 300:
        raise AppError("Payment could not be confirmed.", code="gateway_error", status_code=502)
    return response.json()


async def refund(provider_payment_id: str, amount_paise: int, notes: dict[str, str]) -> dict[str, Any]:
    if settings.payment_mode == "mock":
        return {"id": f"rfnd_mock{secrets.token_hex(6)}", "amount": amount_paise, "status": "processed"}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"{RAZORPAY_API}/payments/{provider_payment_id}/refund",
                json={"amount": amount_paise, "notes": notes},
                auth=(settings.razorpay_key_id, settings.razorpay_key_secret.get_secret_value()),
            )
    except httpx.HTTPError as exc:
        logger.error("Razorpay refund failed: %s", exc)
        raise AppError("Refund could not be issued right now. Try again.", code="gateway_unavailable",
                       status_code=503) from None
    if response.status_code >= 300:
        logger.error("Razorpay refund rejected: %s %s", response.status_code, response.text[:300])
        raise AppError("The payment gateway rejected the refund.", code="refund_rejected", status_code=502)
    return response.json()


def mock_capture(provider_order_id: str) -> tuple[str, str]:
    """Simulates the Razorpay checkout popup completing successfully."""
    if settings.payment_mode != "mock":
        raise AppError("Mock payments are disabled.", code="mock_disabled", status_code=403)
    payment_id = f"pay_mock{secrets.token_hex(8)}"
    return payment_id, sign(provider_order_id, payment_id)

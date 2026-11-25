import os

os.environ["ENVIRONMENT"] = "test"
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://spuni:spuni@localhost:5432/spuni_test")
os.environ["EMAIL_BACKEND"] = "console"
os.environ["RAZORPAY_KEY_ID"] = "rzp_test_spuni"
os.environ["RAZORPAY_KEY_SECRET"] = "test-key-secret"
os.environ["RAZORPAY_WEBHOOK_SECRET"] = "test-webhook-secret"

import subprocess  # noqa: E402
import sys  # noqa: E402
from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import select, text  # noqa: E402

from app.db.session import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Category, EmailOutbox, Product, User, Wallet  # noqa: E402
from app.models.enums import UserRole  # noqa: E402
from app.services import payment_gateway  # noqa: E402
from app.services.payment_gateway import GatewayOrder  # noqa: E402

BACKEND = Path(__file__).resolve().parent.parent


class FakeRazorpay:
    def __init__(self) -> None:
        self.next_id = 1
        self.orders: dict[str, dict] = {}
        self.payments: dict[str, dict] = {}

    def reset(self) -> None:
        self.next_id = 1
        self.orders.clear()
        self.payments.clear()

    async def create_order(self, *, amount_paise: int, receipt: str, notes: dict[str, str]) -> GatewayOrder:
        provider_order_id = f"order_test_{self.next_id}"
        self.next_id += 1
        raw = {"id": provider_order_id, "amount": amount_paise, "currency": "INR", "status": "created"}
        self.orders[provider_order_id] = raw
        return GatewayOrder("razorpay", provider_order_id, amount_paise, raw)

    def capture(self, provider_order_id: str) -> str:
        payment_id = f"pay_test_{self.next_id}"
        self.next_id += 1
        order = self.orders[provider_order_id]
        self.payments[payment_id] = {
            "id": payment_id, "order_id": provider_order_id, "amount": order["amount"], "currency": "INR",
            "status": "captured", "method": "card",
        }
        return payment_id

    def fail_payment(self, provider_order_id: str) -> str:
        payment_id = f"pay_test_{self.next_id}"
        self.next_id += 1
        order = self.orders[provider_order_id]
        self.payments[payment_id] = {
            "id": payment_id, "order_id": provider_order_id, "amount": order["amount"], "currency": "INR",
            "status": "failed", "error_code": "PAYMENT_FAILED", "error_description": "Bank declined the payment",
        }
        return payment_id

    async def fetch_payment(self, provider_payment_id: str) -> dict:
        return self.payments[provider_payment_id]

    async def fetch_order_payments(self, provider_order_id: str) -> list[dict]:
        return [payment for payment in self.payments.values() if payment["order_id"] == provider_order_id]

    async def refund(self, provider_payment_id: str, amount_paise: int, notes: dict[str, str]) -> dict:
        refund_id = f"rfnd_test_{self.next_id}"
        self.next_id += 1
        return {
            "id": refund_id, "payment_id": provider_payment_id, "amount": amount_paise, "status": "processed",
        }


fake_razorpay = FakeRazorpay()


@pytest.fixture(autouse=True)
def fake_razorpay_gateway(monkeypatch):
    fake_razorpay.reset()
    monkeypatch.setattr(payment_gateway, "create_order", fake_razorpay.create_order)
    monkeypatch.setattr(payment_gateway, "fetch_payment", fake_razorpay.fetch_payment)
    monkeypatch.setattr(payment_gateway, "fetch_order_payments", fake_razorpay.fetch_order_payments)
    monkeypatch.setattr(payment_gateway, "refund", fake_razorpay.refund)


@pytest.fixture(scope="session", autouse=True)
async def database():
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=BACKEND, check=True,
                   env={**os.environ}, capture_output=True)
    yield
    await engine.dispose()


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
async def db():
    async with SessionLocal() as session:
        yield session


async def latest_code(email: str) -> str:
    async with SessionLocal() as session:
        row = (await session.execute(
            select(EmailOutbox).where(EmailOutbox.to_email == email, EmailOutbox.template == "otp")
            .order_by(EmailOutbox.id.desc()).limit(1))).scalar_one()
        return row.context["code"]


async def login(client: AsyncClient, email: str, admin: bool = False) -> str:
    base = "/api/v1/admin/auth" if admin else "/api/v1/auth"
    async with SessionLocal() as session:
        await session.execute(text("DELETE FROM otp_codes WHERE email = :e"), {"e": email})
        await session.commit()
    r = await client.post(f"{base}/otp/request", json={"email": email})
    assert r.status_code == 200, r.text
    code = await latest_code(email)
    r = await client.post(f"{base}/otp/verify", json={"email": email, "code": code})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
async def catalog():
    async with SessionLocal() as session:
        cat = Category(name="Wallets", slug="wallets", sort_order=0)
        session.add(cat)
        await session.flush()
        p1 = Product(category_id=cat.id, name="Classic Wallet", slug="classic-wallet", sku="SPN-WL-001",
                     price_paise=399900, stock=5, is_bestseller=True)
        p2 = Product(category_id=cat.id, name="Belt", slug="belt", sku="SPN-BT-001", price_paise=249900, stock=2)
        session.add_all([p1, p2])
        admin = User(email="admin@spuni.in", role=UserRole.ADMIN, full_name="Admin")
        session.add(admin)
        await session.flush()
        session.add(Wallet(user_id=admin.id))
        await session.commit()
        return {"wallet": p1.id, "belt": p2.id}

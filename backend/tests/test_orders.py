import uuid

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.db.session import SessionLocal
from app.models import Product
from tests.conftest import login

ADDRESS = {"full_name": "Ravi Kumar", "phone": "9876543210", "line1": "12 Anna Salai", "city": "Chennai",
           "state": "Tamil Nadu", "postal_code": "600002"}


def auth(token):
    return {"Authorization": f"Bearer {token}"}


async def stock(product_id):
    async with SessionLocal() as s:
        return await s.scalar(select(Product.stock).where(Product.id == product_id))


async def pay(client, token, init):
    r = await client.post("/api/v1/payments/mock/complete", headers=auth(token),
                          json={"order_number": init["order_number"], "provider_order_id": init["provider_order_id"]})
    assert r.status_code == 200, r.text
    gw = r.json()
    r = await client.post("/api/v1/payments/verify", headers=auth(token), json={
        "order_number": init["order_number"], "provider_order_id": gw["provider_order_id"],
        "provider_payment_id": gw["provider_payment_id"], "signature": gw["signature"]})
    return r


async def test_quote_is_server_priced(client, catalog):
    r = await client.post("/api/v1/cart/quote", json={"items": [{"product_id": catalog["wallet"], "quantity": 2}]})
    assert r.status_code == 200
    q = r.json()
    assert q["subtotal_paise"] == 799800
    assert q["shipping_paise"] == 0  # above free shipping threshold
    r = await client.post("/api/v1/cart/quote", json={"items": [{"product_id": catalog["belt"], "quantity": 5}]})
    assert r.json()["has_issues"] is True


async def test_checkout_requires_login(client, catalog):
    r = await client.post("/api/v1/checkout", json={
        "items": [{"product_id": catalog["wallet"], "quantity": 1}], "address": ADDRESS,
        "idempotency_key": uuid.uuid4().hex})
    assert r.status_code == 401


async def test_full_purchase_with_wallet_and_cancel(client, catalog):
    token = await login(client, "buyer@example.com")
    before = await stock(catalog["wallet"])
    key = uuid.uuid4().hex
    body = {"items": [{"product_id": catalog["wallet"], "quantity": 1}], "address": ADDRESS, "idempotency_key": key}
    r = await client.post("/api/v1/checkout", headers=auth(token), json=body)
    assert r.status_code == 200, r.text
    init = r.json()
    assert init["amount_paise"] == 399900 + 0  # free shipping above 3000
    assert await stock(catalog["wallet"]) == before - 1

    # idempotent replay returns same order, no extra stock taken
    r = await client.post("/api/v1/checkout", headers=auth(token), json=body)
    assert r.json()["order_number"] == init["order_number"]
    assert await stock(catalog["wallet"]) == before - 1

    # forged signature is rejected
    r = await client.post("/api/v1/payments/verify", headers=auth(token), json={
        "order_number": init["order_number"], "provider_order_id": init["provider_order_id"],
        "provider_payment_id": "pay_forged123", "signature": "a" * 64})
    assert r.status_code == 400

    r = await pay(client, token, init)
    assert r.status_code == 200, r.text
    order = r.json()
    assert order["status"] == "confirmed" and order["payment_status"] == "paid"
    assert order["wallet_earned_paise"] == 19900  # 5% of 3999 rounded down to whole rupees

    w = (await client.get("/api/v1/account/wallet", headers=auth(token))).json()
    assert w["balance_paise"] == 19900

    # second order uses wallet (max 20% of subtotal)
    r = await client.post("/api/v1/checkout", headers=auth(token), json={
        "items": [{"product_id": catalog["belt"], "quantity": 1}], "address": ADDRESS, "use_wallet": True,
        "idempotency_key": uuid.uuid4().hex})
    init2 = r.json()
    assert init2["amount_paise"] == 249900 + 15000 - 19900
    r = await pay(client, token, init2)
    assert r.json()["wallet_redeemed_paise"] == 19900
    w = (await client.get("/api/v1/account/wallet", headers=auth(token))).json()
    reward2 = (249900 - 19900) * 5 // 100
    reward2 -= reward2 % 100
    assert w["balance_paise"] == reward2

    # cancel returns stock, redeemed points, and reverses reward
    belt_before = await stock(catalog["belt"])
    r = await client.post(f"/api/v1/orders/{init2['order_number']}/cancel", headers=auth(token), json={})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "cancelled"
    assert await stock(catalog["belt"]) == belt_before + 1
    w = (await client.get("/api/v1/account/wallet", headers=auth(token))).json()
    assert w["balance_paise"] == 19900

    async with SessionLocal() as s:
        emails = (await s.execute(text("SELECT template FROM email_outbox WHERE to_email='buyer@example.com'"))).scalars().all()
    assert "order_confirmed" in emails and "order_status" in emails


async def test_cannot_oversell(client, catalog):
    token = await login(client, "greedy@example.com")
    r = await client.post("/api/v1/checkout", headers=auth(token), json={
        "items": [{"product_id": catalog["belt"], "quantity": 9}], "address": ADDRESS,
        "idempotency_key": uuid.uuid4().hex})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "cart_changed"


async def test_admin_fulfilment_flow(client, catalog):
    token = await login(client, "ship@example.com")
    r = await client.post("/api/v1/checkout", headers=auth(token), json={
        "items": [{"product_id": catalog["wallet"], "quantity": 1}], "address": ADDRESS,
        "gift": {"recipient_name": "Meena", "recipient_email": "meena@example.com", "message": "Happy birthday!"},
        "idempotency_key": uuid.uuid4().hex})
    init = r.json()
    assert init["amount_paise"] == 399900 + 9900  # gift wrap
    await pay(client, token, init)
    admin = await login(client, "admin@spuni.in", admin=True)
    number = init["order_number"]
    r = await client.post(f"/api/v1/admin/orders/{number}/status", headers=auth(admin), json={"status": "shipped"})
    assert r.status_code == 400  # tracking required
    r = await client.post(f"/api/v1/admin/orders/{number}/status", headers=auth(admin), json={
        "status": "shipped", "courier": "Blue Dart", "tracking_number": "BD12345"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "shipped"
    r = await client.post(f"/api/v1/admin/orders/{number}/status", headers=auth(admin), json={"status": "processing"})
    assert r.status_code == 409
    async with SessionLocal() as s:
        gift = await s.scalar(text("SELECT count(*) FROM email_outbox WHERE to_email='meena@example.com'"))
    assert gift == 1
    r = await client.get("/api/v1/admin/dashboard", headers=auth(admin))
    assert r.status_code == 200
    assert r.json()["orders_30d"] >= 1


async def test_gift_card_purchase_and_redeem(client, catalog):
    token = await login(client, "giver@example.com")
    r = await client.post("/api/v1/account/gift-cards", headers=auth(token), json={
        "amount_paise": 200000, "recipient_name": "Priya", "recipient_email": "priya@example.com",
        "sender_name": "Arjun", "message": "For you", "idempotency_key": uuid.uuid4().hex})
    assert r.status_code == 200, r.text
    r = await pay(client, token, r.json())
    assert r.json()["status"] == "delivered"
    async with SessionLocal() as s:
        ctx = (await s.execute(text("SELECT context FROM email_outbox WHERE to_email='priya@example.com' "
                                    "AND template='gift_card_received'"))).scalar_one()
    code = ctx["gift_code"]
    receiver = await login(client, "priya@example.com")
    r = await client.post("/api/v1/account/wallet/redeem", headers=auth(receiver), json={"code": code.lower()})
    assert r.status_code == 200, r.text
    r = await client.post("/api/v1/account/wallet/redeem", headers=auth(receiver), json={"code": code})
    assert r.status_code == 400
    w = (await client.get("/api/v1/account/wallet", headers=auth(receiver))).json()
    assert w["balance_paise"] == 200000


async def test_launch_notify(client, catalog):
    admin = await login(client, "admin@spuni.in", admin=True)
    r = await client.post("/api/v1/admin/launches", headers=auth(admin), json={
        "title": "Heritage Satchel", "slug": "heritage-satchel", "status": "upcoming"})
    assert r.status_code == 201, r.text
    launch_id = r.json()["id"]
    r = await client.post("/api/v1/launches/heritage-satchel/notify", json={"email": "fan@example.com"})
    assert r.status_code == 200
    r = await client.post("/api/v1/launches/heritage-satchel/notify", json={"email": "FAN@example.com"})
    assert "already" in r.json()["message"]
    r = await client.post(f"/api/v1/admin/launches/{launch_id}/notify", headers=auth(admin), json={})
    assert r.json()["queued"] == 1
    r = await client.post(f"/api/v1/admin/launches/{launch_id}/notify", headers=auth(admin), json={})
    assert r.json()["queued"] == 0
    r = await client.get("/api/v1/launches")
    assert r.json()[0]["status"] == "launched"


async def test_customization_upload(client, catalog):
    import io

    from PIL import Image

    token = await login(client, "maker@example.com")
    buf = io.BytesIO()
    Image.new("RGB", (40, 40), "brown").save(buf, format="PNG")
    r = await client.post("/api/v1/customizations", headers=auth(token), data={
        "kind": "upload", "details": "Please make a tote with this pattern", "preferred_contact": "email"},
        files={"files": ("design.png", buf.getvalue(), "image/png")})
    assert r.status_code == 201, r.text
    assert r.json()["files"][0]["content_type"] == "image/webp"
    r = await client.post("/api/v1/customizations", headers=auth(token), data={
        "kind": "upload", "details": "Pretend image", "preferred_contact": "email"},
        files={"files": ("evil.png", b"<script>alert(1)</script>", "image/png")})
    assert r.status_code == 400


async def test_database_constraints_backstop(catalog):
    async with SessionLocal() as s:
        product = await s.get(Product, catalog["belt"])
        product.stock = -1
        try:
            await s.commit()
            raise AssertionError("negative stock accepted")
        except IntegrityError:
            await s.rollback()
        try:
            await s.execute(text("INSERT INTO users (email, role) VALUES ('BAD@EXAMPLE.COM', 'customer')"))
            await s.commit()
            raise AssertionError("uppercase email accepted")
        except IntegrityError:
            await s.rollback()

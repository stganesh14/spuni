from sqlalchemy import text

from app.db.session import SessionLocal
from tests.conftest import latest_code, login


async def test_otp_login_flow(client):
    email = "new.customer@example.com"
    r = await client.post("/api/v1/auth/otp/request", json={"email": "New.Customer@Example.com"})
    assert r.status_code == 200
    assert r.json()["resend_after_seconds"] == 60

    # cooldown applies to resend ("forgot OTP")
    r = await client.post("/api/v1/auth/otp/resend", json={"email": email})
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "otp_cooldown"

    r = await client.post("/api/v1/auth/otp/verify", json={"email": email, "code": "000000"})
    assert r.status_code == 401
    assert r.json()["error"]["details"]["attempts_left"] == 4

    code = await latest_code(email)
    r = await client.post("/api/v1/auth/otp/verify", json={"email": email, "code": code, "full_name": "Asha Rao"})
    assert r.status_code == 200
    body = r.json()
    assert body["is_new_user"] is True
    assert body["user"]["full_name"] == "Asha Rao"
    assert "spuni_rt" in r.cookies

    # code is single-use
    r = await client.post("/api/v1/auth/otp/verify", json={"email": email, "code": code})
    assert r.status_code == 401

    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.json()["email"] == email


async def test_resend_invalidates_previous_code(client):
    email = "resend@example.com"
    await client.post("/api/v1/auth/otp/request", json={"email": email})
    first = await latest_code(email)
    async with SessionLocal() as s:  # skip the cooldown
        await s.execute(text("UPDATE otp_codes SET created_at = now() - interval '2 minutes' WHERE email=:e"),
                        {"e": email})
        await s.commit()
    r = await client.post("/api/v1/auth/otp/resend", json={"email": email})
    assert r.status_code == 200
    second = await latest_code(email)
    if first != second:
        r = await client.post("/api/v1/auth/otp/verify", json={"email": email, "code": first})
        assert r.status_code == 401
    r = await client.post("/api/v1/auth/otp/verify", json={"email": email, "code": second})
    assert r.status_code == 200


async def test_lockout_after_max_attempts(client):
    email = "brute@example.com"
    await client.post("/api/v1/auth/otp/request", json={"email": email})
    code = await latest_code(email)
    wrong = "111111" if code != "111111" else "222222"
    for _ in range(5):
        await client.post("/api/v1/auth/otp/verify", json={"email": email, "code": wrong})
    r = await client.post("/api/v1/auth/otp/verify", json={"email": email, "code": code})
    assert r.status_code == 401


async def test_refresh_rotation_and_reuse_detection(client):
    await login(client, "rotate@example.com")
    old = client.cookies.get("spuni_rt")
    r = await client.post("/api/v1/auth/refresh")
    assert r.status_code == 403  # missing anti-CSRF header
    r = await client.post("/api/v1/auth/refresh", headers={"X-Requested-With": "spuni"})
    assert r.status_code == 200
    new = client.cookies.get("spuni_rt")
    assert new != old
    # replaying the old token revokes the family
    client.cookies.set("spuni_rt", old, path="/api/v1/auth")
    r = await client.post("/api/v1/auth/refresh", headers={"X-Requested-With": "spuni"})
    assert r.status_code == 401
    client.cookies.clear()
    client.cookies.set("spuni_rt", new, path="/api/v1/auth")
    r = await client.post("/api/v1/auth/refresh", headers={"X-Requested-With": "spuni"})
    assert r.status_code == 401


async def test_admin_login_only_for_admins(client, catalog):
    email = "plain@example.com"
    await login(client, email)
    async with SessionLocal() as s:
        await s.execute(text("DELETE FROM otp_codes WHERE email=:e"), {"e": email})
        await s.commit()
    r = await client.post("/api/v1/admin/auth/otp/request", json={"email": email})
    assert r.status_code == 200  # no enumeration
    async with SessionLocal() as s:
        count = await s.scalar(text("SELECT count(*) FROM email_outbox WHERE to_email=:e AND subject LIKE '%admin%'"),
                               {"e": email})
    assert count == 0

    token = await login(client, "admin@spuni.in", admin=True)
    r = await client.get("/api/v1/admin/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    # a customer token cannot reach admin endpoints
    customer = await login(client, "plain2@example.com")
    r = await client.get("/api/v1/admin/me", headers={"Authorization": f"Bearer {customer}"})
    assert r.status_code == 401


async def test_validation_errors_are_structured(client):
    r = await client.post("/api/v1/auth/otp/request", json={"email": "not-an-email", "extra": 1})
    assert r.status_code == 422
    fields = {d["field"] for d in r.json()["error"]["details"]}
    assert {"email", "extra"} <= fields

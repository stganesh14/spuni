from app.models import User
from app.models.enums import UserRole
from tests.conftest import login


async def test_admin_can_grant_access_to_existing_customer(client, db, catalog):
    customer = User(email="promote@example.com", role=UserRole.CUSTOMER)
    db.add(customer)
    await db.commit()
    token = await login(client, "admin@spuni.in", admin=True)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.post(
        "/api/v1/admin/admin-users",
        headers=headers,
        json={"email": "PROMOTE@example.com"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["email"] == "promote@example.com"
    assert response.json()["role"] == "admin"


async def test_admin_grant_requires_an_existing_account(client, catalog):
    token = await login(client, "admin@spuni.in", admin=True)
    response = await client.post(
        "/api/v1/admin/admin-users",
        headers={"Authorization": f"Bearer {token}"},
        json={"email": "not-registered@example.com"},
    )

    assert response.status_code == 404
    assert "must register" in response.json()["error"]["message"]


async def test_protected_admin_cannot_be_deleted(client, db, catalog):
    protected = User(email="stganesh1999@gmail.com", role=UserRole.ADMIN)
    db.add(protected)
    await db.commit()
    token = await login(client, "admin@spuni.in", admin=True)

    response = await client.delete(
        f"/api/v1/admin/admin-users/{protected.id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "protected_admin"
    assert await db.get(User, protected.id) is not None


async def test_admin_can_permanently_delete_unreferenced_admin(client, db, catalog):
    target = User(email="remove-admin@example.com", role=UserRole.ADMIN)
    db.add(target)
    await db.commit()
    target_id = target.id
    token = await login(client, "admin@spuni.in", admin=True)

    response = await client.delete(
        f"/api/v1/admin/admin-users/{target_id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 204
    assert await db.get(User, target_id) is None

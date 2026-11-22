from io import BytesIO
from uuid import uuid4

from conftest import login
from httpx import AsyncClient
from PIL import Image


async def test_blog_posts_are_hidden_until_published_and_html_is_sanitized(
    client: AsyncClient, catalog: dict[str, int]
) -> None:
    token = await login(client, "admin@spuni.in", admin=True)
    headers = {"Authorization": f"Bearer {token}"}
    slug = f"editorial-{uuid4().hex[:10]}"
    body = {
        "title": "A story from the atelier",
        "slug": slug,
        "excerpt": "A short introduction.",
        "content": "<p>Care in every detail.</p>",
        "image_url": None,
        "status": "draft",
    }

    created = await client.post("/api/v1/admin/blogs", json=body, headers=headers)
    assert created.status_code == 201, created.text
    post_id = created.json()["id"]

    public_list = await client.get("/api/v1/blogs")
    assert public_list.status_code == 200
    assert all(post["slug"] != slug for post in public_list.json()["items"])
    hidden_detail = await client.get(f"/api/v1/blogs/{slug}")
    assert hidden_detail.status_code == 404

    published_body = {
        **body,
        "status": "published",
        "content": '<p>Handmade story.</p><script>alert("no")</script><a href="javascript:alert(1)">unsafe</a>',
    }
    updated = await client.put(f"/api/v1/admin/blogs/{post_id}", json=published_body, headers=headers)
    assert updated.status_code == 200, updated.text
    assert updated.json()["published_at"] is not None
    assert "<script" not in updated.json()["content"]
    assert "javascript:" not in updated.json()["content"]

    public_detail = await client.get(f"/api/v1/blogs/{slug}")
    assert public_detail.status_code == 200
    assert public_detail.json()["title"] == body["title"]
    assert "Handmade story." in public_detail.json()["content"]

    deleted = await client.delete(f"/api/v1/admin/blogs/{post_id}", headers=headers)
    assert deleted.status_code == 204


async def test_admin_can_upload_blog_cover(client: AsyncClient, catalog: dict[str, int]) -> None:
    token = await login(client, "admin@spuni.in", admin=True)
    image = BytesIO()
    Image.new("RGB", (20, 20), color=(100, 80, 60)).save(image, format="PNG")

    response = await client.post(
        "/api/v1/admin/media/blogs",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("cover.png", image.getvalue(), "image/png")},
    )

    assert response.status_code == 201, response.text
    assert response.json()["url"].startswith("/api/v1/media/")

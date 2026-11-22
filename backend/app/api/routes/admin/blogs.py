"""Admin blog post management."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import DB, current_admin
from app.core.errors import Conflict, NotFound
from app.models import BlogPost
from app.schemas.blog import BlogPostAdminOut, BlogPostIn
from app.services.blogs import sanitize_content

router = APIRouter(prefix="/admin", tags=["admin-blog"], dependencies=[Depends(current_admin)])


async def _check_slug(db: DB, slug: str, exclude_id: int | None = None) -> None:
    query = select(BlogPost.id).where(BlogPost.slug == slug)
    if exclude_id is not None:
        query = query.where(BlogPost.id != exclude_id)
    if await db.scalar(query):
        raise Conflict("A blog post with this slug already exists.", code="duplicate_blog_slug")


def _published_at(status: str, previous: BlogPost | None = None) -> datetime | None:
    if status != "published":
        return None
    if previous is not None and previous.status == "published":
        return previous.published_at
    return datetime.now(UTC)


@router.get("/blogs", response_model=list[BlogPostAdminOut])
async def list_blog_posts(
    db: DB,
    status: Annotated[str | None, Query(pattern="^(draft|published)$")] = None,
) -> list[BlogPostAdminOut]:
    query = select(BlogPost)
    if status:
        query = query.where(BlogPost.status == status)
    rows = (
        await db.execute(query.order_by(BlogPost.updated_at.desc(), BlogPost.id.desc()))
    ).scalars().all()
    return [BlogPostAdminOut.model_validate(row) for row in rows]


@router.get("/blogs/{post_id}", response_model=BlogPostAdminOut)
async def get_blog_post(post_id: int, db: DB) -> BlogPostAdminOut:
    row = await db.get(BlogPost, post_id)
    if row is None:
        raise NotFound("Blog post not found.")
    return BlogPostAdminOut.model_validate(row)


@router.post("/blogs", response_model=BlogPostAdminOut, status_code=201)
async def create_blog_post(body: BlogPostIn, db: DB) -> BlogPostAdminOut:
    await _check_slug(db, body.slug)
    post = BlogPost(
        **body.model_dump(exclude={"content"}),
        content=sanitize_content(body.content),
        published_at=_published_at(body.status),
    )
    db.add(post)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise Conflict("A blog post with this slug already exists.", code="duplicate_blog_slug") from None
    await db.refresh(post)
    return BlogPostAdminOut.model_validate(post)


@router.put("/blogs/{post_id}", response_model=BlogPostAdminOut)
async def update_blog_post(post_id: int, body: BlogPostIn, db: DB) -> BlogPostAdminOut:
    post = await db.get(BlogPost, post_id)
    if post is None:
        raise NotFound("Blog post not found.")
    await _check_slug(db, body.slug, exclude_id=post.id)
    for field, value in body.model_dump(exclude={"content", "status"}).items():
        setattr(post, field, value)
    post.content = sanitize_content(body.content)
    post.published_at = _published_at(body.status, post)
    post.status = body.status
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise Conflict("A blog post with this slug already exists.", code="duplicate_blog_slug") from None
    await db.refresh(post)
    return BlogPostAdminOut.model_validate(post)


@router.delete("/blogs/{post_id}", status_code=204)
async def delete_blog_post(post_id: int, db: DB) -> Response:
    post = await db.get(BlogPost, post_id)
    if post is None:
        raise NotFound("Blog post not found.")
    await db.delete(post)
    await db.commit()
    return Response(status_code=204)

"""Public blog endpoints."""

from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.api.deps import DB
from app.core.errors import NotFound
from app.models import BlogPost
from app.schemas.blog import BlogPostCard, BlogPostPublicOut
from app.schemas.common import Page, paginate_meta

router = APIRouter(tags=["blog"])


@router.get("/blogs", response_model=Page[BlogPostCard])
async def list_blogs(
    db: DB,
    page: Annotated[int, Query(ge=1, le=1000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=60)] = 12,
) -> Page[BlogPostCard]:
    published = BlogPost.status == "published"
    total = await db.scalar(select(func.count(BlogPost.id)).where(published)) or 0
    rows = (
        await db.execute(
            select(BlogPost)
            .where(published, BlogPost.published_at.is_not(None))
            .order_by(BlogPost.published_at.desc(), BlogPost.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()
    return Page[BlogPostCard](
        items=[BlogPostCard.model_validate(row) for row in rows],
        **paginate_meta(total, page, page_size),
    )


@router.get("/blogs/{slug}", response_model=BlogPostPublicOut)
async def get_blog(slug: str, db: DB) -> BlogPostPublicOut:
    row = await db.scalar(
        select(BlogPost).where(
            BlogPost.slug == slug,
            BlogPost.status == "published",
            BlogPost.published_at.is_not(None),
        )
    )
    if row is None:
        raise NotFound("This blog post is not available.")
    return BlogPostPublicOut.model_validate(row)

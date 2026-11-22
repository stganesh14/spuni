from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.common import InputModel, OutputModel, Slug

BlogStatus = Literal["draft", "published"]


class BlogPostIn(InputModel):
    title: str = Field(min_length=2, max_length=160)
    slug: Slug
    excerpt: str | None = Field(default=None, max_length=320)
    content: str = Field(min_length=1, max_length=50_000)
    image_url: str | None = Field(default=None, max_length=500)
    status: BlogStatus = "draft"


class BlogPostAdminOut(OutputModel):
    id: int
    title: str
    slug: str
    excerpt: str | None
    content: str
    image_url: str | None
    status: BlogStatus
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime


class BlogPostCard(OutputModel):
    title: str
    slug: str
    excerpt: str | None
    image_url: str | None
    published_at: datetime


class BlogPostPublicOut(BlogPostCard):
    content: str

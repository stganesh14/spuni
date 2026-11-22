import re
from html import unescape

import nh3

from app.core.errors import AppError

_ALLOWED_TAGS = {
    "a", "b", "blockquote", "br", "code", "div", "em", "h2", "h3",
    "i", "li", "ol", "p", "pre", "s", "strong", "u", "ul",
}


def sanitize_content(content: str) -> str:
    cleaned = nh3.clean(
        content,
        tags=_ALLOWED_TAGS,
        attributes={"a": {"href", "title"}},
        url_schemes={"http", "https", "mailto"},
        link_rel="noopener noreferrer",
    )
    text = unescape(re.sub(r"<[^>]*>", "", cleaned)).strip()
    if not text:
        raise AppError("Add some text before publishing this blog post.", code="empty_blog_content")
    return cleaned

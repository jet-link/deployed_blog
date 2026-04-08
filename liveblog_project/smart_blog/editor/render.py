"""Render Editor.js document JSON to safe HTML for public templates."""
from __future__ import annotations

import html
from typing import Any
from urllib.parse import urlparse

from django.utils.safestring import mark_safe

from smart_blog.editor.sanitize import sanitize_editorjs_fragment

ALLOWED_BLOCK_TYPES = frozenset(
    {
        "paragraph",
        "header",
        "list",
        "quote",
        "delimiter",
        "image",
        "warning",
    }
)

def _esc(s: Any) -> str:
    if s is None:
        return ""
    return html.escape(str(s), quote=True)

def _header_tag(level: Any) -> str:
    try:
        lv = int(level)
    except (TypeError, ValueError):
        lv = 2
    lv = max(2, min(4, lv))
    return f"h{lv}"


def _safe_image_url(url: Any) -> str | None:
    if not url or not isinstance(url, str):
        return None
    url = url.strip()
    if not url or url.lower().startswith("javascript:") or url.startswith("data:"):
        return None
    parsed = urlparse(url)
    if parsed.scheme in ("http", "https"):
        return url
    if parsed.scheme == "" and url.startswith("/"):
        return url
    return None


def _render_list(data: dict[str, Any]) -> str:
    style = data.get("style") or "unordered"
    items = data.get("items")
    if not items:
        return ""

    if style == "ordered":
        tag = "ol"
    elif style in ("unordered", "checklist"):
        tag = "ul"
    else:
        tag = "ul"

    extra = ' class="post-list post-list--checklist"' if style == "checklist" else ' class="post-list"'

    def render_items(nodes: list[Any]) -> str:
        out: list[str] = []
        for node in nodes:
            if isinstance(node, str):
                out.append(f"<li>{sanitize_editorjs_fragment(node)}</li>")
                continue
            if not isinstance(node, dict):
                continue
            content = node.get("content")
            nested = node.get("items") or []
            meta = node.get("meta") if isinstance(node.get("meta"), dict) else {}
            checked = bool(meta.get("checked")) if style == "checklist" else False
            inner = sanitize_editorjs_fragment(content) if content is not None else ""
            if style == "checklist":
                chk = " checked" if checked else ""
                inner = f'<input type="checkbox" disabled{chk} aria-readonly="true"/> <span>{inner}</span>'
            li_open = f"<li>{inner}"
            if nested:
                li_open += render_items(nested)
            li_open += "</li>"
            out.append(li_open)
        return "".join(out)

    # Old Editor.js list: flat strings only
    if items and all(isinstance(x, str) for x in items):
        inner = "".join(f"<li>{sanitize_editorjs_fragment(x)}</li>" for x in items)
        return f"<{tag}{extra}>{inner}</{tag}>"

    inner = render_items(items)
    return f"<{tag}{extra}>{inner}</{tag}>" if inner else ""


def _render_block(block: Any) -> str:
    if not isinstance(block, dict):
        return ""
    btype = block.get("type")
    if btype not in ALLOWED_BLOCK_TYPES:
        return ""
    data = block.get("data")
    if data is None:
        data = {}
    if not isinstance(data, dict):
        return ""

    if btype == "paragraph":
        text = data.get("text") or ""
        return f"<p>{sanitize_editorjs_fragment(text)}</p>"

    if btype == "header":
        text = data.get("text") or ""
        tag = _header_tag(data.get("level"))
        return f"<{tag}>{sanitize_editorjs_fragment(text)}</{tag}>"

    if btype == "list":
        return _render_list(data) or ""

    if btype == "quote":
        text = data.get("text") or ""
        caption = data.get("caption") or ""
        cap_san = sanitize_editorjs_fragment(caption)
        cap = f"<cite>{cap_san}</cite>" if cap_san else ""
        return (
            f'<blockquote class="post-quote"><p>{sanitize_editorjs_fragment(text)}</p>{cap}</blockquote>'
        )

    if btype == "delimiter":
        return "<hr class=\"post-delimiter\" />"

    if btype == "warning":
        title = data.get("title") or ""
        message = data.get("message") or ""
        return (
            '<div class="post-callout post-callout--warning" role="note">'
            f'<strong class="post-callout__title">{_esc(title)}</strong>'
            f'<div class="post-callout__body">{_esc(message)}</div>'
            "</div>"
        )

    if btype == "image":
        file_obj = data.get("file")
        url = None
        if isinstance(file_obj, dict):
            url = _safe_image_url(file_obj.get("url"))
        if url is None:
            url = _safe_image_url(data.get("url"))
        if not url:
            return ""
        caption = data.get("caption") or ""
        alt = _esc(caption)[:500] if caption else ""
        cap_html = f"<figcaption>{_esc(caption)}</figcaption>" if caption else ""
        return (
            '<figure class="post-figure">'
            f'<img src="{_esc(url)}" alt="{alt}" loading="lazy" decoding="async" />'
            f"{cap_html}</figure>"
        )

    return ""


def render_editorjs_to_html(editor_output: dict[str, Any] | None) -> str:
    """
    Convert Editor.js `save()` document to HTML.

    Unknown block types and malformed blocks are skipped. Paragraph / header / list / quote
    inline HTML is passed through :func:`~smart_blog.editor.sanitize.sanitize_editorjs_fragment`;
    other fields stay escaped where applicable.
    """
    if not editor_output or not isinstance(editor_output, dict):
        return ""
    blocks = editor_output.get("blocks")
    if not blocks or not isinstance(blocks, list):
        return ""
    inner: list[str] = []
    for block in blocks:
        chunk = _render_block(block)
        if chunk:
            inner.append(chunk)
    if not inner:
        return ""
    return mark_safe(
        '<div class="post-body-editorjs ck-content">'
        + "".join(inner)
        + "</div>"
    )

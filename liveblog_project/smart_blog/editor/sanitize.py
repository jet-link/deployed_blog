"""Bleach allowlist for Editor.js inline HTML inside paragraph / list / quote fields."""
from __future__ import annotations

import bleach

# Matches @editorjs/link, @editorjs/marker (<mark class="cdx-marker">), @editorjs/inline-code,
# and execCommand bold/italic/underline (<b>, <i>, <u> — browsers may emit <strong>/<em>).
EDITORJS_FRAGMENT_TAGS = frozenset(
    {"a", "b", "strong", "i", "em", "u", "mark", "code", "span", "br"}
)

EDITORJS_FRAGMENT_ATTRIBUTES = {
    "a": ["href", "title", "rel", "target"],
    "mark": ["class"],
    "code": ["class"],
    "span": ["class"],
}

EDITORJS_FRAGMENT_PROTOCOLS = frozenset({"http", "https", "mailto", ""})


def sanitize_editorjs_fragment(html: str) -> str:
    """
    Sanitize a fragment that may contain Editor.js inline markup.
    Unknown tags are stripped; dangerous URLs on <a href> are removed by bleach.
    """
    if html is None:
        return ""
    if not isinstance(html, str):
        html = str(html)
    html = html.strip()
    if not html:
        return ""
    return bleach.clean(
        html,
        tags=EDITORJS_FRAGMENT_TAGS,
        attributes=EDITORJS_FRAGMENT_ATTRIBUTES,
        protocols=EDITORJS_FRAGMENT_PROTOCOLS,
        strip=True,
    )

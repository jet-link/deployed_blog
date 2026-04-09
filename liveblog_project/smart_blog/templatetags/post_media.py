"""Reusable post image gallery context for detail pages."""
from __future__ import annotations

from typing import Any, Dict, List

from django import template

register = template.Library()


def _slides_payload(images) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for im in images:
        alt = (im.alt_text or "").strip()
        out.append(
            {
                "full": im.image.url,
                "thumb": im.get_thumbnail_url(),
                "srcset": im.get_srcset() or "",
                "alt": alt,
                "caption": (im.caption or "").strip(),
                "w": im.width,
                "h": im.height,
                "o": im.orientation_kind or "landscape",
            }
        )
    return out


@register.inclusion_tag("smart_blog/includes/post_media_gallery.html")
def post_media_gallery(item):
    """Editorial grid + JSON payload for the shared lightbox script."""
    images = list(item.images.all())
    n = len(images)
    if n == 0:
        return {"show": False}

    slides = _slides_payload(images)

    if n == 1:
        layout = "single"
        slots = [{"index": 0, "img": images[0], "overlay_more": 0}]
    elif n == 2:
        layout = "double"
        slots = [{"index": i, "img": images[i], "overlay_more": 0} for i in range(2)]
    elif n == 3:
        layout = "triple"
        slots = [{"index": i, "img": images[i], "overlay_more": 0} for i in range(3)]
    elif n == 4:
        layout = "quad"
        slots = [{"index": i, "img": images[i], "overlay_more": 0} for i in range(4)]
    elif n == 5:
        layout = "five"
        slots = [{"index": i, "img": images[i], "overlay_more": 0} for i in range(5)]
    else:
        layout = "preview"
        overlay = n - 5
        slots = [{"index": i, "img": images[i], "overlay_more": 0} for i in range(4)]
        slots.append({"index": 4, "img": images[4], "overlay_more": overlay})

    return {
        "show": True,
        "item": item,
        "layout": layout,
        "slots": slots,
        "slides": slides,
        "count": n,
        "script_id": f"post-media-json-{item.pk}",
    }

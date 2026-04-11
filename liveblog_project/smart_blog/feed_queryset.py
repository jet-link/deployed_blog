"""Lightweight queryset tweaks for feed-style listings (no views package imports)."""
from django.db.models import Exists, OuterRef


def feed_list_optimizations(qs):
    """
    Listing cards only need HTML text for excerpt + denormalized counters; skip unused JSON blob
    and avoid prefetching post images (feed / profile tiles / home hero strip do not render them).
    Annotates has_photos/has_videos for pin icon on cards.
    """
    from smart_blog.models import ItemImage, ItemVideo
    return (
        qs
        .defer("content_json")
        .annotate(
            has_photos=Exists(ItemImage.objects.filter(item=OuterRef("pk"))),
            has_videos=Exists(ItemVideo.objects.filter(item=OuterRef("pk"))),
        )
    )

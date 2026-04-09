"""Lightweight queryset tweaks for feed-style listings (no views package imports)."""


def feed_list_optimizations(qs):
    """
    Listing cards only need HTML text for excerpt + denormalized counters; skip unused JSON blob
    and avoid prefetching post images (feed / profile tiles / home hero strip do not render them).
    """
    return qs.defer("content_json")

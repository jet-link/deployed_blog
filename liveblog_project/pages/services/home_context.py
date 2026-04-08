"""Home page context: strip (popular/trending), editor picks, quick links — with short-lived caches."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

from django.core.cache import cache

from pages.home_content import get_home_page
from pages.models import HomePageContent, HomeQuickLink
from smart_blog.models import Item, TrendingItem
from smart_blog.feed_queryset import feed_list_optimizations
from smart_blog.search_utils import get_popularity_queryset

logger = logging.getLogger(__name__)

HOME_STRIP_PK_CACHE_TTL = 90
HOME_QUICKLINKS_CACHE_TTL = 120


def _strip_cache_key(home: HomePageContent, mode: str) -> str:
    return (
        f"pages.home.strip_pks:{home.cache_bump}:{mode}:"
        f"{home.content_strip_limit}:{home.popular_min_likes}"
    )


def _quicklinks_cache_key(cache_bump: int) -> str:
    return f"pages.home.quicklinks:{cache_bump}"


def _fetch_popular_strip_pks(home: HomePageContent) -> List[int]:
    qs = Item.objects.filter(is_published=True).with_counters()
    qs = get_popularity_queryset(qs, min_likes=home.popular_min_likes)
    return list(qs.values_list("pk", flat=True)[: home.content_strip_limit])


def _fetch_trending_strip_pks(home: HomePageContent) -> List[int]:
    return list(
        TrendingItem.objects.filter(item__is_published=True)
        .order_by("-trend_score")
        .values_list("item_id", flat=True)[: home.content_strip_limit]
    )


def _hydrate_items_ordered(pks: List[int]) -> List[Item]:
    if not pks:
        return []
    qs = feed_list_optimizations(
        Item.objects.filter(pk__in=pks).with_counters()
    )
    by_id = {i.pk: i for i in qs}
    return [by_id[i] for i in pks if i in by_id]


def _load_strip_items(home: HomePageContent) -> tuple[List[Item], str]:
    mode = home.content_strip_mode
    if mode == HomePageContent.STRIP_NONE:
        return [], ""

    if mode == HomePageContent.STRIP_POPULAR:
        heading = "Popular"
        cache_key = _strip_cache_key(home, "popular")
        pks = cache.get(cache_key)
        if pks is None:
            try:
                pks = _fetch_popular_strip_pks(home)
            except Exception:
                logger.exception("home popular strip query failed")
                pks = []
            cache.set(cache_key, pks, HOME_STRIP_PK_CACHE_TTL)
        return _hydrate_items_ordered(pks), heading

    if mode == HomePageContent.STRIP_TRENDING:
        heading = "In trend"
        cache_key = _strip_cache_key(home, "trending")
        pks = cache.get(cache_key)
        if pks is None:
            try:
                pks = _fetch_trending_strip_pks(home)
            except Exception:
                logger.exception("home trending strip query failed")
                pks = []
            cache.set(cache_key, pks, HOME_STRIP_PK_CACHE_TTL)
        return _hydrate_items_ordered(pks), heading

    return [], ""


def _ordered_editor_picks(home: HomePageContent) -> List[Item]:
    if not home.show_editor_picks:
        return []
    id_order = [
        pk
        for pk in (
            home.editor_pick_1_id,
            home.editor_pick_2_id,
            home.editor_pick_3_id,
        )
        if pk
    ]
    if not id_order:
        return []
    qs = feed_list_optimizations(
        Item.objects.filter(pk__in=id_order, is_published=True).with_counters()
    )
    by_id = {i.pk: i for i in qs}
    return [by_id[i] for i in id_order if i in by_id]


def _load_quick_links(home: HomePageContent) -> List[Any]:
    if not home.show_quick_links:
        return []
    key = _quicklinks_cache_key(home.cache_bump)
    data = cache.get(key)
    if data is not None:
        return data
    rows = list(
        HomeQuickLink.objects.filter(is_active=True)
        .order_by("order", "pk")
        .values("label", "url", "icon_class")
    )
    cache.set(key, rows, HOME_QUICKLINKS_CACHE_TTL)
    return rows


def build_home_page_context() -> Dict[str, Any]:
    home = get_home_page()
    quick_links = _load_quick_links(home)
    strip_items, strip_heading = _load_strip_items(home)
    show_content_strip = home.content_strip_mode != HomePageContent.STRIP_NONE and bool(strip_items)
    editor_picks = _ordered_editor_picks(home)

    return {
        "home": home,
        "meta_description": home.meta_description or "",
        "quick_links": quick_links,
        "strip_items": strip_items,
        "strip_heading": strip_heading,
        "show_content_strip": show_content_strip,
        "editor_picks": editor_picks,
    }

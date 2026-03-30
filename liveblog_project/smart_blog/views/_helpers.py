"""Shared helpers used across multiple view modules."""
from django.db.models import Exists, OuterRef

from smart_blog.models import Bookmark, Like


def annotate_user_liked(qs, user):
    if user.is_authenticated:
        likes_subq = Like.objects.filter(item=OuterRef('pk'), user=user)
        return qs.annotate(user_liked=Exists(likes_subq))
    return qs


def annotate_user_bookmarked(qs, user):
    if user.is_authenticated:
        bookmarks_subq = Bookmark.objects.filter(item=OuterRef('pk'), user=user)
        return qs.annotate(user_bookmarked=Exists(bookmarks_subq))
    return qs

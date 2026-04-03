"""Detail views: item_detail, comment_thread."""
from datetime import timedelta

from django.db.models import Count, Exists, OuterRef, Prefetch, Q
from django.http import Http404
from django.shortcuts import get_object_or_404, render
from django.urls import reverse
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme

from smart_blog.forms import CommentForm
from smart_blog.models import (
    Bookmark, Category, Comment, CommentLike, Item, ItemView, Like, Notification,
    ViewEvent,
)
from smart_blog.selectors import has_user_reported_item
from smart_blog.services.report_limits import can_user_report
from smart_blog.utils import breadcrumb, build_breadcrumbs

COMMENT_ROOT_PAGINATION_STEP = 50


def _comments_min_visible_for_focus(item, focus_comment_id):
    """How many root comments must be visible so focus_comment is shown (JS paginates roots)."""
    if not focus_comment_id:
        return None
    try:
        fid = int(focus_comment_id)
    except (TypeError, ValueError):
        return None
    try:
        focus = Comment.objects.get(pk=fid, item=item, is_draft=False)
    except Comment.DoesNotExist:
        return None
    root = focus
    while root.parent_id:
        root = root.parent
    root_ids = list(
        Comment.objects.filter(item=item, parent__isnull=True, is_draft=False)
        .order_by('-created')
        .values_list('pk', flat=True)
    )
    try:
        pos = root_ids.index(root.pk) + 1
    except ValueError:
        return None
    steps = (pos + COMMENT_ROOT_PAGINATION_STEP - 1) // COMMENT_ROOT_PAGINATION_STEP
    return steps * COMMENT_ROOT_PAGINATION_STEP


def register_item_view(request, item):
    ViewEvent.objects.create(item=item)

    if request.user.is_authenticated:
        ItemView.objects.get_or_create(
            item=item,
            user=request.user
        )
    else:
        if not request.session.session_key:
            request.session.create()

        ItemView.objects.get_or_create(
            item=item,
            user=None,
            session_key=request.session.session_key,
            defaults={
                "ip_address": request.META.get("REMOTE_ADDR")
            }
        )


def item_detail(request, slug):
    slug = (slug or '').strip()
    item = get_object_or_404(Item.objects.filter(is_published=True), slug=slug)

    register_item_view(request, item)

    item = (
        Item.objects
        .with_counters()
        .select_related("category", "author", "author__profile")
        .annotate(reports_count=Count('reports', distinct=True))
        .prefetch_related("images")
        .get(pk=item.pk)
    )

    if request.user.is_authenticated:
        likes_subq = CommentLike.objects.filter(
            comment=OuterRef('pk'),
            user=request.user
        )
    else:
        likes_subq = CommentLike.objects.none()

    main_comments_qs = (
        Comment.objects
        .filter(item=item, parent__isnull=True, is_draft=False)
        .annotate(
            user_liked=Exists(likes_subq),
            likes_count=Count('likes', distinct=True),
            replies_count=Count('replies', filter=Q(replies__is_draft=False), distinct=True),
            reports_count=Count('reports', distinct=True),
        )
        .order_by('-created')
    )

    replies_qs = (
        Comment.objects
        .filter(parent__isnull=False, is_draft=False)
        .annotate(
            user_liked=Exists(likes_subq),
            likes_count=Count('likes', distinct=True),
            reports_count=Count('reports', distinct=True),
        )
        .order_by('-created')
    )

    comments = main_comments_qs.prefetch_related(
        Prefetch('replies', queryset=replies_qs),
        Prefetch('replies__replies', queryset=replies_qs),
        Prefetch('replies__replies__replies', queryset=replies_qs),
    )

    user_liked = (
        Like.objects.filter(item=item, user=request.user).exists()
        if request.user.is_authenticated else False
    )

    user_bookmarked = (
        Bookmark.objects.filter(item=item, user=request.user).exists()
        if request.user.is_authenticated else False
    )

    user_reported_item = has_user_reported_item(request.user, item)
    allowed, _ = can_user_report(request.user) if request.user.is_authenticated else (False, None)
    report_rate_limited = not allowed

    liked_users = (
        Like.objects
        .filter(item=item)
        .select_related('user', 'user__profile')
        .exclude(user__isnull=True)
        .order_by('-created_at')
    )

    editable_until = (item.published_date or item.created) + timedelta(hours=24)
    is_editable = timezone.now() <= editable_until

    source = request.GET.get("from")
    source_user = request.GET.get("user")
    source_section = request.GET.get("section")
    source_url = request.GET.get("source_url")
    source_query = request.GET.get("query")
    source_tag = request.GET.get("tag")
    source_tag_slug = request.GET.get("tag_slug")
    source_category_slug = (request.GET.get("category_slug") or "").strip()

    safe_source_url = None
    if source_url and url_has_allowed_host_and_scheme(
        url=source_url,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure()
    ):
        safe_source_url = source_url

    source_user = (source_user or '').strip()
    source_section = (source_section or '').strip().lower()

    if source == "profile" and source_user and source_section == "created":
        breadcrumbs = build_breadcrumbs(
            breadcrumb(source_user, reverse("login_app:profile", kwargs={"username": source_user})),
            breadcrumb("Created", reverse("login_app:profile-section", kwargs={"username": source_user, "section": "created"})),
            breadcrumb(item.title, None),
        )
    elif source == "profile" and source_user:
        breadcrumbs = build_breadcrumbs(
            breadcrumb(source_user, reverse("login_app:profile", kwargs={"username": source_user})),
            breadcrumb(item.title, None),
        )
    elif source == "items_list":
        breadcrumbs = build_breadcrumbs(
            breadcrumb("BraiNews", safe_source_url or reverse("smart_blog:items_list")),
            breadcrumb(item.title, None),
        )
    elif source == "trending":
        breadcrumbs = build_breadcrumbs(
            breadcrumb("In trend", safe_source_url or reverse("smart_blog:trending_list")),
            breadcrumb(item.title, None),
        )
    elif source in ("for_you", "popular"):
        breadcrumbs = build_breadcrumbs(
            breadcrumb("For you", safe_source_url or reverse("smart_blog:for_you_list")),
            breadcrumb(item.title, None),
        )
    elif source in ("category", "topic") and source_category_slug:
        topic_src = safe_source_url or reverse(
            "smart_blog:topic_detail", kwargs={"slug": source_category_slug}
        )
        cat_row = Category.objects.filter(slug=source_category_slug).values("name").first()
        crumb_label = cat_row["name"] if cat_row else source_category_slug
        breadcrumbs = build_breadcrumbs(
            breadcrumb(crumb_label, topic_src),
            breadcrumb(item.title, None),
        )
    elif source == "search" and source_query:
        from urllib.parse import urlencode
        search_url = safe_source_url or (reverse("global_search") + "?" + urlencode({"q": source_query}))
        breadcrumbs = build_breadcrumbs(
            breadcrumb(f"Found - {source_query}", search_url),
            breadcrumb(item.title, None),
        )
    elif source == "tag" and source_tag:
        tag_url = safe_source_url
        if not tag_url and source_tag_slug:
            tag_url = reverse("smart_blog:tag_list", kwargs={"slug": source_tag_slug})
        if not tag_url:
            tag_url = reverse("smart_blog:items_list")
        breadcrumbs = build_breadcrumbs(
            breadcrumb(source_tag, tag_url),
            breadcrumb(item.title, None),
        )
    elif source == "home":
        breadcrumbs = build_breadcrumbs(
            breadcrumb("brainstorm.news", safe_source_url or "/"),
            breadcrumb(item.title, None),
        )
    else:
        breadcrumbs = build_breadcrumbs(
            breadcrumb("BraiNews", reverse("smart_blog:items_list")),
            breadcrumb(item.title, None),
        )

    comments_min_visible = _comments_min_visible_for_focus(item, request.GET.get("focus_comment"))

    return render(request, "smart_blog/item_detail.html", {
        "item": item,
        "form": CommentForm(),
        "comments": comments,
        "user_liked": user_liked,
        "user_bookmarked": user_bookmarked,
        "user_reported_item": user_reported_item,
        "report_rate_limited": report_rate_limited,
        "liked_users": liked_users,
        "editable_until_iso": editable_until.isoformat(),
        "is_editable": is_editable,
        "breadcrumbs": breadcrumbs,
        "comments_min_visible": comments_min_visible,
    })


def comment_thread(request, pk):
    comment = get_object_or_404(Comment, pk=pk)
    if comment.is_draft:
        raise Http404

    if request.user.is_authenticated:
        thread_likes_subq = CommentLike.objects.filter(
            comment=OuterRef('pk'),
            user=request.user
        )
    else:
        thread_likes_subq = CommentLike.objects.none()

    replies_qs = Comment.objects.filter(is_draft=False).annotate(
        user_liked=Exists(thread_likes_subq),
        likes_count=Count('likes', distinct=True),
        reports_count=Count('reports', distinct=True),
    ).order_by('-created')
    comment = (
        Comment.objects
        .filter(pk=comment.pk)
        .annotate(
            user_liked=Exists(thread_likes_subq),
            likes_count=Count('likes', distinct=True),
            reports_count=Count('reports', distinct=True),
        )
        .prefetch_related(
            Prefetch('replies', queryset=replies_qs),
            Prefetch('replies__replies', queryset=replies_qs),
            Prefetch('replies__replies__replies', queryset=replies_qs),
            Prefetch('replies__replies__replies__replies', queryset=replies_qs),
        )
        .get()
    )

    allowed, _ = can_user_report(request.user) if request.user.is_authenticated else (False, None)
    report_rate_limited = not allowed

    breadcrumbs = build_breadcrumbs(
        breadcrumb(comment.item.title, comment.item.get_absolute_url()),
        breadcrumb("Replies", None),
    )

    return render(request, "smart_blog/comment_thread.html", {
        "comment": comment,
        "item": comment.item,
        "report_rate_limited": report_rate_limited,
        "breadcrumbs": breadcrumbs,
    })

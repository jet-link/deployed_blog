"""Admin: all user notifications (moderation)."""
from django.contrib import messages
from django.core.paginator import Paginator
from django.db.models import Q
from django.shortcuts import redirect, render

from admin_panel.decorators import admin_required
from admin_panel.views.bulk_views import _get_ids, _redirect_with_qs
from smart_blog.models import Notification

# GET ?nf= — list filter (preserved in pagination / bulk redirects)
NOTIF_FILTER_ACTIVE = "active"
NOTIF_FILTER_CLEARED = "cleared"


@admin_required
def notifications_list(request):
    """
    - Active only: recipient still has row in inbox sense AND not hidden by admin
      (cleared_from_inbox=False, hidden_from_admin=False). No «Cleared inbox» badge
      in this set (badge only when user cleared but not read — see template).
    - Show cleared: user cleared inbox (cleared_from_inbox) OR admin hid row (hidden_from_admin).
    """
    qs = Notification.objects.select_related(
        "recipient", "actor", "item", "parent_comment", "reply_comment"
    )

    list_filter = request.GET.get("nf", NOTIF_FILTER_ACTIVE)
    if list_filter not in (NOTIF_FILTER_ACTIVE, NOTIF_FILTER_CLEARED):
        list_filter = NOTIF_FILTER_ACTIVE

    if list_filter == NOTIF_FILTER_CLEARED:
        qs = qs.filter(Q(cleared_from_inbox=True) | Q(hidden_from_admin=True))
    else:
        qs = qs.filter(cleared_from_inbox=False, hidden_from_admin=False)

    qs = qs.order_by("-created_at")
    search = request.GET.get("q", "").strip()
    if search:
        qs = qs.filter(
            Q(recipient__username__icontains=search)
            | Q(actor__username__icontains=search)
            | Q(item__title__icontains=search)
        )
    paginator = Paginator(qs, 30)
    page = request.GET.get("page", 1)
    rows = paginator.get_page(page)
    return render(
        request,
        "admin/moderation/notifications_list.html",
        {
            "rows": rows,
            "search": search,
            "notif_list_filter": list_filter,
            "NOTIF_FILTER_ACTIVE": NOTIF_FILTER_ACTIVE,
            "NOTIF_FILTER_CLEARED": NOTIF_FILTER_CLEARED,
        },
    )


@admin_required
def notifications_bulk_clear(request):
    """Hide selected rows from the admin list only (hidden_from_admin=True); DB rows stay; inbox unchanged."""
    if request.method != "POST":
        return redirect("admin_panel:notifications_list")
    ids = _get_ids(request)
    valid = []
    for x in ids:
        try:
            valid.append(int(x))
        except (TypeError, ValueError):
            pass
    if valid:
        updated = Notification.objects.filter(pk__in=valid).update(hidden_from_admin=True)
        if updated:
            messages.success(
                request,
                f"{updated} notification(s) removed from the admin table (still in database).",
            )
        else:
            messages.info(request, "No matching rows were updated.")
    else:
        messages.warning(request, "Select at least one notification to clear.")
    return _redirect_with_qs("notifications_list", request)


@admin_required
def notifications_bulk_delete(request):
    """Permanently delete selected notification rows."""
    if request.method != "POST":
        return redirect("admin_panel:notifications_list")
    ids = _get_ids(request)
    valid = []
    for x in ids:
        try:
            valid.append(int(x))
        except (TypeError, ValueError):
            pass
    if valid:
        n, _ = Notification.objects.filter(pk__in=valid).delete()
        messages.success(request, f"{n} notification row(s) removed from database.")
    else:
        messages.warning(request, "Select at least one notification to delete.")
    return _redirect_with_qs("notifications_list", request)

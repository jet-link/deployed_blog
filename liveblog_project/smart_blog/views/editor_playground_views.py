"""Staff-only Editor.js playground at /editor/ — no DB writes; for live debugging."""
from django.contrib.auth.decorators import login_required
from django.http import HttpResponseForbidden
from django.shortcuts import render


@login_required
def editor_playground(request):
    if not request.user.is_staff:
        return HttpResponseForbidden("This page is only available to staff.")
    return render(request, "smart_blog/editor_playground.html", {})

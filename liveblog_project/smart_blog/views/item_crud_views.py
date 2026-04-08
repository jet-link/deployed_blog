"""Item CRUD views: create_item, edit_item, delete_item, delete_item_image."""
import logging
import os

from django.conf import settings
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.files.storage import default_storage
from django.db import transaction
from django.http import HttpResponse, HttpResponseForbidden, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_POST

from smart_blog.forms import ItemCreateForm
from smart_blog.models import Item, ItemImage
from smart_blog.services.item_write import (
    attach_item_images_from_uploads,
    delete_item_images_by_ids,
    merge_item_tags,
    validate_edit_image_totals,
    validate_uploaded_image_files,
)

logger = logging.getLogger(__name__)


def find_existing_media_path(filename, subdir=None):
    if not filename:
        return None
    try:
        base_root = settings.MEDIA_ROOT
        if base_root:
            search_root = os.path.join(base_root, subdir) if subdir else base_root
            if os.path.isdir(search_root):
                for root, _dirs, files in os.walk(search_root):
                    if filename in files:
                        full_path = os.path.join(root, filename)
                        rel_path = os.path.relpath(full_path, base_root)
                        return rel_path.replace(os.sep, '/')
    except Exception:
        pass
    if subdir:
        rel_path = f"{subdir}/{filename}"
        try:
            if default_storage.exists(rel_path):
                return rel_path
        except Exception:
            pass
    return None


def _ensure_can_create_item(request):
    if request.user.is_superuser:
        return None
    profile = getattr(request.user, 'profile', None)
    can_post = getattr(profile, 'can_post', True)
    shadow_banned = getattr(profile, 'shadow_banned', False)
    if can_post and not shadow_banned:
        return None
    msg = (
        "You have been shadow banned. Improve your trust score to restore access."
        if shadow_banned
        else "Create post is disabled. Improve your trust score to restore access."
    )
    if request.method == "POST" and request.headers.get('x-requested-with') == 'XMLHttpRequest':
        return JsonResponse({"success": False, "error": msg}, status=403)
    return redirect('smart_blog:items_list')


def _json_form_errors(form):
    return {k: [str(x) for x in v] for k, v in form.errors.items()}


def _image_validation_ok_create(form, files) -> bool:
    return validate_uploaded_image_files(files, form)


def _image_validation_ok_edit(form, item, files, delete_ids) -> bool:
    return validate_uploaded_image_files(files, form) and validate_edit_image_totals(
        item, files, delete_ids, form
    )


@login_required
def create_item(request):
    denied = _ensure_can_create_item(request)
    if denied is not None:
        return denied

    if request.method != "POST":
        form = ItemCreateForm()
        return render(
            request,
            "smart_blog/create_item.html",
            {"form": form, "selected_tag_ids": []},
        )

    form = ItemCreateForm(request.POST)
    if not form.is_valid():
        if request.headers.get('x-requested-with') == 'XMLHttpRequest':
            return JsonResponse({"success": False, "errors": _json_form_errors(form)}, status=400)
        selected_tag_ids = [int(x) for x in request.POST.getlist("tags") if x.isdigit()]
        return render(
            request,
            "smart_blog/create_item.html",
            {"form": form, "selected_tag_ids": selected_tag_ids},
        )

    files = request.FILES.getlist("images")
    if not _image_validation_ok_create(form, files):
        if request.headers.get('x-requested-with') == 'XMLHttpRequest':
            return JsonResponse({"success": False, "errors": _json_form_errors(form)}, status=400)
        selected_tag_ids = [int(x) for x in request.POST.getlist("tags") if x.isdigit()]
        return render(
            request,
            "smart_blog/create_item.html",
            {"form": form, "selected_tag_ids": selected_tag_ids},
        )

    try:
        with transaction.atomic():
            item = form.save(commit=False)
            item.author = request.user
            item.save()
            item.tags.set(merge_item_tags(form.cleaned_data))
            attach_item_images_from_uploads(item, files)
    except Exception:
        logger.exception("create_item failed for user %s", request.user.pk)
        form.add_error(None, "Could not save the post. Please try again.")
        if request.headers.get('x-requested-with') == 'XMLHttpRequest':
            return JsonResponse({"success": False, "errors": _json_form_errors(form)}, status=500)
        selected_tag_ids = [int(x) for x in request.POST.getlist("tags") if x.isdigit()]
        return render(
            request,
            "smart_blog/create_item.html",
            {"form": form, "selected_tag_ids": selected_tag_ids},
        )

    profile_url = redirect('login_app:profile', username=request.user.username).url
    if request.headers.get('x-requested-with') == 'XMLHttpRequest':
        return JsonResponse({"success": True, "redirect": profile_url})
    messages.success(request, "Item created successfully.")
    return redirect(profile_url)


@login_required
def edit_item(request, slug):
    slug = (slug or '').strip()
    item = get_object_or_404(Item, slug=slug)

    if request.user != item.author:
        return HttpResponseForbidden("You are not allowed to edit this item.")

    if not item.is_editable and not request.user.is_staff:
        return HttpResponseForbidden("Editing period expired (24 hours after publication).")

    if request.method != "POST":
        form = ItemCreateForm(
            item=item,
            initial={
                "title": item.title,
                "text": item.text,
                "category": item.category_id,
                "tags": item.tags.all(),
            },
        )
        selected_tag_ids = list(item.tags.values_list("pk", flat=True))
        return render(request, "smart_blog/edit_item.html", {
            "form": form,
            "item": item,
            "existing_images": item.images.all(),
            "selected_tag_ids": selected_tag_ids,
        })

    form = ItemCreateForm(request.POST, item=item)
    delete_ids = request.POST.getlist("delete_images")

    if not form.is_valid():
        if request.headers.get('x-requested-with') == 'XMLHttpRequest':
            return JsonResponse({"success": False, "errors": _json_form_errors(form)}, status=400)
        selected_tag_ids = [int(x) for x in request.POST.getlist("tags") if x.isdigit()]
        return render(request, "smart_blog/edit_item.html", {
            "form": form,
            "item": item,
            "existing_images": item.images.all(),
            "selected_tag_ids": selected_tag_ids,
        })

    files = request.FILES.getlist("images")
    if not _image_validation_ok_edit(form, item, files, delete_ids):
        if request.headers.get('x-requested-with') == 'XMLHttpRequest':
            return JsonResponse({"success": False, "errors": _json_form_errors(form)}, status=400)
        selected_tag_ids = [int(x) for x in request.POST.getlist("tags") if x.isdigit()]
        return render(request, "smart_blog/edit_item.html", {
            "form": form,
            "item": item,
            "existing_images": item.images.all(),
            "selected_tag_ids": selected_tag_ids,
        })

    try:
        with transaction.atomic():
            merged_tags = merge_item_tags(form.cleaned_data)
            old_tag_ids = frozenset(item.tags.values_list("pk", flat=True))
            new_tag_ids = frozenset(t.pk for t in merged_tags)

            item.title = form.cleaned_data["title"]
            item.text = form.cleaned_data["text"]

            new_category = form.cleaned_data.get("category")
            new_category_id = new_category.pk if new_category else None
            if item.category_id != new_category_id:
                item.edited = True

            item.category = new_category

            if old_tag_ids != new_tag_ids:
                item.edited = True

            if delete_ids or files:
                item.edited = True

            item.save()
            item.tags.set(merged_tags)
            delete_item_images_by_ids(item, delete_ids)
            attach_item_images_from_uploads(item, files)
    except Exception:
        logger.exception("edit_item failed for item %s user %s", item.pk, request.user.pk)
        form.add_error(None, "Could not save changes. Please try again.")
        if request.headers.get('x-requested-with') == 'XMLHttpRequest':
            return JsonResponse({"success": False, "errors": _json_form_errors(form)}, status=500)
        selected_tag_ids = [int(x) for x in request.POST.getlist("tags") if x.isdigit()]
        return render(request, "smart_blog/edit_item.html", {
            "form": form,
            "item": item,
            "existing_images": item.images.all(),
            "selected_tag_ids": selected_tag_ids,
        })

    messages.success(request, "Post was successfully edited")
    redirect_url = (
        f"{item.get_absolute_url()}?{request.GET.urlencode()}" if request.GET else item.get_absolute_url()
    )
    if request.headers.get("x-requested-with") == "XMLHttpRequest":
        return JsonResponse({"success": True, "redirect": redirect_url})
    return redirect(redirect_url)


@require_POST
@login_required
def delete_item_image(request, pk):
    img = get_object_or_404(ItemImage, pk=pk)
    item = img.item

    if request.user != item.author and not request.user.is_staff:
        return JsonResponse({"success": False, "error": "Permission denied."}, status=403)

    try:
        for field_name in ("image", "image_thumbnail", "image_medium"):
            try:
                field = getattr(img, field_name, None)
                if field and getattr(field, "name", None):
                    field.delete(save=False)
            except Exception:
                logger.exception("Failed to delete %s file for ItemImage %s", field_name, pk)

        img.delete()
        item.edited = True
        item.save(update_fields=["edited"])
    except Exception:
        logger.exception("Failed to delete ItemImage %s", pk)
        return JsonResponse({"success": False, "error": "Delete failed."}, status=500)

    remaining = item.images.count()
    return JsonResponse({"success": True, "image_id": pk, "remaining": remaining})


@require_POST
@login_required
def delete_item(request, slug):
    item = get_object_or_404(Item, slug=slug)

    if request.user != item.author and not request.user.is_staff:
        return HttpResponseForbidden("Permission denied.")

    if not item.is_editable and not request.user.is_staff:
        return HttpResponseForbidden("Deletion period expired.")

    item_title = item.title
    try:
        item.delete()
    except Exception:
        return HttpResponse("Delete failed", status=500)

    messages.info(request, f'Post {item_title} was deleted')
    redirect_to = request.POST.get('redirect_to') or ''
    if redirect_to and url_has_allowed_host_and_scheme(redirect_to, allowed_hosts={request.get_host()}):
        return redirect(redirect_to)

    return redirect("smart_blog:items_list")

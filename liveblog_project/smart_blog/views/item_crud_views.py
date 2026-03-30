"""Item CRUD views: create_item, edit_item, delete_item, delete_item_image."""
import logging
import os
import re

from django.conf import settings
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.files.storage import default_storage
from django.http import HttpResponse, HttpResponseForbidden, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_POST

from smart_blog.forms import ItemCreateForm
from smart_blog.image_utils import (
    MAX_FILE_SIZE_BYTES,
    ALLOWED_MIME_TYPES as IMAGE_ALLOWED_MIME,
    process_image_legacy_safe,
)
from smart_blog.models import Item, ItemImage, Tag
from smart_blog.search_utils import refresh_item_search_vector

MAX_IMAGES = 10
ALLOWED_CONTENT_TYPES = IMAGE_ALLOWED_MIME
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


@login_required
def create_item(request):
    if not request.user.is_superuser:
        profile = getattr(request.user, 'profile', None)
        can_post = getattr(profile, 'can_post', True)
        shadow_banned = getattr(profile, 'shadow_banned', False)
        if not can_post or shadow_banned:
            if request.method == "POST" and request.headers.get('x-requested-with') == 'XMLHttpRequest':
                msg = "You have been shadow banned. Improve your trust score to restore access." if shadow_banned else "Create post is disabled. Improve your trust score to restore access."
                return JsonResponse({"success": False, "error": msg}, status=403)
            return redirect('smart_blog:items_list')
    if request.method == "POST":
        form = ItemCreateForm(request.POST)
        files = request.FILES.getlist("images")

        if len(files) > MAX_IMAGES:
            form.add_error(None, f"Maximum {MAX_IMAGES} images allowed.")
        else:
            bad = [f.name for f in files if (f.content_type or "").lower().strip() not in ALLOWED_CONTENT_TYPES]
            if bad:
                form.add_error(None, f"Unsupported file types: {', '.join(bad)}")
            for f in files:
                f.seek(0, 2)
                sz = f.tell()
                f.seek(0)
                if sz > MAX_FILE_SIZE_BYTES:
                    form.add_error(None, f"File {f.name} too large ({sz / (1024*1024):.1f} MB). Max {MAX_FILE_SIZE_BYTES / (1024*1024):.0f} MB.")
                    break

        if files and (len(files) == 1):
            form.add_error(None, "Either submit no images, or at least 2 images (minimum 2, maximum 10).")

        if form.is_valid():
            item = form.save(commit=False)
            item.author = request.user
            item.save()
            form.save_m2m()

            new_tags_raw = form.cleaned_data.get('new_tags', '')
            if new_tags_raw:
                for tg in [t for t in re.split(r'\s+', new_tags_raw.strip()) if t]:
                    tag_obj, _ = Tag.objects.get_or_create(tag_name=tg)
                    item.tags.add(tag_obj)

            refresh_item_search_vector(item.pk)

            for f in files[:MAX_IMAGES]:
                processed = process_image_legacy_safe(f, item.pk)
                if processed:
                    ItemImage.objects.create(
                        item=item,
                        image=processed["image"],
                        image_thumbnail=processed["image_thumbnail"],
                        image_medium=processed["image_medium"],
                        width=processed.get("width"),
                        height=processed.get("height"),
                    )
                else:
                    ItemImage.objects.create(item=item, image=f)

            profile_url = redirect('login_app:profile', username=request.user.username).url
            if request.headers.get('x-requested-with') == 'XMLHttpRequest':
                return JsonResponse({"success": True, "redirect": profile_url})
            messages.success(request, "Item created successfully.")
            return redirect(profile_url)
        else:
            if request.headers.get('x-requested-with') == 'XMLHttpRequest':
                simple = {k: [str(x) for x in v] for k, v in form.errors.items()}
                return JsonResponse({"success": False, "errors": simple}, status=400)
            selected_tag_ids = [int(x) for x in request.POST.getlist("tags") if x.isdigit()]
    else:
        form = ItemCreateForm()
        selected_tag_ids = []
    return render(request, "smart_blog/create_item.html", {"form": form, "selected_tag_ids": selected_tag_ids})


@login_required
def edit_item(request, slug):
    slug = (slug or '').strip()
    item = get_object_or_404(Item, slug=slug)

    if request.user != item.author:
        return HttpResponseForbidden("You are not allowed to edit this item.")

    if not item.is_editable and not request.user.is_staff:
        return HttpResponseForbidden("Editing period expired (24 hours after publication).")

    existing_images = item.images.all()

    if request.method == "POST":
        form = ItemCreateForm(request.POST)
        files = request.FILES.getlist("images")
        delete_ids = request.POST.getlist("delete_images")

        if len(files) > MAX_IMAGES:
            form.add_error(None, f"Maximum {MAX_IMAGES} images allowed.")
        else:
            wrong = [f.name for f in files if (f.content_type or "").lower().strip() not in ALLOWED_CONTENT_TYPES]
            if wrong:
                form.add_error(None, f"Unsupported file types: {', '.join(wrong)}")
            for f in files:
                f.seek(0, 2)
                sz = f.tell()
                f.seek(0)
                if sz > MAX_FILE_SIZE_BYTES:
                    form.add_error(None, f"File {f.name} too large ({sz / (1024*1024):.1f} MB). Max {MAX_FILE_SIZE_BYTES / (1024*1024):.0f} MB.")
                    break

        existing_count = existing_images.count()
        delete_count = len(delete_ids) if delete_ids else 0
        remaining_after_delete = max(0, existing_count - delete_count)
        total_after = remaining_after_delete + len(files)

        if total_after > MAX_IMAGES:
            form.add_error(None, f"Total images after updates cannot exceed {MAX_IMAGES}.")
        if total_after == 1:
            form.add_error(None, "Resulting number of images would be 1 — either keep 0 images or at least 2 images.")

        if form.is_valid():
            item.title = form.cleaned_data["title"]
            item.text = form.cleaned_data["text"]

            new_category = form.cleaned_data.get("category")
            new_category_id = new_category.pk if new_category else None
            if item.category_id != new_category_id:
                item.edited = True

            item.category = new_category

            old_tag_ids = set(item.tags.values_list("pk", flat=True))

            new_tags_from_form = list(form.cleaned_data["tags"])
            new_tags_raw = form.cleaned_data.get("new_tags", "")
            if new_tags_raw:
                for tg in [t for t in re.split(r'\s+', new_tags_raw.strip()) if t]:
                    tag_obj, _ = Tag.objects.get_or_create(tag_name=tg)
                    new_tags_from_form.append(tag_obj)

            item.tags.set(new_tags_from_form)
            new_tag_ids = set(item.tags.values_list("pk", flat=True))
            if old_tag_ids != new_tag_ids:
                item.edited = True

            if delete_ids or files:
                item.edited = True

            item.save()

            if delete_ids:
                for sid in delete_ids:
                    try:
                        img = ItemImage.objects.get(pk=sid, item=item)
                        for fn in ("image", "image_thumbnail", "image_medium"):
                            try:
                                f = getattr(img, fn, None)
                                if f and getattr(f, "name", None):
                                    f.delete(save=False)
                            except Exception:
                                pass
                        img.delete()
                    except ItemImage.DoesNotExist:
                        pass

            for f in files[:MAX_IMAGES]:
                processed = process_image_legacy_safe(f, item.pk)
                if processed:
                    ItemImage.objects.create(
                        item=item,
                        image=processed["image"],
                        image_thumbnail=processed["image_thumbnail"],
                        image_medium=processed["image_medium"],
                        width=processed.get("width"),
                        height=processed.get("height"),
                    )
                else:
                    ItemImage.objects.create(item=item, image=f)

            messages.success(request, "Post was successfully edited")
            redirect_url = f"{item.get_absolute_url()}?{request.GET.urlencode()}" if request.GET else item.get_absolute_url()
            if request.headers.get("x-requested-with") == "XMLHttpRequest":
                return JsonResponse({"success": True, "redirect": redirect_url})
            return redirect(redirect_url)
        else:
            if request.headers.get('x-requested-with') == 'XMLHttpRequest':
                simple = {k: [str(x) for x in v] for k, v in form.errors.items()}
                return JsonResponse({"success": False, "errors": simple}, status=400)
            selected_tag_ids = [int(x) for x in request.POST.getlist("tags") if x.isdigit()]
    else:
        form = ItemCreateForm(initial={
            "title": item.title,
            "text": item.text,
            "category": item.category_id,
            "tags": item.tags.all(),
        })
        selected_tag_ids = list(item.tags.values_list("pk", flat=True))

    return render(request, "smart_blog/edit_item.html", {
        "form": form,
        "item": item,
        "existing_images": existing_images,
        "selected_tag_ids": selected_tag_ids,
    })


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

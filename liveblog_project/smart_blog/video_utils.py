# smart_blog/video_utils.py
"""Video upload validation and processing helpers."""
import logging
from typing import Sequence

logger = logging.getLogger(__name__)

MAX_VIDEO_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
MAX_ITEM_VIDEOS = 3
ALLOWED_VIDEO_MIME_TYPES = frozenset({
    "video/mp4", "video/webm", "video/quicktime",
})


def validate_video_file(f) -> str | None:
    """Return error string or None if valid."""
    ct = (getattr(f, "content_type", None) or "").lower().strip()
    if ct not in ALLOWED_VIDEO_MIME_TYPES:
        return f"Unsupported video type: {ct or 'unknown'}"
    f.seek(0, 2)
    sz = f.tell()
    f.seek(0)
    if sz > MAX_VIDEO_FILE_SIZE_BYTES:
        return (
            f"Video {getattr(f, 'name', '')} too large "
            f"({sz / (1024*1024):.1f} MB). Max {MAX_VIDEO_FILE_SIZE_BYTES // (1024*1024)} MB."
        )
    return None


def validate_uploaded_video_files(files: Sequence, form) -> bool:
    if len(files) > MAX_ITEM_VIDEOS:
        form.add_error(None, f"You can upload up to {MAX_ITEM_VIDEOS} videos per post.")
        return False
    for f in files:
        err = validate_video_file(f)
        if err:
            form.add_error(None, err)
            return False
    return True


def validate_edit_video_totals(item, files, delete_ids, form) -> bool:
    from smart_blog.models import ItemVideo
    n_existing = ItemVideo.objects.filter(item=item).count()
    parsed = [int(x) for x in (delete_ids or []) if str(x).strip().isdigit()]
    n_remove = ItemVideo.objects.filter(item=item, pk__in=parsed).count() if parsed else 0
    remaining = max(0, n_existing - n_remove)
    total_after = remaining + len(files)
    if total_after > MAX_ITEM_VIDEOS:
        form.add_error(None, f"Total videos after updates cannot exceed {MAX_ITEM_VIDEOS}.")
        return False
    return True


def attach_item_videos_from_uploads(item, files):
    from smart_blog.models import ItemVideo
    from django.db.models import Max
    file_list = list(files)[:MAX_ITEM_VIDEOS]
    if not file_list:
        return
    agg = ItemVideo.objects.filter(item=item).aggregate(mx=Max("sort_order"))
    next_order = (agg["mx"] if agg["mx"] is not None else -1) + 1
    for i, f in enumerate(file_list):
        f.seek(0, 2)
        sz = f.tell()
        f.seek(0)
        ItemVideo.objects.create(
            item=item,
            video=f,
            sort_order=next_order + i,
            file_size=sz,
        )


def delete_item_videos_by_ids(item, raw_id_list):
    from smart_blog.models import ItemVideo
    ids = [int(x) for x in (raw_id_list or []) if str(x).strip().isdigit()]
    if not ids:
        return 0
    qs = ItemVideo.objects.filter(item=item, pk__in=ids)
    n = 0
    for vid in qs:
        try:
            if vid.video and getattr(vid.video, "name", None):
                vid.video.delete(save=False)
            if vid.thumbnail and getattr(vid.thumbnail, "name", None):
                vid.thumbnail.delete(save=False)
        except Exception:
            logger.exception("Failed to delete video files for ItemVideo %s", vid.pk)
        vid.delete()
        n += 1
    return n

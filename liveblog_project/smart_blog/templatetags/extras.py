from django import template
from django.utils.html import strip_tags
from django.utils.text import Truncator


register = template.Library()


@register.filter(name='trust_score_zone_class')
def trust_score_zone_class(score):
    """Badge color class from trust score (same bands as profile Trust rating)."""
    try:
        s = float(score)
    except (TypeError, ValueError):
        return 'badge_muted'
    if s >= 8:
        return 'badge_success'
    if s >= 5:
        return 'badge_muted'
    if s >= 3:
        return 'badge_warning'
    return 'rating_badge_danger'


@register.filter(name='user_shadow_banned')
def user_shadow_banned(user):
    """True when score < 3: block comments and reply."""
    if not user or not user.is_authenticated or getattr(user, 'is_superuser', False):
        return False
    try:
        return getattr(user.profile, 'shadow_banned', False)
    except Exception:
        return False


@register.filter(name='user_cannot_create_post')
def user_cannot_create_post(user):
    """True when score < 5: block Create post (but allow comments if score >= 3)."""
    if not user or not user.is_authenticated or getattr(user, 'is_superuser', False):
        return False
    try:
        return not getattr(user.profile, 'can_post', True)
    except Exception:
        return False
@register.filter(name='excerpt_plain')
def excerpt_plain(value, num=500):
    if value is None:
        return ''
    # Удаляем HTML
    text = strip_tags(value)
    # заменяем NBSP на обычный пробел
    text = text.replace('\xa0', ' ').replace('&nbsp;', ' ')
    # аккуратно обрезаем
    return Truncator(text).chars(int(num), truncate=' …')


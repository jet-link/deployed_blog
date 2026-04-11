// Video gallery: Plyr-powered viewer with carousel for multiple videos.
(function () {
    'use strict';

    var overlay = null;
    var plyrInstance = null;
    var currentSlides = [];
    var curIndex = 0;
    var lastOrientation = '';

    function qs(sel, ctx) { return (ctx || document).querySelector(sel); }

    function ensureOverlay() {
        if (overlay) return;
        overlay = document.createElement('div');
        overlay.className = 'video-gallery-overlay';
        overlay.innerHTML =
            '<button type="button" class="vgzone vgzone--prev" aria-label="Previous"><span class="vgzone__arrow"><i class="fa fa-angle-left"></i></span></button>' +
            '<div class="video-gallery-overlay-inner vg-landscape" role="dialog" aria-modal="true" aria-label="Video viewer">' +
            '<video class="video-gallery-player" playsinline></video>' +
            '</div>' +
            '<button type="button" class="vgzone vgzone--next" aria-label="Next"><span class="vgzone__arrow"><i class="fa fa-angle-right"></i></span></button>' +
            '<span class="vgcount" aria-live="polite"></span>' +
            '<button type="button" class="video-gallery-close" aria-label="Close"><i class="fa fa-times"></i></button>';
        document.body.appendChild(overlay);

        var prevBtn = qs('.vgzone--prev', overlay);
        var nextBtn = qs('.vgzone--next', overlay);
        var closeBtn = qs('.video-gallery-close', overlay);

        prevBtn.addEventListener('click', function (e) { e.stopPropagation(); nav(-1); });
        nextBtn.addEventListener('click', function (e) { e.stopPropagation(); nav(1); });
        closeBtn.addEventListener('click', function (e) { e.stopPropagation(); hideOverlay(); });

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay || e.target.classList.contains('video-gallery-overlay-inner')) {
                hideOverlay();
            }
        });

        document.addEventListener('keydown', function (e) {
            if (!overlay || !overlay.classList.contains('is-visible')) return;
            if (e.key === 'Escape') { e.preventDefault(); hideOverlay(); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); nav(-1); }
            if (e.key === 'ArrowRight') { e.preventDefault(); nav(1); }
        });

        var videoEl = qs('.video-gallery-player', overlay);
        try {
            plyrInstance = new Plyr(videoEl, {
                controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'fullscreen'],
                settings: ['captions', 'speed'],
                speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
                captions: { active: false, language: 'auto', update: false },
                resetOnEnd: true,
                clickToPlay: true,
                hideControls: true,
                tooltips: { controls: false, seek: true },
            });
        } catch (err) {
            // Plyr not loaded — will use plain HTML5 video
        }
    }

    function applyOrientation(videoEl) {
        var inner = qs('.video-gallery-overlay-inner', overlay);
        if (!inner) return;
        var vw = videoEl.videoWidth || 0;
        var vh = videoEl.videoHeight || 0;
        var orient = (vh > vw) ? 'vg-portrait' : 'vg-landscape';

        if (orient !== lastOrientation) {
            inner.classList.remove('vg-landscape', 'vg-portrait');
            inner.classList.add(orient);
            lastOrientation = orient;
        }

        var fsBtn = overlay.querySelector('.plyr__control[data-plyr="fullscreen"]');
        if (fsBtn) fsBtn.style.display = (orient === 'vg-portrait') ? 'none' : '';
    }

    function showCurrent() {
        var s = currentSlides[curIndex];
        if (!s) return;
        var videoEl = qs('.video-gallery-player', overlay);
        var countEl = qs('.vgcount', overlay);
        var prevBtn = qs('.vgzone--prev', overlay);
        var nextBtn = qs('.vgzone--next', overlay);
        var inner = qs('.video-gallery-overlay-inner', overlay);

        if (plyrInstance && plyrInstance.pause) {
            try { plyrInstance.pause(); } catch (e) {}
        }

        inner.style.opacity = '0';

        videoEl.onloadedmetadata = null;
        videoEl.onloadedmetadata = function () {
            applyOrientation(videoEl);
            inner.style.opacity = '';
        };

        videoEl.src = s.src;
        videoEl.load();

        countEl.textContent = (curIndex + 1) + ' / ' + currentSlides.length;

        var showArrows = currentSlides.length > 1;
        prevBtn.style.display = showArrows ? '' : 'none';
        nextBtn.style.display = showArrows ? '' : 'none';
    }

    function nav(dir) {
        if (currentSlides.length <= 1) return;
        curIndex = (curIndex + dir + currentSlides.length) % currentSlides.length;
        showCurrent();
    }

    function hideOverlay() {
        if (!overlay) return;
        if (plyrInstance && plyrInstance.pause) {
            try { plyrInstance.pause(); } catch (e) {}
        }
        var videoEl = qs('.video-gallery-player', overlay);
        if (videoEl) { videoEl.removeAttribute('src'); videoEl.load(); }
        overlay.classList.remove('is-visible');
        lastOrientation = '';
        if (typeof window.unlockScroll === 'function') window.unlockScroll();
    }

    window.__videoGallery_openAt = function (index, slides) {
        ensureOverlay();
        currentSlides = (Array.isArray(slides) ? slides : []).map(function (s) {
            if (typeof s === 'string') return { src: s };
            return { src: s.src || s.url || '' };
        }).filter(function (s) { return Boolean(s.src); });
        if (!currentSlides.length) return;
        curIndex = Math.max(0, Math.min(Number(index) || 0, currentSlides.length - 1));
        lastOrientation = '';
        overlay.classList.add('is-visible');
        if (typeof window.lockScroll === 'function') window.lockScroll();
        showCurrent();
    };

    window.__videoGallery_close = hideOverlay;

    document.addEventListener('DOMContentLoaded', function () {
        if (typeof Plyr === 'undefined') return;
        document.querySelectorAll('.js-plyr-inline').forEach(function (el) {
            new Plyr(el, {
                controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'fullscreen'],
                settings: ['captions', 'speed'],
                speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
                captions: { active: false, language: 'auto', update: false },
                resetOnEnd: true,
                hideControls: true,
                tooltips: { controls: false, seek: true },
            });
        });
    });
})();

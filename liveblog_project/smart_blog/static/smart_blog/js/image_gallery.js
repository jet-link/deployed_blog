// static/js/gallery.js  (оптимизированный)
(function () {
    'use strict';
    function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
    function qsa(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

    document.addEventListener('DOMContentLoaded', function () {
        qsa('.js-gallery').forEach(initGallery);
    });

    function initGallery(galleryRoot) {
        const imgs = qsa('.gallery-img', galleryRoot);
        ensureOverlay();

        // Setup lazy loading for thumbnails via IntersectionObserver (lightweight)
        setupThumbLazyObserver(imgs);

        imgs.forEach((img, i) => {
            if (!img.dataset.index) img.dataset.index = i;
            img.addEventListener('click', function (e) {
                e.preventDefault();
                const idx = Number(img.dataset.index || 0);
                openOverlayAt(idx, galleryRoot);
            });
            img.style.cursor = 'pointer';
            // hint to browser: set low priority for thumbs that are offscreen
            img.fetchPriority = 'low';
        });
    }

    // ---------- IntersectionObserver for thumbnails ----------
    function setupThumbLazyObserver(imgNodes) {
        if (!('IntersectionObserver' in window)) {
            // fallback: images already have src (server provided)
            return;
        }
        const io = new IntersectionObserver((entries, obs) => {
            entries.forEach(ent => {
                if (ent.isIntersecting) {
                    const img = ent.target;
                    const src = img.dataset.src || img.src;
                    if (src && img.src !== src) {
                        img.src = src;
                    }
                    // optionally set srcset if present: img.srcset = img.dataset.srcset || '';
                    obs.unobserve(img);
                }
            });
        }, { rootMargin: '200px 0px', threshold: 0.01 });

        imgNodes.forEach(img => {
            // if image already has loaded src we don't need to observe
            if (img.src && img.complete && img.naturalWidth) return;
            io.observe(img);
        });
    }

    // ---------- Overlay (single instance) ----------
    function ensureOverlay() {
        if (qs('.gallery-overlay')) return;

        const overlay = document.createElement('div');
        overlay.className = 'gallery-overlay';
        overlay.innerHTML = `
      <button type="button" class="gclose" aria-label="Close">&times;</button>
      <button type="button" class="gzone gzone--prev" aria-label="Previous">
        <span class="gzone__arrow" aria-hidden="true"><i class="fa fa-angle-left"></i></span>
      </button>
      <div class="gallery-overlay-inner" role="dialog" aria-modal="true">
        <img src="" alt="" class="gallery-overlay-img" tabindex="-1" loading="lazy" decoding="async" />
      </div>
      <button type="button" class="gzone gzone--next" aria-label="Next">
        <span class="gzone__arrow" aria-hidden="true"><i class="fa fa-angle-right"></i></span>
      </button>
    `;
        document.body.appendChild(overlay);

        const imgEl = qs('.gallery-overlay-img', overlay);
        const closeBtn = qs('.gclose', overlay);
        const prevBtn = qs('.gzone--prev', overlay);
        const nextBtn = qs('.gzone--next', overlay);

        let curIndex = 0;
        let currentSrcs = [];
        let autoplayTimer = null;
        const AUTOPLAY_INTERVAL = 4500;

        function startAutoplayIfNeeded() {
            clearAutoplay();
            if (currentSrcs.length >= 3) {
                autoplayTimer = setInterval(() => { nav(1); }, AUTOPLAY_INTERVAL);
            }
        }
        function clearAutoplay() { if (autoplayTimer) { clearInterval(autoplayTimer); autoplayTimer = null; } }

        function preloadAdjacent() {
            var n = currentSrcs.length;
            if (!n) return;
            var prevIdx = (curIndex - 1 + n) % n, nextIdx = (curIndex + 1) % n;
            var prevSrc = currentSrcs[prevIdx], nextSrc = currentSrcs[nextIdx];
            if (prevSrc) { var i = new Image(); i.src = prevSrc; }
            if (nextSrc && nextIdx !== prevIdx) { var j = new Image(); j.src = nextSrc; }
        }

        function nav(dir) {
            if (!currentSrcs.length) return;
            imgEl.classList.add('gallery-overlay-loading');
            var nextIdx = (curIndex + dir + currentSrcs.length) % currentSrcs.length;
            curIndex = nextIdx;
            var src = currentSrcs[curIndex];
            requestAnimationFrame(function () {
                imgEl.onload = function () { imgEl.classList.remove('gallery-overlay-loading'); };
                imgEl.src = src;
                if (imgEl.complete && imgEl.naturalWidth) {
                    imgEl.classList.remove('gallery-overlay-loading');
                }
                preloadAdjacent();
            });
        }

        function hideOverlay() {
            overlay.classList.remove('is-visible');
            clearAutoplay();
            unlockScroll();
            imgEl.src = '';
            currentSrcs = [];
        }

        closeBtn.addEventListener('click', function (e) { e.stopPropagation(); hideOverlay(); });
        prevBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); nav(-1); clearAutoplay(); }, { passive: false });
        nextBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); nav(1); clearAutoplay(); }, { passive: false });

        document.addEventListener('keydown', function (e) {
            if (!overlay.classList.contains('is-visible')) return;
            clearAutoplay();
            if (e.key === 'Escape') { e.preventDefault(); hideOverlay(); return; }
            if (e.key === 'ArrowLeft') { e.preventDefault(); nav(-1); return; }
            if (e.key === 'ArrowRight') { e.preventDefault(); nav(1); return; }
        });

        // Close when tapping the dimmed backdrop: inside overlay, but not on the image,
        // side nav zones, or close button (on narrow screens close is hidden — backdrop tap closes).
        function onPointerDownBackdrop(e) {
            if (!overlay.classList.contains('is-visible')) return;
            if (!overlay.contains(e.target)) return;
            if (e.target.closest && e.target.closest('.gallery-overlay-img')) return;
            if (e.target.closest && e.target.closest('.gzone')) return;
            if (e.target.closest && e.target.closest('.gclose')) return;
            hideOverlay();
        }
        // use capture phase to detect touches/mouse early
        document.addEventListener('pointerdown', onPointerDownBackdrop, true);

        window.__gallery_openAt = function (index, allSrcs) {
            currentSrcs = Array.isArray(allSrcs) ? allSrcs.slice() : [];
            if (!currentSrcs.length) return;
            curIndex = Math.max(0, Math.min(index || 0, currentSrcs.length - 1));
            imgEl.src = currentSrcs[curIndex];

            overlay.classList.add('is-visible');
            lockScroll();
            preloadAdjacent();
            startAutoplayIfNeeded();
            try {
                const cs = window.getComputedStyle(closeBtn);
                if (cs.display !== 'none' && cs.visibility !== 'hidden') {
                    closeBtn.focus();
                } else {
                    imgEl.focus();
                }
            } catch (err) { }
        };

        window.__gallery_close = hideOverlay;
    }

    function openOverlayAt(index, galleryRoot) {
        const nodes = Array.from(galleryRoot.querySelectorAll('.gallery-img, .gallery-slide-img, .gallery-slide[data-src]'));
        const srcs = [];
        nodes.forEach(n => {
            const s = n.dataset.full || n.dataset.src || n.src;
            if (s && !srcs.includes(s)) srcs.push(s);
        });

        if (typeof window.__gallery_openAt === 'function') {
            window.__gallery_openAt(index || 0, srcs);
        }
    }
})();



// === Подстройка поведения "занять оставшиеся колонки" (обновлённая версия) ===
(function () {
    'use strict';

    function debounce(fn, wait) {
        let t = null;
        return function () {
            const args = arguments;
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    // Получить число колонок текущего grid (кол-во треков в grid-template-columns)
    function getGridColumnCount(grid) {
        const cs = window.getComputedStyle(grid);
        const cols = cs.getPropertyValue('grid-template-columns') || '';
        if (!cols.trim()) return 1;
        // chromium/ff обычно возвращают "1fr 1fr 1fr" — считаем количество токенов
        const parts = cols.trim().replace(/\s+/g, ' ').split(' ');
        return parts.length;
    }

    // распределить целочисленные span'ы между lastRowCount элементами так, чтобы сумма = cols
    // возвращает массив span для каждого элемента (в порядке слева направо)
    function distributeSpans(cols, lastRowCount) {
        const base = Math.floor(cols / lastRowCount);
        let rem = cols - base * lastRowCount;
        const spans = [];
        for (let i = 0; i < lastRowCount; i++) {
            const extra = (rem > 0) ? 1 : 0;
            spans.push(base + extra);
            if (rem > 0) rem--;
        }
        return spans;
    }

    function gridItemsForAdjust(grid) {
        if (grid.classList.contains('item-feed-card__thumb-grid')) {
            return Array.from(grid.querySelectorAll('.item-feed-card__thumb-slot'));
        }
        return Array.from(grid.querySelectorAll('.gallery-cell'));
    }

    // main adjuster for one grid
    function adjustLastRowSpan(grid) {
        if (!grid) return;
        const items = gridItemsForAdjust(grid);
        if (!items.length) return;

        // clear previous inline gridColumn from ALL items to keep consistent state
        items.forEach(it => {
            it.style.gridColumn = '';
        });

        const isFeedThumb = grid.classList.contains('item-feed-card__thumb-grid');
        // detail page gallery: 2 tiles → две колонки (класс переопределяет grid)
        if (!isFeedThumb && items.length === 2) {
            grid.classList.add('gallery-two-cols');
        } else if (!isFeedThumb) {
            grid.classList.remove('gallery-two-cols');
        }

        // compute current columns (after possible class change)
        const cols = getGridColumnCount(grid) || 1;

        // если cols === 1 — ничего не делаем
        if (cols <= 1) return;

        const lastRowCount = items.length % cols === 0 ? cols : items.length % cols;

        // если последняя строка полная — ничего делать не нужно
        if (lastRowCount === cols) return;

        // если в последнем ряду меньше cols — распределим колонки между этими элементами
        const startIndex = items.length - lastRowCount;
        const spans = distributeSpans(cols, lastRowCount); // сумма spans == cols

        // применяем spans к элементам последнего ряда (по порядку)
        for (let i = 0; i < lastRowCount; i++) {
            const it = items[startIndex + i];
            const span = Math.max(1, spans[i] || 1);
            // если span === 1 — очищаем, иначе ставим span
            if (span === 1) it.style.gridColumn = '';
            else it.style.gridColumn = `span ${span}`;
        }
    }

    function adjustAllGrids() {
        const grids = Array.from(document.querySelectorAll('.gallery-grid, .item-feed-card__thumb-grid'));
        grids.forEach(grid => {
            try {
                adjustLastRowSpan(grid);
            } catch (err) {
                console.error('adjustLastRowSpan error', err);
            }
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        // небольшой отложенный вызов, чтобы всё CSS успело примениться
        setTimeout(adjustAllGrids, 60);
    });

    window.addEventListener('resize', debounce(function () {
        adjustAllGrids();
    }, 120));

    // Экспортируем функцию для ручного вызова (на случай AJAX)
    window.__gallery_adjustLastRow = adjustAllGrids;
})();
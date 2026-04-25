/**
 * Pinned PDF modal: PDF.js viewer that lives in the parent document so Escape always closes the modal.
 * - Renders pages at devicePixelRatio for sharp output on mobile / HiDPI.
 * - Prev/Next scroll the internal scroll container and keep the page label in sync.
 * - Current page tracked with IntersectionObserver so label updates during scroll.
 */
(function () {
    'use strict';

    var PDF_WORKER_SRC =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

    function debounce(fn, ms) {
        var t;
        return function () {
            clearTimeout(t);
            var self = this;
            var args = arguments;
            t = setTimeout(function () {
                fn.apply(self, args);
            }, ms);
        };
    }

    function bindModalEscape() {
        var modal = document.getElementById('itemPinnedFileModal');
        if (!modal || modal.dataset.itemPinnedEscapeBound === '1') {
            return;
        }
        modal.dataset.itemPinnedEscapeBound = '1';
        document.addEventListener(
            'keydown',
            function (e) {
                if (e.key !== 'Escape') {
                    return;
                }
                if (!modal.classList.contains('show')) {
                    return;
                }
                if (typeof bootstrap === 'undefined' || !bootstrap.Modal) {
                    return;
                }
                var inst = bootstrap.Modal.getInstance(modal);
                if (inst) {
                    inst.hide();
                }
            },
            true
        );
    }

    function scrollPageIntoView(scrollEl, pageEl) {
        if (!scrollEl || !pageEl) {
            return;
        }
        var containerTop = scrollEl.getBoundingClientRect().top;
        var pageTop = pageEl.getBoundingClientRect().top;
        var delta = pageTop - containerTop;
        scrollEl.scrollTo({
            top: scrollEl.scrollTop + delta,
            behavior: 'smooth',
        });
    }

    function createPdfController(host, pdf) {
        var scrollEl = host.querySelector('[data-pdf-scroll]');
        var inner = host.querySelector('[data-pdf-pages]');
        var pageLabelEl = host.querySelector('[data-pdf-page-label]');
        var zoomEl = host.querySelector('[data-pdf-zoom-pct]');
        var prevBtn = host.querySelector('[data-pdf-prev]');
        var nextBtn = host.querySelector('[data-pdf-next]');
        var zoomInBtn = host.querySelector('[data-pdf-zoom-in]');
        var zoomOutBtn = host.querySelector('[data-pdf-zoom-out]');

        var pages = [];
        var userScale = 1;
        var currentIndex = 0;
        var observer = null;
        var redrawing = false;

        function clampScale(s) {
            return Math.min(3, Math.max(0.5, s));
        }

        function updateLabel() {
            if (!pages.length) {
                return;
            }
            pageLabelEl.textContent = (currentIndex + 1) + ' / ' + pdf.numPages;
        }

        function setCurrentIndex(i) {
            var next = Math.max(0, Math.min(i, pages.length - 1));
            if (next === currentIndex) {
                return;
            }
            currentIndex = next;
            updateLabel();
        }

        function resetObserver() {
            if (observer) {
                observer.disconnect();
                observer = null;
            }
            if (!pages.length || !('IntersectionObserver' in window)) {
                return;
            }
            observer = new IntersectionObserver(
                function (entries) {
                    var best = null;
                    entries.forEach(function (ent) {
                        if (!ent.isIntersecting) {
                            return;
                        }
                        if (!best || ent.intersectionRatio > best.intersectionRatio) {
                            best = ent;
                        }
                    });
                    if (best) {
                        var idx = pages.indexOf(best.target);
                        if (idx !== -1) {
                            setCurrentIndex(idx);
                        }
                    }
                },
                {
                    root: scrollEl,
                    threshold: [0.1, 0.5, 0.9],
                }
            );
            pages.forEach(function (el) {
                observer.observe(el);
            });
        }

        async function renderAll() {
            if (redrawing) {
                return;
            }
            redrawing = true;
            try {
                inner.innerHTML = '';
                pages = [];

                var dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
                var pad = 16;
                var available = Math.max(220, scrollEl.clientWidth - pad * 2);

                for (var p = 1; p <= pdf.numPages; p++) {
                    var page = await pdf.getPage(p);
                    var baseVp = page.getViewport({ scale: 1 });
                    var fit = available / baseVp.width;
                    var cssScale = fit * userScale;
                    var viewport = page.getViewport({ scale: cssScale * dpr });

                    var wCss = Math.floor(viewport.width / dpr);
                    var hCss = Math.floor(viewport.height / dpr);

                    var wrap = document.createElement('div');
                    wrap.className = 'item-pinned-pdfjs__page';
                    wrap.style.width = wCss + 'px';
                    wrap.style.height = hCss + 'px';

                    var canvas = document.createElement('canvas');
                    canvas.width = Math.floor(viewport.width);
                    canvas.height = Math.floor(viewport.height);
                    canvas.style.width = wCss + 'px';
                    canvas.style.height = hCss + 'px';
                    canvas.style.display = 'block';
                    canvas.style.background = '#fff';

                    wrap.appendChild(canvas);
                    inner.appendChild(wrap);
                    pages.push(wrap);

                    var ctx = canvas.getContext('2d', { alpha: false });
                    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                }

                zoomEl.textContent = Math.round(userScale * 100) + '%';
                currentIndex = Math.min(currentIndex, pages.length - 1);
                updateLabel();
                resetObserver();
            } finally {
                redrawing = false;
            }
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', function () {
                if (!pages.length) {
                    return;
                }
                var target = Math.max(0, currentIndex - 1);
                setCurrentIndex(target);
                scrollPageIntoView(scrollEl, pages[target]);
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', function () {
                if (!pages.length) {
                    return;
                }
                var target = Math.min(pages.length - 1, currentIndex + 1);
                setCurrentIndex(target);
                scrollPageIntoView(scrollEl, pages[target]);
            });
        }
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', function () {
                var prev = userScale;
                userScale = clampScale(userScale * 1.15);
                if (userScale !== prev) {
                    renderAll();
                }
            });
        }
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', function () {
                var prev = userScale;
                userScale = clampScale(userScale / 1.15);
                if (userScale !== prev) {
                    renderAll();
                }
            });
        }

        var onResize = debounce(function () {
            renderAll();
        }, 200);
        window.addEventListener('resize', onResize);

        return { render: renderAll };
    }

    async function bootPdf(host) {
        var url = host.getAttribute('data-pdf-url');
        if (!url) {
            return;
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
        var task = pdfjsLib.getDocument({ url: url, withCredentials: true });
        var pdf = await task.promise;
        var controller = createPdfController(host, pdf);
        await controller.render();
    }

    function showError(host, msg) {
        var inner = host.querySelector('[data-pdf-pages]');
        if (inner) {
            inner.innerHTML =
                '<p class="text-danger p-3 mb-0 small item-pinned-pdfjs__err">' + msg + '</p>';
        }
    }

    bindModalEscape();

    var modal = document.getElementById('itemPinnedFileModal');
    var host = document.querySelector('.item-pinned-pdfjs');
    if (modal && host) {
        var started = false;
        modal.addEventListener('shown.bs.modal', function () {
            if (started) {
                return;
            }
            started = true;
            if (typeof pdfjsLib === 'undefined') {
                showError(host, 'PDF viewer failed to load.');
                return;
            }
            bootPdf(host).catch(function (err) {
                console.error(err);
                showError(host, 'PDF could not be displayed.');
            });
        });
    }
})();

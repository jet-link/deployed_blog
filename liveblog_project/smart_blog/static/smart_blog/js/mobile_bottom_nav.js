/**
 * Mobile bottom nav: Discover + Account popovers, Turbo sync for the
 * data-turbo-permanent #mobileBottomNav bar.
 *
 * Idempotency: guarded by nav.__mbnav_initialized so Turbo body-swaps
 * cannot add duplicate listeners even if the script is re-evaluated.
 */
(function () {
    'use strict';

    var nav = document.getElementById('mobileBottomNav');
    if (!nav) return;
    if (nav.__mbnav_initialized) return;
    nav.__mbnav_initialized = true;

    /* ── DOM refs (persist across Turbo because #mobileBottomNav is permanent) ── */
    var btnDiscover   = document.getElementById('mobileNavDiscoverBtn');
    var panelDiscover = document.getElementById('mobileNavDiscoverPopover');
    var btnMore       = document.getElementById('mobileNavMoreBtn');
    var panelAccount  = document.getElementById('mobileNavAccountPopover');
    var scrollHost    = nav.querySelector('.mobile-bottom-nav__scroll');

    /* ── Helpers ── */
    function cssEsc(s) {
        if (typeof s !== 'string') return '';
        return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    function preserveScrollHost(cb) {
        var prev = scrollHost ? scrollHost.scrollLeft : 0;
        try {
            if (typeof cb === 'function') cb();
        } finally {
            if (scrollHost && typeof prev === 'number') {
                scrollHost.scrollLeft = prev;
                requestAnimationFrame(function () {
                    scrollHost.scrollLeft = prev;
                    requestAnimationFrame(function () { scrollHost.scrollLeft = prev; });
                });
            }
        }
    }

    function retreatFocus(panel, fallback) {
        if (!panel) return;
        preserveScrollHost(function () {
            try {
                var ae = document.activeElement;
                if (ae && panel.contains(ae)) {
                    if (fallback && typeof fallback.focus === 'function') {
                        fallback.focus({ preventScroll: true });
                    } else {
                        ae.blur();
                    }
                }
            } catch (_) {}
        });
    }

    /**
     * Turbo Drive preserves focus inside [data-turbo-permanent] across page swaps and
     * re-focuses that node after render (Bardo leavingBardo). If the user clicked
     * For you / Topics, the popover <a> can become activeElement again and flash
     * focus rings / scroll the tab strip — keep focus on the Discover control instead.
     */
    function pinDiscoverBarFocusIfPopoverLinkFocused() {
        if (!btnDiscover || !panelDiscover) return;
        var ae = document.activeElement;
        if (!ae || !panelDiscover.contains(ae) || ae === btnDiscover) return;
        if (!(ae instanceof HTMLElement)) return;
        if (!ae.closest || !ae.closest('a[href]')) return;
        preserveScrollHost(function () {
            try { btnDiscover.focus({ preventScroll: true }); } catch (_) {}
        });
    }

    /* ── Turbo: sync active states from incoming page ── */
    function syncFromNewBody(newBody) {
        if (!newBody || !newBody.querySelector) return;
        var src = newBody.querySelector('#mobileBottomNav');
        if (!src) return;

        nav.className = src.className;
        if (src.hasAttribute('inert')) { nav.setAttribute('inert', ''); } else { nav.removeAttribute('inert'); }
        var ah = src.getAttribute('aria-hidden');
        if (ah != null) { nav.setAttribute('aria-hidden', ah); } else { nav.removeAttribute('aria-hidden'); }

        var srcTrack = src.querySelector('.mobile-bottom-nav__track');
        var liveTrack = nav.querySelector('.mobile-bottom-nav__track');
        if (srcTrack && liveTrack) {
            var links = srcTrack.querySelectorAll('a.mobile-bottom-nav__link[href]');
            for (var i = 0; i < links.length; i++) {
                var href = links[i].getAttribute('href') || '';
                var live = liveTrack.querySelector('a.mobile-bottom-nav__link[href="' + cssEsc(href) + '"]');
                if (live) live.className = links[i].className;
            }
            var sd = srcTrack.querySelector('#mobileNavDiscoverBtn');
            var ld = liveTrack.querySelector('#mobileNavDiscoverBtn');
            if (sd && ld) ld.className = sd.className;
            var sm = srcTrack.querySelector('#mobileNavMoreBtn');
            var lm = liveTrack.querySelector('#mobileNavMoreBtn');
            if (sm && lm) lm.className = sm.className;
        }

        function syncRows(sp, lp) {
            if (!sp || !lp) return;
            var rows = sp.querySelectorAll('a[href]');
            for (var j = 0; j < rows.length; j++) {
                var h = rows[j].getAttribute('href') || '';
                if (!h || h === '#') continue;
                var lr = lp.querySelector('a[href="' + cssEsc(h) + '"]');
                if (lr) {
                    lr.className = rows[j].className;
                    if (rows[j].hasAttribute('data-notifications-count')) {
                        lr.setAttribute('data-notifications-count', rows[j].getAttribute('data-notifications-count'));
                    } else {
                        lr.removeAttribute('data-notifications-count');
                    }
                }
            }
        }
        syncRows(src.querySelector('#mobileNavDiscoverPopover'), panelDiscover);
        syncRows(src.querySelector('#mobileNavAccountPopover'), panelAccount);

        pinDiscoverBarFocusIfPopoverLinkFocused();
    }

    var root = document.documentElement;
    root.addEventListener('turbo:before-render', function (ev) {
        var d = ev.detail || {};
        if (d.newBody) syncFromNewBody(d.newBody);
    });
    root.addEventListener('turbo:render', function () {
        pinDiscoverBarFocusIfPopoverLinkFocused();
    });
    root.addEventListener('turbo:load', function () {
        pinDiscoverBarFocusIfPopoverLinkFocused();
    });
    root.addEventListener('turbo:before-visit', function () {
        retreatFocus(panelDiscover, btnDiscover);
        retreatFocus(panelAccount, btnMore);
        closeAll();
        pinDiscoverBarFocusIfPopoverLinkFocused();
    });

    /* ── Popover positioning ── */
    var repositionBound = false;

    function position(anchor, panel) {
        if (!anchor || !panel || !panel.classList.contains('is-open')) return;
        var r = anchor.getBoundingClientRect();
        var w = panel.offsetWidth;
        var h = panel.offsetHeight;
        if (w < 8 || h < 8) {
            requestAnimationFrame(function () { requestAnimationFrame(function () { position(anchor, panel); }); });
            return;
        }
        var pad = 6;
        var left = Math.max(pad, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - pad));
        /* Gap between popover bottom and anchor top; 0 = flush above the tab (caret bridges to Discover / More). */
        var gapAboveAnchor = -5;
        var top = r.top - h - gapAboveAnchor;
        if (top < pad) top = pad;
        panel.style.left = left + 'px';
        panel.style.top  = top  + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.setProperty('--popover-caret-x', (r.left + r.width / 2 - left) + 'px');
    }

    function reposition() {
        if (panelDiscover && panelDiscover.classList.contains('is-open') && btnDiscover) position(btnDiscover, panelDiscover);
        if (panelAccount  && panelAccount.classList.contains('is-open')  && btnMore)       position(btnMore, panelAccount);
    }

    function bindReposition() {
        if (repositionBound) return;
        repositionBound = true;
        window.addEventListener('resize', reposition, { passive: true });
        window.addEventListener('scroll', reposition, { passive: true, capture: true });
        if (scrollHost) scrollHost.addEventListener('scroll', reposition, { passive: true });
    }

    function unbindReposition() {
        if (!repositionBound) return;
        repositionBound = false;
        window.removeEventListener('resize', reposition);
        window.removeEventListener('scroll', reposition, { capture: true });
        if (scrollHost) scrollHost.removeEventListener('scroll', reposition);
    }

    /* ── Open / close logic ── */
    function isOpen(panel) { return panel && panel.classList.contains('is-open'); }
    function anyOpen()     { return isOpen(panelDiscover) || isOpen(panelAccount); }

    function setOpen(btn, panel, open) {
        if (!btn || !panel) return;
        if (!open) retreatFocus(panel, btn);
        panel.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', String(open));
        panel.setAttribute('aria-hidden', String(!open));
        if (open) {
            bindReposition();
            requestAnimationFrame(function () { requestAnimationFrame(function () { position(btn, panel); }); });
        } else if (!anyOpen()) {
            unbindReposition();
        }
    }

    function openDiscover()  { if (isOpen(panelAccount))  setOpen(btnMore, panelAccount, false); setOpen(btnDiscover, panelDiscover, true);  }
    function closeDiscover() { setOpen(btnDiscover, panelDiscover, false); }
    function openAccount()   { if (isOpen(panelDiscover)) setOpen(btnDiscover, panelDiscover, false); setOpen(btnMore, panelAccount, true);   }
    function closeAccount()  { setOpen(btnMore, panelAccount, false); }

    function closeAll() {
        if (panelDiscover) { retreatFocus(panelDiscover, btnDiscover); panelDiscover.classList.remove('is-open'); if (btnDiscover) btnDiscover.setAttribute('aria-expanded', 'false'); panelDiscover.setAttribute('aria-hidden', 'true'); }
        if (panelAccount)  { retreatFocus(panelAccount, btnMore);     panelAccount.classList.remove('is-open');  if (btnMore)     btnMore.setAttribute('aria-expanded', 'false');     panelAccount.setAttribute('aria-hidden', 'true');  }
        unbindReposition();
    }

    /* ── Event wiring ── */

    function wirePopover(btn, panel, openFn, closeFn) {
        if (!btn || !panel) return;

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            isOpen(panel) ? closeFn() : openFn();
        });

        panel.addEventListener('click', function (e) {
            var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
            if (a && a.getAttribute('href') && a.getAttribute('href').charAt(0) !== '#') closeFn();
        });
    }

    wirePopover(btnDiscover, panelDiscover, openDiscover, closeDiscover);
    wirePopover(btnMore,     panelAccount,  openAccount,  closeAccount);

    /* Close on outside click */
    document.addEventListener('click', function (e) {
        if (!anyOpen()) return;
        var t = e.target;
        if (btnDiscover && (btnDiscover.contains(t) || (panelDiscover && panelDiscover.contains(t)))) return;
        if (btnMore     && (btnMore.contains(t)     || (panelAccount  && panelAccount.contains(t))))  return;
        closeAll();
    });

    /* Close on Escape */
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        if (isOpen(panelDiscover)) { e.preventDefault(); closeDiscover(); if (btnDiscover) btnDiscover.focus(); return; }
        if (isOpen(panelAccount))  { e.preventDefault(); closeAccount();  if (btnMore)     btnMore.focus(); }
    });

    /* Close on wheel/touchmove outside the popovers */
    function closeOnScroll(e) {
        if (!anyOpen()) return;
        var t = e.target;
        if (btnDiscover && (btnDiscover.contains(t) || (panelDiscover && panelDiscover.contains(t)))) return;
        if (btnMore     && (btnMore.contains(t)     || (panelAccount  && panelAccount.contains(t))))  return;
        closeAll();
    }
    document.addEventListener('wheel',     closeOnScroll, { passive: true, capture: true });
    document.addEventListener('touchmove', closeOnScroll, { passive: true, capture: true });

    /* Close on click anywhere inside nav that isn't a popover trigger */
    nav.addEventListener('click', function (e) {
        if (!anyOpen()) return;
        var t = e.target;
        if (btnDiscover && (btnDiscover.contains(t) || (panelDiscover && panelDiscover.contains(t)))) return;
        if (btnMore     && (btnMore.contains(t)     || (panelAccount  && panelAccount.contains(t))))  return;
        closeAll();
    }, true);

    /* ── Public API (used by signout_modal.js etc.) ── */
    window.__closeMobileAccountPopover    = function () { if (isOpen(panelAccount)) closeAccount(); };
    window.__closeMobileNavPopovers       = closeAll;
    window.__runMobileBottomNavTabStripReset = function () {};
})();

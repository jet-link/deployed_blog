(function () {
    'use strict';

    const ROOT = typeof document !== 'undefined' ? document.documentElement : null;

    function show() {
        var el = document.getElementById('brainPreloader');
        if (!el) return;
        el.classList.remove('hidden');
        el.setAttribute('aria-busy', 'true');
        if (ROOT) {
            ROOT.classList.add('brain-preloader-active');
        }
    }

    function hide() {
        var el = document.getElementById('brainPreloader');
        if (!el) return;
        el.classList.add('hidden');
        el.removeAttribute('aria-busy');
        if (ROOT) {
            ROOT.classList.remove('brain-preloader-active');
        }
    }

    function normPath(pathname) {
        var p = pathname || '';
        if (p.length > 1 && p.endsWith('/')) {
            return p.slice(0, -1);
        }
        return p || '/';
    }

    function isPublicationNav(url) {
        try {
            var u = url instanceof URL ? url : new URL(url, location.origin);
            if (u.origin !== location.origin) return false;
            var p = normPath(u.pathname);
            if (/^\/item\/[^/]+$/.test(p)) return true;
            if (/^\/item\/[^/]+\/comments$/.test(p)) return true;
            if (/^\/item\/[^/]+\/comment\/\d+\/thread$/.test(p)) return true;
            return false;
        } catch (e) {
            return false;
        }
    }

    function isTagNav(url) {
        try {
            var u = url instanceof URL ? url : new URL(url, location.origin);
            if (u.origin !== location.origin) return false;
            var p = normPath(u.pathname);
            return /^\/blog\/tag\/[^/]+$/.test(p);
        } catch (e) {
            return false;
        }
    }

    function searchOverlayOpen() {
        return ROOT && ROOT.classList.contains('search-overlay-open');
    }

    function onSearchPage() {
        return location.pathname === '/search' || location.pathname.startsWith('/search/');
    }

    /**
     * Listing / post / thread surfaces where opening a publication should show the preloader.
     * Excludes profile, accounts, static pages (about, etc.) so links from there stay unobtrusive.
     */
    function isContentPreloaderSourcePage() {
        var p = normPath(location.pathname);
        if (p === '/search' || p.startsWith('/search/')) return true;
        if (p === '/brainews' || p.startsWith('/brainews/')) return true;
        if (p === '/for-you' || p.startsWith('/for-you/')) return true;
        if (p === '/trending' || p.startsWith('/trending/')) return true;
        if (p === '/topics' || p.startsWith('/topics/')) return true;
        if (p.startsWith('/blog/tag/')) return true;
        if (p.startsWith('/blog/brainews/category/')) return true;
        if (p.startsWith('/blog/topics/')) return true;
        if (/^\/item\/[^/]+$/.test(p)) return true;
        if (/^\/item\/[^/]+\/comments$/.test(p)) return true;
        if (/^\/item\/[^/]+\/comment\/\d+\/thread$/.test(p)) return true;
        return false;
    }

    function shouldPreload(hrefUrl) {
        if (isTagNav(hrefUrl)) return true;
        if (isPublicationNav(hrefUrl) && (searchOverlayOpen() || onSearchPage() || isContentPreloaderSourcePage())) {
            return true;
        }
        return false;
    }

    document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a[href]');
        if (!a) return;
        if (e.defaultPrevented) return;
        if (e.button !== 0) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var href = a.getAttribute('href');
        if (!href || href.charAt(0) === '#') return;
        var url;
        try {
            url = new URL(a.href);
        } catch (err) {
            return;
        }
        if (url.origin !== location.origin) return;
        if (!shouldPreload(url)) return;
        e.preventDefault();
        show();
        window.location.assign(url.pathname + url.search + url.hash);
    }, true);

    window.addEventListener('pageshow', function (ev) {
        hide();
    });

    window.__brainPreloader = { show: show, hide: hide };
})();

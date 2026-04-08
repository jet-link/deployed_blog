// Open fullscreen search overlay from header search button (after search_operate init).
document.addEventListener('DOMContentLoaded', function () {
    'use strict';

    var searchBtn = document.querySelector('.header-actions .search-btn');
    if (!searchBtn) return;

    searchBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (typeof window.openSearchOverlay === 'function') {
            window.openSearchOverlay();
        } else {
            document.dispatchEvent(new CustomEvent('openSearchOverlay'));
        }
    });
});

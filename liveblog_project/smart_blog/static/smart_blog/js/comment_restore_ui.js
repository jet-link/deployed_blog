// static/js/comment_restore_ui.js
(function () {
    'use strict';

    function restoreCommentUI(root) {
        if (!root) return;

        // 🔄 re-init toggles (Show more / less)
        if (typeof window.initCommentToggles === 'function') {
            window.initCommentToggles(root);
        }

        // 🔄 re-init tooltips
        if (typeof window.initTooltips === 'function') {
            window.initTooltips(root);
        }

        // 🔄 autosize textarea if any
        root.querySelectorAll('textarea.auto-grow').forEach(ta => {
            const cs = getComputedStyle(ta);
            const minH = parseFloat(cs.minHeight) || 0;
            ta.style.height = 'auto';
            ta.style.height = Math.max(minH, ta.scrollHeight) + 'px';
        });
    }
    window.restoreCommentUI = restoreCommentUI;
})();
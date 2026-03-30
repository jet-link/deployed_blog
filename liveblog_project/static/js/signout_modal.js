/**
 * Sign out confirmation modal -- opens on .signout-trigger click,
 * confirms via POST form submit, cancels with Cancel or backdrop.
 */
(function() {
  'use strict';

  const modalEl = document.getElementById('signoutConfirmModal');
  if (!modalEl) return;

  document.querySelectorAll('.signout-trigger').forEach(function(trigger) {
    trigger.addEventListener('click', function(e) {
      e.preventDefault();
      var closeMenuBtn = document.getElementById('bottomMenuClose');
      var sideMenu = document.getElementById('bottomSideMenu');
      if (closeMenuBtn && sideMenu && sideMenu.classList.contains('open')) {
        closeMenuBtn.click();
      }
      if (typeof bootstrap !== 'undefined') {
        var showModal = function() {
          var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
          modal.show();
        };
        window.requestAnimationFrame(function() {
          window.setTimeout(showModal, 50);
        });
      }
    });
  });
})();

/**
 * Custom admin toolbar: auto-submit on change for select filters.
 * (Not named filters.js — that path is Django's changelist filter state script.)
 */
(function() {
  'use strict';

  document.querySelectorAll('.admin-toolbar select').forEach(function(select) {
    select.addEventListener('change', function() {
      var form = select.closest('form');
      if (form) form.submit();
    });
  });

})();

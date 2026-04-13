/**
 * Topics index: filter featured + all grids by category chip (client-side).
 * Legacy live text search markup is kept commented in topics_list.html if needed later.
 */
(function () {
  'use strict';

  function initTopicChipsFilter(nav) {
    var chips = nav.querySelectorAll('.topic-category-chip');
    var featuredRow = document.querySelector('.topics-featured-row');
    var grid = document.getElementById('topicsAllGrid');
    var featuredSec = document.getElementById('topicsFeaturedSection');
    var allSec = document.getElementById('topicsAllSection');
    var emptyMsg = document.getElementById('topicsFilterEmpty');

    function matchCol(col, slug) {
      var tile = col.querySelector('.topic-tile');
      if (!tile) return false;
      var tslug = tile.getAttribute('data-category-slug');
      if (slug === 'all') return true;
      return tslug === slug;
    }

    function applyFilter(slug) {
      var isAll = slug === 'all';
      var featVisible = 0;
      var allVisible = 0;

      if (featuredRow) {
        featuredRow.querySelectorAll(':scope > div').forEach(function (col) {
          var show = matchCol(col, slug);
          col.classList.toggle('d-none', !show);
          if (show) featVisible += 1;
        });
      }
      if (grid) {
        grid.querySelectorAll('.topics-grid-col').forEach(function (col) {
          var show = matchCol(col, slug);
          col.classList.toggle('d-none', !show);
          if (show) allVisible += 1;
        });
      }

      var total = featVisible + allVisible;

      if (emptyMsg) {
        emptyMsg.classList.toggle('d-none', total > 0);
      }

      if (featuredSec) {
        if (isAll) {
          featuredSec.classList.remove('d-none');
        } else {
          featuredSec.classList.toggle('d-none', featVisible === 0);
        }
      }
      if (allSec) {
        if (isAll) {
          allSec.classList.remove('d-none');
        } else {
          allSec.classList.toggle('d-none', allVisible === 0);
        }
      }

      var fh = document.getElementById('topicsFeaturedHeading');
      var ah = document.getElementById('topicsAllHeading');
      if (fh) {
        fh.classList.toggle('d-none', !isAll && featVisible === 0);
      }
      if (ah) {
        ah.classList.toggle('d-none', !isAll && allVisible === 0);
      }

      chips.forEach(function (btn) {
        var catSlug = btn.getAttribute('data-category-slug');
        var isAllBtn = btn.getAttribute('data-filter') === 'all';
        var selected = isAll ? isAllBtn : catSlug === slug;
        btn.classList.toggle('is-selected', selected);
        btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
    }

    nav.addEventListener('click', function (e) {
      var btn = e.target.closest('.topic-category-chip');
      if (!btn) return;
      e.preventDefault();
      var slug = btn.getAttribute('data-filter') === 'all' ? 'all' : btn.getAttribute('data-category-slug');
      if (!slug) return;
      applyFilter(slug);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var nav = document.querySelector('[data-topic-chips-filter]');
    if (nav) {
      initTopicChipsFilter(nav);
    }
  });
})();

(function () {
  document.querySelectorAll('[data-profile-visibility-toggle][data-public-field]').forEach(function (btn) {
    var fieldName = btn.getAttribute('data-public-field')
    var hidden = document.getElementById('id_' + fieldName)
    if (!hidden) return
    var icon = btn.querySelector('i')

    function visibleToOthers() {
      return String(hidden.value) === '1'
    }

    function syncUi() {
      var show = visibleToOthers()
      if (show) {
        if (icon) icon.className = 'fa fa-eye'
        btn.setAttribute('aria-pressed', 'false')
        btn.setAttribute('aria-label', 'Shown on public profile')
        btn.title = 'Shown on public profile. Click to mark hidden from others.'
      } else {
        if (icon) icon.className = 'fa fa-eye-slash'
        btn.setAttribute('aria-pressed', 'true')
        btn.setAttribute('aria-label', 'Hidden from public profile')
        btn.title = 'Hidden from others. Click to show on public profile.'
      }
    }

    btn.addEventListener('click', function () {
      hidden.value = visibleToOthers() ? '0' : '1'
      syncUi()
    })

    syncUi()
  })
})()

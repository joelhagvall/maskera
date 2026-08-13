// Sets the theme before first paint so there is no flash. Loaded as a
// blocking classic script from <head> of every shell (index.html and the
// localized shells from src/meta.ts). External, not inline, so the strict
// CSP (script-src 'self') allows it without hash/nonce maintenance.
;(function () {
  try {
    var d = localStorage.getItem("theme") === "dark"
    var e = document.documentElement
    e.dataset.theme = d ? "dark" : "light"
    e.style.colorScheme = d ? "dark" : "light"
    if (d) {
      document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) {
        m.setAttribute("content", "#0a0a0a")
      })
    }
  } catch (_) {}
})()

// Sets the theme before first paint so there is no flash. Referenced from
// <head> of every shell (index.html and the localized shells from
// src/meta.ts); scripts/prerender.mjs inlines it into the built pages so it
// costs no render-blocking request, and vercel.json's script-src carries its
// sha256 (verified by scripts/check-theme-hash.mjs) so the strict CSP allows
// the inline copy.
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

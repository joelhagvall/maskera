// Sets the theme and the visitor's browser kind (html[data-browser], read by
// the hero's store button) before first paint so there is no flash. Referenced from
// <head> of every shell (index.html and the localized shells from
// src/meta.ts); scripts/prerender.mjs inlines it into the built pages so it
// costs no render-blocking request, and vercel.json's script-src carries its
// sha256 (verified by scripts/check-theme-hash.mjs) so the strict CSP allows
// the inline copy.
;(() => {
  try {
    var d = localStorage.getItem("theme") === "dark"
    var e = document.documentElement
    e.dataset.theme = d ? "dark" : "light"
    e.style.colorScheme = d ? "dark" : "light"
    if (d) {
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
        m.setAttribute("content", "#0a0a0a")
      })
    }
  } catch (_) {}
  // Keep in step with test/extensionBrowsers.test.ts, which runs this file.
  var u = navigator.userAgent
  document.documentElement.dataset.browser = /Android|iPhone|iPad|iPod|Mobile/i.test(u)
    ? "mobile"
    : /Edg\//.test(u)
      ? "edge"
      : /Firefox\//.test(u)
        ? "firefox"
        : /Safari\//.test(u) && !/Chrome\/|Chromium\//.test(u)
          ? "safari"
          : "chrome"
})()

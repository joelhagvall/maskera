// Loads the app bundle on the window load event instead of as a
// <script type="module"> in <head>. The pages are prerendered, so the visible
// content is already in the HTML; letting the fonts and images of that
// content finish first keeps the bundle out of the first-paint critical path
// (Lighthouse's simulator counts everything that finishes before the observed
// first paint; requestAnimationFrame-based variants race that paint). Inlined into the
// built pages by scripts/prerender.mjs, which puts the hashed bundle URL in
// data-src so this file, and its sha256 in vercel.json's script-src, stay the
// same across builds. Not used by the dev server.
;(function () {
  var src = document.currentScript.dataset.src
  function load() {
    var s = document.createElement("script")
    s.type = "module"
    s.crossOrigin = ""
    s.src = src
    document.head.appendChild(s)
  }
  if (document.readyState === "complete") load()
  else addEventListener("load", load)
})()

import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { basename, extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import { renderRouteHtml, routeHtmlViews, viewPaths } from "./src/meta"

const ORT_MIME: Record<string, string> = {
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
}

/**
 * Serve public/ort/ as plain static files in dev. The ONNX runtime loads its
 * WASM loader with a runtime `import("/ort/....mjs")`, and Vite's dev server
 * refuses module imports of files in public/ (in the production build they
 * are ordinary static files, so this is a dev-only problem). Registered via
 * configureServer, this middleware runs before Vite's internal ones and
 * answers the request before the refusal kicks in.
 */
function serveOrtInDev(): Plugin {
  return {
    name: "serve-ort-in-dev",
    apply: "serve",
    configureServer(server) {
      const dir = fileURLToPath(new URL("./public/ort", import.meta.url))
      server.middlewares.use("/ort", (req, res, next) => {
        const name = basename((req.url ?? "").split("?")[0])
        const type = ORT_MIME[extname(name)]
        const file = join(dir, name)
        if (!type || !existsSync(file)) return next()
        res.setHeader("Content-Type", type)
        createReadStream(file).pipe(res)
      })
    },
  }
}

// The sub-page HTML shells are generated from src/meta.ts (the same data
// applyViewMeta uses for SPA navigation), so their titles and descriptions
// cannot drift from the client. Written at config load so dev, build, preview
// and vitest all see fresh files; the output is gitignored. index.html stays
// hand-authored (richer SEO title, og tags and JSON-LD @graph).
const routeInputs: Record<string, string> = {
  index: fileURLToPath(new URL("./index.html", import.meta.url)),
}
for (const view of routeHtmlViews) {
  const dir = fileURLToPath(new URL(`.${viewPaths[view]}`, import.meta.url))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "index.html"), renderRouteHtml(view))
  routeInputs[viewPaths[view].slice(1)] = join(dir, "index.html")
}

export default defineConfig({
  plugins: [react(), serveOrtInDev()],
  // The worker points ONNX Runtime at our self-hosted /ort/ pair. Select the
  // package's external-WASM export so Vite does not also embed a second,
  // unused 23 MB runtime in the JavaScript graph.
  resolve: { conditions: ["onnxruntime-web-use-extern-wasm"] },
  // BENCH=1 also builds bench.html (the latency bench page, never deployed);
  // see scripts/bench-browser.mjs.
  build: {
    rollupOptions: {
      input:
        process.env.BENCH === "1"
          ? {
              ...routeInputs,
              bench: fileURLToPath(new URL("./bench.html", import.meta.url)),
            }
          : routeInputs,
    },
  },
  // host: true exposes the dev server on the LAN so you can open it on a phone
  server: { port: 5180, open: true, host: true },
  // Transformers.js / onnxruntime-web don't play well with esbuild prebundling.
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
  // The NER worker dynamic-imports Transformers.js, which needs code
  // splitting inside the worker bundle, and only the ES format supports that.
  worker: { format: "es" },
})

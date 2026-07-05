import { createReadStream, existsSync } from "node:fs"
import { basename, extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { type Plugin, defineConfig } from "vite"

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

export default defineConfig({
  plugins: [react(), serveOrtInDev()],
  // BENCH=1 also builds bench.html (the latency bench page, never deployed);
  // see scripts/bench-browser.mjs.
  build:
    process.env.BENCH === "1"
      ? {
          rollupOptions: {
            input: {
              index: fileURLToPath(new URL("./index.html", import.meta.url)),
              bench: fileURLToPath(new URL("./bench.html", import.meta.url)),
            },
          },
        }
      : undefined,
  // host: true exposes the dev server on the LAN so you can open it on a phone
  server: { port: 5180, open: true, host: true },
  // Transformers.js / onnxruntime-web don't play well with esbuild prebundling.
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
  // The NER worker dynamic-imports Transformers.js, which needs code
  // splitting inside the worker bundle, and only the ES format supports that.
  worker: { format: "es" },
})

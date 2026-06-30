import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  // host: true exposes the dev server on the LAN so you can open it on a phone
  server: { port: 5180, open: true, host: true },
  // Transformers.js / onnxruntime-web don't play well with esbuild prebundling.
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
})

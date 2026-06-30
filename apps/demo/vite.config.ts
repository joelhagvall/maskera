import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  server: { port: 5180, open: true },
  // Transformers.js / onnxruntime-web don't play well with esbuild prebundling.
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
})

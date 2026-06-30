import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  target: "es2021",
  // Never bundle the heavy ML runtime — it's an optional peer dep.
  external: ["@huggingface/transformers", "@maskera/core"],
})

import { defineConfig } from "tsup"

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    treeshake: true,
    target: "node18",
    external: ["maskera", "@maskera/core", "@huggingface/transformers"],
  },
  {
    entry: ["src/cli.ts"],
    format: ["esm"],
    dts: false,
    clean: false,
    sourcemap: true,
    treeshake: true,
    target: "node18",
    banner: { js: "#!/usr/bin/env node" },
    external: ["maskera", "@maskera/core", "@huggingface/transformers"],
  },
])

#!/usr/bin/env node
/** Keep local caches intact while ensuring the deployable build has one model. */
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const meta = JSON.parse(readFileSync(join(appRoot, "src/model-meta.json"), "utf8"))
const builtModels = join(appRoot, "dist/models")

if (existsSync(builtModels)) {
  for (const entry of readdirSync(builtModels, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== meta.directory) {
      rmSync(join(builtModels, entry.name), { recursive: true, force: true })
      console.log(`pruned stale built model: ${entry.name}`)
    }
  }
}

if (!existsSync(join(builtModels, meta.directory))) {
  throw new Error(`current built model is missing: ${meta.directory}`)
}

console.log(`build contains only the current model: ${meta.directory}`)

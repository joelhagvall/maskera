import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { relative, resolve } from "node:path"
import { repoRoot } from "./benchmark-contract.mjs"

const CODE_EXT_RE = /\.(?:[cm]?js|[cm]?ts|tsx)$/
const HARDCODED_MODEL_RE = /maskera-sv-ner-v\d+/g
const SKIP_SCAN_DIRS = new Set(["node_modules", "dist", "dist-ssr", "build", "coverage", "test"])

const FROZEN_EVAL_FILES = new Set([])

/**
 * Strip block and single-line comments so doc examples do not trigger the
 * hardcoded-model guard while any executable code literal still fails.
 */
function stripJsComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:\\])\/\/[^\n]*/g, "$1")
}

/**
 * Scan code directories for hardcoded `maskera-sv-ner-v<N>` literals in
 * executable source files. Runtime/audit/eval code must derive the model folder
 * from `apps/demo/src/model-meta.json` or `docs/benchmark-release.json`.
 */
export async function findHardcodedModelVersions(
  root = repoRoot,
  scanDirs = ["packages", "scripts", "apps/demo/scripts", "apps/demo/src"],
) {
  const hits = []
  async function walk(dir) {
    if (!existsSync(dir)) return
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_SCAN_DIRS.has(entry.name)) continue
        await walk(resolve(dir, entry.name))
        continue
      }
      if (!CODE_EXT_RE.test(entry.name) || entry.name.includes(".test.")) continue
      const fullPath = resolve(dir, entry.name)
      const relPath = relative(root, fullPath).replaceAll("\\", "/")
      if (FROZEN_EVAL_FILES.has(relPath)) continue
      const stripped = stripJsComments(await readFile(fullPath, "utf8"))
      const lines = stripped.split("\n")
      for (let i = 0; i < lines.length; i++) {
        const matches = lines[i].match(HARDCODED_MODEL_RE)
        if (!matches) continue
        for (const literal of matches) {
          hits.push({ file: relPath, line: i + 1, literal })
        }
      }
    }
  }
  for (const dir of scanDirs) {
    await walk(resolve(root, dir))
  }
  return hits
}

#!/usr/bin/env node
/**
 * Runs every masked example maskera.dev shows (scripts/site-claims.mjs)
 * through the released `maskera` library and its pinned Swedish model, and
 * fails when the page claims an output the model does not give. The hand
 * check that used to back these strings is now this script; pre-push runs it
 * when the site, the rules or the model wrapper change.
 *
 * Needs packages/ner built (`pnpm --filter maskera build`) and the model in
 * the Transformers.js cache (downloaded on the first run, ~43 MB).
 *
 * Run: pnpm --filter @maskera/demo check:claims
 */
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createServer } from "vite"
import { collectSiteClaims } from "./site-claims.mjs"

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))
const NER_DIST = resolve(ROOT, "..", "..", "packages", "ner", "dist", "index.js")
if (!existsSync(NER_DIST)) {
  console.error(`check:claims: ${NER_DIST} is missing; run pnpm --filter maskera build first.`)
  process.exit(1)
}

const vite = await createServer({
  root: ROOT,
  logLevel: "error",
  server: { middlewareMode: true },
  appType: "custom",
})
const [scenes, i18n] = await Promise.all([
  vite.ssrLoadModule("/src/heroScenes.ts"),
  vite.ssrLoadModule("/src/i18n/index.ts"),
])
await vite.close()

const { createNerRecognizer, redactWithNer } = await import(pathToFileURL(NER_DIST).href)
const recognizer = createNerRecognizer()
const failures = []
const claims = collectSiteClaims({ scenes, i18n })
for (const claim of claims) {
  const { text } = await redactWithNer(claim.input, { recognizer })
  if (text !== claim.masked) failures.push({ ...claim, actual: text })
}

if (failures.length > 0) {
  console.error(
    `check:claims: ${failures.length} of ${claims.length} examples on the site do not match the model`,
  )
  for (const f of failures) {
    console.error(
      `\n- ${f.where}\n  input:  ${f.input}\n  page:   ${f.masked}\n  model:  ${f.actual}`,
    )
  }
  process.exit(1)
}
console.log(`check:claims: all ${claims.length} masked examples on the site match the model`)

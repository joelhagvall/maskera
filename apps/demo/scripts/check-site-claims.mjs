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

const library = await import(pathToFileURL(NER_DIST).href)
const recognizer = library.createNerRecognizer()
// A code example runs as written up to its `// text:` line, with the names it
// imports from "maskera" bound to the real library. It reuses the one loaded
// model instead of loading another per example.
const scope = { ...library, createNerRecognizer: () => recognizer }
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
async function runExample(code) {
  const imported = code.match(/^import \{([^}]*)\} from "maskera"\n/m)
  if (!imported) throw new Error(`code example does not import from "maskera":\n${code}`)
  const names = imported[1]
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
  const body = code.replace(imported[0], "")
  return new AsyncFunction(...names, `${body}\nreturn text`)(...names.map((name) => scope[name]))
}
const failures = []
const claims = collectSiteClaims({ scenes, i18n })
for (const claim of claims) {
  const text = claim.code
    ? await runExample(claim.code)
    : (await library.redactWithNer(claim.input, { recognizer })).text
  if (text !== claim.masked) failures.push({ ...claim, actual: text })
}

if (failures.length > 0) {
  console.error(
    `check:claims: ${failures.length} of ${claims.length} examples on the site do not match the model`,
  )
  for (const f of failures) {
    console.error(
      `\n- ${f.where}\n  input:  ${f.input ?? f.code}\n  page:   ${f.masked}\n  model:  ${f.actual}`,
    )
  }
  process.exit(1)
}
console.log(`check:claims: all ${claims.length} masked examples on the site match the model`)

/**
 * Guards the commands the git hooks and the root `test` script run, so a gate
 * cannot be switched off silently (2026-11-27: shuffle was never on).
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("../..", import.meta.url))
const read = (path) => readFileSync(join(ROOT, path), "utf8")
const scripts = JSON.parse(read("package.json")).scripts
const preCommit = read(".githooks/pre-commit")
const prePush = read(".githooks/pre-push")

/** Lines that hand flags to a pnpm script through a literal `--`. */
function pnpmDoubleDashLines(text) {
  return text.split("\n").filter((line) => /\bpnpm\b[^&|;\n]*\s--\s+--?\w/.test(line))
}

test("pnpmDoubleDashLines finds `pnpm ... -- --flag` and nothing else", () => {
  assert.equal(pnpmDoubleDashLines("pnpm -r test -- --sequence.shuffle").length, 1)
  assert.equal(pnpmDoubleDashLines("pnpm -r test --sequence.shuffle").length, 0)
  assert.equal(pnpmDoubleDashLines("git diff -- file && pnpm lint").length, 0)
})

test("no pnpm command passes flags through a literal --", () => {
  const offenders = [
    ...Object.entries(scripts).flatMap(([name, cmd]) =>
      pnpmDoubleDashLines(cmd).map((line) => `package.json "${name}": ${line}`),
    ),
    ...pnpmDoubleDashLines(preCommit).map((line) => `.githooks/pre-commit: ${line}`),
    ...pnpmDoubleDashLines(prePush).map((line) => `.githooks/pre-push: ${line}`),
  ]
  assert.deepEqual(
    offenders,
    [],
    "pnpm 10 forwards `--` to the script, so vitest ignores every flag after it. " +
      "Write `pnpm -r test --sequence.shuffle` without the `--`.",
  )
})

test("the root test script and pre-push run vitest in random order", () => {
  assert.match(scripts.test, /pnpm -r test --sequence\.shuffle/)
  assert.match(prePush, /pnpm -r test --sequence\.shuffle/)
})

test("pre-commit runs the identifier and training privacy guards", () => {
  assert.match(preCommit, /scripts\/check-fixture-identifiers\.mjs/)
  assert.match(preCommit, /training\/privacy_guard\.test\.mjs/)
  assert.match(preCommit, /training\/privacy_attestation\.test\.mjs/)
})

test("pre-push runs prova over every sitemap page when apps/demo changes", () => {
  assert.match(prePush, /scripts\/harness\/prova\.mjs --no-build --lang=all --only=(\s|$)/m)
})

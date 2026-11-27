import assert from "node:assert/strict"
import test from "node:test"
import { isUiFile, verifyReceipt } from "./prova-receipt.mjs"

test("isUiFile matches apps/demo/src non-test files only", () => {
  assert.equal(isUiFile("apps/demo/src/components/HeroStage.tsx"), true)
  assert.equal(isUiFile("apps/demo/src/i18n/sv.json"), true)
  assert.equal(isUiFile("apps/demo/src/foo.test.ts"), false)
  assert.equal(isUiFile("packages/core/src/index.ts"), false)
})

test("verifyReceipt passes with no staged UI files or exact matching hashes", () => {
  assert.equal(verifyReceipt(null, { "packages/core/src/index.ts": "abc" }).ok, true)
  assert.equal(
    verifyReceipt(
      { ok: true, files: { "apps/demo/src/App.tsx": "h1" } },
      { "apps/demo/src/App.tsx": "h1" },
    ).ok,
    true,
  )
})

test("verifyReceipt rejects missing or stale receipts", () => {
  const miss = verifyReceipt(null, { "apps/demo/src/App.tsx": "h1" })
  assert.equal(miss.ok, false)
  assert.deepEqual(miss.missing, ["apps/demo/src/App.tsx"])

  const stale = verifyReceipt(
    { ok: true, files: { "apps/demo/src/App.tsx": "old" } },
    { "apps/demo/src/App.tsx": "new" },
  )
  assert.equal(stale.ok, false)
  assert.deepEqual(stale.stale, ["apps/demo/src/App.tsx"])
})

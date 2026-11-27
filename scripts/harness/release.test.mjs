import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { bumpHagvallVersion, bumpMaskeraRange, releaseTags } from "./release.mjs"

test("bumpMaskeraRange moves every maskera range and leaves other packages alone", () => {
  const before =
    '{\n  "dependencies": {\n    "maskera": "^0.11.1",\n    "maskera-extra": "^1.0.0",\n    "@maskera/core": "^0.8.4"\n  }\n}\n'
  const after = bumpMaskeraRange(before, "0.11.2")
  assert.match(after, /"maskera": "\^0\.11\.2"/)
  assert.match(after, /"maskera-extra": "\^1\.0\.0"/)
  assert.match(after, /"@maskera\/core": "\^0\.8\.4"/)
})

test("bumpHagvallVersion keeps the quote style", () => {
  assert.equal(
    bumpHagvallVersion("export const maskeraVersion = '0.11.1'\n", "0.11.2"),
    "export const maskeraVersion = '0.11.2'\n",
  )
})

test("releaseTags names the tags changesets creates", () => {
  assert.deepEqual(
    releaseTags({ core: "0.8.5", maskera: "0.11.2", mcp: "0.4.1" }).map(({ tag }) => tag),
    ["@maskera/core@0.8.5", "maskera@0.11.2", "@maskera/mcp@0.4.1"],
  )
})

test("pnpm release runs the release script, not a bare changeset publish", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"))
  assert.equal(pkg.scripts.release, "node scripts/harness/release.mjs")
})

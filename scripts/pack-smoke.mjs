#!/usr/bin/env node
/**
 * Pack smoke test: `pnpm pack` @maskera/core and maskera, install the
 * tarballs into a fresh throwaway project, and exercise both the ESM and CJS
 * entry points. This tests what npm users actually receive (the exports map,
 * the dist bundles, the workspace:* -> version rewrite), none of which the
 * unit tests (which import src/) can catch.
 *
 * Usage: node scripts/pack-smoke.mjs   (run `pnpm build` first)
 */
import { execSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(fileURLToPath(new URL("..", import.meta.url)))
const dir = mkdtempSync(join(tmpdir(), "maskera-pack-"))
const run = (cmd, cwd = dir) =>
  execSync(cmd, { cwd, stdio: ["ignore", "pipe", "inherit"] })
    .toString()
    .trim()

try {
  const tarballs = ["@maskera/core", "maskera"].map((name) => {
    const out = run(`pnpm --filter ${name} pack --pack-destination "${dir}"`, root)
    const tarball = out.split("\n").filter(Boolean).pop()
    console.log(`packed ${name}: ${tarball}`)
    return tarball
  })

  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "smoke", private: true }))
  run(`npm install ${tarballs.map((t) => `"${t}"`).join(" ")} --no-audit --no-fund --silent`)

  writeFileSync(
    join(dir, "smoke.mjs"),
    `
import { redact, restore, defaultDetectors } from "@maskera/core"
import { createNerRecognizer, redactWithNer, MASKERA_SV_NER_MODEL } from "maskera"

const input = "Ring 070-174 06 58, personnummer 19900101-2385, mejla a@example.com"
const r = redact(input)
for (const token of ["[TELEFON_1]", "[PERSONNUMMER_1]", "[EPOST_1]"]) {
  if (!r.text.includes(token)) throw new Error("ESM redact missing " + token + ": " + r.text)
}
if (restore(r.text, r.map) !== input) throw new Error("ESM roundtrip broken")
if (!Array.isArray(defaultDetectors) || defaultDetectors.length === 0)
  throw new Error("ESM defaultDetectors broken")
if (typeof createNerRecognizer !== "function" || typeof redactWithNer !== "function")
  throw new Error("ESM ner exports broken")
if (typeof MASKERA_SV_NER_MODEL !== "string") throw new Error("ESM ner constants broken")
console.log("ESM entry ok")
`,
  )
  run("node smoke.mjs")

  writeFileSync(
    join(dir, "smoke.cjs"),
    `
const { redact } = require("@maskera/core")
const ner = require("maskera")

const r = redact("Org.nr 202100-4748, IBAN SE42 8000 0890 1191 4616 8423")
for (const token of ["[ORGANISATIONSNUMMER_1]", "[IBAN_1]"]) {
  if (!r.text.includes(token)) throw new Error("CJS redact missing " + token + ": " + r.text)
}
if (typeof ner.createNerRecognizer !== "function") throw new Error("CJS ner exports broken")
console.log("CJS entry ok")
`,
  )
  run("node smoke.cjs")

  console.log("✅ pack smoke ok")
} finally {
  rmSync(dir, { recursive: true, force: true })
}

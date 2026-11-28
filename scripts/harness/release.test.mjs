import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { AUDIT_FILES } from "../../packages/mcp/audit/summary.mjs"
import {
  bumpClaudeDesktopMcpPin,
  bumpCoreRange,
  bumpExtensionZipVersion,
  bumpHagvallVersion,
  bumpMaskeraRange,
  findAuditEvidenceProblems,
  findUnbumpedReadmeChanges,
  parseModelRevision,
  parsePorcelain,
  parseSyncModelResult,
  releaseTags,
} from "./release.mjs"

test("bumpMaskeraRange moves every maskera range and leaves other packages alone", () => {
  const before =
    '{\n  "dependencies": {\n    "maskera": "^0.11.1",\n    "maskera-extra": "^1.0.0",\n    "@maskera/core": "^0.8.4"\n  }\n}\n'
  const after = bumpMaskeraRange(before, "0.11.2")
  assert.match(after, /"maskera": "\^0\.11\.2"/)
  assert.match(after, /"maskera-extra": "\^1\.0\.0"/)
  assert.match(after, /"@maskera\/core": "\^0\.8\.4"/)

  const afterCore = bumpCoreRange(after, "0.8.6")
  assert.match(afterCore, /"@maskera\/core": "\^0\.8\.6"/)
  assert.match(afterCore, /"maskera": "\^0\.11\.2"/)
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

test("parsePorcelain keeps the path of a first line that starts with a space", () => {
  assert.deepEqual(parsePorcelain(" M src/seo.ts\n?? docs/\nM  bun.lock\n"), [
    "src/seo.ts",
    "docs/",
    "bun.lock",
  ])
})

test("bumpExtensionZipVersion updates EXTENSION_ZIP_VERSION and keeps quotes", () => {
  assert.equal(
    bumpExtensionZipVersion('export const EXTENSION_ZIP_VERSION = "0.2.3"\n', "0.2.4"),
    'export const EXTENSION_ZIP_VERSION = "0.2.4"\n',
  )
})

test("bumpClaudeDesktopMcpPin updates pinned @maskera/mcp versions and ignores unpinned configs", () => {
  const pinned = JSON.stringify(
    {
      mcpServers: {
        maskera: {
          command: "npx",
          args: ["-y", "@maskera/mcp@0.4.4", "--root", "/tmp/demo", "--no-raw-restore"],
        },
      },
    },
    null,
    2,
  )
  const bumped = bumpClaudeDesktopMcpPin(pinned, "0.4.5")
  assert.equal(bumped.changed, true)
  assert.match(bumped.text, /"@maskera\/mcp@0\.4\.5"/)

  const same = bumpClaudeDesktopMcpPin(bumped.text, "0.4.5")
  assert.equal(same.changed, false)

  const unpinned = pinned.replace("@maskera/mcp@0.4.4", "@maskera/mcp")
  assert.equal(bumpClaudeDesktopMcpPin(unpinned, "0.4.5").changed, false)
})

test("parseSyncModelResult extracts trailing JSON even with bun banner lines", () => {
  const out =
    '$ bun run scripts/sync-model.ts --json\n{"changed":true,"version":"0.2.4","changedFiles":["package.json"]}\n'
  assert.deepEqual(parseSyncModelResult(out), {
    changed: true,
    version: "0.2.4",
    changedFiles: ["package.json"],
  })
})

test("findUnbumpedReadmeChanges blocks releasing when a tagged package README drifted", () => {
  const tags = releaseTags({ core: "0.8.5", maskera: "0.12.0", mcp: "0.4.3" })
  const problems = findUnbumpedReadmeChanges(tags, {
    tagExists: (tag) => tag === "@maskera/core@0.8.5",
    readTagFile: () => "old v20 readme",
    readHeadFile: () => "new v21 readme",
  })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /packages\/core\/README\.md changed since @maskera\/core@0\.8\.5/)

  const clean = findUnbumpedReadmeChanges(tags, {
    tagExists: (tag) => tag === "@maskera/core@0.8.5",
    readTagFile: () => "same readme",
    readHeadFile: () => "same readme",
  })
  assert.deepEqual(clean, [])
})

test("parseModelRevision reads the pinned Hub sha from the ner source", () => {
  const source = readFileSync(new URL("../../packages/ner/src/index.ts", import.meta.url), "utf8")
  assert.match(parseModelRevision(source), /^[0-9a-f]{40}$/)
  assert.throws(() => parseModelRevision("export const x = 1\n"), /MASKERA_SV_NER_REVISION/)
})

test("findAuditEvidenceProblems accepts only a passing --release run of what is released", () => {
  const read = (path) => readFileSync(path, "utf8")
  const report = JSON.parse(read(AUDIT_FILES.report))
  const auditMd = read(AUDIT_FILES.summary)
  const contract = JSON.parse(read(AUDIT_FILES.contract))
  const target = { mcpVersion: report.packageVersion, modelRevision: report.model.revision }
  assert.deepEqual(findAuditEvidenceProblems(report, auditMd, contract, target), [])

  const stale = {
    ...report,
    lane: "quick",
    releaseGates: { ...report.releaseGates, release: false },
  }
  const problems = findAuditEvidenceProblems(stale, auditMd, contract, {
    mcpVersion: "99.0.0",
    modelRevision: "b".repeat(40),
  })
  assert.equal(problems.length, 5)
  assert.match(problems.join("\n"), /quick lane/)
  assert.match(problems.join("\n"), /not a passing --release run/)
  assert.match(problems.join("\n"), /releasing 99\.0\.0/)
  assert.match(problems.join("\n"), /AUDIT\.md's generated block does not match/)
})

test("the release runs the strict @maskera/mcp audit before changeset publish", () => {
  const source = readFileSync(new URL("./release.mjs", import.meta.url), "utf8")
  const audit = source.indexOf('run("pnpm", ["audit:full", "--", "--release"')
  const publish = source.indexOf('run("pnpm", ["exec", "changeset", "publish"])')
  assert.ok(audit > 0 && publish > audit, "audit:full --release must run before publish")
})

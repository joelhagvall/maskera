import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  AUDIT_FILES,
  auditSummaryIsCurrent,
  extractSummaryBlock,
  renderAuditSummary,
  replaceSummaryBlock,
} from "./summary.mjs"

const read = (path) => readFileSync(path, "utf8")
const report = JSON.parse(read(AUDIT_FILES.report))
const contract = JSON.parse(read(AUDIT_FILES.contract))

test("AUDIT.md's generated block matches the committed audit-results.json", () => {
  assert.ok(
    auditSummaryIsCurrent(read(AUDIT_FILES.summary), report, contract),
    "AUDIT.md is stale: run `node packages/mcp/audit/summary.mjs` (or `pnpm audit:evidence`)",
  )
})

test("the block names the audited package, model revision and verdict", () => {
  const block = renderAuditSummary(report, contract)
  assert.ok(block.includes(`${report.packageName}@${report.packageVersion}`))
  assert.ok(block.includes(report.model.revision))
  assert.ok(block.includes(report.releaseGates.verdict))
})

test("a hand edit inside the block is detected as stale", () => {
  const edited = read(AUDIT_FILES.summary).replace("## Latest audit run", "## Latest run")
  assert.equal(auditSummaryIsCurrent(edited, report, contract), false)
})

test("replaceSummaryBlock swaps only the block and refuses a file without markers", () => {
  const block = renderAuditSummary(report, contract)
  const md = `# Title\n\n${block.replace("PASS", "FAIL")}\n\n## Tail\n`
  const next = replaceSummaryBlock(md, block)
  assert.equal(extractSummaryBlock(next), block)
  assert.ok(next.startsWith("# Title\n\n") && next.endsWith("\n\n## Tail\n"))
  assert.throws(() => replaceSummaryBlock("# no markers\n", block), /no .* block/)
})

test("a contract pinning another model revision makes the block stale, never relabelled", () => {
  const moved = { ...contract, artifact: { ...contract.artifact, revision: "c".repeat(40) } }
  assert.equal(auditSummaryIsCurrent(read(AUDIT_FILES.summary), report, moved), false)
  assert.throws(() => renderAuditSummary(report, moved), /pins c{40}/)
})

// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import auditResults from "../../../packages/mcp/audit-results.json"
import { Security } from "../src/components/Security"
import en from "../src/i18n/en.json"
import sv from "../src/i18n/sv.json"
import { auditFigures, auditRun, openChecks, PUBLIC_GATES, publicGates } from "../src/mcpAudit"

describe("MCP audit on the security page", () => {
  it("reads the committed evidence, not hand-typed figures", () => {
    expect(auditRun.packageVersion).toBe(auditResults.packageVersion)
    expect(auditRun.modelRevision).toBe(auditResults.model.revision)
    expect(publicGates.map((g) => g.id)).toEqual([...PUBLIC_GATES])
    const privacy = auditResults.suites.find((s) => s.suite === "privacy")
    expect(auditFigures.surfaces).toBe(privacy?.metrics.surfacesChecked)
  })

  it("publishes evidence from a passing --release run only", () => {
    expect(auditResults.releaseGates.release).toBe(true)
    expect(auditResults.releaseGates.passed).toBe(true)
    expect(publicGates.every((g) => g.status === "PASS")).toBe(true)
  })

  it("never shows the author-written quality or performance gates", () => {
    // The site shows accuracy only on independent text (accuracy page).
    expect(PUBLIC_GATES).not.toContain("production-pipeline-quality")
    expect(PUBLIC_GATES).not.toContain("performance-and-soak")
  })

  it("labels every shown gate and every untested check in both languages", () => {
    for (const copy of [sv, en]) {
      for (const id of PUBLIC_GATES) expect(copy.security.auditGates[id]).toBeTruthy()
      for (const check of openChecks) {
        const label = (copy.security.auditOpenChecks as Record<string, string>)[check.id]
        expect(label, `missing auditOpenChecks.${check.id}`).toBeTruthy()
      }
    }
  })

  it("renders the audit section with the run, gates and reproduce command", () => {
    render(<Security go={vi.fn()} />)
    expect(screen.getByRole("heading", { name: sv.security.auditTitle })).toBeTruthy()
    expect(document.body.textContent).toContain(`@maskera/mcp ${auditRun.packageVersion}`)
    for (const id of PUBLIC_GATES) {
      expect(screen.getByRole("rowheader", { name: sv.security.auditGates[id] })).toBeTruthy()
    }
    expect(document.body.textContent).toContain("pnpm audit:full")
    expect(
      screen
        .getByRole("link", { name: new RegExp(sv.security.auditReportCta) })
        .getAttribute("href"),
    ).toBe("https://github.com/joelhagvall/maskera/blob/main/packages/mcp/AUDIT.md")
  })
})

import { constants as fsConstants } from "node:fs"
import { access, stat } from "node:fs/promises"
import { resolve } from "node:path"
import type { RedactionProfile } from "maskera"
import type { MaskeraEngine, MaskMode } from "./engine"
import { SessionVault } from "./vault"

export type DoctorCheckStatus = "ok" | "warn" | "fail"

export interface DoctorCheck {
  name: string
  status: DoctorCheckStatus
  detail: string
}

export interface DoctorReport {
  ok: boolean
  mode: MaskMode
  checks: DoctorCheck[]
}

const SYNTHETIC_SAMPLE =
  "Kontakta provnamn maskera (19900101-2385) på provnamn.maskera@example.com eller 070-174 06 58."

export async function runDoctor(options: {
  engine: MaskeraEngine
  roots: readonly string[]
  mode?: MaskMode
  profile?: RedactionProfile
  customTerms?: readonly string[]
  proxyUrl?: string
}): Promise<DoctorReport> {
  const checks: DoctorCheck[] = []
  const mode = options.mode ?? options.engine.status().defaultMode

  // 1. Node runtime
  const major = Number(process.versions.node.split(".")[0] ?? 0)
  checks.push({
    name: "node",
    status: major >= 18 ? "ok" : "fail",
    detail: `Node ${process.versions.node} (requires >=18)`,
  })

  // 2. Allowed workspace roots
  for (const rawRoot of options.roots) {
    const abs = resolve(rawRoot)
    try {
      const info = await stat(abs)
      if (!info.isDirectory()) {
        checks.push({ name: `root:${abs}`, status: "fail", detail: "Not a directory" })
        continue
      }
      await access(abs, fsConstants.R_OK)
      checks.push({ name: `root:${abs}`, status: "ok", detail: "Readable directory" })
    } catch (err) {
      checks.push({
        name: `root:${abs}`,
        status: "fail",
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // 3. Synthetic Swedish PII redact + restore self-test
  const startedAt = Date.now()
  try {
    const { result, modeUsed } = await options.engine.redact(SYNTHETIC_SAMPLE, {
      mode,
      profile: options.profile,
      customTerms: options.customTerms,
    })
    const vault = new SessionVault()
    const applied = vault.apply(SYNTHETIC_SAMPLE, result, "doctor-check")
    const restored = vault.restore(applied.redacted, { sessionId: applied.sessionId })
    const leaks = ["19900101-2385", "provnamn.maskera@example.com", "070-174 06 58"].filter((s) =>
      applied.redacted.includes(s),
    )
    const roundtripOk = restored.restored === SYNTHETIC_SAMPLE
    const elapsedMs = Date.now() - startedAt
    if (leaks.length > 0 || !roundtripOk) {
      checks.push({
        name: "redaction",
        status: "fail",
        detail: `Self-test failed (leaks=${leaks.length}, roundtrip=${roundtripOk})`,
      })
    } else {
      checks.push({
        name: "redaction",
        status: "ok",
        detail: `mode=${modeUsed}, masked=${applied.totalRedactions} items, roundtrip=ok (${elapsedMs}ms)`,
      })
    }
  } catch (err) {
    checks.push({
      name: "redaction",
      status: "fail",
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  // 4. Optional live proxy + Streamable HTTP /mcp probe
  const proxyBase = (options.proxyUrl ?? "http://127.0.0.1:8787").replace(/\/$/, "")
  try {
    const res = await fetch(`${proxyBase}/_maskera/status`, {
      signal: AbortSignal.timeout(800),
    })
    if (res.ok) {
      const data = (await res.json()) as {
        mcp_url?: string
        requests_proxied?: number
        total_redactions?: number
      }
      checks.push({
        name: "proxy",
        status: "ok",
        detail: `Running at ${proxyBase} (mcp=${data.mcp_url ?? `${proxyBase}/mcp`}, requests=${data.requests_proxied ?? 0}, redacted=${data.total_redactions ?? 0})`,
      })
    } else {
      checks.push({
        name: "proxy",
        status: "warn",
        detail: `${proxyBase}/_maskera/status returned HTTP ${res.status}`,
      })
    }
  } catch {
    checks.push({
      name: "proxy",
      status: "warn",
      detail: `Not running on ${proxyBase} (start with "npx -y @maskera/mcp proxy" if needed)`,
    })
  }

  return {
    ok: checks.every((c) => c.status !== "fail"),
    mode,
    checks,
  }
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines = [`maskera-mcp doctor (${report.ok ? "OK" : "FAILED"}, mode=${report.mode})`]
  for (const check of report.checks) {
    const tag = check.status === "ok" ? "[ok]  " : check.status === "warn" ? "[warn]" : "[fail]"
    lines.push(`  ${tag} ${check.name}: ${check.detail}`)
  }
  return `${lines.join("\n")}\n`
}

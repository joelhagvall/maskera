import { randomUUID } from "node:crypto"

export type ApprovalMode = "automatic" | "browser" | "native"
export type ApprovalStatus = "pending" | "approved" | "declined" | "expired" | "completed"

export interface ApprovalSummary {
  id: string
  tool: string
  reason: string
  sessionId: string | null
  placeholderCount: number
  status: ApprovalStatus
  createdAt: string
  expiresAt: string
  decidedAt: string | null
}

interface ApprovalRecord {
  summary: ApprovalSummary
  expiresAtMs: number
  execute: (() => Promise<Record<string, unknown>>) | null
}

export type ApprovalResumeResult =
  | { status: "completed"; result: Record<string, unknown>; summary: ApprovalSummary }
  | { status: "pending" | "declined" | "expired" | "not_found"; summary?: ApprovalSummary }

const DEFAULT_TTL_MS = 5 * 60 * 1_000
const MAX_RECORDS = 50

/**
 * Process-local approval broker for sensitive MCP actions that would return
 * raw PII into model context (such as `maskera_restore` or `maskera_redact`
 * with `include_map: true`). Summaries never store or emit raw PII values.
 */
export class ApprovalBroker {
  private readonly records = new Map<string, ApprovalRecord>()
  private readonly listeners = new Set<(summaries: ApprovalSummary[]) => void>()
  private readonly ttlMs: number

  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = Math.max(1_000, ttlMs)
  }

  private expireStale(now = Date.now()): void {
    let changed = false
    for (const record of this.records.values()) {
      if (record.summary.status === "pending" && now >= record.expiresAtMs) {
        record.summary.status = "expired"
        record.execute = null
        changed = true
      }
    }
    if (changed) this.notify()
  }

  private notify(): void {
    const snapshot = this.list()
    for (const listener of this.listeners) {
      try {
        listener(snapshot)
      } catch {
        // Ignore listener errors.
      }
    }
  }

  onChange(listener: (summaries: ApprovalSummary[]) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  create(input: {
    tool: string
    reason: string
    sessionId?: string | null
    placeholderCount: number
    execute: () => Promise<Record<string, unknown>>
  }): ApprovalSummary {
    this.expireStale()
    if (this.records.size >= MAX_RECORDS) {
      const oldestKey = this.records.keys().next().value
      if (oldestKey !== undefined) this.records.delete(oldestKey)
    }
    const now = Date.now()
    const id = `apr_${randomUUID().slice(0, 12)}`
    const summary: ApprovalSummary = {
      id,
      tool: input.tool,
      reason: input.reason,
      sessionId: input.sessionId ?? null,
      placeholderCount: input.placeholderCount,
      status: "pending",
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.ttlMs).toISOString(),
      decidedAt: null,
    }
    this.records.set(id, {
      summary,
      expiresAtMs: now + this.ttlMs,
      execute: input.execute,
    })
    this.notify()
    return { ...summary }
  }

  list(): ApprovalSummary[] {
    this.expireStale()
    return [...this.records.values()].map((r) => ({ ...r.summary })).reverse()
  }

  decide(id: string, decision: "approve" | "decline"): ApprovalSummary | null {
    this.expireStale()
    const record = this.records.get(id.trim())
    if (!record) return null
    if (record.summary.status !== "pending") return { ...record.summary }
    record.summary.status = decision === "approve" ? "approved" : "declined"
    record.summary.decidedAt = new Date().toISOString()
    if (decision === "decline") {
      record.execute = null
    }
    this.notify()
    return { ...record.summary }
  }

  async resume(id: string): Promise<ApprovalResumeResult> {
    this.expireStale()
    const record = this.records.get(id.trim())
    if (!record) return { status: "not_found" }
    const { status } = record.summary
    if (status === "pending" || status === "declined" || status === "expired") {
      return { status, summary: { ...record.summary } }
    }
    if (status === "completed" || !record.execute) {
      return { status: "expired", summary: { ...record.summary } }
    }
    const run = record.execute
    record.execute = null
    const result = await run()
    record.summary.status = "completed"
    this.notify()
    return { status: "completed", result, summary: { ...record.summary } }
  }

  clearAll(): void {
    this.records.clear()
    this.notify()
  }
}

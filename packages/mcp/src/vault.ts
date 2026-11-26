import { randomUUID } from "node:crypto"
import { type PiiLabel, type RedactResult, restore } from "maskera"

export interface SessionSummary {
  sessionId: string
  entityCount: number
  countsByLabel: Record<string, number>
  createdAt: string
  updatedAt: string
}

interface SessionEntry {
  id: string
  createdAt: string
  updatedAt: string
  /** Length-prefixed `${label.length}:${label}:${value}` -> placeholder */
  tokenByKey: Map<string, string>
  /** Placeholder -> original value (for restore) */
  map: Record<string, string>
  /** Per-label monotonic counter */
  counters: Map<PiiLabel, number>
  /** Per-label distinct entity count */
  countsByLabel: Record<string, number>
}

const DEFAULT_MAX_SESSIONS = 100
const DEFAULT_MAX_ENTITIES_PER_SESSION = 5_000
const EXISTING_TOKEN_RE = /\[[A-ZÅÄÖ][A-ZÅÄÖ0-9_]*_\d+\]/g

function valueKey(label: PiiLabel, value: string): string {
  return `${label.length}:${label}:${value}`
}

function labelFromKey(key: string): PiiLabel | null {
  const firstColon = key.indexOf(":")
  if (firstColon < 1) return null
  const len = Number(key.slice(0, firstColon))
  if (!Number.isInteger(len) || len <= 0) return null
  return key.slice(firstColon + 1, firstColon + 1 + len) as PiiLabel
}

/**
 * Process-local, in-memory restore vault keyed by session_id.
 *
 * Keeps raw PII values inside the local MCP process so an agent can mask
 * multiple documents under one session (receiving consistent `[NAMN_1]`
 * numbering across files) and later write restored output directly to disk
 * without ever exposing raw values to the cloud LLM.
 */
export class SessionVault {
  private readonly sessions = new Map<string, SessionEntry>()
  private readonly maxSessions: number
  private readonly maxEntitiesPerSession: number

  constructor(
    maxSessions = DEFAULT_MAX_SESSIONS,
    maxEntitiesPerSession = DEFAULT_MAX_ENTITIES_PER_SESSION,
  ) {
    this.maxSessions = Math.max(1, maxSessions)
    this.maxEntitiesPerSession = Math.max(1, maxEntitiesPerSession)
  }

  private getOrCreate(sessionId?: string): SessionEntry {
    const id = sessionId?.trim() || `s_${randomUUID().slice(0, 12)}`
    const existing = this.sessions.get(id)
    if (existing) {
      // Refresh LRU position.
      this.sessions.delete(id)
      this.sessions.set(id, existing)
      existing.updatedAt = new Date().toISOString()
      return existing
    }
    if (this.sessions.size >= this.maxSessions) {
      const oldestKey = this.sessions.keys().next().value
      if (oldestKey !== undefined) this.sessions.delete(oldestKey)
    }
    const now = new Date().toISOString()
    const created: SessionEntry = {
      id,
      createdAt: now,
      updatedAt: now,
      tokenByKey: new Map(),
      map: {},
      counters: new Map(),
      countsByLabel: {},
    }
    this.sessions.set(id, created)
    return created
  }

  /**
   * Re-number a RedactResult's replacements into a persistent session so that
   * the same entity receives the exact same placeholder across multiple calls
   * and files in the same session, while avoiding collisions with literal text.
   */
  apply(
    originalInput: string,
    result: RedactResult,
    sessionId?: string,
  ): {
    sessionId: string
    redacted: string
    counts: Record<string, number>
    totalRedactions: number
    map: Record<string, string>
  } {
    const session = this.getOrCreate(sessionId)
    if (result.redactions.length === 0) {
      return {
        sessionId: session.id,
        redacted: originalInput,
        counts: {},
        totalRedactions: 0,
        map: {},
      }
    }
    const counts: Record<string, number> = {}
    const localMap: Record<string, string> = {}

    // Pre-index literal `[LABEL_N]` tokens once in O(N) so collision checks stay O(1).
    const existingTokens = originalInput.includes("[")
      ? new Set(originalInput.match(EXISTING_TOKEN_RE) ?? [])
      : null

    let redacted = ""
    let cursor = 0
    for (const r of result.redactions) {
      const key = valueKey(r.label, r.value)
      let token = session.tokenByKey.get(key)
      if (token) {
        // Refresh per-session entity LRU order.
        session.tokenByKey.delete(key)
        session.tokenByKey.set(key, token)
      } else {
        let next = session.counters.get(r.label) ?? 0
        for (;;) {
          next += 1
          const candidate = `[${r.label}_${next}]`
          if (!(candidate in session.map) && !existingTokens?.has(candidate)) {
            token = candidate
            break
          }
        }
        if (session.tokenByKey.size >= this.maxEntitiesPerSession) {
          const oldestEntry = session.tokenByKey.entries().next().value
          if (oldestEntry) {
            const [oldestKey, oldestToken] = oldestEntry
            session.tokenByKey.delete(oldestKey)
            delete session.map[oldestToken]
            const oldLabel = labelFromKey(oldestKey)
            if (oldLabel && session.countsByLabel[oldLabel]) {
              session.countsByLabel[oldLabel] -= 1
              if (session.countsByLabel[oldLabel] <= 0) delete session.countsByLabel[oldLabel]
            }
          }
        }
        session.counters.set(r.label, next)
        session.tokenByKey.set(key, token)
        session.map[token] = r.value
        session.countsByLabel[r.label] = (session.countsByLabel[r.label] ?? 0) + 1
      }
      localMap[token] = r.value
      counts[r.label] = (counts[r.label] ?? 0) + 1
      redacted += originalInput.slice(cursor, r.start) + token
      cursor = r.end
    }
    redacted += originalInput.slice(cursor)

    return {
      sessionId: session.id,
      redacted,
      counts,
      totalRedactions: result.redactions.length,
      map: localMap,
    }
  }

  restore(
    text: string,
    options: { sessionId?: string; map?: Record<string, string> },
  ): { restored: string; sessionId: string | null; knownPlaceholders: number } {
    const normalizedId = options.sessionId?.trim() || undefined
    if (options.map && Object.keys(options.map).length > 0) {
      return {
        restored: restore(text, options.map),
        sessionId: normalizedId ?? null,
        knownPlaceholders: Object.keys(options.map).length,
      }
    }
    if (!normalizedId) {
      throw new Error("Provide either session_id or map to restore placeholders.")
    }
    const session = this.sessions.get(normalizedId)
    if (!session) {
      throw new Error(`Unknown session_id "${normalizedId}".`)
    }
    return {
      restored: restore(text, session.map),
      sessionId: session.id,
      knownPlaceholders: Object.keys(session.map).length,
    }
  }

  getMap(sessionId: string): Record<string, string> {
    const session = this.sessions.get(sessionId.trim())
    return session ? { ...session.map } : {}
  }

  entries(): Array<{ sessionId: string; token: string; value: string }> {
    const out: Array<{ sessionId: string; token: string; value: string }> = []
    for (const s of this.sessions.values()) {
      for (const [token, value] of Object.entries(s.map)) {
        out.push({ sessionId: s.id, token, value })
      }
    }
    return out
  }

  clearAll(): void {
    this.sessions.clear()
  }

  list(): SessionSummary[] {
    return [...this.sessions.values()].map((s) => ({
      sessionId: s.id,
      entityCount: Object.keys(s.map).length,
      countsByLabel: { ...s.countsByLabel },
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }))
  }

  clear(sessionId: string): boolean {
    return this.sessions.delete(sessionId.trim())
  }

  get size(): number {
    return this.sessions.size
  }
}

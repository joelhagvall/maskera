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

function valueKey(label: PiiLabel, value: string): string {
  return `${label.length}:${label}:${value}`
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

  constructor(maxSessions = DEFAULT_MAX_SESSIONS) {
    this.maxSessions = Math.max(1, maxSessions)
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
    const counts: Record<string, number> = {}
    const localMap: Record<string, string> = {}

    let redacted = ""
    let cursor = 0
    for (const r of result.redactions) {
      const key = valueKey(r.label, r.value)
      let token = session.tokenByKey.get(key)
      if (!token) {
        let next = session.counters.get(r.label) ?? 0
        for (;;) {
          next += 1
          const candidate = `[${r.label}_${next}]`
          if (!(candidate in session.map) && !originalInput.includes(candidate)) {
            token = candidate
            break
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
    if (options.map && Object.keys(options.map).length > 0) {
      return {
        restored: restore(text, options.map),
        sessionId: options.sessionId ?? null,
        knownPlaceholders: Object.keys(options.map).length,
      }
    }
    if (!options.sessionId) {
      throw new Error("Provide either session_id or map to restore placeholders.")
    }
    const session = this.sessions.get(options.sessionId)
    if (!session) {
      throw new Error(`Unknown session_id "${options.sessionId}".`)
    }
    return {
      restored: restore(text, session.map),
      sessionId: session.id,
      knownPlaceholders: Object.keys(session.map).length,
    }
  }

  getMap(sessionId: string): Record<string, string> {
    const session = this.sessions.get(sessionId)
    return session ? { ...session.map } : {}
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
    return this.sessions.delete(sessionId)
  }

  get size(): number {
    return this.sessions.size
  }
}

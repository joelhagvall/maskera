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
  owner: string
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
const DEFAULT_OWNER = "default"
const EXISTING_TOKEN_RE = /\[[A-ZÅÄÖ][A-ZÅÄÖ0-9_]*_\d+\]/g

function hasOwn(obj: Record<string, string>, key: string): boolean {
  return Object.hasOwn(obj, key)
}

function ownerStorageKey(owner: string, id: string): string {
  return `${owner}\0${id}`
}

function normalizeOwner(owner?: string): string {
  const trimmed = owner?.trim()
  return trimmed || DEFAULT_OWNER
}

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

  private getOrCreate(sessionId?: string, owner?: string): SessionEntry {
    const id = sessionId?.trim() || `s_${randomUUID().slice(0, 12)}`
    const resolvedOwner = normalizeOwner(owner)
    const storageKey = ownerStorageKey(resolvedOwner, id)
    const existing = this.sessions.get(storageKey)
    if (existing) {
      // Refresh LRU position.
      this.sessions.delete(storageKey)
      this.sessions.set(storageKey, existing)
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
      owner: resolvedOwner,
      createdAt: now,
      updatedAt: now,
      tokenByKey: new Map(),
      map: Object.create(null) as Record<string, string>,
      counters: new Map(),
      countsByLabel: {},
    }
    this.sessions.set(storageKey, created)
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
    owner?: string,
  ): {
    sessionId: string
    redacted: string
    counts: Record<string, number>
    totalRedactions: number
    map: Record<string, string>
  } {
    const session = this.getOrCreate(sessionId, owner)
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
          if (!hasOwn(session.map, candidate) && !existingTokens?.has(candidate)) {
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
    options: { sessionId?: string; map?: Record<string, string>; owner?: string },
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
    const resolvedOwner = normalizeOwner(options.owner)
    const session = this.sessions.get(ownerStorageKey(resolvedOwner, normalizedId))
    if (!session) {
      throw new Error(`Unknown session_id "${normalizedId}".`)
    }
    return {
      restored: restore(text, session.map),
      sessionId: session.id,
      knownPlaceholders: Object.keys(session.map).length,
    }
  }

  /**
   * Picks the session that restores `text` when the caller named none.
   * Confined strictly to sessions belonging to `owner` so a missing session_id
   * can never read another client's or the proxy's vault entries.
   */
  resolveSessionFor(text: string, owner?: string): string {
    const resolvedOwner = normalizeOwner(owner)
    const tokens = [...new Set(text.match(EXISTING_TOKEN_RE) ?? [])]
    const candidates = [...this.sessions.values()].filter(
      (s) => s.owner === resolvedOwner && tokens.every((token) => hasOwn(s.map, token)),
    )
    if (candidates.length === 0) {
      throw new Error(
        tokens.length > 0
          ? `No local session knows ${tokens.slice(0, 3).join(", ")}. Read the source with maskera_read_file or maskera_redact first, then pass its session_id.`
          : "No local session exists yet. Read the source with maskera_read_file or maskera_redact first, then pass its session_id.",
      )
    }
    const restorations = new Set(candidates.map((s) => restore(text, s.map)))
    if (restorations.size > 1) {
      throw new Error(
        `The placeholders match ${candidates.length} sessions that restore them differently (${candidates
          .map((s) => s.id)
          .join(", ")}). Pass the session_id from the maskera_read_file result.`,
      )
    }
    const latest = candidates[candidates.length - 1]
    if (!latest) throw new Error("No local session can restore this text.")
    return latest.id
  }

  getMap(sessionId: string, owner?: string): Record<string, string> {
    const resolvedOwner = normalizeOwner(owner)
    const session = this.sessions.get(ownerStorageKey(resolvedOwner, sessionId.trim()))
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

  clearOwner(owner: string): number {
    const resolvedOwner = normalizeOwner(owner)
    let removed = 0
    for (const [key, entry] of this.sessions.entries()) {
      if (entry.owner === resolvedOwner) {
        this.sessions.delete(key)
        removed += 1
      }
    }
    return removed
  }

  list(owner?: string): SessionSummary[] {
    const resolvedOwner = owner !== undefined ? normalizeOwner(owner) : undefined
    const out: SessionSummary[] = []
    for (const s of this.sessions.values()) {
      if (resolvedOwner !== undefined && s.owner !== resolvedOwner) continue
      out.push({
        sessionId: s.id,
        entityCount: Object.keys(s.map).length,
        countsByLabel: { ...s.countsByLabel },
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })
    }
    return out
  }

  clear(sessionId: string, owner?: string): boolean {
    const resolvedOwner = normalizeOwner(owner)
    return this.sessions.delete(ownerStorageKey(resolvedOwner, sessionId.trim()))
  }

  sizeForOwner(owner?: string): number {
    if (owner === undefined) return this.sessions.size
    const resolvedOwner = normalizeOwner(owner)
    let count = 0
    for (const s of this.sessions.values()) {
      if (s.owner === resolvedOwner) count += 1
    }
    return count
  }

  get size(): number {
    return this.sessions.size
  }
}

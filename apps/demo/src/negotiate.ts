// RFC 9110 §12.5.1 Accept negotiation, dependency-free so the routing
// middleware (edge bundle) and the tests share one implementation.

export type MediaRange = {
  type: string
  subtype: string
  q: number
  /** Number of media-type parameters other than q (more = more specific). */
  params: number
  /** Position in the Accept header; earlier wins ties between equal q. */
  position: number
}

/**
 * Parses an Accept header into media ranges. A missing or empty header means
 * any media type (RFC 9110: "A request without any Accept header field
 * implies that the user agent will accept any media type in response").
 */
export function parseAccept(header: string | null | undefined): MediaRange[] {
  const value = (header ?? "").trim()
  if (!value) return [{ type: "*", subtype: "*", q: 1, params: 0, position: 0 }]
  const ranges: MediaRange[] = []
  value.split(",").forEach((part, position) => {
    const [media, ...paramParts] = part.trim().split(";")
    const [rawType, rawSubtype] = media.trim().toLowerCase().split("/")
    if (!rawType) return
    let q = 1
    let params = 0
    for (const param of paramParts) {
      const [key, raw] = param.trim().split("=")
      if (key?.trim().toLowerCase() === "q") {
        const parsed = Number.parseFloat(raw ?? "")
        q = Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 1
      } else if (key?.trim()) {
        params += 1
      }
    }
    ranges.push({
      type: rawType,
      subtype: rawSubtype && rawSubtype.length > 0 ? rawSubtype : "*",
      q,
      params,
      position,
    })
  })
  return ranges.length > 0 ? ranges : [{ type: "*", subtype: "*", q: 1, params: 0, position: 0 }]
}

function specificity(range: MediaRange): number {
  if (range.type === "*") return 0
  if (range.subtype === "*") return 1
  return 2 + range.params
}

function matches(range: MediaRange, offered: string): boolean {
  const [type, subtype] = offered.toLowerCase().split("/")
  if (range.type === "*") return true
  if (range.type !== type) return false
  return range.subtype === "*" || range.subtype === subtype
}

/**
 * Picks the offered media type the client prefers. For each offered type the
 * most specific matching range decides its q (so `text/html;q=0` beats the
 * full wildcard even when the wildcard comes first). Highest q wins; ties go to the range
 * the client listed first, then to the server's offer order. Returns null
 * when nothing acceptable remains (q=0 everywhere or no match), which is the
 * 406 case.
 */
export function selectMediaType(
  acceptHeader: string | null | undefined,
  offered: readonly string[],
): string | null {
  const ranges = parseAccept(acceptHeader)
  let best: { type: string; q: number; position: number; offerIndex: number } | null = null
  offered.forEach((type, offerIndex) => {
    let chosen: MediaRange | null = null
    for (const range of ranges) {
      if (!matches(range, type)) continue
      if (
        !chosen ||
        specificity(range) > specificity(chosen) ||
        (specificity(range) === specificity(chosen) && range.position < chosen.position)
      ) {
        chosen = range
      }
    }
    if (!chosen || chosen.q <= 0) return
    const candidate = { type, q: chosen.q, position: chosen.position, offerIndex }
    if (
      !best ||
      candidate.q > best.q ||
      (candidate.q === best.q && candidate.position < best.position)
    ) {
      best = candidate
    }
  })
  return best ? (best as { type: string }).type : null
}

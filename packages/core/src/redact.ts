import { canonicalize } from "./canonicalize"
import { defaultDetectors } from "./detectors"
import type { Detection, Detector, PiiLabel, Redaction, RedactOptions, RedactResult } from "./types"

function defaultPlaceholder(label: PiiLabel, index: number): string {
  return `[${label}_${index}]`
}

// Context-labeled identifiers outrank generic numeric shapes. A Swedish phone
// number can also have the same ten-digit shape as a samordningsnummer (for
// example `070174-0658`), so prefer the phone label there: it is the more
// specific lexical format and avoids reclassifying an ordinary phone number
// merely because personnummer detection is intentionally typo-tolerant.
const SAME_SPAN_PRIORITY: Partial<Record<PiiLabel, number>> = {
  JOURNALNUMMER: -10,
  KONTONUMMER: -10,
  TELEFON: 0,
  PERSONNUMMER: 10,
  SAMORDNINGSNUMMER: 11,
}

/** A character that can carry meaning on its own, used to trim clipped edges. */
const WORD_CHAR = /[\p{L}\p{N}]/u

/**
 * Resolve overlapping detections deterministically:
 * keep the earliest start, and among equal starts the longest match.
 * This means e.g. a full IBAN wins over a postnummer hiding inside it.
 *
 * A detection that is *fully* inside a kept one is dropped. One that merely
 * *overlaps* is clipped to the part no earlier detection claimed, rather than
 * dropped: dropping it wholesale leaks the remainder in the clear. Detectors
 * genuinely reach across each other, because `.` and digits belong to the
 * e-mail local part too, so "4242 4242 4242 4242.anna@example.com" produces a
 * card span and an e-mail span starting inside it, and the naive rule left the
 * whole address unmasked. Over-masking the clipped remnant is the right side to
 * err on for a redaction tool; `redactWithNer` already clips model spans
 * against rule spans for exactly this reason.
 */
function resolveOverlaps(detections: Detection[], input: string): Detection[] {
  const sorted = [...detections].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start
    if (b.end - b.start !== a.end - a.start) return b.end - b.start - (a.end - a.start)
    const priorityA = SAME_SPAN_PRIORITY[a.label] ?? 5
    const priorityB = SAME_SPAN_PRIORITY[b.label] ?? 5
    if (priorityA !== priorityB) return priorityA - priorityB
    return a.label.localeCompare(b.label)
  })
  const kept: Detection[] = []
  let cursor = -1
  for (const d of sorted) {
    if (d.start >= cursor) {
      kept.push(d)
      cursor = d.end
      continue
    }
    if (d.end <= cursor) continue // wholly inside what we already mask
    // Partial overlap: mask the tail, trimmed to something meaningful. A
    // single leftover character is punctuation or a stray digit, never PII
    // worth a placeholder of its own.
    let start = Math.max(cursor, 0)
    let end = d.end
    while (start < end && !WORD_CHAR.test(input[start] ?? "")) start++
    while (end > start && !WORD_CHAR.test(input[end - 1] ?? "")) end--
    if (end - start < 2) continue
    kept.push({ ...d, start, end, value: input.slice(start, end) })
    cursor = end
  }
  return kept
}

/**
 * Key for the stable-placeholder cache. Length-prefixed rather than
 * `${label}::${value}`, which is ambiguous the moment a custom label contains
 * `::`: ("A::B", "c") and ("A", "B::c") would share one placeholder, and
 * restore() would then write the first value where the second one stood.
 */
function tokenKey(label: PiiLabel, value: string): string {
  return `${label.length}:${label}:${value}`
}

/**
 * Answers "does this generated token already occur in the input?" without
 * scanning the input once per redacted value.
 *
 * The plain scan is O(values × input): 4k distinct values in a 150 KB log spent
 * 237 ms in this check alone, and both factors grow with the document, so a
 * megabyte-sized log dump (the paste this library exists for) blocks for
 * seconds. The placeholders of one label share a prefix ("[EPOST_"), so one
 * scan per label settles all of them: a token carrying that prefix can only
 * occur where the prefix occurs, which is usually nowhere and is a short list
 * even when re-redacting an already redacted document. A token that does not
 * carry the prefix - `placeholder` is an arbitrary caller function, it need not
 * be prefix-stable - still takes the full scan, so the answer stays exact.
 *
 * The positions are then indexed BY TOKEN LENGTH rather than walked per query.
 * Walking them is quadratic in the number of seeded tokens, and the retry loop
 * in `redactFromDetections` is what supplies the second factor: an input seeded
 * with "[EPOST_1]".."[EPOST_N]" forces N probes, and probe k walks about k
 * positions before it finds its collision. Measured on the walk, with one real
 * e-mail in the document: 24 kB of seeded tokens took 37 ms, 50 kB took 131 ms,
 * 101 kB took 521 ms, 208 kB took 1.9 s and 427 kB took 7.7 s, a clean n^2 that
 * blocks the event loop (or freezes the tab) on an input a redaction tool is
 * expected to swallow. Grouping by length costs one pass per distinct length
 * (about six for any counter-shaped placeholder) and answers each probe in O(1).
 */
function createInputProbe(
  input: string,
  placeholder: (label: PiiLabel, index: number) => string,
): (label: PiiLabel, token: string) => boolean {
  interface Probe {
    prefix: string
    at: number[]
    /** Candidate substrings at `at`, per token length. */
    byLength: Map<number, Set<string>>
  }
  // Distinct token lengths per label, past which we stop caching and walk
  // instead. A counter-shaped placeholder produces one length per decade, so
  // this is far above any real one; it only bounds the memory a crafted
  // `placeholder` could make us hold.
  const MAX_CACHED_LENGTHS = 24
  const prefixes = new Map<PiiLabel, Probe | null>()
  return (label, token) => {
    let entry = prefixes.get(label)
    if (entry === undefined) {
      const first = placeholder(label, 1)
      const second = placeholder(label, 2)
      let n = 0
      while (n < first.length && n < second.length && first[n] === second[n]) n++
      const prefix = first.slice(0, n)
      entry = null
      if (prefix.length > 0) {
        const at: number[] = []
        for (let i = input.indexOf(prefix); i !== -1; i = input.indexOf(prefix, i + 1)) at.push(i)
        entry = { prefix, at, byLength: new Map() }
      }
      prefixes.set(label, entry)
    }
    if (entry !== null && token.startsWith(entry.prefix)) {
      let candidates = entry.byLength.get(token.length)
      if (candidates === undefined) {
        if (entry.byLength.size >= MAX_CACHED_LENGTHS) {
          return entry.at.some((i) => input.startsWith(token, i))
        }
        candidates = new Set<string>()
        for (const i of entry.at) {
          if (i + token.length <= input.length) candidates.add(input.slice(i, i + token.length))
        }
        entry.byLength.set(token.length, candidates)
      }
      return candidates.has(token)
    }
    return input.includes(token)
  }
}

/**
 * Detect and replace PII in `input`, returning the redacted text plus a
 * restore map. Placeholders are *stable*: the same value always maps to the
 * same token within one call, so an LLM can reason about `[NAMN_1]`
 * consistently and you can map results back afterwards.
 */
export function redact(input: string, options: RedactOptions = {}): RedactResult {
  return redactFromDetections(input, runDetectors(input, options.detectors), options)
}

/**
 * Run rule detectors over `input` and return their detections, with spans in
 * `input`'s own coordinates.
 *
 * Detectors do NOT see `input`; they see its canonical view (see
 * {@link canonicalize}), because a zero-width space or a fullwidth digit would
 * otherwise walk a personnummer straight past every pattern. Spans come back
 * mapped, and `value` is re-sliced from the original, so a detection always
 * describes real text: `input.slice(d.start, d.end) === d.value` holds even
 * when the folded text the detector matched looked nothing like it.
 *
 * Exported because the hybrid entry point in `maskera` needs the rule
 * detections separately from the model's, and both must fold identically.
 */
export function runDetectors(input: string, detectors: Detector[] = defaultDetectors): Detection[] {
  const canonical = canonicalize(input)
  const all: Detection[] = []
  for (const detector of detectors) {
    for (const m of detector.detect(canonical.text)) {
      if (canonical.identity) {
        all.push({ ...m, label: detector.label })
        continue
      }
      const [start, end] = canonical.span(m.start, m.end)
      all.push({ start, end, value: input.slice(start, end), label: detector.label })
    }
  }
  return all
}

/**
 * Lower-level entry point: turn a pre-computed list of detections into a
 * {@link RedactResult}. Use this when detections come from somewhere async or
 * external (e.g. an NER model in `maskera`) and you want the same stable
 * placeholder + overlap-resolution behaviour as {@link redact}.
 */
export function redactFromDetections(
  input: string,
  detections: Detection[],
  options: Pick<RedactOptions, "placeholder"> = {},
): RedactResult {
  const placeholder = options.placeholder ?? defaultPlaceholder
  const ownPlaceholder = options.placeholder === undefined

  // Spans arrive from callers too (`redactWithNer`, anything model-shaped), and
  // a malformed one does not fail loudly on its own: `resolveOverlaps` sorts a
  // reversed span into place and the rebuild loop below then *duplicates* the
  // text between `last` and `r.start` instead of removing it, which is silent
  // corruption of a document someone is redacting. Reject it instead.
  for (const d of detections) {
    if (
      !Number.isInteger(d.start) ||
      !Number.isInteger(d.end) ||
      d.start < 0 ||
      d.end > input.length ||
      d.start >= d.end
    ) {
      throw new Error(
        `maskera: detection span out of range for "${d.label}": [${d.start}, ${d.end}) ` +
          `in an input of length ${input.length}`,
      )
    }
    // `value` is what `restore()` writes back, and nothing downstream ever
    // re-derives it from the span. A detection whose value disagrees with its
    // own span therefore does not fail, it silently rewrites the document:
    // ({start: 5, end: 18, value: "HELT ANNAT"}) restores "Ring HELT ANNAT
    // imorgon." over "Ring Anna Svensson imorgon.". Same argument as the span
    // check above, so the same treatment.
    if (d.value !== input.slice(d.start, d.end)) {
      throw new Error(
        `maskera: detection value for "${d.label}" does not match its span [${d.start}, ${d.end}): ` +
          `expected ${JSON.stringify(input.slice(d.start, d.end))}, got ${JSON.stringify(d.value)}`,
      )
    }
    // The default placeholder wraps the label in brackets, which only delimits
    // anything as long as the label carries none of its own. A label from an
    // external model ("X] [PERSONNUMMER_1", say) otherwise produces the token
    // "[X] [PERSONNUMMER_1_1]", and the redacted text an LLM sees then contains
    // the literal string "[PERSONNUMMER_1]" at a place the real personnummer
    // never stood. Echo that fragment back and `restore()` writes the real
    // value into it: a document-controlled exfiltration primitive.
    //
    // Banning both brackets is exactly enough for this placeholder. A token is
    // "[" + label + "_" + digits + "]"; with no bracket inside the label its
    // only "[" is the first character and its only "]" the last, so any other
    // token contained in it would have to be the token itself. `maskera`'s
    // `defaultLabelMap` already strips this at the source; this is the guard
    // for everyone calling core directly, which the doc comment invites.
    if (ownPlaceholder && (d.label.includes("[") || d.label.includes("]"))) {
      throw new Error(
        `maskera: label ${JSON.stringify(d.label)} contains a bracket, which would nest inside ` +
          "the default placeholder and let one token be read as another. Sanitise the label " +
          "(see defaultLabelMap in maskera) or pass your own placeholder().",
      )
    }
  }

  const resolved = resolveOverlaps(detections, input)

  // Stable numbering: same value under the same label reuses its placeholder.
  const counters = new Map<PiiLabel, number>()
  const shortestToken = new Map<PiiLabel, number>()
  const tokenByKey = new Map<string, string>()
  const map: Record<string, string> = {}
  const redactions: Redaction[] = []
  const occursInInput = createInputProbe(input, placeholder)

  for (const d of resolved) {
    const key = tokenKey(d.label, d.value)
    let token = tokenByKey.get(key)
    if (!token) {
      // Never hand out a token that already occurs literally in the input
      // (a crafted "[NAMN_1]" in the input would collide with a generated
      // placeholder, and restore() would write the real value into positions
      // the author of the input chose), and never a token another value
      // already owns (a custom placeholder() that ignores the index would
      // otherwise silently map two values to one token and corrupt restore).
      let next = counters.get(d.label) ?? 0
      let attempts = 0
      for (;;) {
        next += 1
        token = placeholder(d.label, next)
        attempts += 1
        const shortest = Math.min(shortestToken.get(d.label) ?? Infinity, token.length)
        shortestToken.set(d.label, shortest)
        if (token.length > 0 && !occursInInput(d.label, token) && !(token in map)) break
        // Giving up after a fixed number of tries made a crafted input a denial
        // of service: seeding "[EPOST_1]".."[EPOST_100]" was enough to make
        // every later redact() throw. An input can only hold
        // input.length / token.length distinct colliding tokens OF ONE LENGTH,
        // but the colliding tokens in the input need not share the length of
        // the token being probed: counter-shaped placeholders grow with the
        // index ("[PERSONNUMMER_1001]" is longer than "[PERSONNUMMER_1]"), so
        // dividing by the CURRENT token's length underestimates how many
        // collisions fit - 1000 concatenated short tokens occupy ~17 KB while
        // the bound computed from the longer 1001st token came out below 1000,
        // and redact() threw on an input it should simply have worked through.
        // Dividing by the SHORTEST token this label has produced is the safe
        // bound: it never underestimates the collision count. Past it the
        // placeholder() itself is broken (it ignores the index) and no
        // further index will help.
        if (token.length === 0 || attempts > 8 + input.length / shortest) {
          throw new Error(
            "maskera: placeholder() must return a token that is unique per (label, index) " +
              "and does not occur in the input",
          )
        }
      }
      counters.set(d.label, next)
      tokenByKey.set(key, token)
      map[token] = d.value
    }
    redactions.push({ ...d, replacement: token })
  }

  // Rebuild the string left-to-right.
  let text = ""
  let last = 0
  for (const r of redactions) {
    text += input.slice(last, r.start)
    text += r.replacement
    last = r.end
  }
  text += input.slice(last)

  return {
    text,
    redactions,
    map,
    restore: (s: string) => restore(s, map),
  }
}

/**
 * Re-insert original values into a string that contains placeholder tokens.
 * Safe to call on LLM output that echoes the placeholders back.
 */
export function restore(text: string, map: Record<string, string>): string {
  const tokens = Object.keys(map).filter((t) => t.length > 0)
  if (tokens.length === 0) return text

  // One left-to-right pass over a trie of the tokens, rather than a
  // split/join per token. Two reasons, and the first one is correctness:
  // replacing token by token re-scans text that was already restored, so a
  // value that happens to contain another token ("Anna [EPOST_1]" as a NAMN
  // value handed in via redactFromDetections) got substituted a second time
  // and the output was neither the placeholder nor the original. A single pass
  // never revisits what it wrote. The second is cost: split/join is O(tokens ×
  // text), which is the same product that made redaction slow on large logs.
  // Matching the deepest node at each position keeps the old longest-first
  // rule, so `[X_10]` still wins over `[X_1]`.
  const root: TrieNode = { next: new Map() }
  for (const token of tokens) {
    let node = root
    // Indexed by UTF-16 unit, the same way the scan below reads the text: a
    // code-point walk here would key a surrogate pair as one two-unit string
    // and never match.
    for (let k = 0; k < token.length; k++) {
      const ch = token[k] as string
      let child = node.next.get(ch)
      if (!child) {
        child = { next: new Map() }
        node.next.set(ch, child)
      }
      node = child
    }
    node.value = map[token]
  }

  let out = ""
  let last = 0
  let i = 0
  while (i < text.length) {
    let node = root.next.get(text[i] as string)
    let matchEnd = -1
    let matchValue: string | undefined
    let j = i
    while (node) {
      j++
      if (node.value !== undefined) {
        matchEnd = j
        matchValue = node.value
      }
      node = j < text.length ? node.next.get(text[j] as string) : undefined
    }
    if (matchValue === undefined) {
      i++
      continue
    }
    out += text.slice(last, i) + matchValue
    i = matchEnd
    last = i
  }
  return out + text.slice(last)
}

type TrieNode = { value?: string; next: Map<string, TrieNode> }

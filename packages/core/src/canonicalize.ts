/**
 * The detection-time view of an input string, plus a map back to the original
 * offsets.
 *
 * Detectors are pattern matchers over ASCII-ish shapes: `\d`, `[A-ZÅÄÖ]`, a
 * literal space. That makes every character that renders as nothing, or renders
 * as a digit without being one, a one-character bypass of the whole rule layer.
 * Measured before this existed, on `redact()` defaults:
 *
 *   "850601-2387"                     -> PERSONNUMMER
 *   "850601" + U+200B + "2387"        -> nothing
 *   "8506" + U+00AD + "012387"        -> nothing
 *   "850601" + U+2060 + "2387"        -> nothing
 *   "850601" + U+2009/U+202F + "2387" -> nothing
 *   "８５０６０１２３８７" (fullwidth)      -> nothing
 *   "anna@exa" + U+200B + "mple.com"  -> nothing
 *
 * All of those render identically (or near enough) to the real thing, and an
 * LLM tokenizer drops the invisible ones outright, so the model downstream reads
 * the personnummer that maskera reported as clean. It is not only an adversary
 * either: U+00AD is what PDF de-hyphenation leaves behind and U+202F is what
 * Word and typographic number formatting insert, so ordinary document pipelines
 * hit this without anyone trying.
 *
 * So detectors run against a canonical view instead: invisible characters
 * removed, compatibility characters folded via NFKC. The ORIGINAL string is
 * still what gets rebuilt and what `value` is sliced from, so `restore()` round
 * trips byte for byte; only the matching sees the folded text.
 */
export interface CanonicalText {
  /** The folded text to run detectors against. */
  readonly text: string
  /** True when {@link text} is the input unchanged, i.e. nothing was folded. */
  readonly identity: boolean
  /**
   * Map a `[start, end)` span in {@link text} to the span in the original input
   * that produced it. An invisible character sitting INSIDE the span is covered
   * by the result (so the mask swallows it); one sitting just outside is not.
   */
  span(start: number, end: number): [number, number]
}

/**
 * Characters that occupy no visual space but split a digit or letter run in two.
 *
 * `\p{Cf}` is the bulk of them: U+00AD SOFT HYPHEN, U+200B ZERO WIDTH SPACE,
 * U+200C/U+200D the joiners, U+2060 WORD JOINER, U+FEFF, and the bidi controls
 * U+200E..U+200F / U+202A..U+202E (the Trojan Source family). Then:
 *
 * - `\p{Me}`, the enclosing combining marks. They are `\p{M}` and therefore
 *   survive NFKC, but never compose with their starter: "8" + U+20E3 (keycap)
 *   stays two code points that RENDER as a boxed 8, so a keycap sequence read
 *   as a perfect personnummer while every detector saw noise.
 * - The blank-rendered spaces that are neither `\p{Cf}` nor JS `\s` and that
 *   NFKC does not fold away: U+2800 BRAILLE PATTERN BLANK and the Hangul
 *   fillers U+115F / U+1160 / U+3164 / U+FFA0. "850601<U+2800>2387" renders
 *   exactly like the canonical spaced form, and U+3164/U+FFA0 fold to U+1160,
 *   which stays blank, so folding alone did not close this.
 * - The C0/C1 control characters except \t \n \r \f: U+0000..U+0008, U+000B,
 *   U+000E..U+001F and U+007F..U+009F. They are invisible in most renderers
 *   and split every pattern, while \t \n \r \f stay as genuine separators
 *   (DIGIT_RUN deliberately does not fuse numbers across line breaks).
 *
 * What remains of `\p{M}` is kept on purpose: U+034F and the variation
 * selectors below are invisible combining marks that survive NFKC, while real
 * marks (accents) must stay so they can compose with their starter.
 *
 * Dropping the joiners costs nothing here because this view is never rendered
 * and never restored from; it only decides where a detector matches.
 */
const INVISIBLE_SOURCE =
  "[\\p{Cf}\\p{Me}\\u034f\\ufe00-\\ufe0f\\u{e0100}-\\u{e01ef}\\u2800\\u115f\\u1160\\u3164\\uffa0\\u0000-\\u0008\\u000b\\u000e-\\u001f\\u007f-\\u009f]"
const INVISIBLE = new RegExp(INVISIBLE_SOURCE, "u")
const INVISIBLE_RUN = new RegExp(`${INVISIBLE_SOURCE}+`, "gu")
const MARK = /\p{M}/u

/**
 * One stretch of the mapping. `linear` segments came through untouched, so an
 * offset inside them shifts by a constant; folded ones changed length or shape,
 * so every canonical offset inside them maps to the whole original range.
 */
interface Segment {
  /** Start of this segment in the canonical text. */
  c: number
  /** Start of the original range that produced it. */
  o: number
  /** End of that original range. */
  oEnd: number
  linear: boolean
}

const identityView = (input: string): CanonicalText => ({
  text: input,
  identity: true,
  span(start, end) {
    // Clamped exactly like the folded path below. A detector handing back an
    // out-of-range span is a bug either way, but it must not be a bug whose
    // symptoms depend on whether the input happened to contain a zero-width
    // space: that is the kind of difference that shows up once, in production.
    return clampSpan(start, end, input.length)
  },
})

function clampSpan(start: number, end: number, length: number): [number, number] {
  const lo = start < 0 || !Number.isFinite(start) ? 0 : start > length ? length : start
  const hi = end > length || !Number.isFinite(end) ? length : end < lo ? lo : end
  return [lo, hi]
}

/**
 * Build the canonical view of `input`.
 *
 * The common case (no invisible characters, already NFKC) returns the input
 * itself with an identity map and costs one regex scan plus one `normalize`
 * quick check, so ordinary Swedish prose pays almost nothing.
 */
export function canonicalize(input: string): CanonicalText {
  if (!INVISIBLE.test(input) && input.normalize("NFKC") === input) return identityView(input)

  const segments: Segment[] = []
  // Folding one code point at a time is only equivalent to folding the whole
  // string because NFKC never composes across two starters (Hangul jamo aside,
  // which no PII shape cares about). Combining marks DO compose with the
  // starter before them, so a base plus its marks is folded as one unit.
  const folded = new Map<number, string>()
  let text = ""
  let runStart = -1
  let i = 0

  const closeRun = (end: number) => {
    if (runStart < 0) return
    segments.push({ c: text.length, o: runStart, oEnd: end, linear: true })
    text += input.slice(runStart, end)
    runStart = -1
  }

  while (i < input.length) {
    const cp = input.codePointAt(i) as number
    // PRINTABLE ASCII is never invisible, never a mark and always NFKC-stable,
    // and it is most of any document. Skipping the per-character work here is
    // what keeps the folded path from costing more than the detection it
    // feeds. "Printable" is load-bearing: the C0/C1 controls are stripped
    // (see INVISIBLE_SOURCE), and 0x00-0x1F / 0x7F are all below 0x80, so a
    // plain `cp < 0x80` fast path smuggled them straight into the folded text
    // and "850601-23<U+0001>87" still walked past every detector. \t \n \f \r
    // are kept on the fast path explicitly: they are separators, not noise.
    //
    // Unless a combining mark follows it: "Åsa" arrives from PDF extraction and
    // from macOS paths as A + U+030A, and folding that pair is how it becomes
    // something `[A-ZÅÄÖ]` can match at all. Marks start at U+0300, so one
    // comparison keeps ordinary text (including å, ä and ö, which are far
    // below that) on the fast path.
    const isPlainAscii =
      (cp >= 0x20 && cp < 0x7f) || cp === 0x09 || cp === 0x0a || cp === 0x0c || cp === 0x0d
    if (isPlainAscii && (i + 1 >= input.length || input.charCodeAt(i + 1) < 0x300)) {
      if (runStart < 0) runStart = i
      i++
      continue
    }

    const size = cp > 0xffff ? 2 : 1
    let j = i + size
    while (j < input.length) {
      const next = input.codePointAt(j) as number
      if (next < 0x80) break
      const nextSize = next > 0xffff ? 2 : 1
      if (!MARK.test(input.slice(j, j + nextSize))) break
      j += nextSize
    }

    const raw = input.slice(i, j)
    let result: string
    if (j === i + size) {
      let cached = folded.get(cp)
      if (cached === undefined) {
        cached = INVISIBLE.test(raw) ? "" : raw.normalize("NFKC")
        folded.set(cp, cached)
      }
      result = cached
    } else {
      result = raw.replace(INVISIBLE_RUN, "").normalize("NFKC")
    }

    if (result === raw) {
      if (runStart < 0) runStart = i
    } else {
      closeRun(i)
      if (result.length > 0) {
        segments.push({ c: text.length, o: i, oEnd: j, linear: false })
        text += result
      }
      // A dropped character contributes no segment at all. The next segment's
      // `o` therefore starts after it, which is what makes an invisible sitting
      // inside a detection fall inside the mapped span.
    }
    i = j
  }
  closeRun(input.length)

  return {
    text,
    identity: text === input,
    span(start, end) {
      const [lo, hi] = clampSpan(start, end, text.length)
      // Every visible character was dropped, so there is nothing to map from.
      if (segments.length === 0) return [0, 0]
      const head = segments[segmentAt(segments, lo)] as Segment
      const mappedStart = head.linear ? head.o + (lo - head.c) : head.o
      if (hi <= lo) return [mappedStart, mappedStart]
      const tail = segments[segmentAt(segments, hi - 1)] as Segment
      const mappedEnd = tail.linear ? tail.o + (hi - tail.c) : tail.oEnd
      return [mappedStart, mappedEnd < mappedStart ? mappedStart : mappedEnd]
    },
  }
}

/** Index of the last segment starting at or before canonical offset `c`. */
function segmentAt(segments: Segment[], c: number): number {
  let lo = 0
  let hi = segments.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if ((segments[mid] as Segment).c <= c) lo = mid
    else hi = mid - 1
  }
  return lo
}

/**
 * Eval scoring for the Swedish NER model. Pure functions, no dependencies.
 *
 * The NER model is probabilistic, so we don't assert exact equality the way a
 * unit test does, we *measure* it against the gold corpus and report:
 *
 *   - precision: of what the model flagged, how much was correct
 *   - recall:    of the real entities, how many the model found
 *   - f1:        the harmonic mean (the single headline number)
 *   - leaks:     gold entities the model missed ENTIRELY (zero overlap), the
 *                safety-critical metric, because a missed name is a PII leak
 *
 * Matching is by exact character span (start + end). `spanF1` ignores the
 * label (did we cover the PII at all?), `labeledF1` also requires the right
 * label. For redaction, spanF1 / leaks matter most; labeledF1 is informational.
 */

/**
 * Resolve { value, label, nth } entities into character spans within `text`.
 * Throws if a value can't be found, that means the corpus entry is wrong, and
 * we want it to fail loudly rather than silently score against a bad span.
 *
 * @param {string} text
 * @param {Array<{ value: string, label: string, nth?: number }>} entities
 * @returns {Array<{ start: number, end: number, label: string, value: string }>}
 */
export function resolveSpans(text, entities) {
  return entities.map((e) => {
    const nth = e.nth ?? 1
    let from = 0
    let idx = -1
    for (let k = 0; k < nth; k++) {
      idx = text.indexOf(e.value, from)
      if (idx < 0) break
      from = idx + 1
    }
    if (idx < 0) {
      throw new Error(`corpus: value "${e.value}" (occurrence ${nth}) not found in: ${text}`)
    }
    return { start: idx, end: idx + e.value.length, label: e.label, value: e.value }
  })
}

const sameSpan = (a, b) => a.start === b.start && a.end === b.end
const overlaps = (a, b) => a.start < b.end && b.start < a.end

/**
 * Score one document's predictions against its gold spans.
 *
 * @param {Array<{start:number,end:number,label:string}>} gold
 * @param {Array<{start:number,end:number,label:string}>} pred
 */
export function scoreDocument(gold, pred) {
  const goldUsed = new Array(gold.length).fill(false)
  let spanTp = 0
  let labeledTp = 0

  for (const p of pred) {
    // Exact-span match against an as-yet-unused gold entity.
    const gi = gold.findIndex((g, i) => !goldUsed[i] && sameSpan(g, p))
    if (gi >= 0) {
      goldUsed[gi] = true
      spanTp++
      if (gold[gi].label === p.label) labeledTp++
    }
  }

  // A leak = a gold entity with no *overlapping* prediction at all. Stricter
  // than "no exact match": a partial overlap at least masks some of the span.
  const leaks = gold.filter((g) => !pred.some((p) => overlaps(g, p)))

  return {
    goldCount: gold.length,
    predCount: pred.length,
    spanTp,
    labeledTp,
    spanFp: pred.length - spanTp,
    spanFn: gold.length - spanTp,
    leaks,
  }
}

const ratio = (num, den) => (den === 0 ? 1 : num / den)
const f1 = (p, r) => (p + r === 0 ? 0 : (2 * p * r) / (p + r))

/**
 * Aggregate per-document results into corpus-wide metrics.
 *
 * @param {ReturnType<typeof scoreDocument>[]} docResults
 */
export function aggregate(docResults) {
  const sum = (key) => docResults.reduce((acc, d) => acc + d[key], 0)
  const support = sum("goldCount")
  const predicted = sum("predCount")
  const spanTp = sum("spanTp")
  const labeledTp = sum("labeledTp")
  const leakCount = docResults.reduce((acc, d) => acc + d.leaks.length, 0)

  const spanPrecision = ratio(spanTp, predicted)
  const spanRecall = ratio(spanTp, support)
  const labeledPrecision = ratio(labeledTp, predicted)
  const labeledRecall = ratio(labeledTp, support)

  return {
    support, // total gold entities
    predicted, // total model predictions
    spanPrecision,
    spanRecall,
    spanF1: f1(spanPrecision, spanRecall),
    labeledPrecision,
    labeledRecall,
    labeledF1: f1(labeledPrecision, labeledRecall),
    leakCount, // gold entities missed entirely, keep this at/near zero
    leakRate: ratio(leakCount, support),
  }
}

/**
 * Run a whole corpus through a recognizer-like function and return metrics.
 * `detect` takes the sentence text and returns predicted spans
 * ([{start,end,label}]). This is model-agnostic: pass the real model in
 * run-eval.mjs, or a stub in tests.
 *
 * @param {Array<{text:string, entities:Array<{value:string,label:string,nth?:number}>}>} corpus
 * @param {(text:string) => Array<{start:number,end:number,label:string}>} detect
 */
export function evaluate(corpus, detect) {
  const perDoc = corpus.map((doc) => {
    const gold = resolveSpans(doc.text, doc.entities)
    const pred = detect(doc.text)
    return { doc, result: scoreDocument(gold, pred) }
  })
  return {
    metrics: aggregate(perDoc.map((d) => d.result)),
    perDoc,
  }
}

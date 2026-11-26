/**
 * EXPERIMENTAL clinical precision filter backed by the Swedish code lists
 * (ICD-10-SE and KVÅ, see build-clinical-lexicon.mjs). Not shipped: it lives
 * next to benchmark-clinical-retention.mjs, which composes it through
 * redactWithNer's `detectionFilter`, so it can be measured without touching
 * the release-locked runtime. Moving it into the clinical profile is a
 * release step of its own (new suite checksum, `pnpm eval:release`).
 *
 * It drops a MODEL detection only when every word in it is clinical
 * vocabulary, so "Kvinna", "Gonartros", "överarmen", "höftfraktur" and
 * "Parkinsons sjukdom" stay readable. Rule detections (personnummer, phone)
 * are never touched, and neither is a detection holding a known given name,
 * surname or town ("Lisa Parkinson" stays masked).
 *
 * A capitalized word inside a sentence is kept masked unless it is clearly a
 * diagnosis (an eponym before a head noun, or a compound ending in a
 * diagnosis): a bare "Frisk" or "Berg" there is more likely a surname.
 */

/** Care words the code texts lack or only have in another form. Keep this short. */
const CARE_TERMS = new Set([
  "pat",
  "patient",
  "patienten",
  "kvinna",
  "kvinnan",
  "man",
  "mannen",
  "flicka",
  "flickan",
  "pojke",
  "pojken",
  "gravid",
  "stemi",
  "nstemi",
  "pci",
  "ekg",
  "mb",
  "morbus",
])
/** What a compound eponym diagnosis ends in: Monteggiafraktur, Bankartskada, Charcotfot. */
const DIAGNOSIS_TAILS = [
  "fraktur",
  "skada",
  "ruptur",
  "seneruptur",
  "cysta",
  "fot",
  "tumör",
  "sarkom",
  "lymfom",
  "syndrom",
  "sjukdom",
  "kontraktur",
  "tendinit",
  "pares",
  "borrelia",
]
/** Nouns a capitalized genitive names a diagnosis with: Perthes sjukdom, Wilms tumör. */
const DIAGNOSIS_HEADS = new Set([
  "sjukdom",
  "syndrom",
  "tumör",
  "sarkom",
  "lymfom",
  "fraktur",
  "kontraktur",
  "pares",
  "fenomen",
  "tyreoidit",
  "encefalopati",
  "esofagus",
  "cysta",
])
const SUFFIXES = [
  "arna",
  "erna",
  "orna",
  "en",
  "et",
  "na",
  "ar",
  "er",
  "or",
  "n",
  "t",
  "s",
  "a",
  "e",
]
const LETTERS = /\p{L}/u

export function createClinicalLexiconFilter(lexicon) {
  const words = new Set(lexicon.words)
  const eponyms = new Set(lexicon.eponyms)
  const heads = new Set(lexicon.heads)
  const acronyms = new Set(lexicon.acronyms)
  const protectedNames = new Set((lexicon.protectedNames ?? []).map((n) => n.toLowerCase()))

  // Latin spelling of a Swedish term: coxartros for koxartros.
  const known = (word) =>
    words.has(word) ||
    CARE_TERMS.has(word) ||
    (word.startsWith("c") && words.has(`k${word.slice(1)}`))
  const stemmed = (word) =>
    known(word) ||
    SUFFIXES.some(
      (s) => word.endsWith(s) && word.length - s.length >= 3 && known(word.slice(0, -s.length)),
    )

  /** A word, its inflection, or a compound of two such parts (höft+fraktur, nyckelben+s+fraktur). */
  function covered(word, depth = 0) {
    if (stemmed(word)) return true
    if (depth > 1) return false
    for (let i = 3; i <= word.length - 3; i++) {
      const left = word.slice(0, i)
      const right = word.slice(i)
      const leftOk =
        covered(left, depth + 1) ||
        (left.endsWith("s") && left.length > 3 && covered(left.slice(0, -1), depth + 1))
      if (leftOk && stemmed(right)) return true
    }
    return false
  }

  /**
   * Each part of a hyphenated word covered, or a single letter (Weber B-fraktur).
   * At least one part must be a word: a spelled-out name (k-a-j-s-a) is not.
   */
  const coveredToken = (token) => {
    const parts = token.toLowerCase().split("-")
    return (
      parts.some((part) => part.length > 1 && !/^\d+$/.test(part)) &&
      parts.every((part) => part.length <= 1 || /^\d+$/.test(part) || covered(part))
    )
  }

  const eponymTail = (token) =>
    /^\p{Lu}/u.test(token) &&
    DIAGNOSIS_TAILS.some(
      (tail) => token.toLowerCase().endsWith(tail) && token.length - tail.length >= 3,
    )

  return (detection, input, source) => {
    if (source === "rule") return true
    const value = detection.value.trim()
    const tokens = value.split(/\s+/).filter((t) => LETTERS.test(t))
    if (!tokens.length) return true
    const lowered = tokens.map((t) => t.toLowerCase().replace(/[’']s?$/, ""))
    if (lowered.some((t) => t.split("-").some((part) => protectedNames.has(part)))) return true

    const before = input.slice(0, detection.start)
    const sentenceStart = /(?:^|[.:;!?\n]\s*)$/.test(before)
    const after = input
      .slice(detection.end)
      .match(/^\s+(\p{L}+)/u)?.[1]
      ?.toLowerCase()

    // "Mb Paget", "Morbus Bechterew": a diagnosis by definition.
    if ((lowered[0] === "mb" || lowered[0] === "morbus") && tokens.length >= 2) return false
    // "Parkinsons" before "sjukdom", "Downs syndrom", "Guillain-Barrés syndrom".
    const last = lowered[lowered.length - 1]
    const isEponym = (t) =>
      t
        .split("-")
        .every((part) => eponyms.has(part) || eponyms.has(part.replace(/s$/, "")) || covered(part))
    // A capitalized genitive before a diagnosis noun: Wilms tumör, Perthes sjukdom. The code
    // lists lack many eponyms, so the shape decides. Trade-off: "Holmquists sjukdom" about a
    // patient would be unmasked too; a bare "Holmquist" never is.
    const genitive = (token) => /^\p{Lu}[\p{L}'’-]*s$/u.test(token)
    const diagnosisNoun = (word) => word !== undefined && DIAGNOSIS_HEADS.has(word)
    if (
      tokens.length === 1 &&
      (isEponym(lowered[0]) || genitive(tokens[0])) &&
      (diagnosisNoun(after) || (isEponym(lowered[0]) && after !== undefined && heads.has(after)))
    )
      return false
    if (
      tokens.length >= 2 &&
      (heads.has(last) || diagnosisNoun(last) || coveredToken(last)) &&
      tokens
        .slice(0, -1)
        .every((t, i) => isEponym(lowered[i]) || genitive(t) || eponymTail(t) || coveredToken(t))
    )
      return false
    // Achillesseneruptur, Lisfrancskada, Monteggiafraktur.
    if (tokens.length === 1 && eponymTail(tokens[0])) return false

    // Acronyms from the code texts or the care terms: KOL, AML, STEMI. Never a surname.
    const acronym = (t) => t.length <= 6 && t === t.toUpperCase()
    if (tokens.every((t) => acronym(t) && (acronyms.has(t.toLowerCase()) || coveredToken(t))))
      return false

    if (!tokens.every(coveredToken)) return true
    // Ordinary vocabulary: drop unless it is a capitalized word inside a sentence (a likely surname).
    const capitalizedInside = !sentenceStart && /^\p{Lu}/u.test(tokens[0])
    return capitalizedInside
  }
}

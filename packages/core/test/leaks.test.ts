import { describe, expect, it } from "vitest"
import { redact } from "../src/index"

/**
 * LEAK REGRESSION SUITE.
 *
 * This is the most important file for hardening the package over time. Every
 * time a real input leaks PII (a value reaches the output unredacted) or is
 * mangled, add it here as a new case. The suite then guarantees that specific
 * failure can never silently come back.
 *
 * Two kinds of regression:
 *   - `mustRedact`: a value that MUST be gone from the output (false negative).
 *   - `mustKeep`:   a value that must SURVIVE untouched (false positive / over-redaction).
 *
 * Keep each case short, with a one-line note on where it came from.
 */

interface LeakCase {
  /** Where this came from, issue link, user report, demo session, etc. */
  note: string
  input: string
  /** Substrings that must NOT appear in the redacted output. */
  mustRedact?: string[]
  /** Substrings that must STILL appear in the redacted output. */
  mustKeep?: string[]
}

const CASES: LeakCase[] = [
  {
    note: "baseline: classic mixed PII sentence",
    input: "Anna Berg, 900101-2385, anna@example.com, 070-174 06 58.",
    mustRedact: ["900101-2385", "anna@example.com", "070-174 06 58"],
  },
  {
    note: "personnummer in 12-digit form must not slip through",
    input: "Inskriven med 199001012385 i systemet.",
    mustRedact: ["199001012385"],
  },
  {
    note: "IBAN with spaces, the whole account, not just chunks",
    input: "Lön till SE42 8000 0890 1191 4616 8423 den 25:e.",
    mustRedact: ["SE42 8000 0890 1191 4616 8423"],
  },
  {
    note: "email embedded in punctuation (parentheses) still detected",
    input: "Kontakt (lars.svensson@example.org) gäller.",
    mustRedact: ["lars.svensson@example.org"],
  },
  {
    note: "false-positive guard: a plain year range is not a phone/PII number",
    input: "Projektet pågick 2019-2024 enligt rapporten.",
    mustKeep: ["2019-2024"],
  },
  {
    note: "false-positive guard: an invalid personnummer-shaped ref id is kept",
    input: "Ärendenummer 123456-0000 hänvisas till handläggaren.",
    mustKeep: ["123456-0000"],
  },
  {
    note: "false-positive guard: ordinary words must never be redacted",
    input: "Vi träffas på fredag och pratar om budgeten.",
    mustKeep: ["Vi träffas på fredag och pratar om budgeten."],
  },
  // Overlap resolution used to DROP a detection that merely overlapped the one
  // it kept, which left the dropped value in the clear. Digits and "." belong
  // to the e-mail local part too, so an identifier butted straight against an
  // address produces exactly that shape, and the whole address survived.
  {
    note: "overlap leak: card butted against an email (no space) left the address exposed",
    input: "Betalning mottagen 4242 4242 4242 4242.anna@example.com bekräftar.",
    mustRedact: ["anna@example.com", "4242 4242 4242 4242"],
  },
  {
    note: "overlap leak: phone butted against an email left the address exposed",
    input: "Ring 070-174 06 58.anna@example.com så fixar vi det.",
    mustRedact: ["anna@example.com", "070-174 06 58"],
  },
  {
    note: "overlap leak: a URL swallowing a phone left the phone's tail behind",
    input: "Se https://example.com/x-070-174 06 58 för detaljer.",
    mustRedact: ["06 58"],
  },
  {
    note: "the winning span is still masked whole when the loser is inside it",
    input: "Betala till SE4280000890119146168423 idag.",
    mustRedact: ["SE4280000890119146168423"],
  },
  // A word boundary was all it took to walk a personnummer past the filter:
  // one appended digit dropped detection from 100% to 0%, every time.
  {
    note: "boundary bypass: personnummer with a digit stuck to it",
    input: "Journalanteckning för 900101-23857 avslutad.",
    mustRedact: ["900101-2385"],
  },
  {
    note: "boundary bypass: personnummer concatenated with the next value",
    input: "Poster: 900101-2385192.0.2.1 i loggen.",
    mustRedact: ["900101-2385"],
  },
  {
    note: "false-positive guard: a plain order number stays untouched",
    input: "Order 100200-3000 levererad, referens 4711829.",
    mustKeep: ["100200-3000", "4711829"],
  },
  {
    note: "false-positive guard: an ISO date and a timestamp are not identifiers",
    input: "Mötet 2026-07-24 loggades vid 1753387200 utan fel.",
    mustKeep: ["2026-07-24", "1753387200"],
  },
  // U+1680 OGHAM SPACE MARK (the space between "850601" and "2387" below)
  // matches JS `\s` and renders as a space, but NFKC does not fold it to
  // U+0020 — it is the one horizontal whitespace canonicalize() leaves behind.
  // The digit-run gap class named only space/tab/NBSP, so one character split
  // the run and the personnummer walked past the checksum detectors.
  {
    note: "canonical bypass: personnummer split by U+1680 ogham space",
    input: "Inskriven med 850601 2387 i systemet.",
    mustRedact: ["850601 2387"],
  },
  // The blank-rendered characters that are neither \p{Cf} nor JS \s and that
  // NFKC does not fold away: they render as an ordinary space (or nothing),
  // so the split personnummer looked exactly like the canonical spaced form
  // while every detector saw two unrelated numbers.
  {
    note: "canonical bypass: personnummer split by U+2800 braille blank",
    input: "Inskriven med 850601⠀2387 i systemet.",
    mustRedact: ["850601⠀2387"],
  },
  {
    note: "canonical bypass: personnummer split by U+3164 hangul filler",
    input: "Inskriven med 850601ㅤ2387 i systemet.",
    mustRedact: ["850601ㅤ2387"],
  },
  // C0/C1 controls are invisible in most renderers. They were below 0x80, so
  // the ASCII fast path in canonicalize() waved them straight through even
  // after the strip set learned them — both paths had to close.
  {
    note: "canonical bypass: personnummer split by U+0001 control character",
    input: "Inskriven med 850601-23\u000187 i systemet.",
    mustRedact: ["850601-23\u000187"],
  },
  {
    note: "canonical bypass: personnummer split by U+007F DEL",
    input: "Inskriven med 850601-23\u007F87 i systemet.",
    mustRedact: ["850601-23\u007F87"],
  },
  // Keycap sequences: "8" + U+20E3 renders as a boxed 8 but never composes
  // under NFKC, so the run read as a perfect personnummer to the eye and as
  // noise to the detectors. \p{Me} is now stripped from the detection view.
  {
    note: "canonical bypass: keycap-combining personnummer",
    input: "Inskriven med 8⃣5⃣0⃣6⃣0⃣1⃣2⃣3⃣8⃣7⃣ i systemet.",
    mustRedact: ["8⃣5⃣0⃣6⃣0⃣1⃣2⃣3⃣8⃣7⃣"],
  },
  // The e-mail detector's letter set was [A-ZÅÄÖ0-9]: any other diacritic
  // (andré, zoë, münchen) or a Cyrillic confusable next to the @ or in the
  // domain left no match position at all, and the address rendered like an
  // ordinary one.
  {
    note: "email bypass: diacritic next to the @",
    input: "Mejla anné@example.com i ärendet.",
    mustRedact: ["anné@example.com"],
  },
  {
    note: "email bypass: Cyrillic confusable in the local part",
    input: "Mejla annа@example.com i ärendet.",
    mustRedact: ["annа@example.com"],
  },
  {
    note: "email bypass: non-ASCII domain",
    input: "Mejla anna@münchen.se i ärendet.",
    mustRedact: ["anna@münchen.se"],
  },
  // The separator policy is deliberate: line and page breaks do NOT fuse two
  // number columns into a candidate, only the invisible/blank characters do.
  {
    note: "fusion guard: a form feed still separates two number columns",
    input: "Belopp 850601\f2387 enligt tabellen.",
    mustKeep: ["850601", "2387"],
  },
]

describe("leak regression suite", () => {
  for (const c of CASES) {
    it(c.note, () => {
      const { text } = redact(c.input)
      for (const leaked of c.mustRedact ?? []) {
        expect(text, `leaked "${leaked}"`).not.toContain(leaked)
      }
      for (const kept of c.mustKeep ?? []) {
        expect(text, `over-redacted, lost "${kept}"`).toContain(kept)
      }
    })
  }
})

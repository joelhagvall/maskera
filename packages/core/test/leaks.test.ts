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
    input: "Anna Berg, 900101-2385, anna@example.se, 070-123 45 67.",
    mustRedact: ["900101-2385", "anna@example.se", "070-123 45 67"],
  },
  {
    note: "personnummer in 12-digit form must not slip through",
    input: "Inskriven med 199001012385 i systemet.",
    mustRedact: ["199001012385"],
  },
  {
    note: "IBAN with spaces, the whole account, not just chunks",
    input: "Lön till SE45 5000 0000 0583 9825 7466 den 25:e.",
    mustRedact: ["SE45 5000 0000 0583 9825 7466"],
  },
  {
    note: "email embedded in punctuation (parentheses) still detected",
    input: "Kontakt (lars.svensson@firma.se) gäller.",
    mustRedact: ["lars.svensson@firma.se"],
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

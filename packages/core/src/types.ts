/**
 * Built-in PII labels. The `string` fallback lets you add custom detectors
 * with arbitrary labels without fighting the type system.
 */
export type PiiLabel =
  | "PERSONNUMMER"
  | "SAMORDNINGSNUMMER"
  | "ORGANISATIONSNUMMER"
  | "EMAIL"
  | "PHONE"
  | "POSTNUMMER"
  | "BANKGIRO"
  | "PLUSGIRO"
  | "IBAN"
  | "IP_ADDRESS"
  | "URL"
  | "CREDIT_CARD"
  | (string & {})

/** A raw match found by a detector, before placeholder assignment. */
export interface Detection {
  /** Inclusive start index into the source string. */
  start: number
  /** Exclusive end index into the source string. */
  end: number
  /** The matched substring. */
  value: string
  /** Which detector produced this match. */
  label: PiiLabel
}

/** A detection that has been assigned a stable placeholder. */
export interface Redaction extends Detection {
  /** The token the value was replaced with, e.g. `[PERSONNUMMER_1]`. */
  replacement: string
}

/**
 * A detector finds occurrences of one kind of PII in a string.
 * Implementations must be pure and stateless.
 */
export interface Detector {
  readonly label: PiiLabel
  detect(input: string): Array<Omit<Detection, "label">>
}

export interface RedactOptions {
  /** Which detectors to run. Defaults to {@link defaultDetectors}. */
  detectors?: Detector[]
  /**
   * Build the placeholder token for a given label and 1-based index.
   * Defaults to ``(label, i) => `[${label}_${i}]` ``.
   */
  placeholder?: (label: PiiLabel, index: number) => string
}

export interface RedactResult {
  /** The input with every detected value swapped for a placeholder. */
  text: string
  /** Every redaction performed, in order of appearance. */
  redactions: Redaction[]
  /** Map of placeholder token -> original value, for local restoration. */
  map: Record<string, string>
  /** Convenience: re-inserts original values into a (possibly LLM-modified) string. */
  restore: (text: string) => string
}

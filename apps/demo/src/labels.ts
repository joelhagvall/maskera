import type { CSSProperties } from "react"
import copy from "./i18n/sv.json"

export interface LabelMeta {
  sv: string
  /**
   * A distinct, readable hue per PII type, picked far apart so neighbours
   * never blend, and dark enough for 4.5:1 (WCAG AA) as small text on the
   * tinted token backgrounds. This is the light-mode value.
   */
  color: string
  /**
   * Dark-mode value, DERIVED not eyeballed: same hue, lightness raised until
   * the colour clears 4.5:1 against its own tinted pill on a dark surface
   * (ratios in the comments, computed with the WCAG formula). Ported back
   * from maskera-cloud's apps/web/src/lib/labels.ts, which was ported from
   * this file - the two repos share one visual language, so edit them
   * together and do not hand-tune either column without re-measuring.
   */
  dark: string
}

// The trailing comments carry the measured contrasts "light | dark", kept in
// sync with the sibling file in maskera-cloud (see the `dark` doc above).
export const LABEL_META: Readonly<Record<string, LabelMeta>> = {
  // names
  NAMN: { sv: copy.labels.NAMN, color: "#1d4ed8", dark: "#5e82e8" }, // blue - 5.72 | 4.66
  // places & addresses
  PLATS: { sv: copy.labels.PLATS, color: "#166534", dark: "#29bc61" }, // green - 6.14 | 6.45
  ADRESS: { sv: copy.labels.ADRESS, color: "#b8420a", dark: "#db5c1f" }, // orange (kept apart from ORGANISATION's brown by lightness, measured) - 4.75 | 4.52
  POSTNUMMER: { sv: copy.labels.POSTNUMMER, color: "#3f6212", dark: "#7dc224" }, // lime - 6.09 | 7.14
  LAGENHETSNUMMER: { sv: copy.labels.LAGENHETSNUMMER, color: "#065f46", dark: "#1dc998" }, // emerald - 6.56 | 7.27
  // organisations
  ORGANISATION: { sv: copy.labels.ORGANISATION, color: "#713f12", dark: "#c66e20" }, // dark brown - 7.39 | 4.54
  ORGANISATIONSNUMMER: { sv: copy.labels.ORGANISATIONSNUMMER, color: "#854d0e", dark: "#c9781d" }, // yellow - 5.90 | 4.89
  // structured ids & contact
  PERSONNUMMER: { sv: copy.labels.PERSONNUMMER, color: "#b91c1c", dark: "#e55252" }, // red - 5.45 | 4.57
  SAMORDNINGSNUMMER: { sv: copy.labels.SAMORDNINGSNUMMER, color: "#be123c", dark: "#e64d72" }, // rose - 5.29 | 4.59
  EPOST: { sv: copy.labels.EPOST, color: "#0369a1", dark: "#1d8cc9" }, // sky blue (kept apart from TELEFON's teal, measured) - 5.13 | 4.54
  TELEFON: { sv: copy.labels.TELEFON, color: "#115e59", dark: "#23c2b8" }, // teal - 6.49 | 7.09
  IBAN: { sv: copy.labels.IBAN, color: "#6d28d9", dark: "#9b6ce5" }, // violet - 6.04 | 4.53
  BANKGIRO: { sv: copy.labels.BANKGIRO, color: "#7e22ce", dark: "#aa66e6" }, // purple - 5.92 | 4.59
  PLUSGIRO: { sv: copy.labels.PLUSGIRO, color: "#a21caf", dark: "#d23ee0" }, // fuchsia - 5.36 | 4.51
  KORTNUMMER: { sv: copy.labels.KORTNUMMER, color: "#be185d", dark: "#e54889" }, // pink - 5.12 | 4.57
  KONTONUMMER: { sv: copy.labels.KONTONUMMER, color: "#6b21a8", dark: "#a965dc" }, // deep purple - 7.30 | 4.83
  JOURNALNUMMER: { sv: copy.labels.JOURNALNUMMER, color: "#4c1d95", dark: "#9c72df" }, // deep violet - 9.10 | 5.03
  REGNUMMER: { sv: copy.labels.REGNUMMER, color: "#4338ca", dark: "#817adc" }, // indigo - 6.71 | 4.58
  IP_ADRESS: { sv: copy.labels.IP_ADRESS, color: "#334155", dark: "#7087a9" }, // slate - 8.76 | 4.57
  URL: { sv: copy.labels.URL, color: "#075985", dark: "#1d8dc9" }, // sky - 6.44 | 4.58
}

const FALLBACK: LabelMeta = { sv: copy.labels.fallback, color: "#334155", dark: "#7087a9" }

export function labelMeta(label: string): LabelMeta {
  return LABEL_META[label] ?? { ...FALLBACK, sv: label }
}

type PiiVariables = CSSProperties & Record<`--pii-${string}`, string>

function piiVariables(meta: LabelMeta): PiiVariables {
  return {
    "--pii-light": meta.color,
    "--pii-dark": meta.dark,
    "--pii-light-bg": `${meta.color}1a`,
    "--pii-dark-bg": `${meta.dark}1a`,
    "--pii-light-border": `${meta.color}73`,
    "--pii-dark-border": `${meta.dark}73`,
    "--pii-light-highlight": `${meta.color}29`,
    "--pii-dark-highlight": `${meta.dark}29`,
  }
}

/**
 * Underline-highlight recipe for marked text in the editors. Adds no width,
 * so it can sit in a backdrop layer behind a transparent textarea.
 */
export function hlStyle(meta: LabelMeta) {
  return piiVariables(meta)
}

/** Tinted pill recipe, shared by placeholder tokens and the stats tags. */
export function pillStyle(meta: LabelMeta) {
  return piiVariables(meta)
}

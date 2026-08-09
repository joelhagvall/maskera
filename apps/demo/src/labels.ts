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
  NAMN: { sv: "Namn", color: "#1d4ed8", dark: "#5e82e8" }, // blue - 5.72 | 4.66
  // places & addresses
  PLATS: { sv: "Plats", color: "#166534", dark: "#29bc61" }, // green - 6.14 | 6.45
  ADRESS: { sv: "Adress", color: "#b8420a", dark: "#db5c1f" }, // orange (kept apart from ORGANISATION's brown by lightness, measured) - 4.75 | 4.52
  POSTNUMMER: { sv: "Postnummer", color: "#3f6212", dark: "#7dc224" }, // lime - 6.09 | 7.14
  LAGENHETSNUMMER: { sv: "Lägenhetsnr", color: "#065f46", dark: "#1dc998" }, // emerald - 6.56 | 7.27
  // organisations
  ORGANISATION: { sv: "Organisation", color: "#713f12", dark: "#c66e20" }, // dark brown - 7.39 | 4.54
  ORGANISATIONSNUMMER: { sv: "Org.nummer", color: "#854d0e", dark: "#c9781d" }, // yellow - 5.90 | 4.89
  // structured ids & contact
  PERSONNUMMER: { sv: "Personnummer", color: "#b91c1c", dark: "#e55252" }, // red - 5.45 | 4.57
  SAMORDNINGSNUMMER: { sv: "Samordningsnr", color: "#be123c", dark: "#e64d72" }, // rose - 5.29 | 4.59
  EPOST: { sv: "E-post", color: "#0369a1", dark: "#1d8cc9" }, // sky blue (kept apart from TELEFON's teal, measured) - 5.13 | 4.54
  TELEFON: { sv: "Telefon", color: "#115e59", dark: "#23c2b8" }, // teal - 6.49 | 7.09
  IBAN: { sv: "IBAN", color: "#6d28d9", dark: "#9b6ce5" }, // violet - 6.04 | 4.53
  BANKGIRO: { sv: "Bankgiro", color: "#7e22ce", dark: "#aa66e6" }, // purple - 5.92 | 4.59
  PLUSGIRO: { sv: "Plusgiro", color: "#a21caf", dark: "#d23ee0" }, // fuchsia - 5.36 | 4.51
  KORTNUMMER: { sv: "Kortnummer", color: "#be185d", dark: "#e54889" }, // pink - 5.12 | 4.57
  KONTONUMMER: { sv: "Kontonummer", color: "#6b21a8", dark: "#a965dc" }, // deep purple - 7.30 | 4.83
  JOURNALNUMMER: { sv: "Journalnummer", color: "#4c1d95", dark: "#9c72df" }, // deep violet - 9.10 | 5.03
  REGNUMMER: { sv: "Reg.nummer", color: "#4338ca", dark: "#817adc" }, // indigo - 6.71 | 4.58
  IP_ADRESS: { sv: "IP-adress", color: "#334155", dark: "#7087a9" }, // slate - 8.76 | 4.57
  URL: { sv: "Länk", color: "#075985", dark: "#1d8dc9" }, // sky - 6.44 | 4.58
}

const FALLBACK: LabelMeta = { sv: "Uppgift", color: "#334155", dark: "#7087a9" }

export function labelMeta(label: string): LabelMeta {
  return LABEL_META[label] ?? { ...FALLBACK, sv: label }
}

// The style recipes below use light-dark(), which resolves against the
// color-scheme that <html> carries (styles.css: light by default, dark when
// the theme toggle sets data-theme="dark"). No JS involved.

/**
 * Underline-highlight recipe for marked text in the editors. Adds no width,
 * so it can sit in a backdrop layer behind a transparent textarea.
 */
export function hlStyle(meta: LabelMeta) {
  return {
    background: `light-dark(${meta.color}29, ${meta.dark}29)`,
    boxShadow: `inset 0 -2px 0 light-dark(${meta.color}, ${meta.dark})`,
  }
}

/** Tinted pill recipe, shared by placeholder tokens and the stats tags. */
export function pillStyle(meta: LabelMeta) {
  return {
    color: `light-dark(${meta.color}, ${meta.dark})`,
    background: `light-dark(${meta.color}1a, ${meta.dark}1a)`,
    borderColor: `light-dark(${meta.color}73, ${meta.dark}73)`,
  }
}

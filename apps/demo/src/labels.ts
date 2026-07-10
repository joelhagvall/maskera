export interface LabelMeta {
  sv: string
  /**
   * A distinct, readable hue per PII type — picked far apart so neighbours
   * never blend, and dark enough for 4.5:1 (WCAG AA) as small text on the
   * tinted token backgrounds.
   */
  color: string
}

const MAP: Record<string, LabelMeta> = {
  // names
  NAMN: { sv: "Namn", color: "#1d4ed8" }, // blue
  // places & addresses
  PLATS: { sv: "Plats", color: "#166534" }, // green
  ADRESS: { sv: "Adress", color: "#9a3412" }, // orange
  POSTNUMMER: { sv: "Postnummer", color: "#3f6212" }, // lime
  LAGENHETSNUMMER: { sv: "Lägenhetsnr", color: "#065f46" }, // emerald
  // organisations
  ORGANISATION: { sv: "Organisation", color: "#92400e" }, // amber
  ORGANISATIONSNUMMER: { sv: "Org.nummer", color: "#854d0e" }, // yellow
  // structured ids & contact
  PERSONNUMMER: { sv: "Personnummer", color: "#b91c1c" }, // red
  SAMORDNINGSNUMMER: { sv: "Samordningsnr", color: "#be123c" }, // rose
  EPOST: { sv: "E-post", color: "#155e75" }, // cyan
  TELEFON: { sv: "Telefon", color: "#115e59" }, // teal
  IBAN: { sv: "IBAN", color: "#6d28d9" }, // violet
  BANKGIRO: { sv: "Bankgiro", color: "#7e22ce" }, // purple
  PLUSGIRO: { sv: "Plusgiro", color: "#a21caf" }, // fuchsia
  KORTNUMMER: { sv: "Kortnummer", color: "#be185d" }, // pink
  REGNUMMER: { sv: "Reg.nummer", color: "#4338ca" }, // indigo
  IP_ADRESS: { sv: "IP-adress", color: "#334155" }, // slate
  URL: { sv: "Länk", color: "#075985" }, // sky
}

const FALLBACK: LabelMeta = { sv: "Uppgift", color: "#334155" }

export function labelMeta(label: string): LabelMeta {
  return MAP[label] ?? { ...FALLBACK, sv: label }
}

export interface LabelMeta {
  sv: string
  /** A distinct, readable hue per PII type — picked far apart so neighbours never blend. */
  color: string
}

const MAP: Record<string, LabelMeta> = {
  // names
  NAMN: { sv: "Namn", color: "#2563eb" }, // blue
  PER: { sv: "Namn", color: "#2563eb" }, // blue
  // places & addresses
  LOC: { sv: "Plats", color: "#16a34a" }, // green
  ADR: { sv: "Adress", color: "#ea580c" }, // orange
  POSTNUMMER: { sv: "Postnummer", color: "#65a30d" }, // lime
  LAGENHETSNUMMER: { sv: "Lägenhetsnr", color: "#059669" }, // emerald
  // organisations
  ORG: { sv: "Organisation", color: "#d97706" }, // amber
  ORGANISATIONSNUMMER: { sv: "Org.nummer", color: "#ca8a04" }, // yellow
  // structured ids & contact
  PERSONNUMMER: { sv: "Personnummer", color: "#dc2626" }, // red
  SAMORDNINGSNUMMER: { sv: "Samordningsnr", color: "#e11d48" }, // rose
  EMAIL: { sv: "E-post", color: "#0891b2" }, // cyan
  PHONE: { sv: "Telefon", color: "#0d9488" }, // teal
  IBAN: { sv: "IBAN", color: "#7c3aed" }, // violet
  BANKGIRO: { sv: "Bankgiro", color: "#9333ea" }, // purple
  PLUSGIRO: { sv: "Plusgiro", color: "#c026d3" }, // fuchsia
  CREDIT_CARD: { sv: "Kortnummer", color: "#db2777" }, // pink
  REGNUMMER: { sv: "Reg.nummer", color: "#4f46e5" }, // indigo
  IP_ADDRESS: { sv: "IP-adress", color: "#475569" }, // slate
  URL: { sv: "Länk", color: "#0284c7" }, // sky
}

const FALLBACK: LabelMeta = { sv: "Uppgift", color: "#475569" }

export function labelMeta(label: string): LabelMeta {
  return MAP[label] ?? { ...FALLBACK, sv: label }
}

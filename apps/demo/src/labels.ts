export interface LabelMeta {
  sv: string
  /** Category colour — the hue encodes the *kind* of data, not decoration. */
  color: string
}

// Four restrained hues, one per data category.
const PERSON = "#6366f1" // indigo
const PLACE = "#10b981" // emerald
const ORG = "#f59e0b" // amber
const ID = "#8b5cf6" // violet

const MAP: Record<string, LabelMeta> = {
  // names
  NAMN: { sv: "Namn", color: PERSON },
  PER: { sv: "Namn", color: PERSON },
  // places & addresses
  LOC: { sv: "Plats", color: PLACE },
  ADR: { sv: "Adress", color: PLACE },
  POSTNUMMER: { sv: "Postnummer", color: PLACE },
  LAGENHETSNUMMER: { sv: "Lägenhetsnr", color: PLACE },
  // organisations
  ORG: { sv: "Organisation", color: ORG },
  ORGANISATIONSNUMMER: { sv: "Org.nummer", color: ORG },
  // structured ids & contact
  PERSONNUMMER: { sv: "Personnummer", color: ID },
  SAMORDNINGSNUMMER: { sv: "Samordningsnr", color: ID },
  EMAIL: { sv: "E-post", color: ID },
  PHONE: { sv: "Telefon", color: ID },
  IBAN: { sv: "IBAN", color: ID },
  BANKGIRO: { sv: "Bankgiro", color: ID },
  PLUSGIRO: { sv: "Plusgiro", color: ID },
  CREDIT_CARD: { sv: "Kortnummer", color: ID },
  REGNUMMER: { sv: "Reg.nummer", color: ID },
  IP_ADDRESS: { sv: "IP-adress", color: ID },
  URL: { sv: "Länk", color: ID },
}

const FALLBACK: LabelMeta = { sv: "Uppgift", color: "#8f8f8f" }

export function labelMeta(label: string): LabelMeta {
  return MAP[label] ?? { ...FALLBACK, sv: label }
}

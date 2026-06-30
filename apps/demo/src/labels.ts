export interface LabelMeta {
  sv: string
  color: string
}

export const LABELS: Record<string, LabelMeta> = {
  NAMN: { sv: "Namn", color: "#f472b6" },
  PER: { sv: "Namn (modell)", color: "#f472b6" },
  LOC: { sv: "Plats (modell)", color: "#34d399" },
  ORG: { sv: "Organisation (modell)", color: "#fbbf24" },
  ADR: { sv: "Adress (modell)", color: "#2dd4bf" },
  PERSON: { sv: "Namn (NER)", color: "#f472b6" },
  LOCATION: { sv: "Plats (NER)", color: "#34d399" },
  ADDRESS: { sv: "Adress (NER)", color: "#34d399" },
  ORGANIZATION: { sv: "Organisation (NER)", color: "#fbbf24" },
  PERSONNUMMER: { sv: "Personnummer", color: "#fb7185" },
  SAMORDNINGSNUMMER: { sv: "Samordningsnr", color: "#fb7185" },
  ORGANISATIONSNUMMER: { sv: "Org.nummer", color: "#fbbf24" },
  ADRESS: { sv: "Adress", color: "#34d399" },
  LAGENHETSNUMMER: { sv: "Lägenhetsnr", color: "#2dd4bf" },
  POSTNUMMER: { sv: "Postnummer", color: "#22d3ee" },
  EMAIL: { sv: "E-post", color: "#60a5fa" },
  PHONE: { sv: "Telefon", color: "#818cf8" },
  IBAN: { sv: "IBAN", color: "#a78bfa" },
  BANKGIRO: { sv: "Bankgiro", color: "#a78bfa" },
  PLUSGIRO: { sv: "Plusgiro", color: "#a78bfa" },
  CREDIT_CARD: { sv: "Kortnummer", color: "#c084fc" },
  REGNUMMER: { sv: "Reg.nummer", color: "#facc15" },
  IP_ADDRESS: { sv: "IP-adress", color: "#94a3b8" },
  URL: { sv: "Länk", color: "#94a3b8" },
}

export function labelMeta(label: string): LabelMeta {
  return LABELS[label] ?? { sv: label, color: "#94a3b8" }
}

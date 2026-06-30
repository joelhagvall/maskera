const SV: Record<string, string> = {
  NAMN: "Namn",
  PER: "Namn",
  LOC: "Plats",
  ORG: "Organisation",
  ADR: "Adress",
  PERSONNUMMER: "Personnummer",
  SAMORDNINGSNUMMER: "Samordningsnr",
  ORGANISATIONSNUMMER: "Org.nummer",
  LAGENHETSNUMMER: "Lägenhetsnr",
  POSTNUMMER: "Postnummer",
  EMAIL: "E-post",
  PHONE: "Telefon",
  IBAN: "IBAN",
  BANKGIRO: "Bankgiro",
  PLUSGIRO: "Plusgiro",
  CREDIT_CARD: "Kortnummer",
  REGNUMMER: "Reg.nummer",
  IP_ADDRESS: "IP-adress",
  URL: "Länk",
}

/** Swedish display name for a label, falling back to the label itself. */
export function labelSv(label: string): string {
  return SV[label] ?? label
}

/**
 * Luhn / mod-10 checksum, used by Swedish personnummer, samordningsnummer
 * and organisationsnummer. Operates on the digits only.
 */
export function luhnValid(digits: string): boolean {
  const only = digits.replace(/\D/g, "")
  if (only.length === 0) return false
  let sum = 0
  let double = false
  for (let i = only.length - 1; i >= 0; i--) {
    let d = only.charCodeAt(i) - 48
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return sum % 10 === 0
}

/**
 * Validate a Swedish personnummer.
 * Accepts 10 or 12 digit forms with optional `-`/`+` separator.
 * Checks the date part and the Luhn control digit (on the 10-digit core).
 */
export function isPersonnummer(value: string): boolean {
  const m = value.match(/^(\d{2})?(\d{2})(\d{2})(\d{2})[-+]?(\d{4})$/)
  if (!m) return false
  // Groups: 1=century? 2=YY 3=MM 4=DD 5=birth+check
  const month = Number(m[3])
  const day = Number(m[4])
  // Day can be 1-31 (personnummer); samordningsnummer adds 60, handled separately.
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false
  const core = value.replace(/[-+]/g, "").slice(-10)
  return luhnValid(core)
}

/** Swedish samordningsnummer: like a personnummer but day has +60. */
export function isSamordningsnummer(value: string): boolean {
  const m = value.match(/^(\d{2})?(\d{2})(\d{2})(\d{2})[-+]?(\d{4})$/)
  if (!m) return false
  const month = Number(m[3])
  const day = Number(m[4])
  if (month < 1 || month > 12) return false
  if (day < 61 || day > 91) return false
  const core = value.replace(/[-+]/g, "").slice(-10)
  return luhnValid(core)
}

/** Swedish organisationsnummer: 10 digits, third digit >= 2, Luhn valid. */
export function isOrganisationsnummer(value: string): boolean {
  const only = value.replace(/\D/g, "")
  const core = only.length === 12 ? only.slice(2) : only
  if (core.length !== 10) return false
  // Third digit of the group number must be >= 2 to distinguish from personnummer.
  if (Number(core[2]) < 2) return false
  return luhnValid(core)
}

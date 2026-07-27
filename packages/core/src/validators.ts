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
 * Days in `month` of `year`. A 10-digit personnummer carries no century, so
 * the caller passes YY (0-99): YY % 4 === 0 is then the best leap rule there
 * is, and it is exact for every year a living holder can be born in (2000 was
 * a leap year, so even YY = 00 is right until 2100). A 12-digit form passes
 * the full year and gets the exact Gregorian rule.
 */
function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28
  return [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] as number
}

/**
 * Validate a Swedish personnummer.
 * Accepts 10 or 12 digit forms with optional `-`/`+` separator.
 * Checks the date part and the Luhn control digit (on the 10-digit core).
 * The date check is a real calendar check: a flat day <= 31 accepted
 * "850230-…" (Feb 30) and non-leap Feb 29, spending the false-positive
 * budget the checksum bought on dates that can never be issued.
 */
export function isPersonnummer(value: string): boolean {
  const m = value.match(/^(\d{2})?(\d{2})(\d{2})(\d{2})[-+]?(\d{4})$/)
  if (!m) return false
  // Groups: 1=century? 2=YY 3=MM 4=DD 5=birth+check
  const year = Number((m[1] ?? "") + m[2])
  const month = Number(m[3])
  const day = Number(m[4])
  // Day can be 1-31 (personnummer); samordningsnummer adds 60, handled separately.
  if (month < 1 || month > 12) return false
  if (day < 1 || day > daysInMonth(year, month)) return false
  const core = value.replace(/[-+]/g, "").slice(-10)
  return luhnValid(core)
}

/** Swedish samordningsnummer: like a personnummer but day has +60. */
export function isSamordningsnummer(value: string): boolean {
  const m = value.match(/^(\d{2})?(\d{2})(\d{2})(\d{2})[-+]?(\d{4})$/)
  if (!m) return false
  const year = Number((m[1] ?? "") + m[2])
  const month = Number(m[3])
  const day = Number(m[4])
  if (month < 1 || month > 12) return false
  if (day < 61 || day - 60 > daysInMonth(year, month)) return false
  const core = value.replace(/[-+]/g, "").slice(-10)
  return luhnValid(core)
}

/** Swedish organisationsnummer: 10 digits, third digit >= 2, Luhn valid. */
export function isOrganisationsnummer(value: string): boolean {
  const only = value.replace(/\D/g, "")
  // The 12-digit form must carry the "16" county prefix for legal entities;
  // without the check any Luhn-valid 12-digit string passed by dropping two
  // arbitrary leading digits.
  if (only.length === 12 && !only.startsWith("16")) return false
  const core = only.length === 12 ? only.slice(2) : only
  if (core.length !== 10) return false
  // Third digit of the group number must be >= 2 to distinguish from personnummer.
  if (Number(core[2]) < 2) return false
  return luhnValid(core)
}

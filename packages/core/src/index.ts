export { type CanonicalText, canonicalize } from "./canonicalize"
export {
  adress,
  // payment
  bankgiro,
  contextualDetectors,
  // generic
  creditCard,
  defaultDetectors,
  // contact
  email,
  fastighetsbeteckning,
  fodelsedatum,
  // opt-in Swedish heuristics
  heuristicDetectors,
  iban,
  ipAddress,
  journalnummer,
  kontonummer,
  lagenhetsnummer,
  organisationsnummer,
  // structured Swedish identifiers
  personnummer,
  phone,
  plusgiro,
  postnummer,
  regexDetector,
  regnummer,
  samordningsnummer,
  url,
} from "./detectors"
export { redact, redactFromDetections, restore, runDetectors } from "./redact"
export type {
  Detection,
  Detector,
  PiiLabel,
  Redaction,
  RedactOptions,
  RedactResult,
} from "./types"
export {
  isBirthDate,
  isOrganisationsnummer,
  isPersonnummer,
  isPersonnummerShape,
  isSamordningsnummer,
  isSamordningsnummerShape,
  luhnValid,
} from "./validators"

export { type CanonicalText, canonicalize } from "./canonicalize"
export {
  adress,
  // payment
  bankgiro,
  // generic
  creditCard,
  defaultDetectors,
  // contact
  email,
  // opt-in Swedish heuristics
  heuristicDetectors,
  iban,
  ipAddress,
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
  isOrganisationsnummer,
  isPersonnummer,
  isPersonnummerShape,
  isSamordningsnummer,
  isSamordningsnummerShape,
  luhnValid,
} from "./validators"

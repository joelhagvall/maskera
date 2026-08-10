export interface Scenario {
  id: string
  name: string
  tagline: string
  text: string
}

export function getScenarios(): Scenario[] {
  return copy.scenarios
}

import copy from "./i18n"

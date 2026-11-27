import { TOKEN_RE } from "./segments"

/**
 * The hero stage shows one task in three places: the browser extension, an AI
 * agent behind the local proxy, and the npm package in your own code. All
 * three use the same sentence and the same placeholders, so the visitor sees
 * one engine everywhere.
 *
 * The browser scene is a real capture of the extension (fictional test data),
 * rendered and checked against the real model by maskera-extension
 * `bun run capture:hero`. `prompt` and `masked` are copied from that script's
 * HERO_SCENES entry for this id; test/heroScenes.test.ts compares them when
 * the sibling checkout exists and reads `height` back from the image file.
 */
export const HERO_SCENE = {
  id: "myndighet",
  height: 794,
  prompt:
    "Bo Ek (781101-2397) i Boden har sökt bostadsanpassning för att kunna bo kvar. Dottern Liv ringde i dag. Ersättningen betalas till bankgiro 991-2346. Skriv beslutet.",
  masked:
    "[NAMN_1] ([PERSONNUMMER_1]) i [PLATS_1] har sökt bostadsanpassning för att kunna bo kvar. Dottern [NAMN_2] ringde i dag. Ersättningen betalas till bankgiro [BANKGIRO_1]. Skriv beslutet.",
  /**
   * The simulated model reply in the agent scene, written with the
   * placeholders the model saw. Swedish in both locales: it is the AI's
   * output on Swedish data, like restoreDemo.replies.
   */
  reply:
    "Beslut: [NAMN_1] ([PERSONNUMMER_1]) i [PLATS_1] beviljas bostadsanpassning så att han kan bo kvar. Ersättningen betalas till bankgiro [BANKGIRO_1].",
} as const

/**
 * The home page's link-preview sample: the start of HERO_SCENE, short enough
 * for one line on a 1200 px card. `masked` is what `maskera-mcp guard
 * --redact` returns for `prompt`; test/heroScenes.test.ts keeps both in step
 * with HERO_SCENE.
 */
export const OG_SAMPLE = {
  prompt: "Bo Ek (781101-2397) i Boden har sökt bostadsanpassning.",
  masked: "[NAMN_1] ([PERSONNUMMER_1]) i [PLATS_1] har sökt bostadsanpassning.",
} as const

/** The files the agent scene reads and writes through Maskera's MCP tools. */
export const AGENT_FILES = { read: "ärende.txt", write: "beslut.md" } as const

/**
 * Identifiers the agent scene shows verbatim, as an agent prints them: the
 * MCP connector's name and the argument name of maskera_read_file. Code, not
 * copy, so they stay the same in every language.
 */
export const AGENT_CONNECTOR = { name: "maskera", readArg: "path" } as const

export const HERO_SCENE_WIDTH = 1368

/** The three places the stage shows, in tab order. */
export const HERO_STAGES = ["browser", "agent", "code"] as const
export type HeroStage = (typeof HERO_STAGES)[number]

export function heroScenePath(id: string): string {
  return `/hero/extension-preview-${id}.webp`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function tokensOf(masked: string): RegExpExecArray[] {
  return [...masked.matchAll(TOKEN_RE)]
}

/**
 * The restore key for a prompt and its masked form: each placeholder mapped
 * to the original text it replaced. Derived, so the scenes never carry a
 * second hand-typed copy of the personal data.
 */
export function restoreMap(prompt: string, masked: string): Record<string, string> {
  const tokens = tokensOf(masked)
  let pattern = ""
  let last = 0
  for (const token of tokens) {
    pattern += `${escapeRegExp(masked.slice(last, token.index))}(.+?)`
    last = token.index + token[0].length
  }
  pattern += escapeRegExp(masked.slice(last))
  const match = new RegExp(`^${pattern}$`).exec(prompt)
  if (!match) throw new Error("masked text does not line up with its prompt")
  const map: Record<string, string> = {}
  tokens.forEach((token, index) => {
    const value = match[index + 1]
    const existing = map[token[0]]
    if (existing !== undefined && existing !== value) {
      throw new Error(`${token[0]} stands for two different values`)
    }
    map[token[0]] = value
  })
  return map
}

/** How many distinct details a masked text hides. */
export function placeholderCount(masked: string): number {
  return new Set(tokensOf(masked).map((token) => token[0])).size
}

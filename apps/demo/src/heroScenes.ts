/**
 * The hero's rotating scenes: one real capture per work task, rendered and
 * checked against the real model by maskera-extension `bun run
 * capture:hero` (its HERO_SCENES hold the prompts and the exact masked
 * text). `height` is the capture's pixel height, so the image reserves its
 * space before it loads; test/heroScenes.test.ts reads it back from the
 * files and checks the ids against i18n `header.heroScenes`.
 */
export const HERO_SCENES = [
  { id: "myndighet", height: 516 },
  { id: "hr", height: 516 },
  { id: "kundtjanst", height: 466 },
] as const

export const HERO_SCENE_WIDTH = 1368

export const HERO_ROTATION_MS = 6_000

export function heroScenePath(id: string): string {
  return `/hero/extension-preview-${id}.webp`
}

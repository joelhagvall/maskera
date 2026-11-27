/**
 * Every place maskera.dev shows what Maskera turns a sentence into, as
 * { where, input, masked } pairs. Pure, so test/siteClaims.test.ts can check
 * that none goes missing; scripts/check-site-claims.mjs runs them through the
 * real model.
 *
 * `modules` are src/heroScenes.ts and src/i18n/index.ts (loaded by Vite in
 * the script, by Vitest in the test).
 */

/** The developer page's README example: the redact call's input and its `// text:` comment. */
export function codeExampleClaim(code) {
  const input = code.match(/redactWithNer\(\s*"([^"]+)"/)?.[1]
  const masked = code.match(/\/\/ text: "([^"]+)"/)?.[1]
  if (!input || !masked)
    throw new Error("developerApi.codeExample has no redact input or // text: line")
  return { input, masked }
}

export function collectSiteClaims({ scenes, i18n }) {
  const claims = [
    {
      where: "heroScenes HERO_SCENE",
      input: scenes.HERO_SCENE.prompt,
      masked: scenes.HERO_SCENE.masked,
    },
    {
      where: "heroScenes OG_SAMPLE",
      input: scenes.OG_SAMPLE.prompt,
      masked: scenes.OG_SAMPLE.masked,
    },
  ]
  for (const [locale, copy] of Object.entries(i18n.copies)) {
    copy.accuracy.contextExamples.forEach((ex, i) => {
      claims.push({
        where: `${locale} accuracy.contextExamples[${i}]`,
        input: ex.input,
        masked: ex.masked,
      })
    })
    claims.push({
      where: `${locale} developerApi.codeExample`,
      ...codeExampleClaim(copy.developerApi.codeExample),
    })
  }
  return claims
}

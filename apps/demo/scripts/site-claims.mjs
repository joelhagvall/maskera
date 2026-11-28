/**
 * Every place maskera.dev shows what Maskera turns a sentence into, as
 * { where, input, masked } pairs, or { where, code, masked } for a code
 * example that check:claims runs. Pure, so test/siteClaims.test.ts can check
 * that none goes missing; scripts/check-site-claims.mjs runs them through the
 * real model.
 *
 * `modules` are src/heroScenes.ts and src/i18n/index.ts (loaded by Vite in
 * the script, by Vitest in the test).
 */

/**
 * A code example on the site that calls redactWithNer: the code up to its
 * `// text: "..."` comment (which check:claims executes against the real
 * library) and the output that comment promises.
 */
export function codeExampleClaim(code) {
  const lines = code.split("\n")
  const at = lines.findIndex((line) => /^\s*\/\/ text: "/.test(line))
  const masked = at === -1 ? undefined : lines[at].match(/\/\/ text: "([^"]+)"/)?.[1]
  if (!code.includes("redactWithNer(") || !masked)
    throw new Error("code example has no redactWithNer call or no // text: line")
  return { code: lines.slice(0, at).join("\n"), masked }
}

/** Every string under a `code` or `codeExample` key that calls redactWithNer, with its key path. */
function redactingCodeExamples(node, path, out) {
  if (Array.isArray(node)) {
    for (const [i, item] of node.entries()) redactingCodeExamples(item, `${path}[${i}]`, out)
  } else if (node && typeof node === "object")
    for (const [key, value] of Object.entries(node)) {
      const here = path ? `${path}.${key}` : key
      if ((key === "code" || key === "codeExample") && typeof value === "string") {
        if (value.includes("redactWithNer(")) out.push({ path: here, code: value })
      } else redactingCodeExamples(value, here, out)
    }
  return out
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
    for (const example of redactingCodeExamples(copy, "", [])) {
      claims.push({ where: `${locale} ${example.path}`, ...codeExampleClaim(example.code) })
    }
  }
  return claims
}

/**
 * Example: redact before the LLM, restore after.
 *
 * The model never sees real personal data — only stable placeholders it can
 * reason about. We map its answer back locally.
 *
 *   pnpm -C packages/core build
 *   node --experimental-strip-types examples/llm-roundtrip.ts
 */
import { redact } from "../packages/core/src/index"

const userMessage =
  "Hej, jag heter Anna Karlsson, personnummer 19900101-0017, " +
  "och jag når er på 070-123 45 67 eller anna@example.se."

const { text, map, restore } = redact(userMessage)

console.log("Sent to LLM:\n", text)
// Hej, jag heter Anna Karlsson, personnummer [PERSONNUMMER_1],
// och jag når er på [PHONE_1] eller [EMAIL_1].

// --- pretend this came back from your model -----------------------------
const fakeLlmAnswer = "Tack! Jag har noterat [PHONE_1] som kontaktnummer och mejlar [EMAIL_1]."

console.log("\nRestored locally:\n", restore(fakeLlmAnswer))
// Tack! Jag har noterat 070-123 45 67 som kontaktnummer och mejlar anna@example.se.

console.log("\nRestore map:", map)

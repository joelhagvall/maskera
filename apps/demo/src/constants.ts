export const GITHUB = "https://github.com/joelhagvall/maskera"
export const HF_MODEL = "https://huggingface.co/joelhagvall/maskera-sv-ner"
export const NPM_CORE = "https://www.npmjs.com/package/@maskera/core"
export const NPM_NER = "https://www.npmjs.com/package/maskera"
export const NPM_MCP = "https://www.npmjs.com/package/@maskera/mcp"
export const CONTACT_EMAIL = "hej@maskera.dev"
/** A mail link to the shared inbox with a prefilled subject. */
export function contactMailto(subject: string): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`
}
/** The Claude Desktop Gateway guide in the @maskera/mcp README. */
export const MCP_DESKTOP_GUIDE = `${GITHUB}/tree/main/packages/mcp#claude-desktop-through-the-proxy`

/** The home page's try-it-yourself demo section (its heading id). */
export const DEMO_ANCHOR = "testa"

/** Demo input cap, in characters (UTF-16 code units). See OverlayEditor. */
export const MAX_INPUT_CHARS = 100_000

import contract from "../../../docs/product-contract.json"

/** The command the docs tell a reader to run to prove the setup works. */
export const DOCTOR_COMMAND = "npx -y @maskera/mcp doctor"

/**
 * What `maskera-mcp doctor` prints with the proxy running on its default
 * port, captured from a real run of the built CLI. CLI output, not copy, so
 * it is the same in every language; only the workspace path is generic and
 * the version comes from the product contract so it never drifts.
 */
export function doctorSample(root: string): string {
  return [
    `maskera-mcp doctor (OK, v${contract.packages.mcp}, mode=auto)`,
    "  [ok]   node: Node 24.22.1 (requires >=18)",
    `  [ok]   root:${root}: Readable directory`,
    "  [ok]   redaction: mode=hybrid, masked=4 items, roundtrip=ok (415ms)",
    "  [ok]   proxy: Running at http://127.0.0.1:8787 (mcp=http://127.0.0.1:8787/mcp, requests=1, redacted=0)",
    "  [ok]   mcp-http: Live http://127.0.0.1:8787/mcp masked synthetic PII (0 leaks, 14ms)",
    '  [ok]   proof: "Kontakta [NAMN_1] ([PERSONNUMMER_1]) på [EPOST_1] eller [TELEFON_1]." (0 leaks, restored=ok)',
  ].join("\n")
}

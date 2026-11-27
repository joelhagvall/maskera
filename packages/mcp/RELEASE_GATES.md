# Maskera MCP & Local Proxy: Release Gates

Every release of `@maskera/mcp` (and any update to `@maskera/core`, `maskera`, or `joelhagvall/maskera-sv-ner`) MUST pass the automated release gates enforced by `packages/mcp/audit/gates.mjs` and `.github/workflows/mcp-audit.yml`.

## Guarantee Separation Principle

This pipeline strictly separates two categories of evidence:

1. **Deterministic Security & Correctness Guarantees (Zero Tolerance):** Architectural properties enforced by code (fail-closed error handling, cross-session isolation, canary scanner over covered formats, mutation kill rate, protocol conformance, clean packaging, offline egress blocking). A single failure blocks release.
2. **Probabilistic NER Quality Floors (Empirical Baselines):** Statistical recall, precision, and non-PII retention measured through the live production pipeline on a previously unseen Swedish corpus. Passing these gates proves absence of measured quality regression against baseline; it MUST NEVER be marketed or interpreted as a mathematical guarantee that every future free-text personal identifier will always be masked.

## Mandatory Release Gates

| Gate ID | Category | Blocking Threshold | Verified By |
| --- | --- | --- | --- |
| `zero-canary-leaks` | Deterministic Security | `0` observed raw/URL/Base64 canary leaks across all egress, MCP, guard, log, and receipt surfaces | `pnpm audit:privacy` |
| `security-invariants` | Deterministic Security | `0` cross-session leaks, `0` fail-open incidents, `0` failed security checks (downgrade, smuggling, SSRF, loopback, perms) | `pnpm audit:security` |
| `mutation-detection` | Deterministic Security | `0` surviving planted security mutations (`4/4` killed) | `pnpm audit:security` |
| `protocol-conformance` | Deterministic Correctness | `100%` pass on JSON-RPC 2.0, MCP protocol versions, stdio purity, elicitation, and Streamable HTTP | `pnpm audit:e2e` |
| `adversarial-regression` | Deterministic Security | `100%` pass on Unicode obfuscation, large payload seam, streaming splits, collisions, concurrency, fault injection, and 200 fuzz trials | `pnpm audit:adversarial` |
| `clean-package-install` | Supply Chain | `100%` pass on tarball pack, 0 forbidden files, valid license/checksums, clean install CLI smoke | `pnpm audit:package` |
| `offline-operation` | Privacy Egress | `0` unexpected outbound network attempts in `rules` and local-ONNX `auto` modes; cold-start fails closed | `pnpm audit:offline` |
| `real-client-e2e` | Integration | `0` failures on installed real CLI clients (`claude`, `codex`, `opencode`) over packed tarball (`NOT_TESTED` allowed only in headless CI lacking those binaries) | `pnpm audit:clients` |
| `production-pipeline-quality` | Probabilistic NER Baseline | Structured recall `>= 98.0%`, overall entity recall `>= 90.0%`, round-trip restoration `= 100.0%`, non-PII retention `>= 85.0%` on unseen multi-domain corpus | `pnpm audit:benchmark` |
| `performance-and-soak` | Reliability | CLI cold start `<= 2500 ms`, StreamingRestorer 10k chunks `<= 250 ms`, 500-op soak heap growth `<= 120 MB`, `SessionVault` bounded | `pnpm audit:benchmark` |

## Threshold Rationale

- **Structured recall `>= 98.0%`:** Baseline measured `100.0%` (31/31) on the unseen corpus; `98.0%` catches any rule detector regression immediately.
- **Overall entity recall `>= 90.0%`:** Baseline measured `100.0%` (51/51) with v20 ONNX; `90.0%` provides a strict floor for future quantized model swaps while keeping deterministic and probabilistic gates distinct.
- **Round-trip restoration `= 100.0%`:** Restoration is deterministic; any lossy round-trip on exact placeholders is a bug.
- **Non-PII retention `>= 85.0%`:** Baseline measured `95.0%` across clinical measurements and domain terms; prevents aggressive over-masking regressions.
- **Latency & soak ceilings:** Baseline on Apple M4 Pro measured `46.8 ms` cold start, `1.97 ms` for 10k SSE chunks, and `20.54 MB` soak heap delta. Gate ceilings leave headroom for slower shared GitHub Actions Ubuntu runners while catching quadratic blowups or unbounded memory leaks.

## Verdict Rules

- **`NOT READY`:** Any release gate has status `FAIL`. Blocks CI and release.
- **`CONDITIONALLY READY`:** All release gates pass (`0` failures), but one or more matrix surfaces are `NOT_TESTED` (e.g. GUI apps or opt-in paid cloud APIs).
- **`PRODUCTION READY`:** All release gates pass AND `0` surfaces remain `NOT_TESTED`.

## Running Locally & in CI

```bash
# Fast pre-commit / PR check (~2s)
pnpm audit:quick

# Full release qualification with machine-readable JSON artifact
pnpm audit:full -- --out packages/mcp/audit-results.json
```

CI workflow: `.github/workflows/mcp-audit.yml` runs `pnpm audit:full -- --ci --out tmp/mcp-audit-report.json` on every push/PR affecting `packages/mcp`, `packages/core`, or `packages/ner` and uploads the JSON report as a 90-day build artifact.

# Maskera MCP & Local Proxy: Production Readiness Audit

- **Audit date:** 2026-11-27
- **Package:** `@maskera/mcp@0.4.1` (`@maskera/core@0.8.5`, `maskera@0.11.2`)
- **Model:** `joelhagvall/maskera-sv-ner` (v20, pinned revision `f417d65c08bcf814f639f8bf9221e30a79a53f39`)
- **Test machine:** Apple M4 Pro (12 cores), 24 GiB RAM, macOS `darwin/arm64`, Node `v24.22.1`, pnpm `10.33.0`
- **Machine-readable evidence:** [audit-results.json](./audit-results.json)
- **Companion documents:** [THREAT_MODEL.md](./THREAT_MODEL.md), [TEST_MATRIX.md](./TEST_MATRIX.md), [RELEASE_GATES.md](./RELEASE_GATES.md)

## Executive Verdict: CONDITIONALLY READY

**Summary counts (post-remediation full audit run):**
- **PASS:** 30 checks across 9 audit suites + 37/37 randomized Vitest unit tests + 10/10 automated release gates
- **FAIL:** 0
- **BLOCKED:** 0
- **NOT TESTED:** 4 surfaces (Claude Desktop GUI Electron app, Cursor IDE GUI, local Ollama daemon, opt-in live paid cloud LLM endpoints)

**Why `CONDITIONALLY READY` (and not unconditional `PRODUCTION READY`):**
1. All **8 baseline security and correctness defects** discovered during the adversarial audit (including 3 Critical and 3 High vulnerabilities) were fixed in code, locked in with unit regression tests, verified against 4 live mutation tests (4/4 killed), and re-verified with 0 raw canary leaks across 29 egress and logging surfaces.
2. However, **4 deployment surfaces remain `NOT TESTED`** in automated headless execution (GUI apps and opt-in paid cloud APIs), and **explicit operational boundaries** apply:
   - **MCP alone does NOT protect free-text chat or raw shell/file tools.** It only masks data flowing through `maskera_*` tools. Production setups that require hard egress enforcement MUST run `maskera-mcp wrap` / `maskera-mcp proxy` (and optionally `maskera-mcp guard` hooks + `--no-raw-restore`).
   - **Binary attachments (images, PDFs) and filenames are not redacted.** Only UTF-8 text and Base64 `text/*`/`application/json` document blocks are masked by the proxy.
   - **Probabilistic NER is not a mathematical zero-leak proof.** Deterministic rules (`personnummer`, `telefon`, `epost`, `IBAN`, etc.) achieved 100% recall on the unseen production corpus; free-text NER achieved 100% recall on the 12-document unseen corpus, but known adversarial model boundaries remain (Cyrillic homoglyphs, hyphenated Swedish compounds, and high over-masking on large English coding-agent system prompts).

---

## 1. Baseline Findings, Root Causes & Verified Fixes

Before adding fixes, the unmodified `@maskera/mcp@0.4.1` build was attacked empirically. All 8 findings below were reproduced live on baseline `0.4.1`, fixed in `packages/mcp/src/`, covered by regression tests, and re-verified at 0 failures.

### FINDING-01 (CRITICAL): Mode-downgrade bypass on file tools & vault exfiltration under `--no-raw-restore`
- **Impact:** A prompt-injected LLM could pass `mode: "rules"` to `maskera_read_file` or `maskera_search_files` on an `auto`-mode server to silently disable Swedish ONNX NER and dump every free-text name, address, and organization in plaintext. Worse, calling `maskera_search_files({ query: "[NAMN_1]", session_id, mode: "rules" })` resolved `[NAMN_1]` from the local vault and returned the raw name in `redacted_line` even under `--no-raw-restore`. Additionally, `FileGuard.searchFiles` truncated matched lines at 500 characters *before* redaction, slicing PII tokens in half and leaking partial identifiers (`19900...`).
- **Baseline evidence:** Empirical probe on baseline `0.4.1` confirmed `exp1_read_downgrade_leaked_name: true`, `exp2_search_exfil_under_no_raw_restore: true`, `exp2b_search_trunc_leaked_partial_pnr: true`.
- **Root cause:** `packages/mcp/src/server.ts` forwarded untrusted `args.mode` directly to `engine.redact()`; `files.ts` truncated lines prior to redaction; `server.ts` did not enforce session-vault secret scrubbing on isolated matched lines.
- **Fix applied:**
  - `server.ts`: Reject `mode: "rules"` on `maskera_read_file` and `maskera_search_files` whenever the server's `defaultMode === "auto"`.
  - `server.ts`: Run `enforceSessionSecretsRedacted()` after line redaction so any value already in the session vault (including placeholder-resolved search terms) is guaranteed replaced by its session token even on context-free single lines.
  - `files.ts` + `server.ts`: Return up to 16,384 chars to `server.ts`, redact the full line first, then truncate to 500 chars via `truncatePreservingPlaceholders()` without cutting placeholders.
- **Regression test:** `packages/mcp/test/mcp.test.ts` ("blocks mode='rules' downgrade..."), `audit/suites/security.mjs` (`mode-downgrade-and-search-exfil`), mutation `MUT-04-allow-mode-downgrade` (killed).

### FINDING-02 (CRITICAL): Fail-open proxy bypasses on encoded paths, `Content-Type` smuggling, and uncovered LLM fields/endpoints
- **Impact:** Raw unredacted PII silently bypassed the proxy and reached the upstream LLM API via:
  1. Percent-encoded paths (e.g., `POST /v1/%6dessages`), because `shouldRedactPath()` checked the raw undecoded path.
  2. `Content-Type` smuggling (`POST /v1/messages` with `Content-Type: application/octet-stream`), where `mayBeJson === false` fell through and forwarded raw bytes unredacted.
  3. Non-plain-object JSON bodies (JSON arrays) falling through unredacted.
  4. Uncovered LLM endpoints (`/v1/completions`, `/v1/embeddings`, `/v1/messages/batches`, `/v1/responses/input_tokens`, `/v1/responses/compact`, `/v1/moderations`).
  5. Uncovered body fields: OpenAI Responses `custom_tool_call` `item.input` (used by Codex `apply_patch`), `metadata.user_id`, `user`, `messages[].name`, `reasoning_content`, `refusal`, `function_call.arguments`, Base64-encoded `text/*` and `application/json` document blocks (`block.source` and `input_file` `file_data`), and numeric PII (`199001012385`) inside JSON tool arguments.
- **Baseline evidence:** Empirical probe confirmed all 7 bypass vectors leaked raw `19900101-2385` / `provnamn.maskera@example.com` upstream (`exp3_*` and `exp4_*` all `true`).
- **Root cause:** Raw string matching in `shouldRedactPath()`, permissive `if (... && mayBeJson)` guard in `handleRequest()`, and incomplete schema traversal in `redactLlmRequestBody()`.
- **Fix applied:** `packages/mcp/src/proxy.ts` now canonicalizes paths (`decodeURIComponent` + `posix.normalize`, rejecting malformed `%` or NUL with `400`), covers all listed LLM endpoints and body fields (including Base64 UTF-8 text documents and 10+ digit safe integers), and **fails closed** with `415 Unsupported Media Type` on non-JSON content types and `400 Bad Request` on non-object JSON bodies.
- **Regression test:** `packages/mcp/test/proxy.test.ts`, `audit/suites/privacy.mjs`, `audit/suites/security.mjs` (`proxy-fail-closed`), mutation `MUT-01-disable-proxy-redaction` (killed).

### FINDING-03 (CRITICAL): Cross-session vault & approval leakage on Streamable HTTP `/mcp`
- **Impact:** All Streamable HTTP `/mcp` clients and the HTTP LLM proxy shared one flat `SessionVault` and `ApprovalBroker`. Any `/mcp` client (Client B) could list and restore Client A's sessions, steal the proxy's `"proxy"` session values, silently restore another owner's secrets via `maskera_write_file` without `session_id` (`resolveSessionFor`), or hijack Client A's browser-approved `maskera_resume` call. Furthermore, `DELETE /mcp` did not wipe the closed session's vault entries, and unknown `Mcp-Session-Id` headers were accepted instead of returning `404`.
- **Baseline evidence:** Empirical probe confirmed `exp5_cross_mcp_session_steal: true` and `exp5b_mcp_steals_proxy_vault: true`.
- **Root cause:** Single shared `SessionVault` keyed only by user-supplied `session_id`, and unowned `ApprovalBroker` records.
- **Fix applied:**
  - `vault.ts`: Partition storage internally by composite key `${owner}\0${id}` (`"proxy"`, `"mcp:<mcpSessionId>"`, `"mcp:stateless"`, `"default"`). All `apply`, `restore`, `resolveSessionFor`, `list`, `getMap`, `clear`, and `clearOwner` calls enforce strict owner isolation. Use `Object.create(null)` for restore maps.
  - `approvals.ts`: Bind approvals to `owner`, enforce owner match in `resume()`, and wipe on `clearOwner()`.
  - `proxy.ts`: Return HTTP `404` for unknown/uninitialized `Mcp-Session-Id` on non-`initialize` requests, and wipe both vault and approvals on `DELETE /mcp` and LRU eviction.
- **Regression test:** `packages/mcp/test/proxy.test.ts`, `audit/suites/security.mjs` (`cross-session-isolation`), mutation `MUT-03-break-session-isolation` (killed).

### FINDING-04 (HIGH): Non-loopback `--host` binding exposed unauthenticated `/_maskera/vault` and `/mcp`
- **Impact:** Starting `startMaskeraProxy` with a wildcard or LAN `--host` bound to all interfaces without authentication, and `isLoopbackHost()` accepted the bound non-loopback host or spoofed `Host: 127.0.0.1:<port>`, letting any LAN host dump raw PII via `GET /_maskera/vault` (`x-maskera-reveal: 1`) or read/write local files via `/mcp`.
- **Fix applied:** `proxy.ts` refuses non-loopback `host` binding by default (`127.0.0.1`, `localhost`, `::1` only unless `allowNonLoopback: true` is explicitly set) and enforces `isLoopbackRemoteAddress(req.socket.remoteAddress)` on `/_maskera/*`, `/healthz`, and `/mcp`.
- **Regression test:** `packages/mcp/test/proxy.test.ts`, `audit/suites/security.mjs` (`ssrf-loopback-perms-limits`).

### FINDING-05 (HIGH): Proxy `fetch()` followed HTTP 3xx redirects and lacked upstream origin verification
- **Impact:** Node `fetch()` defaults to `redirect: "follow"`. A malicious or compromised upstream returning `302 Location: http://attacker/...` could cause the proxy to forward the user's `x-api-key` / `Authorization` headers or reach internal metadata services. Raw path concatenation also lacked an explicit origin equality check.
- **Fix applied:** `proxy.ts` enforces `forwardPath.startsWith("/") && !forwardPath.startsWith("//")`, asserts `new URL(upstreamUrl).origin === new URL(baseUrl).origin`, and passes `redirect: "manual"` to upstream `fetch()`.
- **Regression test:** `audit/suites/security.mjs` (`ssrf-loopback-perms-limits` live 302 redirect trap).

### FINDING-06 (HIGH): Unicode zero-width/soft-hyphen bypass in ONNX NER & NFD mismatch in `customTerms`
- **Impact:** While `@maskera/core` rule detectors canonicalized invisible characters, `redactWithNer()` passed raw input to the ONNX NER model. Inserting U+200B or U+00AD inside a Swedish name (`"A\u200bnna Lind\u00adqvist"`) split BERT wordpieces and leaked the name in plaintext (`"Patient A​nna Lind­qvist bor i [PLATS_1]."`). Additionally, NFD-decomposed `customTerms` (such as macOS filenames) failed to match NFC input.
- **Baseline evidence:** Empirical probe confirmed `exp7_nfd_custom_term_missed: true` and `exp7b_zwsp_name_bypassed_ner: true`.
- **Fix applied:** `packages/mcp/src/engine.ts` canonicalizes `customTerms` via `canonicalize()` and runs hybrid NER on `canonicalize(text).text` whenever `!canonical.identity`, mapping spans back to exact original coordinates via `canonical.span()` so `restore()` stays byte-for-byte lossless without altering `packages/ner`'s release-locked checksum.
- **Regression test:** `packages/mcp/test/mcp.test.ts`, `audit/suites/adversarial.mjs` (`unicode-obfuscation`).

### FINDING-07 (MEDIUM): Numeric PII leak in `guard --redact`, session oracle under `--no-raw-restore`, and sticky elicitation capability
- **Impact:** `guard --redact` (`preserveJsonStructure`) left numeric JSON PII (`199001012385`) unmasked even though block mode caught it; `maskera_restore` validated `session_id` before checking `allowRawRestore` (session-ID existence oracle); `clientSupportsElicitation` was not reset on subsequent `initialize` calls.
- **Fix applied:** `guard.ts` redacts 7+ digit finite numbers in `redactJson()`; `server.ts` enforces `allowRawRestore` before `vault.restore()` and resets `clientSupportsElicitation` on every `initialize`.
- **Regression test:** `packages/mcp/test/proxy.test.ts`, `audit/suites/security.mjs`.

### FINDING-08 (MEDIUM): World-readable `0o644` permissions on restored PII files & audit logs, and unbounded `guard` input size
- **Impact:** Newly written restored files from `maskera_write_file` and proxy audit logs inherited default umask (`0o644`), exposing restored PII to other local users on shared hosts. `guard` stdin and `--file` lacked a byte limit, risking memory exhaustion.
- **Fix applied:** `files.ts` and `proxy.ts` create files with mode `0o600`; `cli.ts` enforces a 16 MiB ceiling on `guard` stdin and `--file` (failing closed with exit code `2`).
- **Regression test:** `audit/suites/security.mjs` (`ssrf-loopback-perms-limits`).

---

## 2. Production-Pipeline Model Quality & Performance Evidence

Evaluated through the **live `@maskera/mcp` server AND live HTTP proxy** (not standalone `packages/ner`) on the previously unseen 12-document Swedish multi-domain corpus (`audit/fixtures/unseen-eval-corpus.json`, covering HR, healthcare/clinical, legal, customer support, finance, and software engineering):

| Metric | Production Pipeline (`@maskera/mcp` v0.4.1 + v20 ONNX) | Standalone v20 Reference (`docs/BENCHMARKS.md`) |
| --- | ---: | ---: |
| Structured PII recall (PNR, tel, email, IBAN, org, etc.) | **100.0%** (31/31) | 99.6% (structured regression) |
| Overall entity recall (incl. free-text names, places, addresses) | **100.0%** (51/51) | 99.4% (curated) / 97.6% (independent names) |
| Overall span precision | **94.5%** | 97.7% (curated) |
| Overall F1 | **97.2%** | 98.5% (curated) |
| Document leakage rate | **0.0%** (0/12 docs) | N/A |
| Protected non-PII domain retention (clinical doses, terms) | **95.0%** | 96%+ (clinical retention) |
| Round-trip restoration accuracy (MCP + Proxy) | **100.0%** (24/24) | N/A |

**Per-entity breakdown (live MCP + Proxy unseen corpus):**
- `NAMN` (16 gold): Recall 100.0%, Precision 94.1%, F1 97.0%
- `ADRESS` (4 gold): Recall 100.0%, Precision 80.0%, F1 88.9%
- `PERSONNUMMER` (5), `EPOST` (6), `TELEFON` (6), `POSTNUMMER` (2), `PLATS` (4), `SAMORDNINGSNUMMER` (1), `ORGANISATIONSNUMMER` (2), `IBAN` (1), `BANKGIRO` (1), `PLUSGIRO` (1), `KONTONUMMER` (1), `KORTNUMMER` (1), `IP` (1): **100.0% Recall / 100.0% Precision / 100.0% F1**

**Observed production over-masking trade-off in real coding agents:**
- In `audit:clients` (`auto` mode), `codex/auto` produced **450 redactions** and `opencode/auto` produced **1,729 redactions** on a 2-3 turn workflow with 1 synthetic person, because `system`/`instructions` blocks (20-40 KB of English coding-agent prompt instructions) run through Swedish ONNX NER. Tool descriptions already run rules-only. This is a documented semantic-utility vs privacy trade-off: masking `system` protects PII placed in user `CLAUDE.md` files, but introduces false positives on English system prose.

**Performance, Concurrency & Soak (Apple M4 Pro, Node v24.22.1):**
- **CLI cold start (`--version`):** `46.8 ms`
- **Local ONNX model load:** `39 ms` (local disk)
- **Pure ONNX inference latency (cache disabled):** `p50 = 9.34 ms`, `p95 = 11.92 ms`, `p99 = 11.92 ms`
- **End-to-end HTTP Proxy round-trip latency:** `p50 = 11.04 ms`, `p95 = 13.35 ms`, `p99 = 13.35 ms` (**`1.70 ms` median proxy overhead**)
- **StreamingRestorer throughput:** 10,000 chunks in `1.97 ms` (~5.1M chunks/s)
- **Concurrent burst (16 clients x 5 requests = 80 requests, rules mode):** `2,184 req/s`, 0 errors, 0 cross-contamination
- **500-operation soak test (rolling sessions, cap=25):** `20.54 MB` heap delta, `SessionVault` bounded at `<= 25` sessions, clean shutdown

---

## 3. Supply Chain, Package & Offline Audit

- **Packed npm artifact (`@maskera/mcp@0.4.1`):** `332,799 bytes`, 8 files (`dist/cli.js`, `dist/cli.js.map`, `dist/index.js`, `dist/index.js.map`, `dist/index.d.ts`, `package.json`, `README.md`, plus directory entry). SHA-256 recorded in [audit-results.json](./audit-results.json). Zero `.env`, training data, fixtures, or secrets included. License: `MIT`.
- **Clean tarball installation:** Installed `@maskera/core`, `maskera`, and `@maskera/mcp` tarballs into an isolated temp directory in `691 ms`; all CLI subcommands (`--version`, `--help`, `install`, `doctor`, `guard`, `mcp` stdio, `wrap`) passed against the installed binary.
- **Model integrity:** `MASKERA_SV_NER_REVISION` is pinned to 40-char commit SHA `f417d65c08bcf814f639f8bf9221e30a79a53f39` with SHA-256 pre-load and post-load cache verification (`MASKERA_SV_NER_SHA256`) before bytes reach `onnxruntime`.
- **Dependency audit (`pnpm audit --prod`):** 0 critical, 0 unignored high, 3 moderate advisories in transitive `onnxruntime-node > adm-zip@0.6.0` (packaging/extraction tool inside `onnxruntime-node`, not invoked by Maskera runtime) and 6 workspace-ignored high advisories tracked in `pnpm-workspace.yaml`.
- **Offline verification (`audit:offline`):** Actively blocked all non-loopback `fetch`/`http`/`https`/`net` egress via Node `--import` preload:
  - `rules` mode: **0 outbound network attempts**.
  - `auto` (hybrid ONNX) mode with local model (`MASKERA_MODEL_PATH` + `MASKERA_ALLOW_REMOTE_MODELS=0`): **0 outbound network attempts**.
  - Cold-start without cached model: **failed closed (exit 2)** when blocked; only required remote host for cold download is `huggingface.co` (plus HF LFS CDN).

---

## 4. Known Residual Limitations (Non-Exploits / Explicit Boundaries)

1. **Cyrillic homoglyphs in free-text names:** Replacing Latin `a` with Cyrillic `а` (U+0430) in `"Pаtient Annа Lindqvist"` yielded `"Pаtient Annа [NAMN_1]"` (surname masked, first name missed). Classified as a known canonicalizer/NER limitation.
2. **Hyphenated Swedish compounds:** `"Lindqvist-ärendet"` can retain the name prefix in NER.
3. **Binary media & PDF attachments:** Proxy does not OCR images or parse binary PDFs.
4. **Filenames:** `maskera_list_files` / `maskera_read_file` return file paths as-is; avoid storing raw PII in filenames.
5. **Default proxy session sharing:** Without an `x-maskera-session` header, all chats through one persistent proxy share the `"proxy"` session map (use `maskera-mcp wrap` for per-invocation isolation).

---

## 5. Reproduction Commands

```bash
pnpm audit:quick        # Fast local/PR gate: protocol + privacy + security + 4/4 mutations
pnpm audit:privacy      # Canary scanner & network egress auditor
pnpm audit:security     # Security invariants + live mutation testing (negative controls)
pnpm audit:e2e          # Protocol conformance + 7 built-CLI E2E suites
pnpm audit:clients      # Real installed CLI clients (claude, codex, opencode) on packed tarball
pnpm audit:adversarial  # Unicode, formats, large docs, streaming splits, fuzzing (200 trials)
pnpm audit:package      # Tarball pack, contents & checksum audit, clean install smoke
pnpm audit:offline      # Active egress-blocked offline verification
pnpm audit:benchmark    # Unseen Swedish corpus eval, latencies, concurrency & 500-op soak
pnpm audit:full         # All lanes + automatic release gate evaluation
```

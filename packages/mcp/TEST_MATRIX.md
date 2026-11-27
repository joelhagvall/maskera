# Maskera MCP & Local Proxy: Test Matrix

Every surface, client, transport, and security invariant is tracked with explicit status: `PASS`, `FAIL`, `BLOCKED`, or `NOT_TESTED`.

## 1. Client & Runtime Integration Matrix

| Client / Target | Artifact Tested | Transport / Mode | Status | Evidence / Notes |
| --- | --- | --- | --- | --- |
| **Claude Code** (`2.1.332`) | Cleanly packed & installed `@maskera/mcp@0.4.2` tarball | MCP stdio + HTTP Proxy + `UserPromptSubmit` guard hook (`rules` & `auto` ONNX) | **PASS** | `audit:clients` (`claude/rules`, `claude/auto`, 0 upstream leaks) |
| **Codex CLI** (`0.172.0`) | Cleanly packed & installed `@maskera/mcp@0.4.2` tarball | MCP stdio + HTTP Proxy Responses API (`426` WS->SSE fallback, 0 reconnects, `rules` & `auto`) | **PASS** | `audit:clients` (`codex/rules: 477ms`, `codex/auto: 917ms`, 0 upstream leaks) |
| **OpenCode** (`v2.4.2`) | Cleanly packed & installed `@maskera/mcp@0.4.2` tarball | MCP stdio + HTTP Proxy Chat Completions + Code Mode `execute` shield (`rules` & `auto`) | **PASS** | `audit:clients` (`opencode/rules: 1634ms`, `opencode/auto: 11214ms`, 0 upstream leaks) |
| **Local LLM (Ollama `gpt-oss:20b`)** | Real local `ollama serve` + built proxy | OpenAI-compatible `/v1/chat/completions` through `maskera-mcp proxy` (`auto` ONNX) | **PASS** | `audit:clients` (`HTTP 200, 0 raw canaries leaked, redacted=3`, `message.reasoning` restored) |
| **Claude Desktop (protocol)** | Built CLI (`dist/cli.js`) | Gateway third-party inference (`x-api-key` routing to Anthropic, SSE split restore) | **PASS** | `e2e-agent-test.mjs` suite 3b |
| **Claude Desktop (GUI app)** | `/Applications/Claude.app` | Electron GUI manual configuration | **NOT_TESTED** | GUI app not headless-automatable; protocol path covered above |
| **Cursor IDE (config & hook)** | Built CLI + installed binary | `.cursor/mcp.json` + `.cursor/hooks.json` (`beforeSubmitPrompt`) | **PASS** | `mcp.test.ts` + `e2e-agent-test.mjs` |
| **Cursor IDE (GUI app)** | `/Applications/Cursor.app` | Full IDE GUI interactive session | **NOT_TESTED** | GUI app requires interactive sign-in |
| **Live Cloud LLMs (Anthropic/OpenAI/OpenCode Go)** | Installed / built CLI | Real paid/subscription upstream APIs | **NOT_TESTED** | Strictly opt-in (`pnpm test:mcp:harnesses -- --live`); disabled by default to enforce zero paid API calls |

## 2. Protocol, Transport & Feature Coverage

| Area | Automated Suite | Status | Key Invariants Verified |
| --- | --- | --- | --- |
| MCP JSON-RPC 2.0 & 4 protocol versions (`2025-11-25`..`2024-11-05`) | `audit:e2e` / `protocol.mjs` | **PASS** | Version negotiation, fallback, `-32700`/`-32600`/`-32601`/`-32602`/`-32002`, notifications (`initialized`, `cancelled`) |
| MCP stdio transport + stdout purity | `protocol.mjs`, `mcp.test.ts` | **PASS** | 0 non-JSON-RPC bytes on stdout; bidirectional `elicitation/create` |
| Streamable HTTP `/mcp` | `protocol.mjs`, `security.mjs` | **PASS** | `POST`, `DELETE` vault wipe, `GET`/`PUT`->`405`, `202` notifications, `404` unknown/closed session, monotonic policy tightening |
| Proxy endpoints (`/messages`, `count_tokens`, `batches`, `chat/completions`, `completions`, `responses`, `embeddings`) | `privacy.mjs`, `security.mjs` | **PASS** | Redaction across all fields including `custom_tool_call.input`, `metadata.user_id`, Base64 text docs, gzip/br decompression |
| SSE & JSON streaming restoration | `adversarial.mjs`, `proxy.test.ts` | **PASS** | 1-char and all-cutpoint splits, JSON-escaped quotes/newlines, thinking & reasoning deltas, EOF without `[DONE]`, Maskera MCP tool shield |
| Privacy canary scanner (18 Swedish PII types, 29 surfaces) | `audit:privacy` | **PASS** | 0 raw, URL-encoded, or Base64 canary leaks across HTTP, MCP, guard, doctor, wrap, inspector, audit.jsonl, stderr, error/cancel paths |
| Security invariants & fail-closed guarantees | `audit:security` | **PASS** | Mode downgrade blocked, search exfil blocked, Content-Type smuggling `415`, percent-encoded path redacted, cross-session isolation, non-loopback refused, `302` redirect not followed, `0o600` perms, size caps |
| Negative controls (Mutation Testing) | `audit:security` | **PASS** | 4/4 planted security mutations killed (`MUT-01`..`MUT-04`) |
| Adversarial & Property-Based Fuzzing | `audit:adversarial` | **PASS** | ZWSP/SHY/WJ/bidi/fullwidth/NFD, JSON/MD/XML/CSV, 96 KB BERT seam, prompt injection & placeholder collisions, 40 concurrent sessions, corrupted ONNX fail-closed, 200 fuzz trials |
| Supply chain & clean tarball install | `audit:package` | **PASS** | Tarball contents & SHA-256 verified, 0 forbidden files, clean install + full CLI smoke |
| Offline egress blocking | `audit:offline` | **PASS** | 0 outbound attempts in `rules` and local ONNX `auto` modes; cold-start fails closed |
| Production quality, latency & soak | `audit:benchmark` | **PASS** | Unseen 12-doc 6-domain eval, p50/p95/p99 latency split, 80-req concurrent burst, 500-op soak test |

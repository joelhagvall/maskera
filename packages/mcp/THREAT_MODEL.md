# Maskera MCP & Local Proxy: Threat Model

This document maps all data flows, trust boundaries, storage locations, bypass paths, and explicit security guarantees for `@maskera/mcp`.

## 1. Architecture & Data Flows

```text
+-----------------------------------------------------------------------------+
| TRUST BOUNDARY A: LOCAL WORKSTATION (RAW PII PERMITTED IN RAM / USER DISK) |
|                                                                             |
|  [Local Files] <--(FileGuard: roots + realpath + 0600)--> [maskera-mcp]     |
|                                                             |   ^           |
|  [User / AI Client CLI: Claude Code, Codex, OpenCode]       |   | JSON-RPC  |
|       |                        |                            v   | (redacted)|
|       | (optional hook)        | ANTHROPIC_BASE_URL /    [SessionVault]     |
|       v                        | OPENAI_BASE_URL          (RAM only,        |
|  [maskera-mcp guard]           v                           owner-scoped)    |
|  (exit 2 on PII)        [maskera-mcp proxy 127.0.0.1]       ^               |
|                           |  |  |                           |               |
|                           |  |  +--> /_maskera (Loopback UI, same-origin)   |
|                           |  +-----> /mcp (Streamable HTTP, per-session)    |
|                           |  +-----> audit.jsonl (0600, counts ONLY)        |
|                           v  (REDACTED JSON/SSE ONLY, fail-closed 502/415)  |
+---------------------------|-------------------------------------------------+
                            |  TRUST BOUNDARY B: EGRESS TO EXTERNAL NETWORK
                            v
                  [External LLM Provider API]
                  (Anthropic / OpenAI / Custom)
                  Sees ONLY placeholders [NAMN_1], [PERSONNUMMER_1], ...
```

## 2. Where Masking, Restoration, and Raw PII Live

| Component | Ever sees raw PII? | Persistence | Isolation / Protection |
| --- | --- | --- | --- |
| Local workspace files | Yes | Disk (`0o600` for newly written files) | Confined to `--root` via `realpath()` + dangling symlink resolution |
| `MaskeraEngine` (`engine.ts`) | Yes (during redaction) | RAM only | Span cache stores ONLY SHA-256 digests + numeric `{start, end, label}` offsets (zero PII text) |
| `SessionVault` (`vault.ts`) | Yes (placeholder -> raw map) | RAM only (cleared on exit, `DELETE /mcp`, `/_maskera/clear`, or LRU cap) | Owner-partitioned (`proxy`, `mcp:<id>`, `mcp:stateless`, `default`) |
| `ApprovalBroker` (`approvals.ts`) | Holds closure referencing restore data until decided/expired | RAM only (5 min TTL, max 50 records) | Owner-bound; summaries contain counts/IDs only, never raw PII |
| `ProxyInspector` (`inspector.ts`) | **No** (stores redacted previews + counts only; `/_maskera/vault` reads `SessionVault` on explicit local toggle) | RAM ring buffer (max 100 entries) | Loopback socket + `Host` + `Origin` + `Sec-Fetch-Site` + custom header + `X-Frame-Options: DENY` + CSP |
| JSONL audit log (`--audit-log`) | **No** | Disk (`0o600`) | Strictly metadata & label counts; zero raw text or previews |
| Setup / wrap receipts (`--receipt`) | **No** | Disk (user-chosen path) | Synthetic self-test proof with verified 0 leaks; never real user data |
| `stdout` / `stderr` | **No** (unless user explicitly passes `guard --redact` on stdout, which outputs redacted text) | Ephemeral streams | `console.log/warn/info/debug` redirected to `stderr`; guard/proxy errors report counts/codes only |
| External LLM API | **No** (within model recall & covered formats) | External provider | Receives redacted request bodies only; responses restored locally |

## 3. Critical Distinction: MCP Tools vs Local Proxy

Do NOT conflate the security guarantees of the two modes:

| Guarantee | MCP Server Only (`maskera-mcp`) | Local Proxy (`maskera-mcp proxy` / `wrap`) |
| --- | --- | --- |
| Masks files read via `maskera_read_file` / `maskera_search_files` | **Yes** | **Yes** (if `/mcp` used) |
| Masks text typed directly into the chat prompt | **No** (unless paired with `guard` hook) | **Yes** |
| Masks output of built-in raw tools (`Bash`, `Read`, `Grep`, other MCP servers) | **No** | **Yes** (travels in LLM API request body) |
| Enforces zero raw PII leaving the machine even if agent ignores instructions | **No** (agent could still call raw tools if enabled) | **Yes** (network egress choke point, fail-closed) |
| Restores placeholders transparently in streamed chat responses | **No** (uses `maskera_write_file` to disk) | **Yes** (JSON + chunk-split SSE) |

## 4. Data Flows That Can Bypass Maskera

1. **Direct client-to-API calls without proxy:** If `ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL` is unset or overridden, traffic bypasses the proxy.
2. **Non-proxy transports (e.g., Codex ChatGPT-login WebSocket/HTTPS):** Proxy returns `426` on WebSocket upgrades so HTTP SSE is used, but clients that pin their own HTTPS base URL bypass local HTTP proxies.
3. **Built-in raw tools in MCP-only mode:** Without disabling raw file/shell tools or running through the proxy, an agent can read local files directly with `cat`/`Read` and send their contents to the LLM.
4. **Binary attachments:** Images (screenshots of PII), binary PDFs, and audio payloads sent to multimodal LLM endpoints are not OCR'd or parsed by the proxy. By default the proxy emits `x-maskera-warning: uninspectable-binary-attachment` and logs a warning in the inspector and audit log; pass `--block-binary` (or `MASKERA_PROXY_BLOCK_BINARY=1`) to reject them fail-closed with HTTP `415`.
5. **External third-party MCP servers:** Another MCP server running locally can make its own outbound network calls completely outside Maskera's proxy.
6. **OS-level crash dumps / swap / memory inspection:** Raw PII exists in process RAM inside `SessionVault` while active; any local process running as the same OS user can inspect loopback endpoints or process memory.

*(Note: Filenames containing Swedish PII are automatically redacted in `maskera_list_files`, `maskera_search_files`, `maskera_read_file`, and `maskera_write_file` using owner-scoped bidirectional aliases, while regular source-code filenames remain untouched.)*

## 5. Adversary Capabilities & Mitigations

### Malicious or Prompt-Injected LLM / Tool Response
- **Attack:** Inject instructions in a read file to call `maskera_restore`, `maskera_redact(include_map=true)`, `maskera_read_file(mode="rules")`, or `maskera_search_files(query="[NAMN_1]", mode="rules")`.
- **Mitigation:**
  - `--no-raw-restore` hides and blocks `maskera_restore` and `include_map: true` (without a session-existence oracle).
  - `--approval-mode browser|native` gates raw PII exports behind explicit human approval.
  - Mode downgrade to `"rules"` is rejected on `maskera_read_file` and `maskera_search_files` when server runs in `"auto"` mode.
  - `maskera_search_files` scrubs all known session secrets from matched lines before truncation and return.
  - Literal placeholders injected into user/file text (`[PERSONNUMMER_1]`) are skipped during token assignment to prevent collision attacks on restore.

### Malicious Local Website / Browser CSRF / DNS Rebinding
- **Attack:** A malicious web page attempts to fetch `http://127.0.0.1:8787/_maskera/vault` or `POST /_maskera/clear` or `POST /mcp` or rebind a domain to `127.0.0.1`.
- **Mitigation:** Loopback bind enforced by default; `req.socket.remoteAddress` verified loopback; strict `Host` allowlist (`127.0.0.1`, `localhost`, `[::1]`); `Origin` & `Sec-Fetch-Site` validation; custom non-simple headers required (`x-maskera-reveal: 1`, `x-maskera-action: ...`); `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`.

### Malicious Concurrent `/mcp` Client
- **Attack:** Client B connected to `http://127.0.0.1:8787/mcp` attempts to read Client A's vault, read the proxy's `"proxy"` vault, omit `session_id` on `maskera_write_file`, or call `maskera_resume` on Client A's approval.
- **Mitigation:** Composite owner isolation (`mcp:<sessionId>`, `mcp:stateless`, `proxy`) in both `SessionVault` and `ApprovalBroker`; HTTP `404` on unknown/closed `Mcp-Session-Id`; immediate owner wipe on `DELETE /mcp`.

### Malicious or Compromised Upstream / Model Tampering
- **Attack:** Upstream returns `302` redirect to steal `x-api-key`, or local Hugging Face cache is tampered with poisoned ONNX weights.
- **Mitigation:** Upstream `fetch()` enforces `redirect: "manual"` and origin match. `maskera` pins `MASKERA_SV_NER_REVISION` to a 40-char commit SHA and verifies SHA-256 digests (`MASKERA_SV_NER_SHA256`) before and after loading weights; corrupted/failing models fail closed (`502` in proxy, `isError: true` in MCP, exit `2` in guard).

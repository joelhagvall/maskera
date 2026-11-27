# @maskera/mcp

Local Swedish PII redaction for any AI agent or LLM client:

1. **One-command proxy wrapper (`maskera-mcp wrap -- <cmd>`)**: starts a local loopback proxy on a free port, verifies zero leaks automatically, injects `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, `MASKERA_PROXY_URL`, and `MASKERA_MCP_URL` into your CLI (`claude`, `codex`, `opencode`, scripts), and prints a session receipt when the command exits.
2. **Local LLM proxy + Streamable HTTP MCP (`maskera-mcp proxy` / `maskera-mcp service install`)**: sits between any client that accepts a custom API URL (Claude Code, Codex with an API key, Cursor, OpenCode, Claude Desktop via third-party inference, Python/JS SDKs) and Anthropic/OpenAI, redacts outgoing prompts and tool results locally on-device, and transparently restores placeholders in both JSON and SSE streaming responses. The same warm process also exposes Streamable HTTP MCP at `http://127.0.0.1:8787/mcp` and a live inspector with a built-in self-test button at `/_maskera`. Install it as a persistent local background service (`launchd` on macOS, `systemd --user` on Linux) with `maskera-mcp service install`.
3. **MCP stdio server (`maskera-mcp`)**: exposes `maskera_read_file`, `maskera_write_file`, `maskera_list_files`, `maskera_search_files`, `maskera_redact`, `maskera_restore`, `maskera_list_sessions`, `maskera_clear_session`, `maskera_status` (plus `maskera_resume` in browser approval mode), along with built-in MCP `prompts` and `resources` (`maskera://skills/maskera/SKILL.md`) over JSON-RPC 2.0 stdio or Streamable HTTP.
4. **Hook / pipe guard (`maskera-mcp guard`)**: blocks PII in Claude Code / Cursor hooks or Unix pipelines (`exit 2`, never echoes raw PII) or redacts streams via `--redact`.
5. **Client installer and diagnostics (`maskera-mcp install` / `maskera-mcp doctor`)**: auto-detects or configures clients (`--apply`, `--project`, `--with-hook`), runs an automatic Swedish PII self-test + live `/mcp` probe, and prints (or saves via `--receipt <file.json>`) a zero-PII setup receipt (`maskera-setup-receipt/v1`).

All redaction runs 100% locally using `maskera` (deterministic Swedish rules + the 43 MB open Swedish ONNX NER model `joelhagvall/maskera-sv-ner`).

## 1. Local LLM proxy + warm Streamable HTTP MCP

Start the proxy on loopback (`127.0.0.1:8787`):

```bash
# Fastest single-terminal launch (starts proxy, verifies 0 leaks, sets env vars, prints session summary on exit)
npx -y @maskera/mcp wrap -- claude
npx -y @maskera/mcp wrap --open -- codex

# Or keep one persistent local proxy + warm /mcp running in the foreground (or open /_maskera automatically)
npx -y @maskera/mcp proxy --root /path/to/workspace --open

# Or install as a background service (launchd on macOS, systemd --user on Linux)
npx -y @maskera/mcp service install --root /path/to/workspace --no-raw-restore
npx -y @maskera/mcp service status
npx -y @maskera/mcp service uninstall
```

Point any client that accepts a custom API URL at it, or connect an MCP client to `/mcp` on the same warm process:

```bash
# Claude Code / Anthropic SDK
ANTHROPIC_BASE_URL=http://127.0.0.1:8787 claude

# Codex (API key) / OpenAI SDK / Cursor custom OpenAI base URL
# Note: Codex logged in with a ChatGPT subscription requires HTTPS on chatgpt_base_url;
# use the MCP stdio server below (`codex mcp add maskera -- npx -y @maskera/mcp`) instead.
OPENAI_BASE_URL=http://127.0.0.1:8787/v1 codex

# Connect an HTTP MCP client to the same warm ONNX model & vault
claude mcp add --transport http maskera 'http://127.0.0.1:8787/mcp?no_raw_restore=1'

# Or require browser approval before raw PII ever leaves the vault
claude mcp add --transport http maskera 'http://127.0.0.1:8787/mcp?approval_mode=browser'

# Inspect live redactions and answer pending approvals in your browser (local RAM only)
open http://127.0.0.1:8787/_maskera

# Optional: write local metadata-only audit logs (counts only, never raw text)
npx -y @maskera/mcp proxy --audit-log ./maskera-audit.jsonl
```

- Routes Anthropic (`/v1/messages`, `/anthropic/*`) and OpenAI (`/v1/chat/completions`, `/v1/responses`, `/openai/*`) automatically, or use `--upstream <url>` for any OpenAI/Anthropic-compatible endpoint (Azure, OpenRouter, LiteLLM).
- Built-in local live inspector at `http://127.0.0.1:8787/_maskera`: see every proxied request and MCP tool call, entity counts, pending approvals, and the exact masked text sent upstream in real time (originals hidden by default until you toggle reveal).
- Restores placeholders even when split across SSE stream chunks, including JSON `tool_use` / `tool_calls` arguments.
- Fails closed (`502`) if local redaction fails: raw PII is never forwarded upstream.

### Which mode to use

- **Proxy** for text typed straight into the chat. It also masks tool results, because they travel in the same request.
- **Streamable HTTP MCP (`/mcp`)** when multiple clients should share one warm ONNX model, one session vault, and browser approvals.
- **MCP stdio server** for local files the agent reads with `maskera_read_file` when no background proxy is running.
- Before you send real personal data, run `npx -y @maskera/mcp doctor` or test with made-up data: send a fictional address and check that `http://127.0.0.1:8787/_maskera` shows a placeholder going upstream.

### Claude Desktop through the proxy

Claude Desktop can send its chat traffic to an Anthropic-compatible gateway. Point it at the proxy and everything you type in the chat is masked on your machine before it reaches Anthropic. Requests are billed to the API key you enter, not to a Claude plan. Setup reference: [Claude Desktop in-app configuration](https://claude.com/docs/third-party/claude-desktop/in-app-configuration).

1. Start the proxy and keep it running: `npx -y @maskera/mcp proxy`. While it is stopped, Desktop's chat fails instead of sending unmasked text.
2. In Claude Desktop, choose **Help → Troubleshooting → Enable Developer Mode**, then **Developer → Configure Third-Party Inference…**.
3. Under **Connection**, set **Inference provider** to **Gateway**.
4. Fill in **Gateway credentials**:
   - **Credential kind**: **Static API key**
   - **Gateway base URL**: `http://127.0.0.1:8787` (no `/v1`; Desktop adds `/v1/messages` itself)
   - **Gateway API key**: your Anthropic API key
   - **Gateway auth scheme**: **x-api-key**. Anthropic's API takes API keys in this header, and it tells the proxy to route the request to Anthropic. The default **Bearer** is forwarded as-is and Anthropic rejects it.
5. Click **Apply Changes**, then **Save & Restart**.
6. Test with made-up data. Open `http://127.0.0.1:8787/_maskera` and send `Skriv ett kort mejl till provnamn.maskera@example.com och bekräfta mötet.` The inspector shows `[EPOST_1]` going upstream, and Desktop's reply shows the address restored.

To go back to your Claude account, choose the Anthropic sign-in option on the sign-in screen. The gateway settings stay on the device and can be changed in the same window.

## 2. MCP server setup (`install`, stdio, and scoped policies)

Generate or write the configuration for your client directly:

```bash
# Auto-detect installed clients, or target one (claude-code, claude-desktop, codex, cursor, opencode, t3-code, or all)
# install runs a synthetic Swedish PII roundtrip automatically and prints a setup receipt
npx -y @maskera/mcp install
npx -y @maskera/mcp install cursor --root /path/to/workspace --no-raw-restore --with-hook
npx -y @maskera/mcp install claude-code --transport http --no-raw-restore --apply --with-hook --receipt ./maskera-receipt.json
npx -y @maskera/mcp doctor --receipt ./maskera-receipt.json
```

Pass `--apply` to execute `claude mcp add` / `codex mcp add` directly, `--project` to write project-local `.mcp.json` for Claude Code, `--with-hook` to add a `maskera-mcp guard` prompt hook, or `--no-verify` to skip the verification receipt. When a local proxy is running, both `install` and `doctor` also execute a live JSON-RPC `maskera_redact` probe against `/mcp` and verify zero leaked PII.

Or configure stdio manually:

```json
{
  "mcpServers": {
    "maskera": {
      "command": "npx",
      "args": ["-y", "@maskera/mcp", "--root", "/path/to/workspace", "--no-raw-restore"]
    }
  }
}
```

Tools (all declare `inputSchema`, `outputSchema`, and MCP tool `annotations`):
- `maskera_list_files`: List files inside allowed workspace roots without reading contents.
- `maskera_search_files`: Search UTF-8 files locally and redact every matched line before returning (supports searching by an existing placeholder like `[NAMN_1]`).
- `maskera_read_file`: Read a local UTF-8 file already redacted, storing the restore map locally under `session_id`.
- `maskera_write_file`: Restore placeholders from `session_id` and write directly to disk without exposing raw PII back to the LLM.
- `maskera_redact`: Redact text locally (`mode: "auto"` or `"rules"`, `profile: "general" | "clinical"`, `custom_terms`).
- `maskera_restore`: Restore placeholders using `session_id` or an explicit map (hidden and blocked under `--no-raw-restore`, or gated under `--approval-mode browser|native`).
- `maskera_list_sessions` / `maskera_clear_session` / `maskera_status`: Inspect counts (never raw PII), clear memory, or check model and policy status.
- `maskera_resume`: Exposed in `--approval-mode browser` to resume a paused raw-PII export once approved in `http://127.0.0.1:8787/_maskera`.

Built-in MCP `prompts` and `resources`:
- Prompts: `maskera-workflow` (with optional `profile` and `custom_terms`) and `maskera-redact-file`.
- Resources: `maskera://skills/maskera/SKILL.md` (full agent operating guide) and `maskera://status`.

Scoped policies (CLI flags or `/mcp` query parameters):
- `--no-raw-restore` / `?no_raw_restore=1`: Hides and blocks `maskera_restore` and `include_map: true`. The agent can still write restored output directly to disk via `maskera_write_file`.
- `--read-only` / `?read_only=1`: Hides and blocks `maskera_write_file` and `maskera_clear_session`.
- `--approval-mode automatic|browser|native` / `?approval_mode=browser`: Gates raw PII exports (`maskera_restore`, `include_map: true`) behind either browser approval in `/_maskera` or native MCP form elicitation (`elicitation/create`). Query parameters may only tighten server defaults, never weaken them.

## 3. Harness-agnostic guard / hook

```bash
# Block prompts or hook JSON containing PII (exits 2 on match, 0 if clean).
# Automatically reuses a running local proxy's warm ONNX model on 127.0.0.1:8787 when available.
echo '{"prompt":"Ring 070-174 06 58"}' | npx -y @maskera/mcp guard

# Redact any pipe locally (pass --no-proxy to force in-process execution)
cat klient.txt | npx -y @maskera/mcp guard --redact
```

## 4. Agent skill (`SKILL.md`)

The skill is served automatically over MCP at `maskera://skills/maskera/SKILL.md` and prompt `maskera-workflow`. You can also install it directly in Claude Code, Codex, Cursor, or OpenCode:

```bash
npx skills add joelhagvall/maskera
```

## 5. Verification scripts (Claude Code, Codex, OpenCode)

Run the built-in reusable E2E and benchmark suites locally (zero paid API calls):

```bash
# Protocol, security, streaming, HTTP /mcp, approvals, install, doctor, and local ONNX E2E
pnpm test:mcp:e2e

# Real installed agent harnesses (claude, codex, opencode) with MCP + proxy + hooks
pnpm test:mcp:harnesses
pnpm test:mcp:harnesses -- --only claude,codex --mode rules
pnpm test:mcp:harnesses -- --live   # opt-in live subscription proof

# Clean npm tarball pack + binary smoke (--cold-hf tests a fresh HF model download)
pnpm test:mcp:pack

# Latency & throughput benchmark (CLI startup, multi-turn ONNX cache, SSE restorer)
pnpm bench:mcp
```

## Options and environment

- `--rules-only` or `MASKERA_MCP_MODE=rules`: Deterministic rules only without loading the ONNX model.
- `--profile general|clinical`: Built-in precision profile.
- `--custom-term <word>` (repeatable): Extra protected words (client names, codenames, case IDs).
- `--no-raw-restore` or `MASKERA_MCP_NO_RAW_RESTORE=1`: Disallow raw PII export into model context.
- `--read-only` or `MASKERA_MCP_READ_ONLY=1`: Disallow file writes and session clears.
- `--approval-mode automatic|browser|native` or `MASKERA_MCP_APPROVAL_MODE`: Gate raw PII exports.
- `--port <n>` / `--host <addr>` / `--upstream <url>` / `--no-restore`: Proxy options.
- `--root <dir>` (repeatable) or `MASKERA_MCP_ROOTS`: Allowed file roots for MCP file tools (works on both `mcp` and `proxy`).
- `MASKERA_MODEL_PATH` + `MASKERA_MODEL_ID` + `MASKERA_ALLOW_REMOTE_MODELS=0`: Load a local ONNX model directory offline.

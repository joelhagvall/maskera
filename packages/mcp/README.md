# @maskera/mcp

Local Swedish PII redaction for any AI agent or LLM client:

1. **Harness-agnostic LLM proxy (`maskera-mcp proxy`)**: sits between any agent/SDK (Claude Code, Codex, Cursor, OpenCode, Python/JS SDKs) and Anthropic/OpenAI, redacts outgoing prompts and tool results locally on-device, and transparently restores placeholders in both JSON and SSE streaming responses. Zero trust in the agent required.
2. **MCP stdio server (`maskera-mcp`)**: exposes `maskera_read_file`, `maskera_write_file`, `maskera_redact`, `maskera_restore`, and session management tools over JSON-RPC 2.0 stdio.
3. **Hook / pipe guard (`maskera-mcp guard`)**: blocks PII in Claude Code / Cursor hooks or Unix pipelines (`exit 2`, never echoes raw PII) or redacts streams via `--redact`.

All redaction runs 100% locally using `maskera` (deterministic Swedish rules + the 43 MB open Swedish ONNX NER model `joelhagvall/maskera-sv-ner`).

## 1. Harness-agnostic local LLM proxy (enforced for every agent)

Start the proxy on loopback (`127.0.0.1:8787`):

```bash
npx -y @maskera/mcp proxy
```

Point any harness at it:

```bash
# Claude Code / Anthropic SDK
ANTHROPIC_BASE_URL=http://127.0.0.1:8787 claude

# Codex (API key) / OpenAI SDK / Cursor custom OpenAI base URL
# Note: Codex logged in with a ChatGPT subscription requires HTTPS on chatgpt_base_url;
# use the MCP stdio server below (`codex mcp add maskera -- npx -y @maskera/mcp`) instead.
OPENAI_BASE_URL=http://127.0.0.1:8787/v1 codex

# Inspect live redactions in your browser (local RAM only, screen-share safe by default)
open http://127.0.0.1:8787/_maskera

# Optional: write local metadata-only audit logs (counts only, never raw text)
npx -y @maskera/mcp proxy --audit-log ./maskera-audit.jsonl
```

- Routes Anthropic (`/v1/messages`, `/anthropic/*`) and OpenAI (`/v1/chat/completions`, `/v1/responses`, `/openai/*`) automatically, or use `--upstream <url>` for any OpenAI/Anthropic-compatible endpoint (Azure, OpenRouter, LiteLLM).
- Built-in local live inspector at `http://127.0.0.1:8787/_maskera`: see every proxied request, entity counts, and the exact masked text sent upstream in real time (originals hidden by default until you toggle reveal).
- Restores placeholders even when split across SSE stream chunks, including JSON `tool_use` / `tool_calls` arguments.
- Fails closed (`502`) if local redaction fails: raw PII is never forwarded upstream.

## 2. MCP stdio server (Claude Desktop / Cursor / Claude Code / Codex / T3 Code)

```json
{
  "mcpServers": {
    "maskera": {
      "command": "npx",
      "args": ["-y", "@maskera/mcp", "--root", "/path/to/your/workspace"]
    }
  }
}
```

Tools:
- `maskera_read_file`: Read a local UTF-8 file already redacted, storing the restore map locally under `session_id`.
- `maskera_write_file`: Restore placeholders from `session_id` and write directly to disk without exposing raw PII back to the LLM.
- `maskera_redact`: Redact text locally (`mode: "auto"` or `"rules"`, `profile: "general" | "clinical"`, `custom_terms`).
- `maskera_restore`: Restore placeholders using `session_id` or an explicit map.
- `maskera_list_sessions` / `maskera_clear_session` / `maskera_status`: Inspect counts (never raw PII), clear memory, or check model status.

## 3. Harness-agnostic guard / hook

```bash
# Block prompts or hook JSON containing PII (exits 2 on match, 0 if clean)
echo '{"prompt":"Ring 070-174 06 58"}' | npx -y @maskera/mcp guard

# Redact any pipe locally
cat klient.txt | npx -y @maskera/mcp guard --redact
```

## 4. Agent skill (`SKILL.md`)

Install the workflow skill (`skills/maskera/SKILL.md`) in Claude Code, Codex, Cursor, or OpenCode:

```bash
npx skills add joelhagvall/maskera
```

## 5. Verification scripts (Claude Code, Codex, OpenCode)

Run the built-in reusable E2E and benchmark suites locally (zero paid API calls):

```bash
# Protocol, security, streaming, and local ONNX E2E (also runs in CI)
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
- `--port <n>` / `--host <addr>` / `--upstream <url>` / `--no-restore`: Proxy options.
- `--root <dir>` (repeatable) or `MASKERA_MCP_ROOTS`: Allowed file roots for MCP file tools.
- `MASKERA_MODEL_PATH` + `MASKERA_MODEL_ID` + `MASKERA_ALLOW_REMOTE_MODELS=0`: Load a local ONNX model directory offline.

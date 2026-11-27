---
name: maskera
description: Redact Swedish personal data (names, personnummer, addresses, phones, emails, IBAN, org numbers) locally before text or files reach an AI model, and restore answers locally. Use when working with Swedish client files, HR/CVs, legal or municipal cases, healthcare notes, support transcripts, or when setting up @maskera/mcp (local LLM proxy, Streamable HTTP or stdio MCP server, guard) or the maskera npm SDK.
---

# Maskera: local Swedish PII redaction

Maskera runs 100% locally on-device using deterministic Swedish rules plus the 43 MB Swedish ONNX NER model (`joelhagvall/maskera-sv-ner`). Raw PII and restore maps stay local so cloud LLMs only see placeholders such as `[NAMN_1]` and `[PERSONNUMMER_1]`.

## Choose the right mode

Pick by where the text comes from: **proxy for text typed straight into the chat**, **MCP for files the agent reads with the Maskera tools**. Before the user sends real personal data, verify the setup with made-up data (a fictional address) and confirm a placeholder in the local inspector at `http://127.0.0.1:8787/_maskera`, or run `npx -y @maskera/mcp doctor`.

1. **Local LLM proxy + warm Streamable HTTP MCP (`maskera-mcp proxy`):**
   Use when no prompt, history or tool output may leave the machine unredacted, or when multiple clients should share one warm ONNX model and session vault.
   ```bash
   npx -y @maskera/mcp proxy --root /path/to/workspace
   # Point any harness or SDK at the loopback proxy:
   ANTHROPIC_BASE_URL=http://127.0.0.1:8787 claude
   OPENAI_BASE_URL=http://127.0.0.1:8787/v1 codex   # API key mode; ChatGPT-login Codex requires HTTPS so use MCP below
   # Same warm process also serves Streamable HTTP MCP:
   # http://127.0.0.1:8787/mcp (supports ?no_raw_restore=1&read_only=1&approval_mode=browser)
   ```
   - Claude Desktop: Help -> Troubleshooting -> Enable Developer Mode, then Developer -> Configure Third-Party Inference. Set Inference provider to **Gateway**, Credential kind **Static API key**, Gateway base URL `http://127.0.0.1:8787` (no `/v1`), Gateway API key = the user's Anthropic API key, Gateway auth scheme **x-api-key**. Apply Changes, then Save & Restart. Full guide: `https://maskera.dev/docs/guides`.
   - Routes Anthropic (`/v1/messages`) and OpenAI (`/v1/chat/completions`, `/v1/responses`) automatically, or set `--upstream <url>`.
   - Restores placeholders transparently in JSON, tool arguments and chunk-split SSE streams.
   - Fails closed (`502`) if local redaction fails. Inspect counts only at `http://127.0.0.1:8787/_maskera/status`.

2. **Working with sensitive local Swedish files (MCP stdio or Streamable HTTP):**
   Install automatically with `npx -y @maskera/mcp install <client>` (`claude-code`, `claude-desktop`, `codex`, `cursor`, `opencode`, `t3-code`), or configure manually:
   - Claude Code / Cursor (`mcpServers`):
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
   - Codex CLI:
     ```bash
     codex mcp add maskera -- npx -y @maskera/mcp --root /path/to/workspace --no-raw-restore
     ```
   - OpenCode v2:
     ```bash
     opencode mcp add maskera -- npx -y @maskera/mcp --root /path/to/workspace --no-raw-restore
     ```
   Workflow rules when the Maskera MCP tools are available:
   - List and search sensitive Swedish directories with `maskera_list_files` and `maskera_search_files` instead of raw `grep`/`rg` so matched lines are redacted before entering context.
   - Read sensitive Swedish files with `maskera_read_file` instead of raw file-reading tools. Reuse one `session_id` across related files so `[NAMN_1]` stays consistent.
   - Pass `custom_terms` for client codenames, project names or case references not covered by built-in rules.
   - Pass `profile: "clinical"` for Swedish medical or care notes so diagnoses, doses and measurements stay intact while personal data is masked.
   - Write finished drafts directly to disk with `maskera_write_file` so placeholders are restored locally without echoing raw PII back into the conversation.
   - Use `--no-raw-restore` (or `--approval-mode browser`) when the agent should never pull raw PII back into chat via `maskera_restore` or `include_map: true`.
   - Clear the in-memory restore map with `maskera_clear_session` once the task is done.

3. **Hooks and Unix pipes (guard):**
   ```bash
   # Block prompts or JSON hook payloads containing PII (exits 2, prints counts only):
   npx -y @maskera/mcp guard
   # Redact text locally in a pipeline:
   cat input.txt | npx -y @maskera/mcp guard --redact
   ```

4. **Embedding in application code (browser or Node 18+):**
   ```bash
   npm install maskera @huggingface/transformers
   ```
   Reuse one `createNerRecognizer()` instance across calls and run `await redactWithNer(text, { recognizer })` (or `redact(text)` from `@maskera/core` for zero-dependency structured rules only).

## Boundaries

- A skill guides agent behaviour; for hard enforcement that cannot be bypassed by raw shell or file tools, use `maskera-mcp proxy` or restrict file access to `maskera-mcp` with `--no-raw-restore`.
- Automated masking reduces exposure risk but is not a zero-leak guarantee. Never log restore maps or write them next to redacted outputs.
- Reference docs and machine-readable details: `https://maskera.dev/docs` and `https://maskera.dev/llms.txt`.

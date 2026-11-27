# Set up Maskera locally for this workspace

Help me set up Maskera (`@maskera/mcp` or the `maskera` npm SDK) so Swedish personal data (names, personnummer, addresses, phone numbers, emails, IBAN, org numbers) is masked locally on my device before text reaches an AI model.

## Step 1: Pick the right mode

Ask me (or inspect my current client) which setup fits best:

1. **Local LLM proxy + warm Streamable HTTP MCP (`npx -y @maskera/mcp proxy --root .`)**: Best when text typed straight into the chat and tool results must be masked automatically, or when several clients should share one warm ONNX model and session vault.
   - Anthropic / Claude Code: `ANTHROPIC_BASE_URL=http://127.0.0.1:8787`
   - OpenAI / Codex (API key) / Cursor: `OPENAI_BASE_URL=http://127.0.0.1:8787/v1`
   - Streamable HTTP MCP on the same process: `http://127.0.0.1:8787/mcp` (add `?no_raw_restore=1` to block raw PII export into chat, `?read_only=1` for read-only access, or `?approval_mode=browser` for browser approvals in `http://127.0.0.1:8787/_maskera`).
2. **MCP stdio server (`npx -y @maskera/mcp --root . --no-raw-restore`)**: Best when the client cannot change its API base URL (for example Codex signed in with a ChatGPT account) and the agent reads/writes local Swedish files via Maskera tools.
3. **Hook / shell guard (`npx -y @maskera/mcp guard`)**: Exits `2` on PII (printing label counts only) in hooks or redacts streams with `--redact`.
4. **Application SDK (`npm install maskera @huggingface/transformers`)**: For browser or Node.js code.

## Step 2: Configure and verify with made-up data

Run the built-in installer or show me the exact command for my client (`claude-code`, `claude-desktop`, `codex`, `cursor`, `opencode`, `t3-code`):

```bash
npx -y @maskera/mcp install <client> --root . --no-raw-restore
```

Then run the local diagnostic self-test before touching any real personal data:

```bash
npx -y @maskera/mcp doctor --root .
```

If using the proxy, open `http://127.0.0.1:8787/_maskera` and send a fictional Swedish test prompt (`Skriv ett kort mejl till provnamn.maskera@example.com och bekräfta mötet.`). Confirm `[EPOST_1]` appears in the inspector going upstream and the reply restores the address locally.

## Step 3: Safe MCP file workflow

When Maskera MCP tools are active:

- Use `maskera_list_files` and `maskera_search_files` instead of raw `grep`/`rg` on sensitive Swedish folders.
- Read files with `maskera_read_file` and reuse one `session_id` across related files.
- Pass `profile: "clinical"` for Swedish healthcare notes and `custom_terms` for client codenames or case IDs.
- Write finished drafts directly to disk with `maskera_write_file` so placeholders are restored locally without echoing raw PII into chat.
- Call `maskera_clear_session` when done.
- Read the bundled skill resource `maskera://skills/maskera/SKILL.md` (or prompt `maskera-workflow`) if you need the full reference.

## Docs

- Documentation: https://maskera.dev/docs (English: https://maskera.dev/en/docs)
- `@maskera/mcp` reference: https://maskera.dev/en/docs/mcp
- Client guides: https://maskera.dev/en/docs/clients
- SDK and self-hosting: https://maskera.dev/en/docs/sdk
- Full agent index: https://maskera.dev/llms.txt

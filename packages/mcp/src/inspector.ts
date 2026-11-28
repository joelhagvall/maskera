import type { ServerResponse } from "node:http"
import type { ApprovalSummary } from "./approvals"

export interface InspectedRequest {
  id: string
  timestamp: string
  method: string
  path: string
  upstream: string
  sessionId: string
  status: number
  streamed: boolean
  durationMs: number
  redactions: number
  counts: Record<string, number>
  /** Redacted snippets sent upstream (never raw PII). */
  redactedPreview: string[]
  /** Optional non-PII security warnings (e.g. uninspectable binary attachments). */
  warnings?: string[]
}

const MAX_EVENTS = 100

/**
 * In-memory ring buffer and SSE fan-out for the local proxy and MCP inspector.
 * Keeps only metadata and already-redacted previews (never raw PII).
 */
export class ProxyInspector {
  private readonly items: InspectedRequest[] = []
  private readonly subscribers = new Set<ServerResponse>()
  private approvalsSnapshot: ApprovalSummary[] = []
  private seq = 0

  record(entry: Omit<InspectedRequest, "id">): InspectedRequest {
    this.seq += 1
    const item: InspectedRequest = { id: `req_${this.seq}`, ...entry }
    this.items.unshift(item)
    if (this.items.length > MAX_EVENTS) this.items.length = MAX_EVENTS

    const payload = `event: request\ndata: ${JSON.stringify(item)}\n\n`
    for (const res of [...this.subscribers]) {
      if (res.writableEnded || res.destroyed) {
        this.subscribers.delete(res)
        continue
      }
      res.write(payload)
    }
    return item
  }

  publishApprovals(approvals: ApprovalSummary[]): void {
    this.approvalsSnapshot = approvals
    const payload = `event: approvals\ndata: ${JSON.stringify({ approvals })}\n\n`
    for (const res of [...this.subscribers]) {
      if (res.writableEnded || res.destroyed) {
        this.subscribers.delete(res)
        continue
      }
      res.write(payload)
    }
  }

  list(): readonly InspectedRequest[] {
    return this.items
  }

  clear(): void {
    this.items.length = 0
    this.approvalsSnapshot = []
    const payload = `event: cleared\ndata: {}\n\n`
    for (const res of [...this.subscribers]) {
      if (res.writableEnded || res.destroyed) {
        this.subscribers.delete(res)
        continue
      }
      res.write(payload)
    }
  }

  subscribe(res: ServerResponse, extraHeaders: Record<string, string> = {}): void {
    res.writeHead(200, {
      ...extraHeaders,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    })
    res.write(
      `event: init\ndata: ${JSON.stringify({ items: this.items, approvals: this.approvalsSnapshot })}\n\n`,
    )
    this.subscribers.add(res)
    res.on("close", () => {
      this.subscribers.delete(res)
    })
  }

  closeAll(): void {
    for (const res of [...this.subscribers]) {
      try {
        res.end()
      } catch {
        // ignore already-closed streams
      }
    }
    this.subscribers.clear()
  }
}

export function renderInspectorHtml(info: {
  url: string
  mcpUrl?: string
  defaultMode: string
  restoreResponses: boolean
}): string {
  const safeUrl = info.url.replace(/[<>&"']/g, "")
  const safeMcpUrl = (info.mcpUrl ?? `${info.url}/mcp`).replace(/[<>&"']/g, "")
  return `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Maskera Proxy & MCP Inspector</title>
<style>
  :root {
    --bg: #ffffff;
    --bg-subtle: #f7f7f8;
    --fg: #111113;
    --muted: #666670;
    --border: #e4e4e7;
    --err: #b91c1c;
    --err-bg: #fef2f2;
    --tok-bg: #eff6ff;
    --tok-fg: #1d4ed8;
    --tok-border: #bfdbfe;
    --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0c0c0e;
      --bg-subtle: #16161a;
      --fg: #f4f4f5;
      --muted: #a1a1aa;
      --border: #27272a;
      --err: #f87171;
      --err-bg: #450a0a;
      --tok-bg: #172554;
      --tok-fg: #93c5fd;
      --tok-border: #1e3a8a;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: var(--sans);
    background: var(--bg);
    color: var(--fg);
    line-height: 1.5;
  }
  .wrap { max-width: 960px; margin: 0 auto; padding: 24px 20px 64px; }
  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    padding-bottom: 18px;
    border-bottom: 1px solid var(--border);
  }
  h1 { margin: 0; font-size: 18px; font-weight: 650; letter-spacing: -0.02em; }
  .sub { margin: 4px 0 0; font-size: 13px; color: var(--muted); }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  button {
    font-family: var(--sans);
    font-weight: 500;
    font-size: 12.5px;
    padding: 7px 12px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    cursor: pointer;
  }
  button:hover { background: var(--bg-subtle); }
  button.active, button.primary { background: var(--fg); color: var(--bg); border-color: var(--fg); }
  .stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin: 18px 0 22px;
  }
  @media (max-width: 640px) { .stats { grid-template-columns: repeat(2, 1fr); } }
  .stat {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 12px 14px;
    background: var(--bg-subtle);
  }
  .stat-k { font-size: 11.5px; color: var(--muted); }
  .stat-v { font-size: 20px; font-weight: 650; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .approvals {
    margin: 0 0 22px;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 14px 16px;
    background: var(--bg-subtle);
  }
  .approvals h2 { margin: 0 0 8px; font-size: 14px; }
  .approval-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 10px 0;
    border-top: 1px solid var(--border);
    font-size: 13px;
  }
  .approval-row:first-of-type { border-top: 0; padding-top: 2px; }
  .approval-meta { color: var(--muted); font-size: 12px; }
  .empty {
    border: 1px dashed var(--border);
    border-radius: 6px;
    padding: 28px 20px;
    text-align: center;
    color: var(--muted);
    font-size: 13.5px;
  }
  .empty code {
    display: block; margin: 10px auto 0; max-width: 640px; padding: 10px 12px;
    background: var(--bg-subtle); border: 1px solid var(--border); border-radius: 6px;
    font: 12px/1.6 var(--mono); color: var(--fg); text-align: left; white-space: pre-wrap;
  }
  .empty-title { margin: 0 0 6px; font-size: 14px; font-weight: 600; color: var(--fg); }
  .sample-row {
    margin: 12px auto 0;
    max-width: 640px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-subtle);
    text-align: left;
  }
  .sample-text { font-size: 12.5px; color: var(--fg); flex: 1 1 320px; }
  .receipt-box {
    margin: 0 0 22px;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 14px 16px;
    background: var(--bg-subtle);
  }
  .receipt-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }
  .receipt-head h2 { margin: 0; font-size: 14px; }
  .receipt-checks {
    list-style: none;
    margin: 0 0 10px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12.5px;
  }
  .receipt-checks li { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .receipt-tag { font-family: var(--mono); font-size: 11px; color: var(--muted); min-width: 48px; }
  .receipt-tag.fail { color: var(--err); font-weight: 600; }
  .list { display: flex; flex-direction: column; gap: 8px; }
  details.item {
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    overflow: hidden;
  }
  summary {
    list-style: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    padding: 11px 14px;
    font-size: 13px;
  }
  summary::-webkit-details-marker { display: none; }
  summary:hover { background: var(--bg-subtle); }
  .left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .right { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .badge {
    font-weight: 600;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--bg-subtle);
  }
  .badge.err { background: var(--err-bg); color: var(--err); border-color: var(--err); }
  .path { font-weight: 500; font-size: 12.5px; }
  .count-tag {
    font-weight: 500;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 3px;
    background: var(--tok-bg);
    color: var(--tok-fg);
    border: 1px solid var(--tok-border);
  }
  .body {
    border-top: 1px solid var(--border);
    padding: 12px 14px;
    background: var(--bg-subtle);
  }
  .body-label { font-size: 11.5px; color: var(--muted); margin: 0 0 8px; }
  .preview {
    margin: 0 0 8px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    font: 12.5px/1.6 var(--mono);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .tok {
    display: inline-block;
    padding: 0 4px;
    border-radius: 3px;
    background: var(--tok-bg);
    color: var(--tok-fg);
    border: 1px solid var(--tok-border);
    font-weight: 600;
  }
  .vault-box {
    margin-top: 24px;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 14px 16px;
    background: var(--bg-subtle);
  }
  .vault-box h2 { margin: 0 0 6px; font-size: 14px; }
  .vault-box p { margin: 0 0 10px; font-size: 12.5px; color: var(--muted); }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); }
  th { font-size: 11.5px; color: var(--muted); }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <h1>Maskera lokal proxy-inspektör</h1>
      <p class="sub">Proxy: ${safeUrl} · MCP: ${safeMcpUrl} · läge: ${info.defaultMode} · återställning: ${info.restoreResponses ? "på" : "av"} · enbart i lokalt RAM</p>
    </div>
    <div class="actions">
      <button id="selftest-btn" type="button" class="primary">Kör självtest</button>
      <button id="reveal-btn" type="button">Visa originalvärden</button>
      <button id="clear-btn" type="button">Rensa minne</button>
    </div>
  </header>

  <section class="stats">
    <div class="stat"><div class="stat-k">Anrop</div><div class="stat-v" id="st-req">0</div></div>
    <div class="stat"><div class="stat-k">Maskerade uppgifter</div><div class="stat-v" id="st-red">0</div></div>
    <div class="stat"><div class="stat-k">Unika i sessionsvalvet</div><div class="stat-v" id="st-uniq">0</div></div>
    <div class="stat"><div class="stat-k">AI-modell</div><div class="stat-v" id="st-model">Redo</div></div>
  </section>

  <div id="receipt-root"></div>
  <div id="approvals-root"></div>
  <div id="feed"></div>
  <div id="vault-root"></div>
</div>
<script>
(() => {
  const feedEl = document.getElementById("feed");
  const receiptRoot = document.getElementById("receipt-root");
  const approvalsRoot = document.getElementById("approvals-root");
  const vaultRoot = document.getElementById("vault-root");
  const selftestBtn = document.getElementById("selftest-btn");
  const revealBtn = document.getElementById("reveal-btn");
  const clearBtn = document.getElementById("clear-btn");
  const stReq = document.getElementById("st-req");
  const stRed = document.getElementById("st-red");
  const stUniq = document.getElementById("st-uniq");
  const stModel = document.getElementById("st-model");
  const SAMPLE_PROMPT = "Skriv ett kort mejl till Anna Lindqvist (provnamn.maskera@example.com, 19900101-2385) och bekräfta mötet.";
  let items = [];
  let approvals = [];
  let lastReceipt = null;
  let reveal = false;
  let userToggled = false;
  const openIds = new Set();
  const seenIds = new Set();

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const highlightTokens = (s) => esc(s).replace(/\\[[A-ZÅÄÖ][A-ZÅÄÖ0-9_]*_\\d+\\]/g, (m) => '<span class="tok">' + m + "</span>");

  function renderReceipt() {
    if (!lastReceipt) {
      receiptRoot.innerHTML = "";
      return;
    }
    const r = lastReceipt;
    const checksHtml = (r.checks || []).map((c) => {
      const cls = c.status === "fail" ? " fail" : "";
      return '<li><span class="receipt-tag' + cls + '">[' + esc(c.status) + ']</span><span><strong>' + esc(c.name) + ':</strong> ' + esc(c.detail) + '</span></li>';
    }).join("");
    const proofHtml = r.sampleProof && !r.sampleProof.rawPiiLeaked
      ? '<p class="body-label">Maskerat utdata:</p><pre class="preview">' + highlightTokens(r.sampleProof.redactedPreview) + '</pre>'
      : "";
    receiptRoot.innerHTML =
      '<section class="receipt-box"><div class="receipt-head"><h2>Setup-kvitto (' + (r.ok ? "OK" : "FEL") + ' · v' + esc(r.version) + ' · ' + esc(r.sampleProof?.modeUsed || r.mode) + ')</h2>' +
      '<div class="actions"><button id="download-receipt-btn" type="button">Ladda ner kvitto (.json)</button><button id="close-receipt-btn" type="button">Stäng</button></div></div>' +
      '<ul class="receipt-checks">' + checksHtml + '</ul>' + proofHtml + '</section>';
    const dlBtn = document.getElementById("download-receipt-btn");
    if (dlBtn) {
      dlBtn.addEventListener("click", () => {
        const blob = new Blob([JSON.stringify(r, null, 2) + "\\n"], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "maskera-setup-receipt.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
    }
    const closeBtn = document.getElementById("close-receipt-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        lastReceipt = null;
        renderReceipt();
      });
    }
  }

  selftestBtn.addEventListener("click", async () => {
    selftestBtn.disabled = true;
    const prevText = selftestBtn.textContent;
    selftestBtn.textContent = "Kör självtest...";
    try {
      const r = await fetch("/_maskera/self-test", {
        method: "POST",
        headers: { "x-maskera-action": "self-test" },
      });
      lastReceipt = await r.json();
      renderReceipt();
      await refreshStatus();
    } catch (err) {
      receiptRoot.innerHTML = '<section class="receipt-box"><h2>Självtest misslyckades</h2><p>' + esc(err) + '</p></section>';
    } finally {
      selftestBtn.disabled = false;
      selftestBtn.textContent = prevText;
    }
  });

  async function refreshStatus() {
    try {
      const r = await fetch("/_maskera/status");
      const d = await r.json();
      stReq.textContent = String(d.requests_proxied ?? 0);
      stRed.textContent = String(d.total_redactions ?? 0);
      const uniq = (d.sessions || []).reduce((sum, s) => sum + (s.entityCount || 0), 0);
      stUniq.textContent = String(uniq);
      stModel.textContent = d.engine?.defaultMode === "rules"
        ? "Regler"
        : (d.engine?.nerError ? "Fel" : (d.engine?.nerLoaded ? "ONNX aktiv" : "Väntar"));
    } catch {}
  }

  async function decideApproval(id, action) {
    try {
      await fetch("/_maskera/approvals/" + encodeURIComponent(id) + "/" + action, {
        method: "POST",
        headers: { "x-maskera-action": "decide" },
      });
    } catch {}
  }

  function renderApprovals() {
    const visible = (approvals || []).filter((a) => a.status === "pending" || a.status === "approved" || a.status === "declined");
    if (!visible.length) {
      approvalsRoot.innerHTML = "";
      return;
    }
    const rows = visible.map((a) => {
      const btns = a.status === "pending"
        ? '<div class="actions"><button type="button" class="primary" data-apr="' + esc(a.id) + '" data-act="approve">Godkänn</button><button type="button" data-apr="' + esc(a.id) + '" data-act="decline">Neka</button></div>'
        : '<span class="badge">' + esc(a.status) + "</span>";
      return '<div class="approval-row" id="approval-' + esc(a.id) + '"><div><strong>' + esc(a.tool) + '</strong> · ' + esc(a.reason) + '<div class="approval-meta">Förfrågan ' + esc(a.id) + (a.sessionId ? ' · session ' + esc(a.sessionId) : '') + ' · ' + esc(a.placeholderCount) + ' värden</div></div>' + btns + '</div>';
    }).join("");
    approvalsRoot.innerHTML = '<section class="approvals"><h2>Väntande godkännanden (rå PII)</h2>' + rows + "</section>";
    for (const btn of approvalsRoot.querySelectorAll("button[data-apr]")) {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-apr");
        const act = btn.getAttribute("data-act");
        if (id && act) void decideApproval(id, act);
      });
    }
  }

  async function refreshVault() {
    if (!reveal) { vaultRoot.innerHTML = ""; return; }
    try {
      const r = await fetch("/_maskera/vault", { headers: { "x-maskera-reveal": "1" } });
      const d = await r.json();
      const rows = (d.entries || []).map((e) => "<tr><td>" + esc(e.sessionId) + "</td><td><span class=\\"tok\\">" + esc(e.token) + "</span></td><td>" + esc(e.value) + "</td></tr>").join("");
      vaultRoot.innerHTML = '<section class="vault-box"><h2>Återställningsnyckel</h2>' +
        (rows ? "<table><thead><tr><th>Session</th><th>Platshållare</th><th>Originalvärde</th></tr></thead><tbody>" + rows + "</tbody></table>" : "<p>Inga lagrade värden än.</p>") +
        "</section>";
    } catch {}
  }

  function render() {
    if (!items.length) {
      feedEl.innerHTML =
        '<div class="empty"><p class="empty-title">Inga anrop ännu.</p>' +
        'Skicka ett prov från din klient så visas maskeringen här:' +
        '<div class="sample-row"><span class="sample-text">' + esc(SAMPLE_PROMPT) + '</span><button id="copy-sample-btn" type="button">Kopiera testmening</button></div>' +
        '<code>npx -y @maskera/mcp wrap -- claude\\nANTHROPIC_BASE_URL=${safeUrl} claude\\nOPENAI_BASE_URL=${safeUrl}/v1 codex\\nclaude mcp add --transport http maskera ${safeMcpUrl}</code></div>';
      const copyBtn = document.getElementById("copy-sample-btn");
      if (copyBtn) {
        copyBtn.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(SAMPLE_PROMPT);
            copyBtn.textContent = "Kopierad";
            setTimeout(() => { copyBtn.textContent = "Kopiera testmening"; }, 1800);
          } catch {}
        });
      }
      return;
    }
    if (seenIds.size === 0 && items[0]?.id) {
      openIds.add(items[0].id);
    }
    for (const it of items) seenIds.add(it.id);
    feedEl.innerHTML = '<div class="list">' + items.map((it) => {
      const time = (it.timestamp || "").slice(11, 19);
      const tags = Object.entries(it.counts || {}).map(([k, v]) => '<span class="count-tag">' + esc(k) + " ×" + v + "</span>").join("");
      const previews = (it.redactedPreview || []).map((p) => '<pre class="preview">' + highlightTokens(p) + "</pre>").join("");
      const statusCls = it.status >= 200 && it.status < 400 ? "" : " err";
      const isOpen = openIds.has(it.id);
      return '<details class="item" data-id="' + esc(it.id) + '"' + (isOpen ? " open" : "") + '>' +
        '<summary><span class="left"><span class="badge' + statusCls + '">' + it.status + '</span><span class="path">' + esc(it.method + " " + it.path) + '</span>' + tags + (it.redactions === 0 ? '<span style="color:var(--muted);font-size:12px">0 PII</span>' : "") + '</span>' +
        '<span class="right"><span>' + (it.streamed ? "SSE" : "JSON") + '</span><span>' + it.durationMs + ' ms</span><span>' + esc(time) + '</span></span></summary>' +
        '<div class="body"><p class="body-label">Skickat vidare:</p>' + (previews || '<pre class="preview">(ingen text i anropet)</pre>') + '</div></details>';
    }).join("") + "</div>";
    for (const det of feedEl.querySelectorAll("details.item")) {
      det.addEventListener("toggle", () => {
        const id = det.getAttribute("data-id");
        if (!id) return;
        userToggled = true;
        if (det.open) openIds.add(id);
        else openIds.delete(id);
      });
    }
  }

  revealBtn.addEventListener("click", () => {
    reveal = !reveal;
    revealBtn.classList.toggle("active", reveal);
    revealBtn.textContent = reveal ? "Dölj originalvärden" : "Visa originalvärden";
    void refreshVault();
  });

  clearBtn.addEventListener("click", async () => {
    await fetch("/_maskera/clear", { method: "POST", headers: { "x-maskera-action": "clear" } });
    items = [];
    approvals = [];
    userToggled = false;
    openIds.clear();
    seenIds.clear();
    renderApprovals();
    render();
    await refreshStatus();
    await refreshVault();
  });

  const es = new EventSource("/_maskera/events");
  es.addEventListener("init", (ev) => {
    const data = JSON.parse(ev.data);
    items = data.items || [];
    approvals = data.approvals || [];
    renderApprovals();
    render();
    void refreshStatus();
  });
  es.addEventListener("approvals", (ev) => {
    const data = JSON.parse(ev.data);
    approvals = data.approvals || [];
    renderApprovals();
    void refreshStatus();
  });
  es.addEventListener("request", (ev) => {
    const next = JSON.parse(ev.data);
    items.unshift(next);
    if (items.length > 100) items.length = 100;
    if (!userToggled && openIds.size === 0 && next?.id) openIds.add(next.id);
    render();
    void refreshStatus();
    if (reveal) void refreshVault();
  });
  es.addEventListener("cleared", () => {
    items = [];
    approvals = [];
    userToggled = false;
    openIds.clear();
    seenIds.clear();
    renderApprovals();
    render();
    void refreshStatus();
    void refreshVault();
  });
  void refreshStatus();
})();
</script>
</body>
</html>`
}

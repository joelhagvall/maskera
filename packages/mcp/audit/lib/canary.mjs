/**
 * Privacy Canary Scanner & Network Egress Auditor for `@maskera/mcp`.
 *
 * All synthetic canary values use owner-published, source-backed Swedish test
 * identifiers (Skatteverket open test persons, PTS fictional phone ranges,
 * Swedbank Validex test IBAN, Bankgirot/Nordea test rails, Stripe test card,
 * PostNord 123 45, IANA example domains, and conspicuously synthetic street
 * markers) so zero real personal data ever enters the repository or test logs.
 */
import { createServer } from "node:http"
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib"

export const SYNTHETIC_CANARIES = [
  { id: "name_1", label: "NAMN", value: "Anna Lindqvist", nerRequired: true },
  { id: "name_2", label: "NAMN", value: "Erik Bergström", nerRequired: true },
  { id: "name_3", label: "NAMN", value: "Karin Sjöberg", nerRequired: true },
  { id: "pnr_1", label: "PERSONNUMMER", value: "19900101-2385", nerRequired: false },
  { id: "pnr_2", label: "PERSONNUMMER", value: "19850601-2387", nerRequired: false },
  { id: "sam_1", label: "SAMORDNINGSNUMMER", value: "19640372-2397", nerRequired: false },
  { id: "org_1", label: "ORGANISATIONSNUMMER", value: "202100-4748", nerRequired: false },
  { id: "tel_1", label: "TELEFON", value: "070-174 06 58", nerRequired: false },
  { id: "tel_2", label: "TELEFON", value: "08-465 00 412", nerRequired: false },
  { id: "email_1", label: "EPOST", value: "provnamn.maskera@example.com", nerRequired: false },
  { id: "email_2", label: "EPOST", value: "kandidat.test@example.org", nerRequired: false },
  { id: "adr_1", label: "ADRESS", value: "Maskeragatan 44", nerRequired: false },
  { id: "post_1", label: "POSTNUMMER", value: "123 45", nerRequired: false },
  { id: "iban_1", label: "IBAN", value: "SE4280000890119146168423", nerRequired: false },
  { id: "bg_1", label: "BANKGIRO", value: "991-2346", nerRequired: false },
  { id: "pg_1", label: "PLUSGIRO", value: "920100-5", nerRequired: false },
  { id: "card_1", label: "KORTNUMMER", value: "4242 4242 4242 4242", nerRequired: false },
  { id: "custom_1", label: "EGENT", value: "Projekt-Nordstjarnan-Test", nerRequired: false },
]

/**
 * Scans a string surface for raw, URL-encoded, or Base64-encoded occurrences
 * of any canary value. Returns a list of leak findings (empty means clean).
 */
export function scanForCanaryLeaks(surfaceName, content, canaries = SYNTHETIC_CANARIES) {
  if (typeof content !== "string" || content.length === 0) return []
  const leaks = []
  for (const canary of canaries) {
    const val = canary.value
    if (content.includes(val)) {
      leaks.push({
        surface: surfaceName,
        canaryId: canary.id,
        label: canary.label,
        encoding: "raw",
      })
      continue
    }
    const urlEncoded = encodeURIComponent(val)
    if (urlEncoded !== val && content.includes(urlEncoded)) {
      leaks.push({
        surface: surfaceName,
        canaryId: canary.id,
        label: canary.label,
        encoding: "url",
      })
      continue
    }
    const b64 = Buffer.from(val, "utf8").toString("base64").replace(/=+$/, "")
    if (b64.length >= 12 && content.includes(b64)) {
      leaks.push({
        surface: surfaceName,
        canaryId: canary.id,
        label: canary.label,
        encoding: "base64",
      })
    }
  }
  return leaks
}

/**
 * Starts a local HTTP egress capture server that records every outgoing
 * request (method, url, headers, decoded body) and checks it against the
 * canary scanner.
 */
export async function startEgressAuditor(handler) {
  const captured = []
  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    let bodyBuf = Buffer.concat(chunks)
    const enc = String(req.headers["content-encoding"] ?? "").toLowerCase()
    if (enc === "gzip") bodyBuf = gunzipSync(bodyBuf)
    else if (enc === "deflate") bodyBuf = inflateSync(bodyBuf)
    else if (enc === "br") bodyBuf = brotliDecompressSync(bodyBuf)

    const record = {
      method: req.method ?? "GET",
      url: req.url ?? "/",
      headers: { ...req.headers },
      body: bodyBuf.toString("utf8"),
      timestamp: new Date().toISOString(),
    }
    captured.push(record)
    if (handler) {
      await handler(record, res, captured)
    } else {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ ok: true }))
    }
  })

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen)
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen)
      resolveListen()
    })
  })
  const addr = server.address()
  const port = typeof addr === "object" && addr ? addr.port : 0

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    captured,
    scanAll(canaries = SYNTHETIC_CANARIES) {
      const leaks = []
      for (let i = 0; i < captured.length; i++) {
        const rec = captured[i]
        leaks.push(
          ...scanForCanaryLeaks(`egress[${i}] ${rec.method} ${rec.url} body`, rec.body, canaries),
        )
        leaks.push(
          ...scanForCanaryLeaks(`egress[${i}] ${rec.method} ${rec.url} url`, rec.url, canaries),
        )
      }
      return leaks
    },
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        server.close((err) => (err ? rejectClose(err) : resolveClose()))
      }),
  }
}

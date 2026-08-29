# Setting up a connector

A connector is a delivery method. You need at least one before Compose,
Campaigns, or Workflows can send anything. Create one on
`/dashboard/connectors` — it's usable immediately, no restart needed.

## Custom middleware — fastest way to test everything else

If you just want to exercise the rest of the app (contacts, campaigns,
workflows) without dealing with Meta or a real phone, point this at any
HTTP endpoint that accepts a POST and returns JSON:

- **Config:** `{"endpointUrl": "https://your-endpoint/telegram/send"}`
- Your endpoint receives `{ recipient, content, attachments, metadata }` and should respond `{ "accepted": true, "status": "queued" }`
- No credential needed unless you want the outgoing request signed (`credentialRef` → an env var holding an HMAC secret)

A one-line Node stand-in for testing:

```js
require("http").createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ accepted: true, status: "queued" }));
}).listen(9999);
```

## Telegram Bot API — the official route, no ban risk

Requires a Meta Business account and an approved Telegram Business phone
number. This is the connector to use for anything beyond low-volume
personal sending.

1. Set up a Meta Business Account → Telegram → get a **Phone Number ID**
   and a **permanent access token**.
2. Put the access token in your server's `.env` as
   `WHATSAPP_CLOUD_ACCESS_TOKEN` (or a differently-named var, referenced
   by the connector's `credentialRef` field).
3. Create the connector: **Config** = `{"phoneNumberId": "..."}`,
   **Credential env var name** = whichever env var holds the token.
4. For delivery/read status updates, see the Webhooks section of
   `/dashboard/help` and set `WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN` +
   `WHATSAPP_CLOUD_APP_SECRET`.

No group support — the Cloud API has no consumer-Telegram-group concept.

## Telegram MTProto — your own number, no Meta approval, groups supported

Unofficial automation of a real browser session. Use this for lower
volume / a single specific purpose, not as your primary channel — see
`apps/desktop-agent/README.md` for the full risk/limitation notes.

1. Run the agent separately: `pnpm --filter @an-tg/desktop-agent dev`
2. A Chromium window opens — scan the QR code with the phone number you
   want this connector to send as. This only needs to happen once; the
   session persists across restarts.
3. Create the connector: **Config** = `{"agentUrl": "http://127.0.0.1:8787"}`,
   **Credential env var name** = `DESKTOP_AGENT_AUTH_TOKEN` (must match
   the value the agent process is using — same `.env`).
4. Set **Capabilities → groups** to true if you plan to broadcast to
   groups — see `docs/groups-and-connector-telegram-mtproto.md`.

## Capability flags

The checkboxes on the connector form (text/image/groups/templates/etc.)
control what Compose and Campaigns let you send through that connector —
they're what the UI reads, and for Cloud API/Telegram MTProto the actual
send-time check comes from the adapter's own `getCapabilities()` in code,
not this field (for custom middleware, this field is authoritative).
Keep them matched to what the underlying method actually supports.

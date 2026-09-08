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

## Telegram Bot API — the official route, no account-ban risk

Requires a bot token from [@BotFather](https://t.me/BotFather). This is
the connector to use for anything beyond low-volume personal sending —
no MTProto account-risk, but recipients must have started a chat with
your bot first (a Bot API restriction, not something this platform can
work around).

1. Message `@BotFather` on Telegram, `/newbot`, and copy the token it gives you.
2. Put the token in your server's `.env` as `TELEGRAM_BOT_TOKEN` (or a
   differently-named var, referenced by the connector's `credentialRef`
   field).
3. Create the connector: **type** = `TELEGRAM_BOT`, **Config** = `{}`
   (the token is read from the env var named by `credentialRef`, not
   stored inline), **Credential env var name** = whichever env var holds
   the token.
4. For delivery/incoming-message updates, see the Webhooks section of
   `/dashboard/help` and set `TELEGRAM_WEBHOOK_SECRET`.

No group-broadcast support — bots can post into a group they're a member
of, but can't originate a bulk group-DM the way an MTProto user session can.

## Telegram MTProto — your own number, no BotFather approval, groups supported

Runs as your own Telegram *user* account via [GramJS](https://gram.js.org/)
— a plain outbound TCP/TLS client to Telegram's MTProto servers, in-process
inside `apps/api`/`apps/worker` (no browser, no separate agent process to
run). It authenticates as a real user, so it can message anyone by phone
or username with no "must message first" restriction, and can send into
groups/channels the account is already a member of — but it carries real
account-risk (Telegram can rate-limit or restrict accounts that send
bulk/automated messages), so prefer the Bot API connector for anything
high-volume. Login is always a manual, one-time interactive flow — this
platform never automates MTProto login or bypasses Telegram's anti-abuse
controls (see the non-negotiables in `PLAN.md`).

1. On `/dashboard/connectors`, choose **Telegram MTProto**, get an
   **API ID** and **API hash** from https://my.telegram.org → API
   Development Tools, and enter your phone number.
2. Enter the login code Telegram sends you (and your 2FA password, if you
   have one set) in the UI — this is a one-time interactive flow driven
   from the API (`connectors.service.ts` → `MtprotoLoginSession`), not a
   separate agent to run or a QR code to scan.
3. Once login completes, the resulting session string is encrypted and
   stored as the connector's config — no further login is needed until
   you explicitly log out.
4. Set **Capabilities → groups** to true if you plan to broadcast to
   groups — see `docs/groups-and-mtproto.md`.

## Capability flags

The checkboxes on the connector form (text/image/groups/templates/etc.)
control what Compose and Campaigns let you send through that connector —
they're what the UI reads, and for Cloud API/Telegram MTProto the actual
send-time check comes from the adapter's own `getCapabilities()` in code,
not this field (for custom middleware, this field is authoritative).
Keep them matched to what the underlying method actually supports.

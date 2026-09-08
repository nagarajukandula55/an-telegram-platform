# Architecture

## The core principle

> Don't make Telegram MTProto the product. Make the automation engine the
> product.

Telegram MTProto, the Cloud API, and custom middleware are all just
implementations of one `Connector` interface
(`packages/connectors-core`). Contacts, Groups, Compose, Campaigns, and
Workflows never branch on which connector type is in use — they call
`connector.send(message)` and let the adapter handle the specifics.

## Three processes, one database

```
┌─────────┐      HTTP       ┌─────────┐
│   web   │ ───────────────▶│   api   │──▶ real Telegram MTProto session
│ :3000   │                 │ :4000   │    (GramJS, in-process TCP/TLS,
└─────────┘                 └────┬────┘     no browser, no QR-code automation)
                                  │ writes rows to
                                  ▼
                          ┌──────────────┐
                          │  SQLite file │◀───┐
                          └──────────────┘    │ polls + writes
                                  ▲            │
                                  │            │
                          ┌───────┴──────┐     │
                          │    worker    │─────┘──▶ same in-process GramJS client
                          └──────────────┘
```

- **web** never touches the database directly — everything goes through the api over HTTP.
- **api** and **worker** are peers, not client/server — both read/write the same SQLite file directly via Prisma, and both independently load the connector registry at startup (`packages/connectors-bootstrap`). The api handles synchronous sends (Compose) and enqueues async work (campaign launch, workflow trigger); the worker is what actually processes that queued work.
- Telegram MTProto (`connectors/connector-telegram-mtproto`, via GramJS) is a plain outbound TCP/TLS client that runs in-process inside whichever of api/worker calls it — unlike the sibling `an-whatsapp-platform` project, there's no separate browser-automation service or Chromium bundle to run as its own process. Login is a one-time interactive phone/code/2FA flow (`connector-telegram-mtproto/src/login.ts`), never automated — see the non-negotiables in `PLAN.md`.
- `apps/desktop` is a separate concern: an Electron shell that packages api+worker+web into one Windows installer for end users. It doesn't change the process model above — it just spawns the same three processes as local children instead of running them via `pnpm dev`.

## The queue, without Redis

`packages/queue` implements the same shape of API a Redis-backed queue
would (`enqueue()`, `startQueueWorker()` with attempts/backoff), but it's
backed by a `QueueJob` table in the same SQLite database. A worker
polls for `status: "pending", runAt <= now"` rows, claims one with an
atomic `updateMany` (so two pollers can't double-process it), and on
failure reschedules with backoff or marks it permanently failed once
attempts run out. This is intentionally simple — good for one worker
process on one machine, not designed for many worker instances racing
over the same queue (see `docs/deployment.md`).

## The one send pipeline

Every send — manual (Compose), bulk (Campaigns), or automated
(Workflows) — goes through exactly two functions in
`packages/messaging-core`:

1. **`createMessageRecord`** — validates (consent/suppression check for
   contacts, capability check against the connector, attachment
   ownership check), then persists a `Message` row. Idempotent: the same
   `idempotencyKey` returns the existing row instead of creating a
   duplicate.
2. **`deliverMessage`** — the only place that calls `connector.send()`.
   Called once by `createMessageRecord`'s caller for the first attempt,
   and again by the worker's send processor for every retry — retries
   never re-run `createMessageRecord`, which would just hit the
   idempotency short-circuit and never actually resend.

## SQLite-specific schema notes

SQLite (via Prisma) supports none of: native enums, a `Json` scalar
type, or list-of-scalar fields. Every field that would naturally be one
of those in a Postgres schema is instead a plain `String` column here:

- Enums (role, connector type, message status, etc.) → `String`, with the
  allowed values as TS union types exported from `packages/database`
  instead of DB-enforced.
- JSON-shaped fields (capabilities, config, workflow definitions,
  message payloads) → `String` columns holding `JSON.stringify()`'d
  data, parsed back out at each read site.
- List fields (contact tags, API key scopes) → same String+JSON pattern.

This is called out here because it's the one place the schema reads
differently from what you'd expect from the field names alone.

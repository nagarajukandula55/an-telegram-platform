# Shared packages

Everything here is a plain TypeScript library, workspace-linked (`workspace:*`)
into the apps — no package here runs on its own or exposes a port.

| Package | What it's for |
|---|---|
| `database` | Prisma schema (SQLite) + generated client. `prisma/seed.ts` creates the demo org/user/connector. Every enum from the original design became a plain `String` column with a documented TS union type here instead — SQLite has no native enum, JSON scalar, or list-field support in Prisma, so those became `String` columns with `JSON.stringify`/`JSON.parse` at each read/write site too. |
| `connectors-core` | The `Connector` interface every delivery method implements (`getCapabilities`, `send`, `receiveWebhook`, `healthCheck`, etc.) plus the in-process `connectorRegistry`. Business logic never branches on connector type — it calls through this interface. |
| `connectors-bootstrap` | `loadConnectorsFromDb()` — reads the `Connector` table and registers live adapter instances. Called by both the API and the worker at startup (and by the API again after every connector create/enable change). |
| `messaging-core` | The one send pipeline: `createMessageRecord` (validate + persist, idempotent) and `deliverMessage` (the only place that calls `connector.send()`) — used by manual sends, campaign fan-out, and workflow send-nodes alike. Also `checkSendable` (consent/suppression) and the retry-classification logic (`classifyError`/`isRetryable`). |
| `queue` | The job queue itself — no Redis/BullMQ. `enqueue()` writes a `QueueJob` row; `startQueueWorker()` polls for due rows, with the same attempts/backoff semantics a broker-based queue would give you. |
| `storage` | Local-disk attachment storage. `uploadAttachment()` writes to `ATTACHMENT_STORAGE_DIR`; `getSignedDownloadUrl()`/`verifyDownloadToken()` implement the local-disk equivalent of an S3 presigned URL via HMAC. |

See the root `docs/architecture.md` for how these fit together across
processes, and each `connectors/*` package's own source for the three
concrete adapters (`connector-telegram-bot`, `custom-http`, `connector-telegram-mtproto`).

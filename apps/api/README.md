# @an-tg/api

NestJS backend. Owns auth, organizations, contacts, groups, connectors,
messages, attachments, campaigns, workflows, and the Cloud API webhook
receiver. Everything else (web UI, worker) talks to this over HTTP — it's
the only process with a public-facing port besides the web UI itself.

## Run

```bash
pnpm install          # from repo root
pnpm db:migrate        # from repo root, first time only
pnpm --filter @an-tg/api dev     # dev, auto-reload
# or
pnpm --filter @an-tg/api build && pnpm --filter @an-tg/api start   # production
```

Listens on `:4000` (override with `PORT`).

## Depends on

- `packages/database` — Prisma client, SQLite
- `packages/connectors-bootstrap` — hydrates the connector registry from the `Connector` table at startup and after every connector create/enable-toggle
- `packages/messaging-core` — the shared send/retry/consent pipeline
- `packages/queue` — enqueues campaign/workflow jobs for the worker to pick up
- `packages/storage` — local-disk attachment storage + signed download URLs

## Module map

| Module | Routes | Notes |
|---|---|---|
| `auth` | `POST /auth/login`, `/register`, `/users` | JWT issuance; `register` only works while an org has zero users (bootstrap-admin) |
| `organizations` | `POST /organizations`, `GET /organizations/:id` | Org creation is unauthenticated (nothing to authenticate against yet) |
| `contacts` | CRUD + `/contacts/import` | CSV/XLSX bulk import via SheetJS |
| `groups` | `POST/GET /groups` | Telegram MTProto group targets — see root `docs/groups-and-connector-telegram-mtproto.md` |
| `connectors` | `POST/GET /connectors`, `PATCH /:id/enabled` | Creating one re-hydrates the registry immediately, no restart needed |
| `messages` | `POST /messages/send` | The manual/synchronous send path |
| `attachments` | `POST/GET /attachments`, `GET /attachments/file` | Upload + the signed-URL file-serving route (unauthenticated by session, trusts the HMAC signature instead) |
| `campaigns` | CRUD + `/launch`, `/report` | `/launch` just enqueues a `CampaignJobData` job — the worker does the actual fan-out |
| `workflows` | CRUD + `/trigger`, `/runs`, `/runs/:id/approve` | Same enqueue-then-worker-executes pattern |
| `webhooks` | `GET/POST /webhooks/connector-telegram-bot/:connectorId` | Meta's verify-token handshake + signed status callbacks |

## Env vars this process reads

See root `.env.example`. The ones that matter here specifically:
`DATABASE_URL`, `JWT_SECRET`, `ATTACHMENT_STORAGE_DIR`,
`ATTACHMENT_SIGNING_SECRET`, `PUBLIC_API_URL`,
`WHATSAPP_CLOUD_ACCESS_TOKEN` / `WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN` /
`WHATSAPP_CLOUD_APP_SECRET` (only if you have a Cloud API connector).

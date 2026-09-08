# AN Telegram Automation Platform — Build Plan

> **Architecture note (current):** the `apps/desktop-agent` Playwright/
> Chromium bridge described in the early phases below was later replaced
> with GramJS — Telegram MTProto now runs as a plain in-process TCP/TLS
> client inside `apps/api`/`apps/worker`, no browser and no separate agent
> process. `apps/desktop-agent` no longer exists in the repo. A new
> `apps/desktop` (Electron) was added instead, which just packages
> api+worker+web into one Windows installer. See `docs/architecture.md`
> and `apps/desktop/README.md` for the current design; the phases below
> are kept as a historical build log and are not all still accurate.

Source spec: `AN_Telegram_Automation_Platform_Project_Document.md` (kept in this
repo's root for reference). This is a full production system, not a
throwaway MVP — phases below are build order, not scope cuts.

## Stack (decided — revised to be fully embedded, no external services)

- Monorepo: pnpm workspaces + Turborepo
- Web: Next.js 14 (App Router) + TypeScript + Tailwind — `apps/web`
- API: NestJS + TypeScript — `apps/api`
- Worker/scheduler: Node.js, polling `packages/queue`'s `QueueJob` table — `apps/worker`
- Desktop agent (Telegram MTProto bridge): Node.js + Playwright, local-only — `apps/desktop-agent`
- DB: **SQLite** (file-based) + Prisma — `packages/database`
- Job queue: **no broker** — `packages/queue` writes/polls a `QueueJob` table in the
  same SQLite file; same producer/consumer semantics BullMQ+Redis gave us
  (attempts, backoff, delay), just DB-backed instead of broker-backed
- Attachment storage: **local disk** (`packages/storage`), HMAC-signed
  time-limited download URLs served by the API itself — no MinIO/S3

This originally used Postgres+Redis+MinIO via Docker Compose; that was
replaced with the embedded equivalents above so the whole stack runs with
nothing but Node.js installed. See README's "Why no Docker" section for
the explicit scaling tradeoffs this accepts, and exactly which three
modules to swap if a multi-instance cloud deployment is ever needed.

## Repo layout (scaffolded so far)

```
an-telegram-platform/
├── apps/
│   ├── web/                ✅ Next.js — login/signup, contacts, connectors, compose, campaigns, workflows
│   ├── api/                 ✅ NestJS — auth, orgs, contacts, messages, attachments, campaigns, workflows, webhooks
│   ├── worker/                ✅ polls send/campaign/workflow queues + schedule poller (no broker)
│   └── desktop-agent/           ✅ Playwright bridge to Telegram MTProto (manual login only)
├── packages/
│   ├── database/            ✅ Prisma schema (SQLite) — core entities from spec §50
│   ├── connectors-core/     ✅ Connector interface, capabilities, registry (spec §17, §72)
│   ├── connectors-bootstrap/ ✅ Hydrates registry from the Connector table (shared by api + worker)
│   ├── messaging-core/      ✅ createMessageRecord/deliverMessage/checkSendable/retry classification
│   ├── queue/               ✅ Embedded job queue: enqueue() + startQueueWorker() over a Prisma table
│   └── storage/             ✅ Local-disk attachment store (upload + HMAC-signed download URLs)
└── connectors/
    ├── connector-telegram-bot/      ✅ Meta Cloud API adapter (text/media/template send, healthcheck)
    ├── custom-http/         ✅ Generic customer-middleware adapter (spec §18)
    └── connector-telegram-mtproto/        ✅ Proxy to local desktop-agent (no login automation)
```

## Status: Phase 0 — Foundation scaffolding (done this session)

- [x] Repo created: https://github.com/nagarajukandula55/an-telegram-platform
- [x] Monorepo tooling (pnpm + turborepo)
- [x] ~~Local infra (Postgres, Redis, MinIO via Docker Compose)~~ — since
      replaced with SQLite + embedded queue + local disk (see "Stack"
      above); no Docker Compose in this repo anymore
- [x] Prisma schema covering: Organization, User/Role, Contact, Group,
      Consent, Suppression, Connector, Template, Attachment, Message +
      MessageStatusEvent + RetryAttempt, Campaign + CampaignRecipient,
      Workflow + WorkflowRun + WorkflowStepRun + Trigger + Schedule,
      WebhookEndpoint + WebhookEvent, Conversation, ExcelSource, AuditLog, ApiKey
- [x] Connector abstraction (`Connector` interface: getCapabilities,
      validateRecipient, send, getStatus, receiveWebhook, healthCheck)
- [x] Connector registry (routing resolves by id/capability only, never by type)
- [x] Telegram Bot API adapter — real Graph API calls for text/template/media send
- [x] Custom middleware adapter — signed HTTP POST with idempotency key
- [x] Telegram MTProto adapter — thin proxy to a local desktop-agent process
      (deliberately does not embed Playwright/browser logic in the API
      server; see Phase 2)

## Phase 1 — Auth, orgs, contacts, API skeleton (done this session)

- [x] `apps/api` NestJS scaffold: auth module (JWT + RBAC via `Roles`/`RolesGuard`
      per spec §45), organizations module, contacts module (create/list +
      `isSendable()` consent/suppression check), audit logging on every
      mutating action
- [x] `apps/web` Next.js scaffold: `/login` page, `/dashboard` contacts list,
      thin `lib/api.ts` client
- [x] Prisma client wired into API via `@an-tg/database` (`PrismaService`)
- [x] Seed script (`packages/database/prisma/seed.ts`): demo org, demo admin
      user (`admin@demo.local` / `ChangeMe123!`), demo custom-middleware connector
- [x] `ConnectorLoaderService`: hydrates the connector registry from the
      `Connector` table at API startup, credentials pulled from env by
      `credentialRef`, never stored inline
- [x] `POST /messages/send`: full path — consent/suppression check →
      connector capability check → idempotency dedup → `Message` row →
      `connector.send()` → `MessageStatusEvent` — proves the connector
      abstraction end-to-end for a single message

### Phase 1 follow-ups closed this session

- [x] `POST /auth/register`: bootstrap signup — creates the org's first
      user as `TENANT_ADMIN`, but only while that org has zero users
      (blocks silently adding admins to an org someone else set up);
      `POST /auth/users` (TENANT_ADMIN/SUPER_ADMIN only) adds subsequent users
- [x] `POST /connectors`, `GET /connectors`, `PATCH /connectors/:id/enabled` —
      connectors were previously seed-script-only; now creatable from the
      UI/API, and creating one immediately re-hydrates the in-process
      registry so no restart is needed
- [x] `/dashboard` navigation shell (Contacts/Connectors/Compose/Campaigns/Workflows)
      plus a `/signup` page that chains org-create → register → redirect to dashboard
- [x] Refresh tokens / server-side session revocation: access tokens are
      now short-lived (15m); `RefreshToken` rows (SHA-256-hashed, 30d
      expiry) back `POST /auth/refresh` (rotates on use — old token
      revoked, new one issued), `POST /auth/logout` (revokes the
      presented token), and `POST /auth/logout-all` (revokes every
      session for the caller). The web app refreshes silently in the
      background (`useAuthToken` in `apps/web/src/lib/useAuth.ts`).
- [ ] Still open: no per-connector webhook secrets (see Phase 4 note)

## Phase 2 — Telegram MTProto desktop agent (done this session, partially)

- [x] `apps/desktop-agent`: Express server + Playwright persistent-context
      session against web.telegram.com. `/health` reports login state,
      `/send` deep-links to `web.telegram.com/send?phone=...` and types
      into the composer. Manual QR login only — never automated. Bound to
      `127.0.0.1` only, requires a bearer token.
- [x] Contact import (`POST /contacts/import`, `apps/web` Contacts page):
      accepts CSV or XLSX via SheetJS, matches `phone`/`name`/`email`/
      `language`/`tags` columns case-insensitively, skips duplicates/invalid
      rows with a per-row result list (spec §52/§87). A real arbitrary
      column→field mapping wizard is still a follow-up — this covers the
      common case where columns are already named sensibly.
- [x] Message composer UI (`/dashboard/compose`): connector picker, phone,
      body, optional attachment upload, calls `POST /messages/send` directly
- [x] Group sending (Web connector): `Group` rows (`POST/GET /groups`, `/dashboard/groups`)
      store the exact Telegram chat/group display name; the desktop agent's
      `sendGroupMessage()` types that name into Telegram MTProto's search box,
      opens the first match, and sends — no deep-link exists for groups
      the way `wa.me/<phone>` does for contacts, so this is UI-search-driven
      and depends on the name matching exactly. Compose and Campaigns both
      support choosing a group instead of/alongside contacts, gated on the
      selected connector's `capabilities.groups`. Verified live: single
      group send and a two-group campaign broadcast both delivered
      correctly through a stub agent.
- [ ] Group *discovery* (listing a Telegram account's actual joined groups
      automatically) is not implemented — groups are added manually by
      typing the exact name, not picked from a live list
- [ ] Manual / Assisted / Full-automation send-mode distinction in the UI — composer today is "manual" only
- Known fragility: Telegram MTProto's DOM/selectors change without notice;
  `session.ts` is the single place to update when that happens. Treat this
  connector as best-effort, not delivery-guaranteed — this is called out
  explicitly in code comments and in the connector's own doc-comment.

## Phase 3 — Campaign engine (done this session)

- [x] `apps/worker`: send/campaign/workflow queue processors (originally
      BullMQ+Redis, since migrated to `packages/queue`'s embedded
      DB-polled queue — see "Stack" above) + a 30s-poll scheduler for
      one-time `Schedule` rows (`apps/worker/src/processors/*`)
- [x] Campaign create → recipients from Contact ids → launch (enqueues
      `CampaignJobData`) → worker fans out one send-queue job per recipient
- [x] High-volume approval gate: campaigns over 500 recipients start in
      `WAITING_APPROVAL` and require a Manager+ role to launch (spec §26/§86)
- [x] Idempotency dedup per recipient (`campaign:{id}:contact:{id}`) +
      consent/suppression check (shared `checkSendable`, runs on every send
      regardless of entry point)
- [x] Retry engine: `classifyError`/`isRetryable`/`nextRetryDelayMs` in
      `@an-tg/messaging-core`; the send processor persists a `RetryAttempt`
      row per failure and only re-throws (triggering the queue engine's backoff) for
      retryable categories — permanent/policy/invalid-recipient/auth
      failures terminate immediately (spec §30, §73)
- [x] Campaigns page (`/dashboard/campaigns`): create with a contact-checkbox
      picker, launch, and a JSON report view. Still a simple form, not the
      full audience/message/attachments/schedule/preview wizard (spec §55)
- [x] Basic report endpoint (`GET /campaigns/:id/report`, counts by message status);
      XLSX/CSV/PDF export still open

## Phase 4 — Official API hardening (done this session, partially)

- [x] Webhook receiver (`apps/api/src/webhooks`): GET verify-token handshake,
      POST with HMAC-SHA256 signature check (`X-Hub-Signature-256`) using
      timing-safe compare, replay-safe (dedups on the signature itself via
      `WebhookEvent`), updates `Message.status` + logs `MessageStatusEvent`
      from `statuses` entries
- [ ] Template management + approval-status sync with Meta — schema exists, no sync job yet
- [ ] Interactive messages (buttons/lists)
- [ ] Media upload flow (currently link-based send only, via signed S3 URLs;
      Cloud API's resumable upload endpoint isn't wired up)
- Note: per-connector webhook verify-token/app-secret are read from global
  env vars (`WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN`/`WHATSAPP_CLOUD_APP_SECRET`)
  rather than per-`Connector` row — fine for one Cloud API connector per
  deployment, needs revisiting for multi-connector-per-org.

## Phase 5 — Custom middleware SDK

- [x] `custom-http` connector (done in Phase 0): signed HTTP POST, idempotency header
- [ ] Connector config UI (endpoint, secret, capability declaration)
- [ ] SDK docs/examples: Node.js, Python, REST

## Phase 6 — Workflow engine (done this session, partially)

- [x] Workflow definition: `{ nodes: [{id, type, config}] }`, executed
      strictly in array order by `apps/worker/src/processors/workflow.processor.ts`
- [x] Node types implemented: `trigger`, `send` (goes through the same
      `createMessageRecord`/`deliverMessage` path as everything else),
      `wait` (delayed queue job), `log`, `condition` (simple field===value),
      `human_approval` (pauses the run; `POST /workflows/runs/:id/approve` resumes it)
- [x] `WorkflowRun`/`WorkflowStepRun` persistence, `POST /workflows/:id/trigger`
- [ ] Branch/switch/loop/batch nodes (spec §13 lists these; only a strictly
      sequential executor exists today — no real branching yet)
- [x] Workflows page (`/dashboard/workflows`): raw-JSON node editor (not a
      visual builder yet), trigger, run list, and an Approve-and-resume
      button for runs paused on a `human_approval` node

## Phase 7 — Attachments (done this session, partially)

- [x] `packages/storage`: local-disk store, `uploadAttachment` (SHA-256
      hash, org-prefixed key) + `getSignedDownloadUrl` (HMAC-signed,
      time-limited link served by the API's own `/attachments/file`
      route — attachments never get a permanent public URL; every
      connector send signs a short-lived link just-in-time)
- [x] `POST /attachments` (multipart upload) with a MIME allowlist + 16MB
      size cap; `deliverMessage` resolves a message's attachments through
      the `MessageAttachment` join table
- [ ] Malware/virus scan hook (spec §70) — allowlist + size check only right now
- [ ] Excel range → image/PDF renderer
- [ ] Watermarking

## Phase 8 — Inbox

- [ ] Inbound message handling → Conversation model — schema exists, no ingestion path yet
- [ ] Team inbox UI, assignment, SLA

## Phase 9 — Optional AI

- [ ] Message drafting/translation (pluggable, off by default)
- [ ] Natural-language workflow proposals (always require human approval before execution)

---

## Verified live, end-to-end, this session (no Docker, no external services)

Migrated the DB layer from Postgres/BullMQ-Redis/MinIO to SQLite/DB-polled
queue/local-disk (see Stack section above), rebuilt every package
(`pnpm build`, 13/13 succeed via Turborepo's dependency graph), then
actually ran it:

- [x] `prisma migrate dev` created `packages/database/prisma/dev.db` and applied the schema — no Docker
- [x] `prisma db seed` seeded the demo org/admin/connector
- [x] Built API started clean (all routes mapped, connector registry loaded from DB)
- [x] `POST /auth/login` → real JWT issued
- [x] `POST /contacts` → contact persisted, tags correctly JSON-encoded for SQLite
- [x] `GET /connectors` → capabilities/config correctly parsed back to objects for the API response
- [x] `POST /messages/send` against an unreachable endpoint → `TIMEOUT` error category, message marked `FAILED`, error persisted — proves failure handling
- [x] Same send against a live fake HTTP receiver → `status: "SENT"` with a real `providerMessageId` — proves a full successful send
- [x] Campaign create → launch → **worker** (separate process, polling the `QueueJob` table) faned it out and delivered it → report showed `{"SENT": 1}`
- [x] Workflow (log → wait 1s → log) → trigger → worker executed all three steps in order with correct delay timing → run status `completed`
- [x] `next build` + `next start` → `/login` and `/dashboard/compose` both return HTTP 200

Bugs this surfaced and fixed along the way (worth knowing about if you hit
similar issues extending this):
- SQLite's Prisma connector supports neither the `Json` scalar type nor
  scalar list fields (`String[]`) nor enums — every one of those in the
  original schema had to become a plain `String` column, with JSON
  encode/decode moved into application code (see `packages/database/src/index.ts`
  for the enum → TS-union replacement, and every `JSON.stringify`/`JSON.parse`
  pair added at each read/write site).
- Prisma's `mode: "insensitive"` filter is Postgres-only; removed from the
  contacts search (SQLite's `LIKE` is already ASCII-case-insensitive).
- Every workspace package originally pointed `main`/`types` straight at
  `src/index.ts` — fine for dev-mode transpilers (tsx/ts-node/webpack) but
  broken for a plain `node dist/main.js` production run. Fixed by adding a
  real `build: tsc` script to each package and pointing `main`/`types` at
  `dist/`, with `turbo.json`'s existing `dependsOn: ["^build"]` handling
  build order.
- `express` needs to be an explicit dependency of `apps/api` (used
  directly in `main.ts` for raw-body webhook signature verification) —
  it was only a transitive dependency via `@nestjs/platform-express`,
  which pnpm's strict linking doesn't hoist automatically.
- Env vars needed a loading strategy that works the same in dev (tsx/nest
  --watch) and in a compiled `node dist/...` run: each entrypoint
  (`apps/api/src/main.ts`, `apps/worker/src/index.ts`,
  `apps/desktop-agent/src/index.ts`) now does a `require("dotenv").config(...)`
  as its literal first statement, pointing at the monorepo-root `.env`;
  `packages/database/.env` (gitignored) holds just `DATABASE_URL` for the
  Prisma CLI itself, which doesn't share that loading path.

## What's still open

- Automated test suite is minimal — `packages/messaging-core` has unit
  tests (consent/retry/rate-limit) but most of `apps/api`/`apps/worker`
  is still only exercised by manual curl + log inspection.
- CI pipeline now runs install/typecheck/test/build on every push/PR
  (`.github/workflows/ci.yml`), but doesn't run lint (no package defines
  a `lint` script yet) or any integration/e2e suite.
- Web UI is functional but intentionally minimal: campaigns/workflows use
  plain forms and a raw JSON node editor rather than the wizard/visual
  builder described in spec §55/§13 — good enough to exercise every API
  path for testing, not a finished design.
- Per-organization Telegram Bot API webhook secrets (see Phase 4 note
  above) — currently one global env var per secret, fine for a single
  Bot API connector per deployment.
- No refresh-token reuse detection beyond rejecting an already-revoked
  token — a stolen-and-replayed refresh token isn't distinguished from
  an expired one, and there's no "reuse detected, revoke the whole
  chain" response yet.

---

## Non-negotiables carried into every phase (spec §103–104)

- Never automate Telegram MTProto login/QR or bypass anti-abuse controls.
- Every connector call goes through the `Connector` interface — no
  `if (connectorType === 'telegram_web')` branching in business logic.
- Consent/opt-out and suppression checks run before every send, not just in campaigns.
- Idempotency key required on every outbound message.
- Secrets (access tokens, signing secrets, agent auth tokens) never in
  plaintext config tables or logs — env vars locally, secrets manager in
  cloud deployment.
- Group sending is connector-capability-gated, never assumed available.

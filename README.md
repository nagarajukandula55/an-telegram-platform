# AN Telegram Automation Platform

A connector-agnostic Telegram automation platform: one workflow/message/
attachment/campaign engine, pluggable delivery via Telegram MTProto, the
official Meta Cloud API, or customer-owned middleware.

**Fully self-contained — no Docker, no Postgres/Redis/MinIO servers to
run.** The database is a local SQLite file, the job queue is a table in
that same file (polled instead of brokered), and attachments live on
local disk. Everything runs with just Node.js installed.

## Quick start

```bash
pnpm install
cp .env.example .env
pnpm db:migrate    # creates packages/database/prisma/dev.db and applies the schema
pnpm db:seed       # demo org + admin@demo.local / ChangeMe123! + a demo connector
pnpm dev           # runs web (3000), api (4000), and worker together
```

Visit `http://localhost:3000/login`, sign in with the seeded admin (or use
`/signup` to create a fresh organization). **Then open `/dashboard/help`
inside the running app** — that's the day-to-day guide to every screen.

Full setup walkthrough: `docs/getting-started.md`.

## Documentation

This repo has three layers of docs, each answering a different question:

| Layer | Where | Answers |
|---|---|---|
| **Setup guides** | `docs/` — [getting-started](docs/getting-started.md), [connectors](docs/connectors.md), [groups & Telegram MTProto](docs/groups-and-connector-telegram-mtproto.md), [architecture](docs/architecture.md), [deployment](docs/deployment.md) | "How do I install/configure this?" — read before or while running it |
| **In-app guide** | `/dashboard/help` in the running app | "How do I use this screen?" — read while using it |
| **Per-app READMEs** | [`apps/api`](apps/api/README.md), [`apps/worker`](apps/worker/README.md), [`apps/web`](apps/web/README.md), [`apps/desktop-agent`](apps/desktop-agent/README.md), [`packages`](packages/README.md) | "What does this specific process/package do and how do I run it standalone?" — read when working on the code |

`PLAN.md` is a fourth, different kind of doc: not a guide, but a running
account of what's built vs. still open, phase by phase.

## Layout

- `apps/web` — Next.js frontend: login/signup, contacts, connectors, compose, campaigns, workflows, in-app help
- `apps/api` — NestJS backend: auth, organizations, contacts, groups, connectors, messages, attachments, campaigns, workflows, webhooks
- `apps/worker` — polls the `QueueJob` table for send/campaign/workflow jobs + a schedule poller (no broker)
- `apps/desktop-agent` — local Playwright bridge for Telegram MTProto sessions (manual QR login only)
- `packages/database` — Prisma schema (SQLite) + client
- `packages/connectors-core` — shared `Connector` interface + registry
- `packages/connectors-bootstrap` — hydrates the registry from the `Connector` table (used by both api and worker)
- `packages/messaging-core` — the one send/retry/consent code path every entry point (manual, campaign, workflow) shares
- `packages/queue` — the embedded job queue: `enqueue()` writes a row, `startQueueWorker()` polls and claims rows
- `packages/storage` — local-disk attachment store + HMAC-signed, time-limited download URLs (never a public link)
- `connectors/*` — Telegram MTProto, Telegram Bot API, custom-middleware adapters

See `PLAN.md` for exactly what's done vs. still open per phase — in particular the
"What's NOT yet done that matters before calling this production" section.

## Core principle

> Do not make Telegram MTProto the product. Make the automation engine the
> product. Telegram MTProto, the Cloud API, and customer middleware are all
> just connectors behind one `Connector` interface — business logic never
> branches on connector type.

Why there's no Docker/Redis/Postgres/MinIO, and what changes if you ever
need more than one instance: `docs/deployment.md`.

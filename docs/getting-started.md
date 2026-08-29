# Getting started

Everything runs locally with nothing to install beyond Node.js — no
Docker, no Postgres/Redis/MinIO. The database is a SQLite file, the job
queue is a table in that same file, attachments live on local disk.

## Prerequisites

- Node.js 20+ (tested on 22)
- pnpm (`corepack enable` will get you the pinned version automatically)

## Install and run

```bash
git clone <this repo>
cd an-telegram-platform
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm db:seed
pnpm dev          # runs api + web + worker together, auto-reload
```

Then open `http://localhost:3000/login` and sign in as
`admin@demo.local` / `ChangeMe123!` (from the seed script), or go to
`/signup` to create your own organization instead.

**Read `/dashboard/help` inside the running app first** — it's the
day-to-day guide to every screen. This doc and the others in `docs/` are
the "before you run it" layer; the in-app Help page is the "using it"
layer.

## Running the production build instead of dev mode

```bash
pnpm build
pnpm start        # runs the built api + worker + web together
```

## If you need Telegram MTProto (groups, or your own number)

That's a fourth process, run separately, because it opens a real browser
window for you to scan a QR code with:

```bash
pnpm --filter @an-tg/desktop-agent dev
```

See `apps/desktop-agent/README.md` and `docs/connectors.md` for the full
setup.

## What each command actually starts

| Command | Starts |
|---|---|
| `pnpm dev` | api (`:4000`) + web (`:3000`) + worker, dev mode, auto-reload |
| `pnpm start` | Same three, running the production build |
| `pnpm --filter @an-tg/desktop-agent dev` | The Telegram MTProto bridge, separately — opt-in |
| `pnpm db:migrate` | Applies Prisma migrations to the local SQLite file |
| `pnpm db:seed` | Creates the demo org/user/connector |

## Next steps

- `docs/connectors.md` — set up your first real delivery method
- `docs/architecture.md` — how the four processes and the queue fit together
- `docs/deployment.md` — what changes if you want this running on a server instead of your machine
- `PLAN.md` — what's built vs. still open, phase by phase

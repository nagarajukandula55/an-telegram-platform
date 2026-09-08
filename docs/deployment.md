# Deployment considerations

The default setup (SQLite, DB-polled queue, local disk) was chosen
specifically to run with zero external services on one machine. That's
the right call for local use, a single small team, or "one particular
purpose" usage — and it's what's actually built and verified today.

**This doc is about the tradeoff, not a migration you need to do now.**
Read it when you're actually considering running this somewhere other
than your own machine.

## What breaks with more than one instance

- **SQLite** is a single file. Two processes on different machines can't
  share it. Even on one machine, SQLite handles concurrent writers by
  serializing them — fine for one api + one worker, not built for
  horizontal scaling.
- **The queue** (`packages/queue`) polls that same file. Multiple worker
  processes on different machines can't coordinate through it.
- **Attachments** live on local disk (`ATTACHMENT_STORAGE_DIR`). A second
  instance wouldn't see files the first one saved unless they share a
  volume.
- **The MTProto session** (GramJS, in-process inside api/worker) is a
  live TCP connection tied to whichever process holds it — not something
  a load balancer can share across instances without extra work.

None of this matters until you actually need >1 instance or a server
that isn't the one you're developing on.

## If/when you do need to scale or host this remotely

The pieces to swap, and why the connector-agnostic design makes this a
config change rather than a rewrite of business logic:

| Local (today) | Cloud equivalent | What changes |
|---|---|---|
| SQLite | Managed Postgres | `datasource provider` in `schema.prisma`, re-run migrations. Every String-encoded-JSON field could revert to a real `Json`/enum column at the same time, though that's optional. |
| `packages/queue` (DB-polled) | Redis + BullMQ, or keep the DB-polled approach with a real Postgres row-lock (`FOR UPDATE SKIP LOCKED`) instead of the SQLite-friendly `updateMany` claim | The `enqueue()`/`startQueueWorker()` call sites in `apps/api` and `apps/worker` don't need to change — only `packages/queue`'s internals would |
| Local disk attachments | S3-compatible object storage | `packages/storage`'s two functions (`uploadAttachment`, `getSignedDownloadUrl`) are the only place this logic lives |
| One api/worker process each | Multiple instances behind a load balancer | Needs the queue swap above first, or you'll get duplicate sends |

None of the application code above `packages/queue`/`packages/storage`/
`packages/database`'s datasource line needs to know or care which of
these you're running — that's the point of keeping storage/queue/DB
access behind small, focused packages instead of scattered `fetch`/`fs`
calls.

## Also needed before "production" regardless of hosting

- Per-organization webhook secrets, if you'll ever have more than one
  Telegram Bot API connector across different orgs (today it's one global
  env var pair per deployment).
- Rate/volume limiting — nothing throttles campaign or workflow send
  rate today beyond queue concurrency.
- An automated test suite and CI — everything verified so far has been
  manual build/typecheck/live-run checks in this session, not an
  automated pipeline.

See `PLAN.md` for the full, currently-accurate list of what's built vs.
open.

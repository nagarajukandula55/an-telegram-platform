# @an-tg/worker

Background process that turns queued work into actual sends. Nothing
queue-driven happens — no campaign fan-out, no workflow steps, no
retries — unless this is running alongside the API.

## Run

```bash
pnpm --filter @an-tg/worker dev      # dev, auto-reload (tsx watch)
# or
pnpm --filter @an-tg/worker build && pnpm --filter @an-tg/worker start
```

No port — this is a pure background poller, nothing listens for HTTP here.

## What it does

Three independent pollers plus a scheduler, all reading the same
`QueueJob` table in the SQLite database (see `packages/queue` for how the
queue itself works — there's no Redis/broker, just DB rows):

| Poller | Source | Interval | Job |
|---|---|---|---|
| `send.processor.ts` | `send` queue | 1s | Delivers one message via the target connector; on a retryable failure (per `classifyError`/`isRetryable` in `packages/messaging-core`) it's rescheduled with backoff, logged as a `RetryAttempt` |
| `campaign.processor.ts` | `campaign` queue | 2s | Fans a launched campaign out into one `send` job per recipient (contact or group) |
| `workflow.processor.ts` | `workflow` queue | 1s | Executes one workflow node (`trigger`/`send`/`wait`/`log`/`condition`/`human_approval`), then enqueues the next step — or, for `human_approval`, pauses and waits for `POST /workflows/runs/:id/approve` |
| `scheduler.ts` | `Schedule` table | 30s | Fires due one-time schedules by creating a `WorkflowRun` and enqueueing its first step. Recurring `cronExpr` schedules are not evaluated yet. |

At startup it also calls `loadConnectorsFromDb()` (same as the API) so it
can resolve connectors independently — the worker never asks the API to
send on its behalf, it sends directly.

## Depends on

`packages/database`, `packages/connectors-bootstrap`,
`packages/messaging-core`, `packages/queue` — same core packages as the
API, since the two processes share responsibility for the send pipeline.

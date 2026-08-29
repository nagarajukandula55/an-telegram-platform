import type { PrismaClient } from "@an-tg/database";
import type { QueueName } from "./queues";

export interface EnqueueOptions {
  delayMs?: number;
  maxAttempts?: number;
}

/**
 * Writes one job row. This is the entire "producer" side of the queue —
 * no broker, no network hop, just a DB insert. Safe to call from any
 * process that shares the same SQLite file (api and worker both do).
 */
export async function enqueue<T>(
  prisma: PrismaClient,
  queueName: QueueName,
  payload: T,
  opts: EnqueueOptions = {},
): Promise<{ id: string }> {
  const job = await prisma.queueJob.create({
    data: {
      queueName,
      payload: JSON.stringify(payload),
      runAt: new Date(Date.now() + (opts.delayMs ?? 0)),
      maxAttempts: opts.maxAttempts ?? 5,
    },
  });
  return { id: job.id };
}

export interface QueueWorkerOptions {
  concurrency?: number;
  pollIntervalMs?: number;
  /** Called with (attemptNumber) -> delay in ms, or null to stop retrying. */
  backoff?: (attemptNumber: number) => number | null;
}

const DEFAULT_BACKOFF = (attemptNumber: number): number | null => {
  const schedule = [30_000, 120_000, 600_000];
  return schedule[attemptNumber - 1] ?? null;
};

export interface QueueWorkerHandle {
  stop(): void;
}

/**
 * Polls `QueueJob` rows for this queue and processes due, pending ones.
 * This replaces BullMQ+Redis: a handler that resolves marks the job
 * completed; a handler that throws is treated as a retryable failure and
 * rescheduled per `backoff` (or marked failed once attempts run out) —
 * the same semantics `apps/worker`'s processors already expected from
 * BullMQ, so the processors themselves barely changed.
 *
 * Single-process polling with `updateMany` claim-guards is sufficient for
 * the local/single-worker deployment this replaces Redis for; it is not
 * designed for many concurrent worker processes racing over the same queue.
 */
export function startQueueWorker<T>(
  prisma: PrismaClient,
  queueName: QueueName,
  handler: (payload: T, meta: { attemptsMade: number; jobId: string }) => Promise<void>,
  opts: QueueWorkerOptions = {},
): QueueWorkerHandle {
  const concurrency = opts.concurrency ?? 5;
  const pollIntervalMs = opts.pollIntervalMs ?? 1000;
  const backoff = opts.backoff ?? DEFAULT_BACKOFF;
  let stopped = false;
  let inFlight = 0;

  async function claimNext(): Promise<{ id: string; payload: T; attempts: number; maxAttempts: number } | null> {
    const candidates = await prisma.queueJob.findMany({
      where: { queueName, status: "pending", runAt: { lte: new Date() } },
      orderBy: { runAt: "asc" },
      take: 5,
    });

    for (const candidate of candidates) {
      const claim = await prisma.queueJob.updateMany({
        where: { id: candidate.id, status: "pending" },
        data: { status: "processing" },
      });
      if (claim.count === 1) {
        return { id: candidate.id, payload: JSON.parse(candidate.payload) as T, attempts: candidate.attempts, maxAttempts: candidate.maxAttempts };
      }
    }
    return null;
  }

  async function runOne() {
    const job = await claimNext();
    if (!job) return;

    inFlight++;
    try {
      await handler(job.payload, { attemptsMade: job.attempts, jobId: job.id });
      await prisma.queueJob.update({ where: { id: job.id }, data: { status: "completed" } });
    } catch (err) {
      const nextAttempt = job.attempts + 1;
      const delay = nextAttempt < job.maxAttempts ? backoff(nextAttempt) : null;
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (delay !== null) {
        await prisma.queueJob.update({
          where: { id: job.id },
          data: { status: "pending", attempts: nextAttempt, runAt: new Date(Date.now() + delay), lastError: errorMessage },
        });
      } else {
        await prisma.queueJob.update({
          where: { id: job.id },
          data: { status: "failed", attempts: nextAttempt, lastError: errorMessage },
        });
      }
    } finally {
      inFlight--;
    }
  }

  const interval = setInterval(() => {
    if (stopped) return;
    const slotsFree = concurrency - inFlight;
    for (let i = 0; i < slotsFree; i++) {
      runOne().catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`[queue:${queueName}] unexpected poll error:`, err);
      });
    }
  }, pollIntervalMs);

  return {
    stop() {
      stopped = true;
      clearInterval(interval);
    },
  };
}

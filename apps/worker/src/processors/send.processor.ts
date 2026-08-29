import { prisma } from "@an-tg/database";
import { startQueueWorker, QUEUE_NAMES, type NewSendJobData, type QueueWorkerHandle } from "@an-tg/queue";
import { createMessageRecord, deliverMessage, isRetryable, nextRetryDelayMs, SendValidationError } from "@an-tg/messaging-core";

/**
 * Consumes the send queue. Each job represents one logical outbound
 * message; `createMessageRecord` is idempotent (safe if the job is
 * duplicated), while `deliverMessage` performs the actual connector call
 * and is what re-runs on every retry.
 */
export function startSendWorker(): QueueWorkerHandle {
  return startQueueWorker<NewSendJobData>(
    prisma,
    QUEUE_NAMES.SEND,
    async (data, meta) => {
      let message;
      try {
        ({ message } = await createMessageRecord(prisma, data));
      } catch (err) {
        if (err instanceof SendValidationError) {
          // Not sendable / unsupported content type — permanent, do not retry.
          return;
        }
        throw err;
      }

      if (message.status !== "QUEUED") {
        // Already delivered (or terminally failed) by a previous attempt.
        return;
      }

      const outcome = await deliverMessage(prisma, message.id);

      if (outcome.status === "FAILED") {
        const category = outcome.errorCategory ?? "UNKNOWN";
        await prisma.retryAttempt.create({
          data: {
            messageId: message.id,
            attemptNumber: meta.attemptsMade + 1,
            errorCategory: category,
            errorDetail: outcome.errorMessage,
            nextAttemptAt: nextRetryDelayMs(meta.attemptsMade + 1)
              ? new Date(Date.now() + (nextRetryDelayMs(meta.attemptsMade + 1) as number))
              : null,
          },
        });

        if (isRetryable(category)) {
          // Throwing tells the queue engine to reschedule per its backoff policy.
          throw new Error(`Retryable send failure (${category}): ${outcome.errorMessage ?? "unknown error"}`);
        }
      }
    },
    { concurrency: 10, pollIntervalMs: 1000 },
  );
}

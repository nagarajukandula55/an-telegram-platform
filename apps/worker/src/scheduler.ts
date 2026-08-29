import { prisma } from "@an-tg/database";
import { enqueue, QUEUE_NAMES } from "@an-tg/queue";

const POLL_INTERVAL_MS = 30_000;

/**
 * Polls due one-time schedules and fires the associated workflow.
 * Recurring cron expressions (Schedule.cronExpr) are not yet evaluated here
 * — see PLAN.md Phase 3/6 for the cron-parsing follow-up.
 */
export function startScheduler(): NodeJS.Timeout {
  async function tick() {
    const due = await prisma.schedule.findMany({
      where: { isActive: true, runAt: { lte: new Date() } },
    });

    for (const schedule of due) {
      if (schedule.workflowId) {
        const run = await prisma.workflowRun.create({ data: { workflowId: schedule.workflowId, status: "running" } });
        await enqueue(prisma, QUEUE_NAMES.WORKFLOW, { workflowRunId: run.id, workflowId: schedule.workflowId, stepIndex: 0 });
      }
      await prisma.schedule.update({ where: { id: schedule.id }, data: { isActive: false } });
    }
  }

  return setInterval(() => {
    tick().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Scheduler tick failed:", err);
    });
  }, POLL_INTERVAL_MS);
}

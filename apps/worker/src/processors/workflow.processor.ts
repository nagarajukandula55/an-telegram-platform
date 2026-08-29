import { prisma } from "@an-tg/database";
import { startQueueWorker, enqueue, QUEUE_NAMES, type WorkflowJobData, type QueueWorkerHandle } from "@an-tg/queue";
import { createMessageRecord, deliverMessage } from "@an-tg/messaging-core";

export interface WorkflowNode {
  id: string;
  type: "trigger" | "send" | "wait" | "log" | "condition" | "human_approval";
  config: Record<string, unknown>;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[]; // executed strictly in array order for this MVP executor
}

/**
 * Minimal sequential workflow executor (spec §13 node types are only
 * partially covered here: trigger/send/wait/log/condition/human_approval).
 * Branch/switch/loop nodes are Phase 6 follow-ups — see PLAN.md.
 */
export function startWorkflowWorker(): QueueWorkerHandle {
  return startQueueWorker<WorkflowJobData>(
    prisma,
    QUEUE_NAMES.WORKFLOW,
    async (data) => {
      const workflow = await prisma.workflow.findUniqueOrThrow({ where: { id: data.workflowId } });
      const definition = JSON.parse(workflow.definition) as WorkflowDefinition;
      const node = definition.nodes[data.stepIndex];

      if (!node) {
        await prisma.workflowRun.update({
          where: { id: data.workflowRunId },
          data: { status: "completed", finishedAt: new Date() },
        });
        return;
      }

      const stepRun = await prisma.workflowStepRun.create({
        data: { workflowRunId: data.workflowRunId, nodeId: node.id, status: "running", input: JSON.stringify(node.config) },
      });

      try {
        const output = await executeNode(node, data.workflowRunId);
        await prisma.workflowStepRun.update({
          where: { id: stepRun.id },
          data: { status: "completed", output: JSON.stringify(output ?? {}), finishedAt: new Date() },
        });

        if (node.type === "human_approval") {
          // Pause: do not enqueue the next step. An operator resumes the
          // run via the workflows API, which enqueues stepIndex + 1 itself.
          await prisma.workflowRun.update({ where: { id: data.workflowRunId }, data: { status: "awaiting_approval" } });
          return;
        }

        const delayMs = node.type === "wait" ? Number(node.config.delayMs ?? 0) : 0;
        await enqueue(
          prisma,
          QUEUE_NAMES.WORKFLOW,
          { workflowRunId: data.workflowRunId, workflowId: data.workflowId, stepIndex: data.stepIndex + 1 },
          { delayMs },
        );
      } catch (err) {
        await prisma.workflowStepRun.update({
          where: { id: stepRun.id },
          data: { status: "failed", error: err instanceof Error ? err.message : String(err), finishedAt: new Date() },
        });
        await prisma.workflowRun.update({ where: { id: data.workflowRunId }, data: { status: "failed", finishedAt: new Date() } });
        throw err;
      }
    },
    { concurrency: 5, pollIntervalMs: 1000 },
  );
}

async function executeNode(node: WorkflowNode, workflowRunId: string): Promise<Record<string, unknown> | void> {
  switch (node.type) {
    case "trigger":
      return {};

    case "log":
      // eslint-disable-next-line no-console
      console.log(`[workflow ${workflowRunId}] ${String(node.config.message ?? "")}`);
      return {};

    case "wait":
      return { delayMs: node.config.delayMs ?? 0 };

    case "condition": {
      const { field, equals, context } = node.config as { field?: string; equals?: unknown; context?: Record<string, unknown> };
      const actual = field ? context?.[field] : undefined;
      return { matched: actual === equals };
    }

    case "send": {
      const config = node.config as {
        organizationId: string;
        connectorId: string;
        toPhone: string;
        body?: string;
      };
      const { message } = await createMessageRecord(prisma, {
        organizationId: config.organizationId,
        connectorId: config.connectorId,
        toPhone: config.toPhone,
        contentType: "text",
        body: config.body,
        idempotencyKey: `workflow:${workflowRunId}:node:${node.id}`,
        workflowRunId,
      });
      const outcome = await deliverMessage(prisma, message.id);
      return { messageId: message.id, status: outcome.status };
    }

    case "human_approval":
      return { awaitingApproval: true };

    default:
      return {};
  }
}

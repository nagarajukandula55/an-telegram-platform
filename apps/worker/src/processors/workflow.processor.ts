import { prisma } from "@an-tg/database";
import { startQueueWorker, enqueue, QUEUE_NAMES, type WorkflowJobData, type QueueWorkerHandle } from "@an-tg/queue";
import { createMessageRecord, deliverMessage } from "@an-tg/messaging-core";

export type WorkflowNodeType = "trigger" | "send" | "wait" | "log" | "condition" | "switch" | "loop" | "batch" | "human_approval";

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  config: Record<string, unknown>;
}

/**
 * `when` selects which edge to follow out of a branching node:
 * - condition node: "true" | "false"
 * - switch node: matched against String(value at config.field) in run context, or "default"
 * - loop node: "loop" (take the body again) | "done" (exit the loop)
 * Every other node type has at most one outgoing edge (`when` unset/ignored).
 */
export interface WorkflowEdge {
  from: string;
  to: string;
  when?: string;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  startNodeId: string;
}

/** Accumulated per-run state: each node's output keyed by node id, plus loop iteration counters. */
export interface RunContext {
  outputs: Record<string, unknown>;
  loopCounts: Record<string, number>;
}

export function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

function findNode(definition: WorkflowDefinition, id: string): WorkflowNode | undefined {
  return definition.nodes.find((n) => n.id === id);
}

function outgoingEdges(definition: WorkflowDefinition, nodeId: string): WorkflowEdge[] {
  return definition.edges.filter((e) => e.from === nodeId);
}

/**
 * Graph-walking executor: nodes/edges instead of a flat ordered array, so
 * condition/switch nodes can actually branch and loop nodes can actually
 * repeat a subgraph — the previous executor ran nodes strictly in array
 * order regardless of a condition node's result. See PLAN.md.
 */
export function startWorkflowWorker(): QueueWorkerHandle {
  return startQueueWorker<WorkflowJobData>(
    prisma,
    QUEUE_NAMES.WORKFLOW,
    async (data) => {
      const workflow = await prisma.workflow.findUniqueOrThrow({ where: { id: data.workflowId } });
      const definition = JSON.parse(workflow.definition) as WorkflowDefinition;
      const node = findNode(definition, data.nodeId);
      if (!node) {
        await prisma.workflowRun.update({ where: { id: data.workflowRunId }, data: { status: "completed", finishedAt: new Date() } });
        return;
      }

      const run = await prisma.workflowRun.findUniqueOrThrow({ where: { id: data.workflowRunId } });
      const context: RunContext = run.context ? JSON.parse(run.context) : { outputs: {}, loopCounts: {} };

      const stepRun = await prisma.workflowStepRun.create({
        data: { workflowRunId: data.workflowRunId, nodeId: node.id, status: "running", input: JSON.stringify(node.config) },
      });

      try {
        const output = await executeNode(node, data.workflowRunId, context);
        context.outputs[node.id] = output ?? {};
        await prisma.workflowRun.update({ where: { id: data.workflowRunId }, data: { context: JSON.stringify(context) } });
        await prisma.workflowStepRun.update({
          where: { id: stepRun.id },
          data: { status: "completed", output: JSON.stringify(output ?? {}), finishedAt: new Date() },
        });

        if (node.type === "human_approval") {
          // Pause: do not enqueue the next step. An operator resumes the
          // run via the workflows API, which enqueues the node after this one.
          await prisma.workflowRun.update({ where: { id: data.workflowRunId }, data: { status: "awaiting_approval" } });
          return;
        }

        const nextNodeId = resolveNextNode(definition, node, context, output);
        if (!nextNodeId) {
          await prisma.workflowRun.update({ where: { id: data.workflowRunId }, data: { status: "completed", finishedAt: new Date() } });
          return;
        }

        const delayMs = node.type === "wait" ? Number(node.config.delayMs ?? 0) : 0;
        await enqueue(prisma, QUEUE_NAMES.WORKFLOW, { workflowRunId: data.workflowRunId, workflowId: data.workflowId, nodeId: nextNodeId }, { delayMs });
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

/** Decides which outgoing edge to take. Returns undefined when the run should end (no matching/outgoing edge). */
export function resolveNextNode(definition: WorkflowDefinition, node: WorkflowNode, context: RunContext, output: Record<string, unknown> | void): string | undefined {
  const edges = outgoingEdges(definition, node.id);
  if (edges.length === 0) return undefined;

  if (node.type === "condition") {
    const matched = Boolean((output as { matched?: boolean } | undefined)?.matched);
    return edges.find((e) => e.when === (matched ? "true" : "false"))?.to;
  }

  if (node.type === "switch") {
    const field = String(node.config.field ?? "");
    const actual = String(getByPath(context.outputs, field) ?? "");
    return (edges.find((e) => e.when === actual) ?? edges.find((e) => e.when === "default"))?.to;
  }

  if (node.type === "loop") {
    const times = Number(node.config.times ?? 0);
    const count = context.loopCounts[node.id] ?? 0;
    if (count < times) {
      context.loopCounts[node.id] = count + 1;
      return edges.find((e) => e.when === "loop")?.to;
    }
    return edges.find((e) => e.when === "done")?.to;
  }

  // Linear node types (trigger/send/wait/log/batch): exactly one outgoing edge.
  return edges[0]?.to;
}

async function executeNode(node: WorkflowNode, workflowRunId: string, context: RunContext): Promise<Record<string, unknown> | void> {
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
      const { field, equals } = node.config as { field?: string; equals?: unknown };
      const actual = field ? getByPath(context.outputs, field) : undefined;
      return { matched: actual === equals };
    }

    case "switch": {
      // The branch itself is resolved from context by resolveNextNode();
      // this just records the value that was compared, for step-run visibility.
      const field = String(node.config.field ?? "");
      return { value: getByPath(context.outputs, field) };
    }

    case "loop":
      return { iteration: (context.loopCounts[node.id] ?? 0) + 1 };

    case "send": {
      const config = node.config as { organizationId: string; connectorId: string; toPhone: string; body?: string };
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

    case "batch": {
      // Fan-out send: same connector/body to every recipient in config.recipients.
      // Capped at 200 per step so one job can't block the worker indefinitely —
      // for larger fan-outs, use a Campaign instead (queue-backed, per-recipient jobs).
      const config = node.config as { organizationId: string; connectorId: string; body?: string; recipients: string[] };
      const recipients = (config.recipients ?? []).slice(0, 200);
      const results: Array<{ toPhone: string; messageId: string; status: string }> = [];
      for (const toPhone of recipients) {
        const { message } = await createMessageRecord(prisma, {
          organizationId: config.organizationId,
          connectorId: config.connectorId,
          toPhone,
          contentType: "text",
          body: config.body,
          idempotencyKey: `workflow:${workflowRunId}:node:${node.id}:to:${toPhone}`,
          workflowRunId,
        });
        const outcome = await deliverMessage(prisma, message.id);
        results.push({ toPhone, messageId: message.id, status: outcome.status });
      }
      return { sent: results.length, results };
    }

    case "human_approval":
      return { awaitingApproval: true };

    default:
      return {};
  }
}

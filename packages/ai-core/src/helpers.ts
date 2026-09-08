import type { AiProvider } from "./types";

export interface DraftReplyInput {
  /** Recent conversation history, oldest first. */
  history: Array<{ direction: "inbound" | "outbound"; body: string | null }>;
  tone?: string;
}

/** Drafts a suggested reply — never sent automatically, always surfaced for a human to review/edit/send (spec Phase 9 non-negotiable). */
export async function draftReply(provider: AiProvider, input: DraftReplyInput): Promise<string> {
  const transcript = input.history
    .filter((m) => m.body)
    .map((m) => `${m.direction === "inbound" ? "Customer" : "Agent"}: ${m.body}`)
    .join("\n");

  const reply = await provider.complete([
    {
      role: "system",
      content:
        `You are drafting a reply for a support agent to review and send themselves — you are not sending anything. ` +
        `Write a single concise, ${input.tone ?? "helpful and professional"} reply to the customer's most recent message, ` +
        `grounded only in the conversation below. Output only the reply text, no preamble, no quotes.`,
    },
    { role: "user", content: transcript || "(no prior messages)" },
  ]);

  return reply.trim();
}

/** Translates text to a target language — output only, never auto-sent. */
export async function translateText(provider: AiProvider, text: string, targetLanguage: string): Promise<string> {
  const translated = await provider.complete([
    {
      role: "system",
      content: `Translate the user's message to ${targetLanguage}. Output only the translation, nothing else — no explanations, no quotes.`,
    },
    { role: "user", content: text },
  ]);
  return translated.trim();
}

export interface ProposedWorkflowNode {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

export interface ProposedWorkflowEdge {
  from: string;
  to: string;
  when?: string;
}

export interface ProposedWorkflow {
  nodes: ProposedWorkflowNode[];
  edges: ProposedWorkflowEdge[];
  startNodeId: string;
}

const WORKFLOW_SCHEMA_PROMPT = `You design workflow definitions for an automation platform. A workflow is JSON: {"nodes": [...], "edges": [...], "startNodeId": "..."}.

Each node is {"id": string, "type": one of trigger|send|wait|log|condition|switch|loop|batch|human_approval, "config": object}.
- trigger: config {} — always the entry point unless the workflow starts elsewhere.
- send: config {connectorId: string (leave as "" — the user fills this in), toPhone: string, body: string}.
- wait: config {delayMs: number}.
- log: config {message: string}.
- condition: config {field: string, equals: any} — branches via edges with "when": "true" or "when": "false".
- switch: config {field: string} — branches via edges with "when": "<matched value>" or "when": "default".
- loop: config {times: number} — branches via edges with "when": "loop" (repeat) or "when": "done" (exit).
- batch: config {connectorId: "", body: string, recipients: string[]}.
- human_approval: config {} — pauses the run until a person approves it; use this before any node with real-world side effects when the description implies caution is warranted.

Each edge is {"from": nodeId, "to": nodeId, "when"?: string (only for condition/switch/loop source nodes, per the rules above)}.

Respond with ONLY the JSON object, no markdown fences, no commentary.`;

/**
 * Proposes a workflow definition from a natural-language description. This
 * NEVER creates or activates a workflow — it returns a definition for the
 * visual builder (apps/web/.../WorkflowBuilder.tsx) to pre-fill, which a
 * human then reviews, edits, and explicitly saves. That save step, and the
 * fact that saving a workflow doesn't trigger it, is what satisfies spec
 * Phase 9's "always require human approval before execution" — nothing
 * here can run without a person first creating the workflow AND then
 * separately triggering or scheduling it.
 */
export async function proposeWorkflow(provider: AiProvider, description: string): Promise<ProposedWorkflow> {
  const raw = await provider.complete(
    [
      { role: "system", content: WORKFLOW_SCHEMA_PROMPT },
      { role: "user", content: description },
    ],
    { maxTokens: 1500, temperature: 0.2 },
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripMarkdownFence(raw));
  } catch {
    throw new Error("AI provider did not return valid JSON for the proposed workflow");
  }

  return validateProposedWorkflow(parsed);
}

function stripMarkdownFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1] : text;
}

function validateProposedWorkflow(value: unknown): ProposedWorkflow {
  if (!value || typeof value !== "object") throw new Error("Proposed workflow is not an object");
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.nodes) || v.nodes.length === 0) throw new Error("Proposed workflow has no nodes");
  if (!Array.isArray(v.edges)) throw new Error("Proposed workflow is missing an edges array");
  if (typeof v.startNodeId !== "string") throw new Error("Proposed workflow is missing startNodeId");

  const nodeIds = new Set<string>();
  for (const n of v.nodes) {
    if (!n || typeof n !== "object" || typeof (n as Record<string, unknown>).id !== "string" || typeof (n as Record<string, unknown>).type !== "string") {
      throw new Error("Proposed workflow has a malformed node");
    }
    nodeIds.add((n as Record<string, unknown>).id as string);
  }
  if (!nodeIds.has(v.startNodeId as string)) {
    throw new Error("Proposed workflow's startNodeId does not reference an existing node");
  }
  for (const e of v.edges) {
    if (!e || typeof e !== "object" || typeof (e as Record<string, unknown>).from !== "string" || typeof (e as Record<string, unknown>).to !== "string") {
      throw new Error("Proposed workflow has a malformed edge");
    }
  }

  return value as unknown as ProposedWorkflow;
}

import { describe, expect, it } from "vitest";
import { getByPath, resolveNextNode, type RunContext, type WorkflowDefinition, type WorkflowNode } from "./workflow.processor";

function emptyContext(): RunContext {
  return { outputs: {}, loopCounts: {} };
}

describe("getByPath", () => {
  it("resolves a nested dot path", () => {
    expect(getByPath({ a: { b: { c: 42 } } }, "a.b.c")).toBe(42);
  });

  it("returns undefined for a missing path", () => {
    expect(getByPath({ a: {} }, "a.b.c")).toBeUndefined();
  });
});

describe("resolveNextNode", () => {
  const definition: WorkflowDefinition = {
    startNodeId: "cond",
    nodes: [
      { id: "cond", type: "condition", config: { field: "prev.ok", equals: true } },
      { id: "yes", type: "log", config: {} },
      { id: "no", type: "log", config: {} },
    ],
    edges: [
      { from: "cond", to: "yes", when: "true" },
      { from: "cond", to: "no", when: "false" },
    ],
  };

  it("condition node follows the true edge when matched", () => {
    const node = definition.nodes[0] as WorkflowNode;
    const next = resolveNextNode(definition, node, emptyContext(), { matched: true });
    expect(next).toBe("yes");
  });

  it("condition node follows the false edge when not matched", () => {
    const node = definition.nodes[0] as WorkflowNode;
    const next = resolveNextNode(definition, node, emptyContext(), { matched: false });
    expect(next).toBe("no");
  });

  it("returns undefined when a node has no outgoing edges (run ends)", () => {
    const node: WorkflowNode = { id: "leaf", type: "log", config: {} };
    expect(resolveNextNode(definition, node, emptyContext(), {})).toBeUndefined();
  });

  it("switch node matches on the field value, falling back to a default edge", () => {
    const switchDef: WorkflowDefinition = {
      startNodeId: "sw",
      nodes: [{ id: "sw", type: "switch", config: { field: "n1.tier" } }],
      edges: [
        { from: "sw", to: "gold", when: "gold" },
        { from: "sw", to: "fallback", when: "default" },
      ],
    };
    const node = switchDef.nodes[0] as WorkflowNode;

    const matched = resolveNextNode(switchDef, node, { outputs: { n1: { tier: "gold" } }, loopCounts: {} }, {});
    expect(matched).toBe("gold");

    const unmatched = resolveNextNode(switchDef, node, { outputs: { n1: { tier: "bronze" } }, loopCounts: {} }, {});
    expect(unmatched).toBe("fallback");
  });

  it("loop node takes the loop edge until the iteration count is reached, then the done edge", () => {
    const loopDef: WorkflowDefinition = {
      startNodeId: "lp",
      nodes: [{ id: "lp", type: "loop", config: { times: 2 } }],
      edges: [
        { from: "lp", to: "body", when: "loop" },
        { from: "lp", to: "after", when: "done" },
      ],
    };
    const node = loopDef.nodes[0] as WorkflowNode;
    const context = emptyContext();

    expect(resolveNextNode(loopDef, node, context, {})).toBe("body");
    expect(context.loopCounts.lp).toBe(1);
    expect(resolveNextNode(loopDef, node, context, {})).toBe("body");
    expect(context.loopCounts.lp).toBe(2);
    expect(resolveNextNode(loopDef, node, context, {})).toBe("after");
  });

  it("linear node types take their single outgoing edge", () => {
    const linearDef: WorkflowDefinition = {
      startNodeId: "a",
      nodes: [
        { id: "a", type: "log", config: {} },
        { id: "b", type: "log", config: {} },
      ],
      edges: [{ from: "a", to: "b" }],
    };
    const node = linearDef.nodes[0] as WorkflowNode;
    expect(resolveNextNode(linearDef, node, emptyContext(), {})).toBe("b");
  });
});

"use client";

import { useMemo, useState } from "react";
import { apiListConnectors, ConnectorDto, WorkflowDefinitionDto, WorkflowEdgeDto, WorkflowNodeDto } from "@/lib/api";
import { useEffect } from "react";

const NODE_TYPES = ["trigger", "send", "wait", "log", "condition", "switch", "loop", "batch", "human_approval"] as const;
type NodeType = (typeof NODE_TYPES)[number];

const NODE_LABELS: Record<NodeType, string> = {
  trigger: "Trigger",
  send: "Send message",
  wait: "Wait",
  log: "Log",
  condition: "Condition (if/else)",
  switch: "Switch (multi-way)",
  loop: "Loop",
  batch: "Batch send",
  human_approval: "Human approval",
};

const NODE_WIDTH = 160;
const NODE_HEIGHT = 56;

function defaultConfig(type: NodeType): Record<string, unknown> {
  switch (type) {
    case "wait":
      return { delayMs: 5000 };
    case "log":
      return { message: "" };
    case "condition":
      return { field: "", equals: "" };
    case "switch":
      return { field: "" };
    case "loop":
      return { times: 1 };
    case "send":
      return { connectorId: "", toPhone: "", body: "" };
    case "batch":
      return { connectorId: "", body: "", recipients: [] };
    default:
      return {};
  }
}

let nodeCounter = 0;
function newNodeId() {
  nodeCounter += 1;
  return `n${Date.now()}_${nodeCounter}`;
}

export default function WorkflowBuilder({
  token,
  initial,
  onSave,
  onCancel,
}: {
  token: string | null;
  initial?: WorkflowDefinitionDto;
  onSave: (definition: WorkflowDefinitionDto) => void;
  onCancel: () => void;
}) {
  const [nodes, setNodes] = useState<WorkflowNodeDto[]>(
    initial?.nodes ?? [{ id: newNodeId(), type: "trigger", config: {}, position: { x: 40, y: 40 } }],
  );
  const [edges, setEdges] = useState<WorkflowEdgeDto[]>(initial?.edges ?? []);
  const [startNodeId, setStartNodeId] = useState<string>(initial?.startNodeId ?? nodes[0]?.id ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [connectors, setConnectors] = useState<ConnectorDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) apiListConnectors(token).then(setConnectors).catch(() => {});
  }, [token]);

  const selected = useMemo(() => nodes.find((n) => n.id === selectedId) ?? null, [nodes, selectedId]);

  function addNode(type: NodeType) {
    const id = newNodeId();
    setNodes((prev) => [...prev, { id, type, config: defaultConfig(type), position: { x: 40 + (prev.length % 4) * 190, y: 40 + Math.floor(prev.length / 4) * 110 } }]);
    setSelectedId(id);
  }

  function removeNode(id: string) {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.from !== id && e.to !== id));
    if (startNodeId === id) setStartNodeId("");
    if (selectedId === id) setSelectedId(null);
  }

  function updateConfig(id: string, config: Record<string, unknown>) {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, config } : n)));
  }

  function moveNode(id: string, x: number, y: number) {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, position: { x, y } } : n)));
  }

  function startConnect(id: string) {
    setConnectingFrom(id);
  }

  function finishConnect(targetId: string) {
    if (!connectingFrom || connectingFrom === targetId) {
      setConnectingFrom(null);
      return;
    }
    const source = nodes.find((n) => n.id === connectingFrom);
    let when: string | undefined;
    if (source?.type === "condition") {
      when = window.prompt('This edge fires when the condition is: type "true" or "false"', "true") ?? undefined;
    } else if (source?.type === "switch") {
      when = window.prompt('Value this edge matches (or "default" for the fallback edge):', "") ?? undefined;
    } else if (source?.type === "loop") {
      when = window.prompt('Type "loop" for the edge that repeats the body, or "done" for the edge that exits the loop:', "loop") ?? undefined;
    }
    setEdges((prev) => [...prev.filter((e) => !(e.from === connectingFrom && e.when === when)), { from: connectingFrom, to: targetId, when }]);
    setConnectingFrom(null);
  }

  function removeEdge(index: number) {
    setEdges((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    setError(null);
    if (nodes.length === 0) {
      setError("Add at least one node");
      return;
    }
    if (!startNodeId || !nodes.some((n) => n.id === startNodeId)) {
      setError("Pick a start node (click the star on a node)");
      return;
    }
    onSave({ nodes, edges, startNodeId });
  }

  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">Add node:</span>
        {NODE_TYPES.map((t) => (
          <button key={t} onClick={() => addNode(t)} className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">
            + {NODE_LABELS[t]}
          </button>
        ))}
      </div>

      {connectingFrom && (
        <p className="mb-2 rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-700">
          Click the node you want to connect to (or click the same node again to cancel).
        </p>
      )}

      <div className="flex gap-4">
        <div
          className="relative h-[420px] flex-1 overflow-auto rounded border border-dashed border-gray-300 bg-gray-50"
          style={{ minWidth: 480 }}
        >
          <svg className="pointer-events-none absolute left-0 top-0 h-full w-full" style={{ minWidth: 900, minHeight: 500 }}>
            {edges.map((e, i) => {
              const from = nodes.find((n) => n.id === e.from);
              const to = nodes.find((n) => n.id === e.to);
              if (!from?.position || !to?.position) return null;
              const x1 = from.position.x + NODE_WIDTH / 2;
              const y1 = from.position.y + NODE_HEIGHT / 2;
              const x2 = to.position.x + NODE_WIDTH / 2;
              const y2 = to.position.y + NODE_HEIGHT / 2;
              return (
                <g key={i}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#818cf8" strokeWidth={2} markerEnd="url(#arrow)" />
                  {e.when && (
                    <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 4} fontSize={10} fill="#4338ca" textAnchor="middle">
                      {e.when}
                    </text>
                  )}
                </g>
              );
            })}
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="#818cf8" />
              </marker>
            </defs>
          </svg>

          <div className="relative" style={{ minWidth: 900, minHeight: 500 }}>
            {nodes.map((node) => (
              <NodeBox
                key={node.id}
                node={node}
                isStart={node.id === startNodeId}
                isSelected={node.id === selectedId}
                isConnecting={connectingFrom === node.id}
                onSelect={() => (connectingFrom ? finishConnect(node.id) : setSelectedId(node.id))}
                onMove={(x, y) => moveNode(node.id, x, y)}
                onSetStart={() => setStartNodeId(node.id)}
                onConnect={() => startConnect(node.id)}
                onRemove={() => removeNode(node.id)}
              />
            ))}
          </div>
        </div>

        <div className="w-64 shrink-0 space-y-3">
          {selected ? (
            <NodeConfigForm node={selected} connectors={connectors} onChange={(config) => updateConfig(selected.id, config)} />
          ) : (
            <p className="text-xs text-gray-400">Select a node to edit its settings.</p>
          )}

          <div>
            <p className="mb-1 text-xs font-medium text-gray-500">Edges</p>
            <ul className="space-y-1 text-xs">
              {edges.map((e, i) => (
                <li key={i} className="flex items-center justify-between rounded border border-gray-200 px-1.5 py-1">
                  <span>
                    {e.from} → {e.to} {e.when ? `(${e.when})` : ""}
                  </span>
                  <button onClick={() => removeEdge(i)} className="text-red-500 hover:underline">
                    ✕
                  </button>
                </li>
              ))}
              {edges.length === 0 && <li className="text-gray-400">None yet — click a node's ⚡ then a target node.</li>}
            </ul>
          </div>
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button onClick={handleSave} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
          Save workflow
        </button>
        <button onClick={onCancel} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

function NodeBox({
  node,
  isStart,
  isSelected,
  isConnecting,
  onSelect,
  onMove,
  onSetStart,
  onConnect,
  onRemove,
}: {
  node: WorkflowNodeDto;
  isStart: boolean;
  isSelected: boolean;
  isConnecting: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onSetStart: () => void;
  onConnect: () => void;
  onRemove: () => void;
}) {
  const [dragging, setDragging] = useState(false);

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    setDragging(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = node.position ?? { x: 0, y: 0 };

    function handleMove(ev: MouseEvent) {
      onMove(Math.max(0, origin.x + (ev.clientX - startX)), Math.max(0, origin.y + (ev.clientY - startY)));
    }
    function handleUp() {
      setDragging(false);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      onClick={onSelect}
      className={`absolute cursor-move select-none rounded border bg-white px-2 py-1.5 text-xs shadow-sm ${
        isSelected ? "border-indigo-500 ring-2 ring-indigo-200" : isConnecting ? "border-indigo-400" : "border-gray-300"
      } ${dragging ? "opacity-70" : ""}`}
      style={{ left: node.position?.x ?? 0, top: node.position?.y ?? 0, width: NODE_WIDTH, height: NODE_HEIGHT }}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium">{isStart && "★ "}{NODE_LABELS[node.type as NodeType] ?? node.type}</span>
      </div>
      <p className="truncate text-gray-400">{node.id}</p>
      <div className="mt-1 flex gap-1 text-[11px]">
        <button onClick={(e) => { e.stopPropagation(); onSetStart(); }} title="Set as start node" className="hover:underline">
          ★
        </button>
        <button onClick={(e) => { e.stopPropagation(); onConnect(); }} title="Connect to another node" className="hover:underline">
          ⚡
        </button>
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Delete node" className="text-red-500 hover:underline">
          ✕
        </button>
      </div>
    </div>
  );
}

function NodeConfigForm({
  node,
  connectors,
  onChange,
}: {
  node: WorkflowNodeDto;
  connectors: ConnectorDto[];
  onChange: (config: Record<string, unknown>) => void;
}) {
  const c = node.config;

  function set(key: string, value: unknown) {
    onChange({ ...c, [key]: value });
  }

  return (
    <div className="space-y-2 rounded border border-gray-200 p-2">
      <p className="text-xs font-medium">{NODE_LABELS[node.type as NodeType] ?? node.type} settings</p>

      {node.type === "send" && (
        <>
          <Field label="Connector">
            <select value={String(c.connectorId ?? "")} onChange={(e) => set("connectorId", e.target.value)} className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs">
              <option value="">Select…</option>
              {connectors.map((conn) => (
                <option key={conn.id} value={conn.id}>
                  {conn.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="To phone">
            <input value={String(c.toPhone ?? "")} onChange={(e) => set("toPhone", e.target.value)} className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs" />
          </Field>
          <Field label="Body">
            <textarea value={String(c.body ?? "")} onChange={(e) => set("body", e.target.value)} rows={3} className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs" />
          </Field>
        </>
      )}

      {node.type === "batch" && (
        <>
          <Field label="Connector">
            <select value={String(c.connectorId ?? "")} onChange={(e) => set("connectorId", e.target.value)} className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs">
              <option value="">Select…</option>
              {connectors.map((conn) => (
                <option key={conn.id} value={conn.id}>
                  {conn.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Recipients (one phone per line)">
            <textarea
              value={Array.isArray(c.recipients) ? (c.recipients as string[]).join("\n") : ""}
              onChange={(e) => set("recipients", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
              rows={4}
              className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs"
            />
          </Field>
          <Field label="Body">
            <textarea value={String(c.body ?? "")} onChange={(e) => set("body", e.target.value)} rows={3} className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs" />
          </Field>
        </>
      )}

      {node.type === "wait" && (
        <Field label="Delay (ms)">
          <input type="number" value={Number(c.delayMs ?? 0)} onChange={(e) => set("delayMs", Number(e.target.value))} className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs" />
        </Field>
      )}

      {node.type === "log" && (
        <Field label="Message">
          <input value={String(c.message ?? "")} onChange={(e) => set("message", e.target.value)} className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs" />
        </Field>
      )}

      {node.type === "condition" && (
        <>
          <Field label="Field (dot path, e.g. n1.status)">
            <input value={String(c.field ?? "")} onChange={(e) => set("field", e.target.value)} className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs" />
          </Field>
          <Field label="Equals">
            <input value={String(c.equals ?? "")} onChange={(e) => set("equals", e.target.value)} className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs" />
          </Field>
        </>
      )}

      {node.type === "switch" && (
        <Field label="Field (dot path)">
          <input value={String(c.field ?? "")} onChange={(e) => set("field", e.target.value)} className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs" />
        </Field>
      )}

      {node.type === "loop" && (
        <Field label="Times">
          <input type="number" value={Number(c.times ?? 0)} onChange={(e) => set("times", Number(e.target.value))} className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs" />
        </Field>
      )}

      {(node.type === "trigger" || node.type === "human_approval") && <p className="text-[11px] text-gray-400">No settings for this node type.</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] text-gray-500">{label}</span>
      {children}
    </label>
  );
}

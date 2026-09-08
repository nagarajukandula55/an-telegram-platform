"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthToken } from "@/lib/useAuth";
import {
  apiListWorkflows,
  apiCreateWorkflow,
  apiTriggerWorkflow,
  apiWorkflowRuns,
  apiApproveWorkflowRun,
  WorkflowDto,
  WorkflowDefinitionDto,
} from "@/lib/api";
import WorkflowBuilder from "./WorkflowBuilder";

const EXAMPLE_DEFINITION: WorkflowDefinitionDto = {
  nodes: [
    { id: "n1", type: "log", config: { message: "workflow started" }, position: { x: 40, y: 40 } },
    { id: "n2", type: "wait", config: { delayMs: 5000 }, position: { x: 230, y: 40 } },
    { id: "n3", type: "log", config: { message: "workflow finished" }, position: { x: 420, y: 40 } },
  ],
  edges: [
    { from: "n1", to: "n2" },
    { from: "n2", to: "n3" },
  ],
  startNodeId: "n1",
};

export default function WorkflowsPage() {
  const token = useAuthToken();
  const [workflows, setWorkflows] = useState<WorkflowDto[]>([]);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"builder" | "json" | null>(null);
  const [definitionJson, setDefinitionJson] = useState(JSON.stringify(EXAMPLE_DEFINITION, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [runsFor, setRunsFor] = useState<string | null>(null);
  const [runs, setRuns] = useState<Array<{ id: string; status: string; startedAt: string; finishedAt: string | null }>>([]);

  const refresh = useCallback(() => {
    if (!token) return;
    apiListWorkflows(token).then(setWorkflows).catch((err) => setError(err.message));
  }, [token]);

  useEffect(refresh, [refresh]);

  async function saveWorkflow(definition: WorkflowDefinitionDto) {
    if (!token) return;
    setError(null);
    try {
      await apiCreateWorkflow(token, { name, definition });
      setName("");
      setMode(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workflow");
    }
  }

  async function handleJsonCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const definition = JSON.parse(definitionJson) as WorkflowDefinitionDto;
      await saveWorkflow(definition);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workflow");
    }
  }

  async function handleTrigger(id: string) {
    if (!token) return;
    setError(null);
    try {
      await apiTriggerWorkflow(token, id);
      await handleViewRuns(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger workflow");
    }
  }

  async function handleViewRuns(id: string) {
    if (!token) return;
    setRunsFor(id);
    const list = await apiWorkflowRuns(token, id);
    setRuns(list);
  }

  async function handleApprove(runId: string) {
    if (!token || !runsFor) return;
    await apiApproveWorkflowRun(token, runId);
    await handleViewRuns(runsFor);
  }

  return (
    <div className="max-w-5xl">
      <h1 className="mb-6 text-xl font-semibold">Workflows</h1>

      {mode === null && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workflow name"
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <button
            onClick={() => setMode("builder")}
            disabled={!name}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Open visual builder
          </button>
          <button
            onClick={() => setMode("json")}
            disabled={!name}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Advanced: raw JSON
          </button>
        </div>
      )}

      {mode === "builder" && <WorkflowBuilder token={token} onSave={saveWorkflow} onCancel={() => setMode(null)} />}

      {mode === "json" && (
        <form onSubmit={handleJsonCreate} className="mb-6 space-y-3 rounded-lg border border-gray-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-xs text-gray-500">
              Definition (JSON — {"{ nodes, edges, startNodeId }"}; node types: trigger/send/wait/log/condition/switch/loop/batch/human_approval)
            </label>
            <textarea
              value={definitionJson}
              onChange={(e) => setDefinitionJson(e.target.value)}
              rows={14}
              className="w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
              Create workflow
            </button>
            <button type="button" onClick={() => setMode(null)} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Active</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {workflows.map((w) => (
              <tr key={w.id} className="border-t border-gray-100">
                <td className="px-4 py-2">{w.name}</td>
                <td className="px-4 py-2">{w.isActive ? "Yes" : "No"}</td>
                <td className="space-x-2 px-4 py-2 text-right">
                  <button onClick={() => handleTrigger(w.id)} className="text-indigo-600 hover:underline">
                    Trigger
                  </button>
                  <button onClick={() => handleViewRuns(w.id)} className="text-gray-500 hover:underline">
                    Runs
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {runsFor && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-medium">Runs</h2>
          {runs.length === 0 && <p className="text-sm text-gray-400">No runs yet.</p>}
          <ul className="space-y-2 text-sm">
            {runs.map((r) => (
              <li key={r.id} className="flex items-center justify-between border-b border-gray-100 pb-2">
                <span>
                  {r.id.slice(0, 8)} — {r.status} — started {new Date(r.startedAt).toLocaleString()}
                </span>
                {r.status === "awaiting_approval" && (
                  <button onClick={() => handleApprove(r.id)} className="text-indigo-600 hover:underline">
                    Approve & resume
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

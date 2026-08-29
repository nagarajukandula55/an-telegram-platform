"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthToken } from "@/lib/useAuth";
import { apiListGroups, apiCreateGroup, apiListConnectors, GroupDto, ConnectorDto } from "@/lib/api";

export default function GroupsPage() {
  const token = useAuthToken();
  const [groups, setGroups] = useState<GroupDto[]>([]);
  const [connectors, setConnectors] = useState<ConnectorDto[]>([]);
  const [connectorId, setConnectorId] = useState("");
  const [name, setName] = useState("");
  const [alias, setAlias] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!token) return;
    apiListGroups(token).then(setGroups).catch((err) => setError(err.message));
  }, [token]);

  useEffect(refresh, [refresh]);
  useEffect(() => {
    if (!token) return;
    apiListConnectors(token).then((list) => {
      const webConnectors = list.filter((c) => c.type === "TELEGRAM_MTPROTO");
      setConnectors(webConnectors.length > 0 ? webConnectors : list);
      if (list[0]) setConnectorId(list[0].id);
    });
  }, [token]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    try {
      await apiCreateGroup(token, { connectorId, name, alias: alias || undefined });
      setName("");
      setAlias("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add group");
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-2 text-xl font-semibold">Groups</h1>
      <p className="mb-6 text-sm text-gray-500">
        For Telegram MTProto sends: the <span className="font-medium">Name</span> must exactly match the group/chat&rsquo;s
        display name in Telegram — the desktop agent searches for it by that text when sending.
      </p>

      <form onSubmit={handleCreate} className="mb-6 space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-gray-500">Group / chat name (exact)</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded border border-gray-300 px-2 py-1 text-sm" placeholder="e.g. AP Service Team" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Connector</label>
            <select value={connectorId} onChange={(e) => setConnectorId(e.target.value)} required className="rounded border border-gray-300 px-2 py-1 text-sm">
              {connectors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Alias (optional, for your own reference)</label>
          <input value={alias} onChange={(e) => setAlias(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
          Add group
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Alias</th>
              <th className="px-4 py-2">Added</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                  No groups yet.
                </td>
              </tr>
            ) : (
              groups.map((g) => (
                <tr key={g.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{g.name}</td>
                  <td className="px-4 py-2">{g.alias ?? "—"}</td>
                  <td className="px-4 py-2">{new Date(g.createdAt).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

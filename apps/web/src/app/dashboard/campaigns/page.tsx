"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthToken } from "@/lib/useAuth";
import {
  apiListCampaigns,
  apiCreateCampaign,
  apiLaunchCampaign,
  apiCampaignReport,
  apiListConnectors,
  apiListContacts,
  apiListGroups,
  apiListTemplates,
  apiCreateTemplate,
  downloadCampaignReportCsv,
  CampaignDto,
  ConnectorDto,
  GroupDto,
  TemplateDto,
} from "@/lib/api";

export default function CampaignsPage() {
  const token = useAuthToken();
  const [campaigns, setCampaigns] = useState<CampaignDto[]>([]);
  const [connectors, setConnectors] = useState<ConnectorDto[]>([]);
  const [contacts, setContacts] = useState<Array<{ id: string; name: string | null; phone: string }>>([]);
  const [groups, setGroups] = useState<GroupDto[]>([]);
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [name, setName] = useState("");
  const [connectorId, setConnectorId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateBody, setNewTemplateBody] = useState("");

  const refresh = useCallback(() => {
    if (!token) return;
    apiListCampaigns(token).then(setCampaigns).catch((err) => setError(err.message));
  }, [token]);

  useEffect(refresh, [refresh]);
  useEffect(() => {
    if (!token) return;
    apiListConnectors(token).then((list) => {
      setConnectors(list);
      if (list[0]) setConnectorId(list[0].id);
    });
    apiListContacts(token).then(setContacts);
    apiListGroups(token).then(setGroups);
    refreshTemplates();
  }, [token]);

  function refreshTemplates() {
    if (!token) return;
    apiListTemplates(token).then(setTemplates).catch(() => {});
  }

  const selectedConnector = connectors.find((c) => c.id === connectorId);
  const supportsGroups = selectedConnector?.capabilities.groups ?? false;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    try {
      await apiCreateCampaign(token, {
        name,
        connectorId,
        templateId: templateId || undefined,
        recipientContactIds: selectedContactIds.length ? selectedContactIds : undefined,
        recipientGroupIds: selectedGroupIds.length ? selectedGroupIds : undefined,
      });
      setName("");
      setSelectedContactIds([]);
      setSelectedGroupIds([]);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
    }
  }

  async function handleLaunch(id: string) {
    if (!token) return;
    setError(null);
    try {
      await apiLaunchCampaign(token, id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to launch campaign");
    }
  }

  async function handleReport(id: string) {
    if (!token) return;
    setReportFor(id);
    const r = await apiCampaignReport(token, id);
    setReport(r);
  }

  async function handleExportCsv(id: string, name: string) {
    if (!token) return;
    setError(null);
    try {
      await downloadCampaignReportCsv(token, id, `${name.replace(/[^\w-]+/g, "_")}-report.csv`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export report");
    }
  }

  async function handleCreateTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    try {
      const created = await apiCreateTemplate(token, { name: newTemplateName, body: newTemplateBody });
      setNewTemplateName("");
      setNewTemplateBody("");
      setShowNewTemplate(false);
      refreshTemplates();
      setTemplateId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create template");
    }
  }

  function toggleContact(id: string) {
    setSelectedContactIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleGroup(id: string) {
    setSelectedGroupIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-xl font-semibold">Campaigns</h1>

      <form onSubmit={handleCreate} className="mb-6 space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-gray-500">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Connector</label>
            <select value={connectorId} onChange={(e) => setConnectorId(e.target.value)} required className="rounded border border-gray-300 px-2 py-1 text-sm">
              {connectors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Contacts ({selectedContactIds.length} selected)</label>
          <div className="max-h-32 overflow-auto rounded border border-gray-200 p-2 text-sm">
            {contacts.map((c) => (
              <label key={c.id} className="flex items-center gap-2 py-0.5">
                <input type="checkbox" checked={selectedContactIds.includes(c.id)} onChange={() => toggleContact(c.id)} />
                {c.name ?? c.phone} ({c.phone})
              </label>
            ))}
            {contacts.length === 0 && <p className="text-gray-400">No contacts — add some on the Contacts page first.</p>}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Message template</label>
          <div className="flex gap-2">
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm">
              <option value="">No template (empty body)</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setShowNewTemplate((v) => !v)} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
              {showNewTemplate ? "Cancel" : "+ New template"}
            </button>
          </div>
          {showNewTemplate && (
            <div className="mt-2 space-y-2 rounded border border-gray-200 p-2">
              <input
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="Template name"
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <textarea
                value={newTemplateBody}
                onChange={(e) => setNewTemplateBody(e.target.value)}
                placeholder="Message body — use {{contact.name}}, {{contact.company}}, {{variables.x}} to personalize per recipient"
                rows={3}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={handleCreateTemplate}
                disabled={!newTemplateName || !newTemplateBody}
                className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Save template
              </button>
            </div>
          )}
        </div>
        {supportsGroups && (
          <div>
            <label className="mb-1 block text-xs text-gray-500">Groups ({selectedGroupIds.length} selected)</label>
            <div className="max-h-32 overflow-auto rounded border border-gray-200 p-2 text-sm">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-2 py-0.5">
                  <input type="checkbox" checked={selectedGroupIds.includes(g.id)} onChange={() => toggleGroup(g.id)} />
                  {g.alias ?? g.name}
                </label>
              ))}
              {groups.length === 0 && <p className="text-gray-400">No groups — add some on the Groups page first.</p>}
            </div>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
          Create campaign
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Recipients</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="border-t border-gray-100">
                <td className="px-4 py-2">{c.name}</td>
                <td className="px-4 py-2">{c.status}</td>
                <td className="px-4 py-2">{c._count?.recipients ?? "—"}</td>
                <td className="space-x-2 px-4 py-2 text-right">
                  <button onClick={() => handleLaunch(c.id)} className="text-indigo-600 hover:underline">
                    Launch
                  </button>
                  <button onClick={() => handleReport(c.id)} className="text-gray-500 hover:underline">
                    Report
                  </button>
                  <button onClick={() => handleExportCsv(c.id, c.name)} className="text-gray-500 hover:underline">
                    Export CSV
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reportFor && report && (
        <pre className="mt-4 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs">{JSON.stringify(report, null, 2)}</pre>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  apiListConnectors,
  apiListContacts,
  apiListGroups,
  apiListTemplates,
  apiCreateTemplate,
  apiCreateCampaign,
  ConnectorDto,
  GroupDto,
  TemplateDto,
} from "@/lib/api";

const STEPS = ["Audience", "Message", "Review & launch"] as const;

/** Client-side mirror of packages/messaging-core's renderTemplate() — preview only, the server does the real render at send time. */
function previewTemplate(body: string, sample: Record<string, unknown>): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, path: string) => {
    const value = path.split(".").reduce<unknown>((acc: unknown, key: string) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), sample);
    return value === undefined || value === null ? match : String(value);
  });
}

export default function CampaignWizard({
  token,
  onCreated,
  onCancel,
}: {
  token: string | null;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [connectors, setConnectors] = useState<ConnectorDto[]>([]);
  const [contacts, setContacts] = useState<Array<{ id: string; name: string | null; phone: string }>>([]);
  const [groups, setGroups] = useState<GroupDto[]>([]);
  const [templates, setTemplates] = useState<TemplateDto[]>([]);

  const [name, setName] = useState("");
  const [connectorId, setConnectorId] = useState("");
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateBody, setNewTemplateBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
  const selectedTemplate = templates.find((t) => t.id === templateId);
  const recipientCount = selectedContactIds.length + selectedGroupIds.length;

  const sampleContact = contacts.find((c) => selectedContactIds.includes(c.id)) ?? contacts[0];
  const previewBody = selectedTemplate
    ? previewTemplate(selectedTemplate.body, { contact: { name: sampleContact?.name ?? "Jane Doe", phone: sampleContact?.phone ?? "+15551234567" } })
    : "";

  function toggleContact(id: string) {
    setSelectedContactIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleGroup(id: string) {
    setSelectedGroupIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleCreateTemplate() {
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

  function goNext() {
    setError(null);
    if (step === 0) {
      if (!name.trim()) return setError("Give this campaign a name");
      if (!connectorId) return setError("Pick a connector");
      if (recipientCount === 0) return setError("Select at least one contact or group");
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit() {
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiCreateCampaign(token, {
        name,
        connectorId,
        templateId: templateId || undefined,
        recipientContactIds: selectedContactIds.length ? selectedContactIds : undefined,
        recipientGroupIds: selectedGroupIds.length ? selectedGroupIds : undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-4 flex items-center gap-2 text-sm">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${i === step ? "bg-indigo-600 text-white" : i < step ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-400"}`}>
              {i + 1}
            </span>
            <span className={i === step ? "font-medium text-gray-900" : "text-gray-400"}>{label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 text-gray-300">→</span>}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-gray-500">Campaign name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Connector</label>
              <select value={connectorId} onChange={(e) => setConnectorId(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm">
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
            <div className="max-h-40 overflow-auto rounded border border-gray-200 p-2 text-sm">
              {contacts.map((c) => (
                <label key={c.id} className="flex items-center gap-2 py-0.5">
                  <input type="checkbox" checked={selectedContactIds.includes(c.id)} onChange={() => toggleContact(c.id)} />
                  {c.name ?? c.phone} ({c.phone})
                </label>
              ))}
              {contacts.length === 0 && <p className="text-gray-400">No contacts — add some on the Contacts page first.</p>}
            </div>
          </div>
          {supportsGroups && (
            <div>
              <label className="mb-1 block text-xs text-gray-500">Groups ({selectedGroupIds.length} selected)</label>
              <div className="max-h-40 overflow-auto rounded border border-gray-200 p-2 text-sm">
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
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
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
          </div>

          {showNewTemplate && (
            <div className="space-y-2 rounded border border-gray-200 p-2">
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

          {selectedTemplate && (
            <div>
              <p className="mb-1 text-xs text-gray-500">Preview (rendered against {sampleContact ? "your first selected contact" : "a sample contact"}):</p>
              <div className="rounded border border-gray-200 bg-gray-50 p-2 text-sm">{previewBody}</div>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-2 text-sm">
          <p>
            <span className="text-gray-500">Name:</span> {name}
          </p>
          <p>
            <span className="text-gray-500">Connector:</span> {selectedConnector?.name ?? "—"}
          </p>
          <p>
            <span className="text-gray-500">Recipients:</span> {selectedContactIds.length} contact(s), {selectedGroupIds.length} group(s)
          </p>
          <p>
            <span className="text-gray-500">Template:</span> {selectedTemplate?.name ?? "None (empty body)"}
          </p>
          {selectedTemplate && <div className="rounded border border-gray-200 bg-gray-50 p-2">{previewBody}</div>}
          <p className="text-xs text-gray-400">
            This creates the campaign as a draft (or waiting-approval if the recipient count is large) — it does not send anything yet. Launch it from the campaigns list afterward.
          </p>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex justify-between">
        <div>
          {step > 0 && (
            <button onClick={goBack} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
              Back
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          {step < STEPS.length - 1 ? (
            <button onClick={goNext} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
              Next
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={submitting} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {submitting ? "Creating…" : "Create campaign"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

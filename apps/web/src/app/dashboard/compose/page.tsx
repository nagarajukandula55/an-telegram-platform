"use client";

import { useEffect, useState } from "react";
import { useAuthToken } from "@/lib/useAuth";
import { apiListConnectors, apiListGroups, apiSendMessage, apiUploadAttachment, ConnectorDto, GroupDto } from "@/lib/api";

export default function ComposePage() {
  const token = useAuthToken();
  const [connectors, setConnectors] = useState<ConnectorDto[]>([]);
  const [groups, setGroups] = useState<GroupDto[]>([]);
  const [connectorId, setConnectorId] = useState("");
  const [recipientMode, setRecipientMode] = useState<"contact" | "group">("contact");
  const [toPhone, setToPhone] = useState("");
  const [toGroupId, setToGroupId] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [watermarkText, setWatermarkText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiListConnectors(token).then((list) => {
      setConnectors(list);
      if (list[0]) setConnectorId(list[0].id);
    });
    apiListGroups(token).then((list) => {
      setGroups(list);
      if (list[0]) setToGroupId(list[0].id);
    });
  }, [token]);

  const selectedConnector = connectors.find((c) => c.id === connectorId);
  const supportsGroups = selectedConnector?.capabilities.groups ?? false;

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      let attachmentId: string | undefined;
      if (file) {
        const uploaded = await apiUploadAttachment(token, file, watermarkText || undefined);
        attachmentId = uploaded.id;
      }
      const message = await apiSendMessage(token, {
        connectorId,
        toPhone: recipientMode === "contact" ? toPhone : undefined,
        toGroupId: recipientMode === "group" ? toGroupId : undefined,
        contentType: file ? "document" : "text",
        body,
        attachmentId,
      });
      setResult(JSON.stringify(message, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 text-xl font-semibold">Compose</h1>

      <form onSubmit={handleSend} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs text-gray-500">Connector</label>
          <select value={connectorId} onChange={(e) => setConnectorId(e.target.value)} required className="w-full rounded border border-gray-300 px-2 py-1 text-sm">
            <option value="" disabled>
              Select a connector…
            </option>
            {connectors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type})
              </option>
            ))}
          </select>
          {connectors.length === 0 && <p className="mt-1 text-xs text-amber-600">No connectors yet — create one on the Connectors page first.</p>}
        </div>

        <div>
          <label className="mb-1 block text-xs text-gray-500">Send to</label>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={recipientMode === "contact"} onChange={() => setRecipientMode("contact")} />
              A contact
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={recipientMode === "group"}
                disabled={!supportsGroups}
                onChange={() => setRecipientMode("group")}
              />
              A group/chat {!supportsGroups && "(connector doesn't support groups)"}
            </label>
          </div>
        </div>

        {recipientMode === "contact" ? (
          <div>
            <label className="mb-1 block text-xs text-gray-500">Recipient phone</label>
            <input value={toPhone} onChange={(e) => setToPhone(e.target.value)} required placeholder="+91..." className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs text-gray-500">Group</label>
            <select value={toGroupId} onChange={(e) => setToGroupId(e.target.value)} required className="w-full rounded border border-gray-300 px-2 py-1 text-sm">
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.alias ?? g.name}
                </option>
              ))}
            </select>
            {groups.length === 0 && <p className="mt-1 text-xs text-amber-600">No groups yet — add one on the Groups page first.</p>}
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs text-gray-500">Message</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} required className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Attachment (optional)</label>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
          {file && (file.type === "image/jpeg" || file.type === "image/png") && (
            <input
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
              placeholder="Watermark text (optional, e.g. your org name)"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
            />
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={sending || !connectorId}
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </form>

      {result && <pre className="mt-4 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs">{result}</pre>}
    </div>
  );
}

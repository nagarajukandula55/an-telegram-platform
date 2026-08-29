"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthToken } from "@/lib/useAuth";
import { apiListConnectors, apiCreateConnector, ConnectorDto } from "@/lib/api";

const CAPABILITY_KEYS = ["text", "image", "video", "audio", "document", "sticker", "location", "interactive", "groups", "templates", "webhooks"];

export default function ConnectorsPage() {
  const token = useAuthToken();
  const [connectors, setConnectors] = useState<ConnectorDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<"TELEGRAM_BOT" | "CUSTOM_MIDDLEWARE" | "TELEGRAM_MTPROTO">("TELEGRAM_BOT");
  const [configJson, setConfigJson] = useState('{\n  "phoneNumberId": ""\n}');
  const [credentialRef, setCredentialRef] = useState("WHATSAPP_CLOUD_ACCESS_TOKEN");

  const refresh = useCallback(() => {
    if (!token) return;
    apiListConnectors(token).then(setConnectors).catch((err) => setError(err.message));
  }, [token]);

  useEffect(refresh, [refresh]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    try {
      const config = JSON.parse(configJson);
      const capabilities = Object.fromEntries(CAPABILITY_KEYS.map((k) => [k, defaultCapability(type, k)]));
      await apiCreateConnector(token, { name, type, config, capabilities, credentialRef: credentialRef || undefined });
      setName("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create connector");
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-xl font-semibold">Connectors</h1>

      <form onSubmit={handleCreate} className="mb-6 space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-gray-500">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="rounded border border-gray-300 px-2 py-1 text-sm">
              <option value="TELEGRAM_BOT">Telegram Bot API</option>
              <option value="CUSTOM_MIDDLEWARE">Custom middleware</option>
              <option value="TELEGRAM_MTPROTO">Telegram MTProto (desktop agent)</option>
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Config (JSON)</label>
          <textarea
            value={configJson}
            onChange={(e) => setConfigJson(e.target.value)}
            rows={4}
            className="w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs"
          />
          <p className="mt-1 text-xs text-gray-400">
            Cloud API: <code>{`{"phoneNumberId": "..."}`}</code> · Custom middleware: <code>{`{"endpointUrl": "..."}`}</code> · Telegram MTProto: <code>{`{"agentUrl": "http://127.0.0.1:8787"}`}</code>
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Credential env var name</label>
          <input value={credentialRef} onChange={(e) => setCredentialRef(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
          <p className="mt-1 text-xs text-gray-400">Name of the env var on the API/worker holding the secret — never the secret itself.</p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
          Create connector
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Enabled</th>
              <th className="px-4 py-2">Id (use for compose/campaigns)</th>
            </tr>
          </thead>
          <tbody>
            {connectors.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  No connectors yet.
                </td>
              </tr>
            ) : (
              connectors.map((c) => (
                <tr key={c.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2">{c.type}</td>
                  <td className="px-4 py-2">{c.isEnabled ? "Yes" : "No"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{c.id}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function defaultCapability(type: string, key: string): boolean {
  if (type === "TELEGRAM_BOT") return !["groups"].includes(key);
  if (type === "TELEGRAM_MTPROTO") return ["text", "image", "video", "audio", "document", "groups"].includes(key);
  return ["text", "image", "document"].includes(key);
}

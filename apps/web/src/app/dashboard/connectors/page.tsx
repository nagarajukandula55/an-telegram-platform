"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthToken } from "@/lib/useAuth";
import {
  apiListConnectors,
  apiCreateConnector,
  apiSetConnectorRateLimits,
  apiMtprotoLoginStart,
  apiMtprotoLoginCode,
  apiMtprotoLoginPassword,
  apiMtprotoLoginFinalize,
  apiGetWebhookSecret,
  apiRegenerateWebhookSecret,
  ConnectorDto,
} from "@/lib/api";

const CAPABILITY_KEYS = ["text", "image", "video", "audio", "document", "sticker", "location", "interactive", "groups", "templates", "webhooks"];

export default function ConnectorsPage() {
  const token = useAuthToken();
  const [connectors, setConnectors] = useState<ConnectorDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!token) return;
    apiListConnectors(token).then(setConnectors).catch((err) => setError(err.message));
  }, [token]);

  useEffect(refresh, [refresh]);

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-xl font-semibold">Connectors</h1>

      <CreateConnectorForm token={token} onCreated={refresh} onError={setError} />
      <MtprotoLoginForm token={token} onCreated={refresh} onError={setError} />

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Enabled</th>
              <th className="px-4 py-2">Id (use for compose/campaigns)</th>
              <th className="px-4 py-2">Send caps (per min/hr/day)</th>
              <th className="px-4 py-2">Webhook secret</th>
            </tr>
          </thead>
          <tbody>
            {connectors.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  No connectors yet.
                </td>
              </tr>
            ) : (
              connectors.map((c) => (
                <ConnectorRow key={c.id} connector={c} token={token} onUpdated={refresh} onError={setError} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateConnectorForm({
  token,
  onCreated,
  onError,
}: {
  token: string | null;
  onCreated: () => void;
  onError: (msg: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"TELEGRAM_BOT" | "CUSTOM_MIDDLEWARE">("TELEGRAM_BOT");
  const [configJson, setConfigJson] = useState("{}");
  const [credentialRef, setCredentialRef] = useState("TELEGRAM_BOT_TOKEN");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    onError(null);
    try {
      const config = JSON.parse(configJson);
      const capabilities = Object.fromEntries(CAPABILITY_KEYS.map((k) => [k, defaultCapability(type, k)]));
      await apiCreateConnector(token, { name, type, config, capabilities, credentialRef: credentialRef || undefined });
      setName("");
      onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to create connector");
    }
  }

  return (
    <form onSubmit={handleCreate} className="mb-6 space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm font-medium">Telegram Bot API / Custom middleware</p>
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
          Telegram Bot API: <code>{`{}`}</code> (token comes from the credential env var below) · Custom middleware: <code>{`{"endpointUrl": "..."}`}</code>
        </p>
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Credential env var name</label>
        <input value={credentialRef} onChange={(e) => setCredentialRef(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
        <p className="mt-1 text-xs text-gray-400">Name of the env var on the API/worker holding the secret — never the secret itself.</p>
      </div>
      <button type="submit" className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
        Create connector
      </button>
    </form>
  );
}

type MtprotoStep = "phone" | "code" | "password" | "name";

function MtprotoLoginForm({
  token,
  onCreated,
  onError,
}: {
  token: string | null;
  onCreated: () => void;
  onError: (msg: string | null) => void;
}) {
  const [step, setStep] = useState<MtprotoStep>("phone");
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loginAttemptId, setLoginAttemptId] = useState<string | null>(null);
  const [sessionString, setSessionString] = useState<string | null>(null);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    onError(null);
    try {
      const { loginAttemptId: id } = await apiMtprotoLoginStart(token, { apiId: Number(apiId), apiHash, phoneNumber });
      setLoginAttemptId(id);
      setStep("code");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to start login");
    }
  }

  async function handleCode(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !loginAttemptId) return;
    onError(null);
    try {
      const result = await apiMtprotoLoginCode(token, { loginAttemptId, code });
      if (result.status === "needs_password") {
        setStep("password");
      } else {
        setSessionString(result.sessionString);
        setStep("name");
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to submit code");
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !loginAttemptId) return;
    onError(null);
    try {
      const result = await apiMtprotoLoginPassword(token, { loginAttemptId, password });
      setSessionString(result.sessionString);
      setStep("name");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to submit password");
    }
  }

  async function handleFinalize(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !loginAttemptId || !sessionString) return;
    onError(null);
    try {
      await apiMtprotoLoginFinalize(token, { loginAttemptId, sessionString, name });
      setStep("phone");
      setApiId("");
      setApiHash("");
      setPhoneNumber("");
      setCode("");
      setPassword("");
      setName("");
      setLoginAttemptId(null);
      setSessionString(null);
      onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to finalize connector");
    }
  }

  return (
    <div className="mb-6 space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm font-medium">Telegram MTProto — log in with your own number</p>
      <p className="text-xs text-gray-400">
        One-time interactive login (spec non-negotiable: never automated). Get an API ID/hash from{" "}
        <code>my.telegram.org</code> → API Development Tools.
      </p>

      {step === "phone" && (
        <form onSubmit={handleStart} className="space-y-2">
          <div className="flex gap-3">
            <input placeholder="API ID" value={apiId} onChange={(e) => setApiId(e.target.value)} required className="w-28 rounded border border-gray-300 px-2 py-1 text-sm" />
            <input placeholder="API hash" value={apiHash} onChange={(e) => setApiHash(e.target.value)} required className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm" />
          </div>
          <input placeholder="Phone number (+1...)" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
          <button type="submit" className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
            Send code
          </button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={handleCode} className="space-y-2">
          <input placeholder="Login code from Telegram" value={code} onChange={(e) => setCode(e.target.value)} required className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
          <button type="submit" className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
            Submit code
          </button>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={handlePassword} className="space-y-2">
          <input type="password" placeholder="2FA password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
          <button type="submit" className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
            Submit password
          </button>
        </form>
      )}

      {step === "name" && (
        <form onSubmit={handleFinalize} className="space-y-2">
          <input placeholder="Connector name" value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
          <button type="submit" className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
            Finish — create connector
          </button>
        </form>
      )}
    </div>
  );
}

function ConnectorRow({
  connector,
  token,
  onUpdated,
  onError,
}: {
  connector: ConnectorDto;
  token: string | null;
  onUpdated: () => void;
  onError: (msg: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [perMinute, setPerMinute] = useState(connector.rateLimitPerMinute?.toString() ?? "");
  const [perHour, setPerHour] = useState(connector.rateLimitPerHour?.toString() ?? "");
  const [perDay, setPerDay] = useState(connector.rateLimitPerDay?.toString() ?? "");

  async function save() {
    if (!token) return;
    onError(null);
    try {
      await apiSetConnectorRateLimits(token, connector.id, {
        rateLimitPerMinute: perMinute ? Number(perMinute) : null,
        rateLimitPerHour: perHour ? Number(perHour) : null,
        rateLimitPerDay: perDay ? Number(perDay) : null,
      });
      setEditing(false);
      onUpdated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to update send caps");
    }
  }

  return (
    <tr className="border-t border-gray-100 align-top">
      <td className="px-4 py-2">{connector.name}</td>
      <td className="px-4 py-2">{connector.type}</td>
      <td className="px-4 py-2">{connector.isEnabled ? "Yes" : "No"}</td>
      <td className="px-4 py-2 font-mono text-xs text-gray-500">{connector.id}</td>
      <td className="px-4 py-2">
        {editing ? (
          <div className="flex items-center gap-1">
            <input value={perMinute} onChange={(e) => setPerMinute(e.target.value)} placeholder="∞" className="w-14 rounded border border-gray-300 px-1 py-0.5 text-xs" />
            <span className="text-xs text-gray-400">/</span>
            <input value={perHour} onChange={(e) => setPerHour(e.target.value)} placeholder="∞" className="w-14 rounded border border-gray-300 px-1 py-0.5 text-xs" />
            <span className="text-xs text-gray-400">/</span>
            <input value={perDay} onChange={(e) => setPerDay(e.target.value)} placeholder="∞" className="w-14 rounded border border-gray-300 px-1 py-0.5 text-xs" />
            <button onClick={save} className="ml-1 rounded bg-indigo-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-indigo-700">
              Save
            </button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="text-xs text-indigo-600 hover:underline">
            {connector.rateLimitPerMinute ?? "∞"} / {connector.rateLimitPerHour ?? "∞"} / {connector.rateLimitPerDay ?? "∞"}
          </button>
        )}
      </td>
      <td className="px-4 py-2">{connector.type === "TELEGRAM_BOT" && <WebhookSecretCell connector={connector} token={token} onError={onError} />}</td>
    </tr>
  );
}

function WebhookSecretCell({
  connector,
  token,
  onError,
}: {
  connector: ConnectorDto;
  token: string | null;
  onError: (msg: string | null) => void;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);

  async function reveal() {
    if (!token) return;
    onError(null);
    try {
      const { webhookSecret } = await apiGetWebhookSecret(token, connector.id);
      setRevealed(webhookSecret ?? "(none — regenerate to create one)");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to fetch webhook secret");
    }
  }

  async function regenerate() {
    if (!token) return;
    onError(null);
    try {
      const { webhookSecret } = await apiRegenerateWebhookSecret(token, connector.id);
      setRevealed(webhookSecret);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to regenerate webhook secret");
    }
  }

  if (revealed) {
    return (
      <div className="max-w-[14rem]">
        <p className="break-all font-mono text-xs text-gray-600">{revealed}</p>
        <p className="mt-0.5 text-[11px] text-gray-400">Set this as `secret_token` in Telegram's setWebhook call.</p>
        <button onClick={regenerate} className="mt-1 text-xs text-indigo-600 hover:underline">
          Regenerate
        </button>
      </div>
    );
  }

  return (
    <button onClick={reveal} className="text-xs text-indigo-600 hover:underline">
      {connector.hasWebhookSecret ? "Reveal" : "Generate"}
    </button>
  );
}

function defaultCapability(type: string, key: string): boolean {
  if (type === "TELEGRAM_BOT") return !["groups"].includes(key);
  return ["text", "image", "document"].includes(key);
}

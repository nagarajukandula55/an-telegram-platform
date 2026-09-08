"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthToken } from "@/lib/useAuth";
import {
  apiListConversations,
  apiGetConversation,
  apiAssignConversation,
  apiSetConversationStatus,
  apiReplyConversation,
  apiListUsers,
  apiAiStatus,
  apiDraftReply,
  apiTranslate,
  ConversationDto,
  TeamMemberDto,
} from "@/lib/api";

const STATUS_TABS = ["open", "pending", "closed"] as const;

function slaAge(lastInboundAt: string | null): { label: string; urgent: boolean } {
  if (!lastInboundAt) return { label: "—", urgent: false };
  const minutes = Math.floor((Date.now() - new Date(lastInboundAt).getTime()) / 60_000);
  if (minutes < 60) return { label: `${minutes}m`, urgent: minutes > 30 };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { label: `${hours}h`, urgent: true };
  return { label: `${Math.floor(hours / 24)}d`, urgent: true };
}

export default function InboxPage() {
  const token = useAuthToken();
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]>("open");
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ConversationDto | null>(null);
  const [team, setTeam] = useState<TeamMemberDto[]>([]);
  const [replyBody, setReplyBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [drafting, setDrafting] = useState(false);

  const refresh = useCallback(() => {
    if (!token) return;
    apiListConversations(token, status).then(setConversations).catch((err) => setError(err.message));
  }, [token, status]);

  useEffect(refresh, [refresh]);
  useEffect(() => {
    if (!token) return;
    apiListUsers(token).then(setTeam).catch(() => {});
    apiAiStatus(token).then((r) => setAiEnabled(r.enabled)).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token || !selectedId) {
      setSelected(null);
      return;
    }
    apiGetConversation(token, selectedId).then(setSelected).catch((err) => setError(err.message));
  }, [token, selectedId]);

  async function handleAssign(userId: string) {
    if (!token || !selectedId) return;
    setError(null);
    try {
      await apiAssignConversation(token, selectedId, userId || null);
      const updated = await apiGetConversation(token, selectedId);
      setSelected(updated);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign conversation");
    }
  }

  async function handleSetStatus(newStatus: string) {
    if (!token || !selectedId) return;
    setError(null);
    try {
      await apiSetConversationStatus(token, selectedId, newStatus);
      refresh();
      if (newStatus !== status) setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  async function handleSuggestReply() {
    if (!token || !selectedId) return;
    setError(null);
    setDrafting(true);
    try {
      const { draft } = await apiDraftReply(token, selectedId);
      setReplyBody(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to draft a reply");
    } finally {
      setDrafting(false);
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !selectedId || !replyBody.trim()) return;
    setError(null);
    setSending(true);
    try {
      await apiReplyConversation(token, selectedId, replyBody);
      setReplyBody("");
      const updated = await apiGetConversation(token, selectedId);
      setSelected(updated);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] max-w-5xl gap-4">
      <div className="flex w-80 shrink-0 flex-col rounded-lg border border-gray-200 bg-white">
        <div className="flex border-b border-gray-200">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatus(s);
                setSelectedId(null);
              }}
              className={`flex-1 px-2 py-2 text-xs font-medium capitalize ${status === s ? "border-b-2 border-indigo-600 text-indigo-700" : "text-gray-400"}`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-auto">
          {conversations.length === 0 && <p className="p-4 text-center text-xs text-gray-400">No {status} conversations.</p>}
          {conversations.map((c) => {
            const age = slaAge(c.lastInboundAt);
            const lastMessage = c.messages[0];
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`block w-full border-b border-gray-100 p-3 text-left text-sm hover:bg-gray-50 ${selectedId === c.id ? "bg-indigo-50" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.contact.name ?? c.contact.phone}</span>
                  <span className={`text-[11px] ${age.urgent ? "font-semibold text-red-500" : "text-gray-400"}`}>{age.label}</span>
                </div>
                <p className="truncate text-xs text-gray-400">{lastMessage?.body ?? "(no messages)"}</p>
                {c.assignedTo && <p className="mt-0.5 text-[11px] text-indigo-600">→ {c.assignedTo.name ?? c.assignedTo.email}</p>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 rounded-lg border border-gray-200 bg-white p-4">
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        {!selected ? (
          <p className="text-sm text-gray-400">Select a conversation to view it.</p>
        ) : (
          <div className="flex h-full flex-col">
            <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <p className="font-medium">{selected.contact.name ?? selected.contact.phone}</p>
                <p className="text-xs text-gray-400">{selected.contact.telegramUserId ? `Telegram user ${selected.contact.telegramUserId}` : selected.contact.phone}</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selected.assignedToId ?? ""}
                  onChange={(e) => handleAssign(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                >
                  <option value="">Unassigned</option>
                  {team.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name ?? m.email}
                    </option>
                  ))}
                </select>
                {STATUS_TABS.filter((s) => s !== selected.status).map((s) => (
                  <button key={s} onClick={() => handleSetStatus(s)} className="rounded border border-gray-300 px-2 py-1 text-xs capitalize text-gray-600 hover:bg-gray-50">
                    Mark {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-auto">
              {selected.messages.map((m) => (
                <MessageBubble key={m.id} message={m} token={token} aiEnabled={aiEnabled} />
              ))}
            </div>

            <form onSubmit={handleReply} className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
              {aiEnabled && (
                <button
                  type="button"
                  onClick={handleSuggestReply}
                  disabled={drafting}
                  title="AI-draft a reply for you to review and edit — never sent automatically"
                  className="rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  {drafting ? "Drafting…" : "✨ Suggest"}
                </button>
              )}
              <input
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Type a reply…"
                className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
              <button type="submit" disabled={sending || !replyBody.trim()} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {sending ? "Sending…" : "Send"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  token,
  aiEnabled,
}: {
  message: { id: string; direction: string; body: string | null; createdAt: string };
  token: string | null;
  aiEnabled: boolean;
}) {
  const [translated, setTranslated] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState("English");

  async function handleTranslate() {
    if (!token || !message.body) return;
    setTranslating(true);
    try {
      const { translated: result } = await apiTranslate(token, message.body, targetLanguage);
      setTranslated(result);
    } catch {
      // Best-effort — leave the original text visible if translation fails.
    } finally {
      setTranslating(false);
    }
  }

  return (
    <div className={`max-w-[70%] rounded px-3 py-2 text-sm ${message.direction === "inbound" ? "bg-gray-100" : "ml-auto bg-indigo-100"}`}>
      <p>{message.body}</p>
      {translated && <p className="mt-1 border-t border-black/10 pt-1 italic text-gray-600">{translated}</p>}
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <p className="text-[10px] text-gray-400">{new Date(message.createdAt).toLocaleString()}</p>
        {aiEnabled && message.body && (
          <div className="flex items-center gap-1">
            <input
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="w-16 rounded border border-gray-300 px-1 py-0.5 text-[10px]"
            />
            <button onClick={handleTranslate} disabled={translating} className="text-[10px] text-indigo-600 hover:underline disabled:opacity-50">
              {translating ? "…" : "Translate"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthToken } from "@/lib/useAuth";
import { apiListContacts, apiCreateContact, apiImportContacts } from "@/lib/api";

interface Contact {
  id: string;
  name: string | null;
  phone: string;
  createdAt: string;
}

export default function ContactsPage() {
  const token = useAuthToken();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [importSummary, setImportSummary] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!token) return;
    apiListContacts(token).then(setContacts).catch((err) => setError(err.message));
  }, [token]);

  useEffect(refresh, [refresh]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    try {
      await apiCreateContact(token, { phone, name: name || undefined });
      setPhone("");
      setName("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add contact");
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setError(null);
    try {
      const result = await apiImportContacts(token, file);
      setImportSummary(`Imported ${result.created} of ${result.results.length} rows`);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      e.target.value = "";
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-xl font-semibold">Contacts</h1>

      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-lg border border-gray-200 bg-white p-4">
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} required className="rounded border border-gray-300 px-2 py-1 text-sm" placeholder="+91..." />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" />
          </div>
          <button type="submit" className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
            Add contact
          </button>
        </form>
        <div className="ml-auto">
          <label className="mb-1 block text-xs text-gray-500">Import CSV / XLSX</label>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleImport} className="text-sm" />
        </div>
      </div>

      {importSummary && <p className="mb-3 text-sm text-green-700">{importSummary}</p>}
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Phone</th>
              <th className="px-4 py-2">Added</th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                  No contacts yet.
                </td>
              </tr>
            ) : (
              contacts.map((c) => (
                <tr key={c.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{c.name ?? "—"}</td>
                  <td className="px-4 py-2">{c.phone}</td>
                  <td className="px-4 py-2">{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

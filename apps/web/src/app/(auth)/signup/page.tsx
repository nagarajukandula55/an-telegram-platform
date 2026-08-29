"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCreateOrganization, apiRegister } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const org = await apiCreateOrganization(orgName, orgSlug);
      const { accessToken } = await apiRegister(org.id, email, password, name || undefined);
      window.localStorage.setItem("an_wa_token", accessToken);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-3 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-lg font-semibold">Create your organization</h1>

        <div>
          <label className="mb-1 block text-xs text-gray-500">Organization name</label>
          <input value={orgName} onChange={(e) => setOrgName(e.target.value)} required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Organization slug (lowercase, hyphens)</label>
          <input value={orgSlug} onChange={(e) => setOrgSlug(e.target.value)} required pattern="[a-z0-9-]+" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Your name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Password (min 8 chars)</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={8} required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={loading} className="w-full rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {loading ? "Creating…" : "Create organization"}
        </button>
        <p className="text-center text-xs text-gray-400">
          Already have an account? <a href="/login" className="text-indigo-600 hover:underline">Sign in</a>
        </p>
      </form>
    </main>
  );
}

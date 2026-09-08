"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthToken } from "@/lib/useAuth";
import { apiListCampaigns, apiLaunchCampaign, apiCampaignReport, downloadCampaignReportCsv, CampaignDto } from "@/lib/api";
import CampaignWizard from "./CampaignWizard";

export default function CampaignsPage() {
  const token = useAuthToken();
  const [campaigns, setCampaigns] = useState<CampaignDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  const refresh = useCallback(() => {
    if (!token) return;
    apiListCampaigns(token).then(setCampaigns).catch((err) => setError(err.message));
  }, [token]);

  useEffect(refresh, [refresh]);

  function handleCreated() {
    setShowWizard(false);
    refresh();
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

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Campaigns</h1>
        {!showWizard && (
          <button onClick={() => setShowWizard(true)} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
            + New campaign
          </button>
        )}
      </div>

      {showWizard && <CampaignWizard token={token} onCreated={handleCreated} onCancel={() => setShowWizard(false)} />}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

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
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  No campaigns yet.
                </td>
              </tr>
            ) : (
              campaigns.map((c) => (
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
              ))
            )}
          </tbody>
        </table>
      </div>

      {reportFor && report && (
        <pre className="mt-4 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs">{JSON.stringify(report, null, 2)}</pre>
      )}
    </div>
  );
}

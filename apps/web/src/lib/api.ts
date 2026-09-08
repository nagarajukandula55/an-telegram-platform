const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `Request failed (HTTP ${res.status})`);
  }
  return res.json() as Promise<T>;
}

export interface LoginResult {
  accessToken: string;
  user: { id: string; email: string; role: string; organizationId: string };
}

export async function apiCreateOrganization(name: string, slug: string) {
  const res = await fetch(`${API_BASE_URL}/organizations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, slug }),
  });
  return handle<{ id: string; name: string; slug: string }>(res);
}

export async function apiRegister(organizationId: string, email: string, password: string, name?: string) {
  const res = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId, email, password, name }),
  });
  return handle<LoginResult>(res);
}

export async function apiLogin(email: string, password: string) {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return handle<LoginResult>(res);
}

export async function apiListContacts(token: string, search?: string) {
  const url = new URL(`${API_BASE_URL}/contacts`);
  if (search) url.searchParams.set("search", search);
  const res = await fetch(url, { headers: authHeaders(token), cache: "no-store" });
  return handle<Array<{ id: string; name: string | null; phone: string; createdAt: string }>>(res);
}

export async function apiCreateContact(token: string, data: { phone: string; name?: string; email?: string }) {
  const res = await fetch(`${API_BASE_URL}/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function apiImportContacts(token: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE_URL}/contacts/import`, { method: "POST", headers: authHeaders(token), body: form });
  return handle<{ created: number; results: Array<{ row: number; status: string; reason?: string }> }>(res);
}

export interface ConnectorDto {
  id: string;
  name: string;
  type: string;
  isPrimary: boolean;
  isEnabled: boolean;
  capabilities: Record<string, boolean>;
  createdAt: string;
  rateLimitPerMinute?: number | null;
  rateLimitPerHour?: number | null;
  rateLimitPerDay?: number | null;
}

export async function apiListConnectors(token: string) {
  const res = await fetch(`${API_BASE_URL}/connectors`, { headers: authHeaders(token), cache: "no-store" });
  return handle<ConnectorDto[]>(res);
}

export async function apiCreateConnector(
  token: string,
  data: {
    name: string;
    type: string;
    config: Record<string, unknown>;
    capabilities: Record<string, boolean>;
    credentialRef?: string;
    isPrimary?: boolean;
    rateLimitPerMinute?: number;
    rateLimitPerHour?: number;
    rateLimitPerDay?: number;
  },
) {
  const res = await fetch(`${API_BASE_URL}/connectors`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(data),
  });
  return handle<ConnectorDto>(res);
}

export async function apiMtprotoLoginStart(token: string, data: { apiId: number; apiHash: string; phoneNumber: string }) {
  const res = await fetch(`${API_BASE_URL}/connectors/mtproto/login/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(data),
  });
  return handle<{ loginAttemptId: string; phoneCodeHash: string }>(res);
}

export async function apiMtprotoLoginCode(token: string, data: { loginAttemptId: string; code: string }) {
  const res = await fetch(`${API_BASE_URL}/connectors/mtproto/login/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(data),
  });
  return handle<{ status: "needs_password" } | { status: "ready_to_finalize"; sessionString: string }>(res);
}

export async function apiMtprotoLoginPassword(token: string, data: { loginAttemptId: string; password: string }) {
  const res = await fetch(`${API_BASE_URL}/connectors/mtproto/login/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(data),
  });
  return handle<{ status: "ready_to_finalize"; sessionString: string }>(res);
}

export async function apiMtprotoLoginFinalize(
  token: string,
  data: { loginAttemptId: string; sessionString: string; name: string; isPrimary?: boolean },
) {
  const res = await fetch(`${API_BASE_URL}/connectors/mtproto/login/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(data),
  });
  return handle<ConnectorDto>(res);
}

export async function apiSetConnectorRateLimits(
  token: string,
  id: string,
  data: { rateLimitPerMinute?: number | null; rateLimitPerHour?: number | null; rateLimitPerDay?: number | null },
) {
  const res = await fetch(`${API_BASE_URL}/connectors/${id}/rate-limits`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(data),
  });
  return handle<ConnectorDto>(res);
}

export async function apiSendMessage(
  token: string,
  data: { connectorId: string; toPhone?: string; toGroupId?: string; contentType: string; body?: string; attachmentId?: string },
) {
  const res = await fetch(`${API_BASE_URL}/messages/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function apiUploadAttachment(token: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE_URL}/attachments`, { method: "POST", headers: authHeaders(token), body: form });
  return handle<{ id: string; originalName: string }>(res);
}

export interface GroupDto {
  id: string;
  name: string;
  alias: string | null;
  connectorId: string;
  createdAt: string;
}

export async function apiListGroups(token: string) {
  const res = await fetch(`${API_BASE_URL}/groups`, { headers: authHeaders(token), cache: "no-store" });
  return handle<GroupDto[]>(res);
}

export async function apiCreateGroup(token: string, data: { connectorId: string; name: string; alias?: string }) {
  const res = await fetch(`${API_BASE_URL}/groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(data),
  });
  return handle<GroupDto>(res);
}

export interface CampaignDto {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  _count?: { recipients: number; messages: number };
}

export async function apiListCampaigns(token: string) {
  const res = await fetch(`${API_BASE_URL}/campaigns`, { headers: authHeaders(token), cache: "no-store" });
  return handle<CampaignDto[]>(res);
}

export async function apiCreateCampaign(
  token: string,
  data: { name: string; connectorId: string; recipientContactIds?: string[]; recipientGroupIds?: string[]; templateId?: string },
) {
  const res = await fetch(`${API_BASE_URL}/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function apiLaunchCampaign(token: string, id: string) {
  const res = await fetch(`${API_BASE_URL}/campaigns/${id}/launch`, { method: "POST", headers: authHeaders(token) });
  return handle(res);
}

export async function apiCampaignReport(token: string, id: string) {
  const res = await fetch(`${API_BASE_URL}/campaigns/${id}/report`, { headers: authHeaders(token), cache: "no-store" });
  return handle<{ campaignId: string; name: string; status: string; totalMessages: number; byStatus: Record<string, number> }>(res);
}

export interface WorkflowDto {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export async function apiListWorkflows(token: string) {
  const res = await fetch(`${API_BASE_URL}/workflows`, { headers: authHeaders(token), cache: "no-store" });
  return handle<WorkflowDto[]>(res);
}

export async function apiCreateWorkflow(token: string, data: { name: string; definition: { nodes: Array<{ id: string; type: string; config: Record<string, unknown> }> } }) {
  const res = await fetch(`${API_BASE_URL}/workflows`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function apiTriggerWorkflow(token: string, id: string) {
  const res = await fetch(`${API_BASE_URL}/workflows/${id}/trigger`, { method: "POST", headers: authHeaders(token) });
  return handle(res);
}

export async function apiWorkflowRuns(token: string, id: string) {
  const res = await fetch(`${API_BASE_URL}/workflows/${id}/runs`, { headers: authHeaders(token), cache: "no-store" });
  return handle<Array<{ id: string; status: string; startedAt: string; finishedAt: string | null }>>(res);
}

export async function apiApproveWorkflowRun(token: string, runId: string) {
  const res = await fetch(`${API_BASE_URL}/workflows/runs/${runId}/approve`, { method: "POST", headers: authHeaders(token) });
  return handle(res);
}

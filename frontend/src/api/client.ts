// Thin REST client for the BCC FastAPI backend. Cookies carry the session,
// so every request uses credentials: "include".
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    public requestId: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    let requestId: string | undefined;
    try {
      const body = (await res.json()) as { message?: string; request_id?: string };
      message = body.message ?? message;
      requestId = body.request_id;
    } catch {
      // response body wasn't JSON; keep the generic message
    }
    throw new ApiError(res.status, requestId, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ ok: boolean; role: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  dashboardSummary: () => request<import("../types").DashboardSummary>("/dashboard/summary"),
  listServices: () => request<import("../types").Service[]>("/services"),
  getService: (id: string) => request<import("../types").Service>(`/services/${id}`),
  serviceHistory: (id: string, limit = 100) =>
    request<import("../types").ServiceHistoryEntry[]>(`/services/${id}/history?limit=${limit}`),
  serviceLogs: (id: string, limit = 100) =>
    request<import("../types").LogEvent[]>(`/services/${id}/logs?limit=${limit}`),
  listIncidents: (status?: string) =>
    request<import("../types").Incident[]>(`/incidents${status ? `?status=${status}` : ""}`),
  acknowledgeIncident: (id: string) =>
    request<import("../types").Incident>(`/incidents/${id}/acknowledge`, { method: "POST" }),
  serverMetrics: () => request<import("../types").ServerMetric>("/metrics/server"),
  notificationSettings: () =>
    request<import("../types").NotificationSetting[]>("/notifications/settings"),
  updateNotificationSetting: (id: string, patch: { cooldown_seconds?: number; enabled?: boolean }) =>
    request<import("../types").NotificationSetting>(`/notifications/settings/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
};

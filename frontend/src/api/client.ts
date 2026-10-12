// Thin REST client for the BCC FastAPI backend. Cookies carry the session,
// so every request uses credentials: "include".
import type { Page } from "../types/index.ts";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

// Fired whenever a request comes back 401, so the auth hook can clear
// client-side state and the router can redirect to /login. Previously a
// stale sessionStorage "role" could outlive an expired server session with
// no way for the UI to notice.
export const AUTH_EXPIRED_EVENT = "bcc:auth-expired";

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

  if (res.status === 401) {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }

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
  listServices: (cursor?: string, limit = 50) =>
    request<Page<import("../types").Service>>(
      `/services?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  createService: (payload: { name: string; unit_name: string; interval_seconds?: number }) =>
    request<import("../types").Service>("/services", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateService: (id: string, patch: { name?: string; enabled?: boolean; interval_seconds?: number }) =>
    request<import("../types").Service>(`/services/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  getService: (id: string) => request<import("../types").Service>(`/services/${id}`),
  serviceHistory: (id: string, limit = 100) =>
    request<import("../types").ServiceHistoryEntry[]>(`/services/${id}/history?limit=${limit}`),
  serviceLogs: (id: string, limit = 100) =>
    request<import("../types").LogEvent[]>(`/services/${id}/logs?limit=${limit}`),
  listIncidents: (status?: string, cursor?: string, limit = 50) =>
    request<Page<import("../types").Incident>>(
      `/incidents?limit=${limit}${status ? `&status=${status}` : ""}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  acknowledgeIncident: (id: string) =>
    request<import("../types").Incident>(`/incidents/${id}/acknowledge`, { method: "POST" }),
  serverMetrics: () => request<import("../types").ServerMetric>("/metrics/server"),
  notificationSettings: () =>
    request<import("../types").NotificationSetting[]>("/notifications/settings"),
  updateNotificationSetting: (
    id: string,
    patch: { cooldown_seconds?: number; enabled?: boolean; silence_minutes?: number },
  ) =>
    request<import("../types").NotificationSetting>(`/notifications/settings/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
};

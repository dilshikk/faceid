// Thin REST client for the BCC FastAPI backend. Cookies carry the session,
// so every request uses credentials: "include".
import type {
  DashboardSummary,
  Incident,
  LogEvent,
  LogLevel,
  NotificationSetting,
  Page,
  ServerMetric,
  Service,
  ServiceHistoryEntry,
} from "../types/index.ts";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

// Fired whenever a request comes back 401, so the auth hook can clear
// client-side state and the router can redirect to /login.
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

type ErrorBody = {
  detail?: string | { msg?: string }[];
  message?: string;
  request_id?: string;
};

function extractMessage(body: ErrorBody, fallback: string): string {
  if (typeof body.detail === "string") return body.detail;
  if (Array.isArray(body.detail) && body.detail.length > 0) {
    return body.detail.map((d) => d.msg).filter(Boolean).join("; ") || fallback;
  }
  return body.message ?? fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  // A failed login is also a 401 but must not be treated as "session expired".
  if (res.status === 401 && path !== "/auth/login") {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    let requestId: string | undefined;
    try {
      const body = (await res.json()) as ErrorBody;
      message = extractMessage(body, message);
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

export type LogFilters = { since?: string; q?: string; level?: LogLevel };

export const api = {
  live: () => request<{ status: string }>("/health/live"),
  ready: () => request<{ status: string }>("/health/ready"),
  login: (username: string, password: string, otp?: string) =>
    request<{ ok: boolean; role: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password, otp: otp || null }),
    }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  dashboardSummary: () => request<DashboardSummary>("/dashboard/summary"),
  listServices: (cursor?: string, limit = 50) =>
    request<Page<Service>>(
      `/services?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  createService: (payload: { name: string; unit_name: string; interval_seconds?: number }) =>
    request<Service>("/services", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateService: (id: string, patch: { name?: string; enabled?: boolean; interval_seconds?: number }) =>
    request<Service>(`/services/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  getService: (id: string) => request<Service>(`/services/${id}`),
  serviceHistory: (id: string, limit = 100) =>
    request<ServiceHistoryEntry[]>(`/services/${id}/history?limit=${limit}`),
  serviceLogs: (id: string, limit = 100, filters?: LogFilters) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (filters?.since) params.set("since", filters.since);
    if (filters?.q) params.set("q", filters.q);
    if (filters?.level) params.set("level", filters.level);
    return request<LogEvent[]>(`/services/${id}/logs?${params.toString()}`);
  },
  listIncidents: (status?: string, cursor?: string, limit = 50) =>
    request<Page<Incident>>(
      `/incidents?limit=${limit}${status ? `&status=${status}` : ""}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  getIncident: (id: string) => request<Incident>(`/incidents/${id}`),
  acknowledgeIncident: (id: string) =>
    request<Incident>(`/incidents/${id}/acknowledge`, { method: "POST" }),
  serverMetrics: () => request<ServerMetric>("/metrics/server"),
  notificationSettings: () => request<NotificationSetting[]>("/notifications/settings"),
  updateNotificationSetting: (
    id: string,
    patch: { cooldown_seconds?: number; enabled?: boolean; silence_minutes?: number },
  ) =>
    request<NotificationSetting>(`/notifications/settings/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
};

export type ServiceStatusValue = "active" | "inactive" | "failed" | "activating" | "unknown";

export type Service = {
  id: string;
  name: string;
  unit_name: string;
  enabled: boolean;
  interval_seconds: number;
  status: ServiceStatusValue;
  pid: number | null;
  last_transition_at: string | null;
};

export type ServiceHistoryEntry = {
  status: ServiceStatusValue;
  pid: number | null;
  observed_at: string;
};

export type LogEvent = {
  level: string;
  message: string;
  event_time: string;
};

export type IncidentStatusValue = "open" | "acknowledged" | "resolved";

export type Incident = {
  id: string;
  service_id: string;
  severity: string;
  status: IncidentStatusValue;
  first_seen: string;
  last_seen: string;
  resolved_at: string | null;
};

export type ServerMetric = {
  cpu_percent: number;
  ram_percent: number;
  disk_percent: number;
  uptime_seconds: number;
  observed_at: string;
};

export type DashboardSummary = {
  services_by_status: Record<string, number>;
  last_check_at: string | null;
  recent_incidents: Incident[];
  server: ServerMetric | null;
  postgres_healthy: boolean;
  telegram_healthy: boolean;
};

export type NotificationSetting = {
  id: string;
  channel: string;
  event_type: string;
  recipient: string;
  cooldown_seconds: number;
  enabled: boolean;
  silence_until: string | null;
};

// Cursor-paginated list response (TZ 7: bounded response size).
export type Page<T> = {
  items: T[];
  next_cursor: string | null;
};

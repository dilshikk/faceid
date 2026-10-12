import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePolling } from "../hooks/useApi.ts";
import { api, type LogFilters } from "../api/client.ts";
import type { LogLevel } from "../types/index.ts";

const LEVELS: { value: LogLevel | "all"; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "error", label: "ERROR" },
  { value: "warning", label: "WARNING" },
  { value: "info", label: "INFO" },
];

const LEVEL_COLORS: Record<LogLevel, string> = {
  error: "text-red-400",
  warning: "text-amber-300",
  info: "text-slate-300",
};

// Live log tail for a single allowlisted service (TZ 4.3) with text and
// level filters, both applied by the backend.
export default function Logs() {
  const { id } = useParams<{ id: string }>();
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<LogLevel | "all">("all");
  const service = usePolling(() => api.getService(id!), 30000, [id]);

  const filters: LogFilters = {
    q: query || undefined,
    level: level === "all" ? undefined : level,
  };
  const logs = usePolling(() => api.serviceLogs(id!, 200, filters), 15000, [id, query, level]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Логи {service.data ? `— ${service.data.name}` : ""}
        </h1>
        <Link to={`/services/${id}`} className="text-sm text-slate-400 hover:text-white">
          Назад к службе
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          className="flex-1 rounded bg-slate-800 px-3 py-2 text-sm"
          placeholder="Фильтр по тексту сообщения..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex gap-1">
          {LEVELS.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => setLevel(l.value)}
              className={`cursor-pointer rounded px-3 py-2 text-xs font-medium ${
                level === l.value ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {logs.loading && <p className="text-slate-400">Загрузка...</p>}
      {logs.error && <p className="text-red-400">{logs.error}</p>}

      {logs.data && logs.data.length > 0 ? (
        <div className="text-xs font-mono bg-slate-900 border border-slate-800 rounded-lg p-3 max-h-[70vh] overflow-auto">
          {logs.data.map((l, i) => (
            <div key={i} className={`whitespace-pre-wrap ${LEVEL_COLORS[l.level] ?? "text-slate-300"}`}>
              <span className="text-slate-500">{new Date(l.event_time).toLocaleString()}</span>{"  "}
              {l.message}
            </div>
          ))}
        </div>
      ) : (
        !logs.loading && <p className="text-sm text-slate-400">Логов нет или нет доступа к journald.</p>
      )}
    </div>
  );
}

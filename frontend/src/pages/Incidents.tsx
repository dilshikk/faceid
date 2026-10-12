import { useState } from "react";
import { usePaginatedPolling } from "../hooks/useApi.ts";
import { api, ApiError } from "../api/client.ts";
import type { Incident } from "../types/index.ts";

export default function Incidents() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | null>(null);
  const { items, nextCursor, error, loading, loadMore, refresh } = usePaginatedPolling<Incident>(
    (cursor) => api.listIncidents(statusFilter, cursor),
    15000,
    [statusFilter],
  );

  const acknowledge = async (id: string) => {
    setActionError(null);
    try {
      await api.acknowledgeIncident(id);
      refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Не удалось подтвердить инцидент");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 text-sm">
        {[undefined, "open", "acknowledged", "resolved"].map((s) => (
          <button
            key={s ?? "all"}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded ${statusFilter === s ? "bg-slate-700" : "bg-slate-800/50"}`}
          >
            {s ?? "все"}
          </button>
        ))}
      </div>

      {loading && <p className="text-slate-400">Загрузка...</p>}
      {error && <p className="text-red-400">{error}</p>}
      {actionError && <p className="text-red-400">{actionError}</p>}
      {!loading && items.length === 0 && <p className="text-slate-400">Инцидентов нет.</p>}

      <ul className="space-y-2">
        {items.map((incident) => (
          <li key={incident.id} className="flex items-center justify-between rounded-lg border border-slate-800 p-4">
            <div>
              <p className="font-medium">{incident.severity}</p>
              <p className="text-xs text-slate-500">
                {new Date(incident.first_seen).toLocaleString()} — {incident.status}
              </p>
            </div>
            {incident.status !== "resolved" && (
              <button
                onClick={() => acknowledge(incident.id)}
                className="text-xs rounded bg-slate-700 px-3 py-1 hover:bg-slate-600"
              >
                Подтвердить
              </button>
            )}
          </li>
        ))}
      </ul>

      {nextCursor && (
        <button
          onClick={() => loadMore()}
          className="text-sm rounded bg-slate-800 px-4 py-2 hover:bg-slate-700"
        >
          Показать ещё
        </button>
      )}
    </div>
  );
}

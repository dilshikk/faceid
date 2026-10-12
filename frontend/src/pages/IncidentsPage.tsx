import { useState } from "react";
import { usePolling } from "../hooks/useApi.ts";
import { api } from "../api/client.ts";

export default function IncidentsPage() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const { data, error, loading } = usePolling(() => api.listIncidents(statusFilter), 15000);

  const acknowledge = async (id: string) => {
    await api.acknowledgeIncident(id);
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
      {data && data.length === 0 && <p className="text-slate-400">Инцидентов нет.</p>}

      <ul className="space-y-2">
        {data?.map((incident) => (
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
    </div>
  );
}

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePolling } from "../hooks/useApi.ts";
import { api } from "../api/client.ts";

// Standalone live log tail for a single allowlisted service (TZ 4.3).
// Split out from ServiceDetails so this page can be shared/bookmarked and
// kept lightweight to load on its own. Supports a text filter, backed by
// the backend's `q` query param so filtering doesn't depend on how many
// lines happen to already be loaded client-side.
export default function Logs() {
  const { id } = useParams<{ id: string }>();
  const [query, setQuery] = useState("");
  const service = usePolling(() => api.getService(id!), 30000);
  const logs = usePolling(() => api.serviceLogs(id!, 200, query ? { q: query } : undefined), 15000);

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

      <input
        className="w-full rounded bg-slate-800 px-3 py-2 text-sm"
        placeholder="Фильтр по тексту сообщения..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {logs.loading && <p className="text-slate-400">Загрузка...</p>}
      {logs.error && <p className="text-red-400">{logs.error}</p>}

      {logs.data && logs.data.length > 0 ? (
        <pre className="text-xs bg-slate-900 border border-slate-800 rounded-lg p-3 max-h-[70vh] overflow-auto whitespace-pre-wrap">
          {logs.data.map((l) => `${new Date(l.event_time).toLocaleString()}  ${l.message}`).join("\n")}
        </pre>
      ) : (
        !logs.loading && <p className="text-sm text-slate-400">Логов нет или нет доступа к journald.</p>
      )}
    </div>
  );
}

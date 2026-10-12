import { Link, useParams } from "react-router-dom";
import { usePolling } from "../hooks/useApi.ts";
import { api } from "../api/client.ts";

// Standalone live log tail for a single allowlisted service (TZ 4.3).
// Split out from ServiceDetails so this page can be shared/bookmarked and
// kept lightweight to load on its own.
export default function Logs() {
  const { id } = useParams<{ id: string }>();
  const service = usePolling(() => api.getService(id!), 30000);
  const logs = usePolling(() => api.serviceLogs(id!, 200), 15000);

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

      {logs.loading && <p className="text-slate-400">Загрузка...</p>}
      {logs.error && <p className="text-red-400">{logs.error}</p>}

      {logs.data && logs.data.length > 0 ? (
        <pre className="text-xs bg-slate-900 border border-slate-800 rounded-lg p-3 max-h-[70vh] overflow-auto whitespace-pre-wrap">
          {logs.data.map((l, i) => `${new Date(l.event_time).toLocaleString()}  ${l.message}`).join("\n")}
        </pre>
      ) : (
        !logs.loading && <p className="text-sm text-slate-400">Логов нет или нет доступа к journald.</p>
      )}
    </div>
  );
}

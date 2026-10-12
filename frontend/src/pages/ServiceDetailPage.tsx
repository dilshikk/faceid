import { useParams } from "react-router-dom";
import { usePolling } from "../hooks/useApi.ts";
import { api } from "../api/client.ts";
import StatusBadge from "../components/StatusBadge.tsx";

export default function ServiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const service = usePolling(() => api.getService(id!), 15000);
  const history = usePolling(() => api.serviceHistory(id!, 50), 30000);
  const logs = usePolling(() => api.serviceLogs(id!, 100), 15000);

  if (service.loading) return <p className="text-slate-400">Загрузка...</p>;
  if (service.error) return <p className="text-red-400">{service.error}</p>;
  if (!service.data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{service.data.name}</h1>
        <StatusBadge status={service.data.status} />
      </div>
      <p className="text-sm text-slate-400">
        unit: {service.data.unit_name} · PID: {service.data.pid ?? "—"}
      </p>

      <section>
        <h2 className="font-semibold mb-2">История статусов</h2>
        {history.data && history.data.length > 0 ? (
          <ul className="text-sm space-y-1 max-h-64 overflow-auto">
            {history.data.map((entry, i) => (
              <li key={i} className="flex justify-between text-slate-300">
                <span>{entry.status}</span>
                <span className="text-slate-500">{new Date(entry.observed_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">Истории пока нет.</p>
        )}
      </section>

      <section>
        <h2 className="font-semibold mb-2">Логи</h2>
        {logs.data && logs.data.length > 0 ? (
          <pre className="text-xs bg-slate-900 border border-slate-800 rounded-lg p-3 max-h-80 overflow-auto whitespace-pre-wrap">
            {logs.data.map((l) => l.message).join("\n")}
          </pre>
        ) : (
          <p className="text-sm text-slate-400">Логов нет или нет доступа к journald.</p>
        )}
      </section>
    </div>
  );
}

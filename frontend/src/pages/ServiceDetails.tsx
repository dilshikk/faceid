import { Link, useParams } from "react-router-dom";
import { usePolling } from "../hooks/useApi.ts";
import { api } from "../api/client.ts";
import StatusBadge from "../components/StatusBadge.tsx";

function formatDuration(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days} д ${hours} ч`;
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return `${minutes} мин`;
}

// Service overview and status history. Full log tailing lives on its own
// route (Logs.tsx) so a long log stream doesn't make this page heavy.
export default function ServiceDetails() {
  const { id } = useParams<{ id: string }>();
  const service = usePolling(() => api.getService(id!), 15000, [id]);
  const history = usePolling(() => api.serviceHistory(id!, 50), 30000, [id]);

  if (service.loading) return <p className="text-slate-400">Загрузка...</p>;
  if (service.error) return <p className="text-red-400">{service.error}</p>;
  if (!service.data) return null;

  const s = service.data;
  const facts: { label: string; value: string }[] = [
    { label: "Unit", value: s.unit_name },
    { label: "PID", value: s.pid?.toString() ?? "—" },
    { label: "Uptime", value: s.uptime_seconds != null ? formatDuration(s.uptime_seconds) : "—" },
    { label: "Запущен", value: s.started_at ? new Date(s.started_at).toLocaleString() : "—" },
    { label: "Перезапусков", value: s.restarts?.toString() ?? "—" },
    {
      label: "Последняя проверка",
      value: s.last_transition_at ? new Date(s.last_transition_at).toLocaleString() : "—",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{s.name}</h1>
        <StatusBadge status={s.status} />
      </div>

      <dl className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {facts.map((f) => (
          <div key={f.label} className="rounded-lg border border-slate-800 p-3">
            <dt className="text-xs text-slate-500">{f.label}</dt>
            <dd className="text-sm text-slate-200 truncate">{f.value}</dd>
          </div>
        ))}
      </dl>

      <Link
        to={`/services/${id}/logs`}
        className="inline-block text-sm rounded bg-slate-800 px-4 py-2 hover:bg-slate-700"
      >
        Посмотреть логи
      </Link>

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
    </div>
  );
}

import { usePolling } from "../hooks/useApi.ts";
import { api } from "../api/client.ts";

const STATUS_LABELS: Record<string, string> = {
  active: "Активны",
  inactive: "Неактивны",
  failed: "С сбоем",
  activating: "Запускаются",
  unknown: "Неизвестно",
};

export default function DashboardPage() {
  const { data, error, loading } = usePolling(() => api.dashboardSummary(), 15000);

  if (loading) return <p className="text-slate-400">Загрузка...</p>;
  if (error) return <p className="text-red-400">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <div key={key} className="rounded-lg border border-slate-800 p-4">
            <p className="text-xs text-slate-400">{label}</p>
            <p className="text-2xl font-semibold">{data.services_by_status[key] ?? 0}</p>
          </div>
        ))}
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-800 p-4 space-y-2">
          <h2 className="font-semibold">Сервер</h2>
          {data.server ? (
            <ul className="text-sm space-y-1 text-slate-300">
              <li>CPU: {data.server.cpu_percent.toFixed(1)}%</li>
              <li>RAM: {data.server.ram_percent.toFixed(1)}%</li>
              <li>Диск: {data.server.disk_percent.toFixed(1)}%</li>
              <li>Uptime: {Math.floor(data.server.uptime_seconds / 3600)} ч</li>
            </ul>
          ) : (
            <p className="text-sm text-slate-400">Метрики ещё не собраны.</p>
          )}
          <p className="text-sm text-slate-400">
            PostgreSQL: {data.postgres_healthy ? "доступен" : "недоступен"} · Telegram:{" "}
            {data.telegram_healthy ? "доступен" : "недоступен"}
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 p-4">
          <h2 className="font-semibold mb-2">Последние инциденты</h2>
          {data.recent_incidents.length === 0 ? (
            <p className="text-sm text-slate-400">Инцидентов нет.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {data.recent_incidents.map((incident) => (
                <li key={incident.id} className="flex justify-between text-slate-300">
                  <span>{incident.severity}</span>
                  <span className="text-slate-500">{incident.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

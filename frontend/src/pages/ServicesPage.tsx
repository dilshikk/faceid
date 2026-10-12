import { Link } from "react-router-dom";
import { usePolling } from "../hooks/useApi.ts";
import { api } from "../api/client.ts";
import StatusBadge from "../components/StatusBadge.tsx";

export default function ServicesPage() {
  const { data, error, loading } = usePolling(() => api.listServices(), 15000);

  if (loading) return <p className="text-slate-400">Загрузка...</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  if (!data || data.length === 0) {
    return (
      <p className="text-slate-400">
        Служб в реестре нет. Добавьте зарегистрированные службы в таблицу monitored_services (см. docs/deployment.md).
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {data.map((service) => (
        <Link
          key={service.id}
          to={`/services/${service.id}`}
          className="flex items-center justify-between rounded-lg border border-slate-800 p-4 hover:border-slate-600"
        >
          <div>
            <p className="font-medium">{service.name}</p>
            <p className="text-xs text-slate-500">{service.unit_name}</p>
          </div>
          <StatusBadge status={service.status} />
        </Link>
      ))}
    </div>
  );
}

import { useSearchParams } from "react-router-dom";
import { useAuth, usePolling } from "../hooks/useApi.ts";
import { api } from "../api/client.ts";
import ServiceDatabasePanel from "../components/bot-users/ServiceDatabasePanel.tsx";

// Users of each monitored bot, read directly (read-only) from the bot's own DB.
export default function BotUsers() {
  const { role } = useAuth();
  const canManage = role === "owner" || role === "admin";
  const [params, setParams] = useSearchParams();
  const services = usePolling(() => api.listServices(undefined, 200), 60000);

  if (services.loading) return <p className="text-slate-400">Загрузка...</p>;
  if (services.error) return <p className="text-red-400">{services.error}</p>;

  const items = services.data?.items ?? [];
  if (items.length === 0) {
    return <p className="text-slate-400">Сначала добавьте ботов на странице «Службы».</p>;
  }
  const selectedId = params.get("service") ?? items[0].id;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-xl font-semibold">Пользователи ботов</h1>
        {items.map((service) => (
          <button
            key={service.id}
            onClick={() => setParams({ service: service.id })}
            className={`rounded px-3 py-1 text-sm ${service.id === selectedId ? "bg-emerald-600" : "bg-slate-800 hover:bg-slate-700"}`}
          >
            {service.name}
          </button>
        ))}
      </div>

      <ServiceDatabasePanel key={selectedId} serviceId={selectedId} canManage={canManage} />

      <p className="text-xs text-slate-500">
        Данные читаются напрямую из базы бота в режиме только для чтения. Пароли и токены скрываются.
      </p>
    </div>
  );
}

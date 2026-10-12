import { useState } from "react";
import { Link } from "react-router-dom";
import { usePaginatedPolling, useAuth } from "../hooks/useApi.ts";
import { api, ApiError } from "../api/client.ts";
import StatusBadge from "../components/StatusBadge.tsx";
import type { Service } from "../types/index.ts";

function AddServiceForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [unitName, setUnitName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.createService({ name, unit_name: unitName });
      setName("");
      setUnitName("");
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось добавить службу");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-800 p-4"
    >
      <div className="flex-1 min-w-[160px]">
        <label className="block text-xs text-slate-400 mb-1">Название</label>
        <input
          className="w-full rounded bg-slate-800 px-3 py-2 text-sm"
          placeholder="Mado Bot"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="flex-1 min-w-[160px]">
        <label className="block text-xs text-slate-400 mb-1">Unit (systemd)</label>
        <input
          className="w-full rounded bg-slate-800 px-3 py-2 text-sm"
          placeholder="mado-bot.service"
          value={unitName}
          onChange={(e) => setUnitName(e.target.value)}
          required
        />
      </div>
      {error && <p className="text-sm text-red-400 w-full">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {submitting ? "Добавление..." : "Добавить службу"}
      </button>
    </form>
  );
}

export default function Services() {
  const { role } = useAuth();
  const { items, nextCursor, loading, error, loadMore } = usePaginatedPolling<Service>(
    (cursor) => api.listServices(cursor),
    15000,
  );
  const canManage = role === "owner" || role === "admin";

  return (
    <div className="space-y-4">
      {canManage && <AddServiceForm onCreated={() => window.location.reload()} />}

      {loading && <p className="text-slate-400">Загрузка...</p>}
      {error && <p className="text-red-400">{error}</p>}

      {!loading && items.length === 0 && (
        <p className="text-slate-400">
          Служб в реестре нет. {canManage ? "Добавьте первую службу выше." : "Обратитесь к администратору, чтобы её добавили."}
        </p>
      )}

      <div className="space-y-2">
        {items.map((service) => (
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

import { usePolling } from "../hooks/useApi.ts";
import { api } from "../api/client.ts";

export default function SettingsPage() {
  const { data, error, loading } = usePolling(() => api.notificationSettings(), 30000);

  const toggle = async (id: string, enabled: boolean) => {
    await api.updateNotificationSetting(id, { enabled });
  };

  if (loading) return <p className="text-slate-400">Загрузка...</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Уведомления</h1>
      {!data || data.length === 0 ? (
        <p className="text-slate-400">Настройки уведомлений ещё не созданы.</p>
      ) : (
        <ul className="space-y-2">
          {data.map((setting) => (
            <li key={setting.id} className="flex items-center justify-between rounded-lg border border-slate-800 p-4">
              <div>
                <p className="font-medium">{setting.event_type}</p>
                <p className="text-xs text-slate-500">
                  {setting.channel} → {setting.recipient} · cooldown {setting.cooldown_seconds}с
                </p>
              </div>
              <button
                onClick={() => toggle(setting.id, !setting.enabled)}
                className={`text-xs rounded px-3 py-1 ${setting.enabled ? "bg-emerald-600" : "bg-slate-700"}`}
              >
                {setting.enabled ? "включено" : "выключено"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

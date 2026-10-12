import { usePolling } from "../hooks/useApi.ts";
import { api } from "../api/client.ts";

export default function Settings() {
  const { data, error, loading } = usePolling(() => api.notificationSettings(), 30000);

  const toggle = async (id: string, enabled: boolean) => {
    await api.updateNotificationSetting(id, { enabled });
  };

  const silence = async (id: string, minutes: number) => {
    await api.updateNotificationSetting(id, { silence_minutes: minutes });
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
          {data.map((setting) => {
            const silenced = setting.silence_until && new Date(setting.silence_until) > new Date();
            return (
              <li
                key={setting.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 p-4"
              >
                <div>
                  <p className="font-medium">{setting.event_type}</p>
                  <p className="text-xs text-slate-500">
                    {setting.channel} → {setting.recipient} · cooldown {setting.cooldown_seconds}с
                  </p>
                  {silenced && (
                    <p className="text-xs text-amber-400">
                      Утишено до {new Date(setting.silence_until as string).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggle(setting.id, !setting.enabled)}
                    className={`text-xs rounded px-3 py-1 ${setting.enabled ? "bg-emerald-600" : "bg-slate-700"}`}
                  >
                    {setting.enabled ? "включено" : "выключено"}
                  </button>
                  {silenced ? (
                    <button
                      onClick={() => silence(setting.id, 0)}
                      className="text-xs rounded bg-slate-700 px-3 py-1 hover:bg-slate-600"
                    >
                      Снять утишение
                    </button>
                  ) : (
                    <button
                      onClick={() => silence(setting.id, 60)}
                      className="text-xs rounded bg-slate-700 px-3 py-1 hover:bg-slate-600"
                    >
                      Утишить на 1ч
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

import { useState } from "react";
import { api, ApiError } from "../../api/client.ts";
import type { BotDatabase } from "../../types/index.ts";

type Props = { serviceId: string; initial: BotDatabase; onSaved: () => void };

const INPUT_CLASS = "w-full rounded bg-slate-800 px-3 py-2 text-sm";

// Connection settings for one bot's database. Saving first tests the
// connection on the server, so only working settings are stored.
export default function DatabaseForm({ serviceId, initial, onSaved }: Props) {
  const [host, setHost] = useState(initial.host ?? "127.0.0.1");
  const [port, setPort] = useState(String(initial.port ?? 5432));
  const [dbname, setDbname] = useState(initial.dbname ?? "");
  const [user, setUser] = useState(initial.user ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fields = [
    { label: "Хост", value: host, set: setHost, placeholder: "127.0.0.1", type: "text" },
    { label: "Порт", value: port, set: setPort, placeholder: "5432", type: "number" },
    { label: "База данных", value: dbname, set: setDbname, placeholder: "mado_bot", type: "text" },
    { label: "Пользователь", value: user, set: setUser, placeholder: "bcc_reader", type: "text" },
  ];

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setSaving(true);
    setError(null);
    try {
      await action();
      setPassword("");
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    run(
      () =>
        api.saveBotDatabase(serviceId, {
          host,
          port: Number(port),
          dbname,
          user,
          password: password || undefined,
          users_table: initial.users_table,
        }),
      "Не удалось сохранить подключение",
    );
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-slate-800 p-4">
      <h2 className="font-semibold">Подключение к базе данных бота</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {fields.map((f) => (
          <div key={f.label}>
            <label className="block text-xs text-slate-400 mb-1">{f.label}</label>
            <input
              className={INPUT_CLASS}
              type={f.type}
              placeholder={f.placeholder}
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              required
            />
          </div>
        ))}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Пароль</label>
          <input
            className={INPUT_CLASS}
            type="password"
            autoComplete="new-password"
            placeholder={initial.has_password ? "не менять" : "пароль"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Проверка..." : "Проверить и сохранить"}
        </button>
        {initial.configured && (
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              confirmDelete
                ? run(() => api.deleteBotDatabase(serviceId), "Не удалось удалить подключение")
                : setConfirmDelete(true)
            }
            className="rounded bg-slate-800 px-4 py-2 text-sm text-red-300 hover:bg-slate-700 disabled:opacity-50"
          >
            {confirmDelete ? "Точно удалить?" : "Удалить подключение"}
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Подключение только для чтения: панель не может изменить данные бота. Пароль хранится в зашифрованном виде.
      </p>
    </form>
  );
}

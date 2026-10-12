import { useState } from "react";
import { usePolling } from "../../hooks/useApi.ts";
import { api } from "../../api/client.ts";
import DatabaseForm from "./DatabaseForm.tsx";
import UsersTable from "./UsersTable.tsx";

type Props = { serviceId: string; canManage: boolean };

// Everything for one bot: its database connection and the user table viewer.
export default function ServiceDatabasePanel({ serviceId, canManage }: Props) {
  const database = usePolling(() => api.getBotDatabase(serviceId), 300000, [serviceId]);
  const [editing, setEditing] = useState(false);

  if (database.loading) return <p className="text-slate-400">Загрузка...</p>;
  if (database.error) return <p className="text-red-400">{database.error}</p>;
  const config = database.data;
  if (!config) return null;

  // Remembers the chosen table; an empty password keeps the saved one.
  const makeDefault = async (table: string) => {
    await api.saveBotDatabase(serviceId, {
      host: config.host ?? "127.0.0.1",
      port: config.port ?? 5432,
      dbname: config.dbname ?? "",
      user: config.user ?? "",
      users_table: table,
    });
    database.refresh();
  };

  const showForm = canManage && (editing || !config.configured);
  const connectionKey = `${config.host}:${config.port}/${config.dbname}/${config.user}/${config.users_table}`;

  return (
    <div className="space-y-4">
      {config.configured && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 p-4 text-sm">
          <span className="text-slate-300">
            База:{" "}
            <span className="font-mono">
              {config.user}@{config.host}:{config.port}/{config.dbname}
            </span>
          </span>
          {canManage && (
            <button
              onClick={() => setEditing((value) => !value)}
              className="rounded bg-slate-800 px-3 py-1 hover:bg-slate-700"
            >
              {editing ? "Скрыть" : "Изменить подключение"}
            </button>
          )}
        </div>
      )}

      {showForm && (
        <DatabaseForm
          key={connectionKey}
          serviceId={serviceId}
          initial={config}
          onSaved={() => {
            setEditing(false);
            database.refresh();
          }}
        />
      )}

      {!config.configured && !canManage && (
        <p className="text-slate-400">
          Для этого бота база данных не настроена. Обратитесь к администратору.
        </p>
      )}

      {config.configured && (
        <UsersTable
          key={connectionKey}
          serviceId={serviceId}
          defaultTable={config.users_table}
          onMakeDefault={canManage ? makeDefault : undefined}
        />
      )}
    </div>
  );
}

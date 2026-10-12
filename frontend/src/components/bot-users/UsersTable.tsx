import { useState } from "react";
import { usePolling } from "../../hooks/useApi.ts";
import { api, ApiError } from "../../api/client.ts";
import type { BotCell } from "../../types/index.ts";

const PAGE_SIZE = 50;

type Props = {
  serviceId: string;
  defaultTable: string | null;
  onMakeDefault?: (table: string) => Promise<void>;
};

function formatCell(value: BotCell): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "да" : "нет";
  return String(value);
}

// Read-only browser for one table of a bot's database, with search and paging.
export default function UsersTable({ serviceId, defaultTable, onMakeDefault }: Props) {
  const tables = usePolling(() => api.botTables(serviceId), 300000, [serviceId]);
  const [table, setTable] = useState<string | null>(defaultTable);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  const activeTable = table ?? tables.data?.tables[0] ?? null;
  const page = usePolling(
    () =>
      activeTable
        ? api.botUsers(serviceId, { table: activeTable, q: query, limit: PAGE_SIZE, offset })
        : Promise.resolve(null),
    60000,
    [serviceId, activeTable, query, offset],
  );

  const selectTable = (value: string) => {
    setTable(value);
    setOffset(0);
  };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(search.trim());
    setOffset(0);
  };

  const makeDefault = async () => {
    if (!activeTable || !onMakeDefault) return;
    setActionError(null);
    try {
      await onMakeDefault(activeTable);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Не удалось сохранить");
    }
  };

  if (tables.loading) return <p className="text-slate-400">Загрузка таблиц...</p>;
  if (tables.error) return <p className="text-red-400">{tables.error}</p>;

  const tableNames = tables.data?.tables ?? [];
  if (tableNames.length === 0) {
    return (
      <p className="text-slate-400">
        В базе нет доступных таблиц. Проверьте права пользователя базы данных.
      </p>
    );
  }

  const data = page.data;
  const rangeEnd = data ? Math.min(data.offset + data.rows.length, data.total) : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px]">
          <label className="block text-xs text-slate-400 mb-1">Таблица</label>
          <select
            className="w-full rounded bg-slate-800 px-3 py-2 text-sm"
            value={activeTable ?? ""}
            onChange={(e) => selectTable(e.target.value)}
          >
            {tableNames.map((name) => (
              <option key={name} value={name}>
                {name}
                {name === defaultTable ? " (пользователи)" : ""}
              </option>
            ))}
          </select>
        </div>
        <form onSubmit={onSearch} className="flex flex-1 min-w-[240px] gap-2">
          <input
            className="flex-1 rounded bg-slate-800 px-3 py-2 text-sm"
            placeholder="Поиск: имя, телефон, Telegram ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={100}
          />
          <button type="submit" className="rounded bg-slate-700 px-4 py-2 text-sm hover:bg-slate-600">
            Найти
          </button>
        </form>
        {onMakeDefault && activeTable && activeTable !== defaultTable && (
          <button
            onClick={makeDefault}
            className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium"
          >
            Сделать таблицей пользователей
          </button>
        )}
      </div>

      {actionError && <p className="text-sm text-red-400">{actionError}</p>}
      {page.error && <p className="text-sm text-red-400">{page.error}</p>}
      {page.loading && !data && <p className="text-slate-400">Загрузка...</p>}

      {data &&
        (data.rows.length === 0 ? (
          <p className="text-slate-400">{query ? "Ничего не найдено." : "Таблица пуста."}</p>
        ) : (
          <div className="max-h-[65vh] overflow-auto rounded-lg border border-slate-800">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-900">
                <tr>
                  {data.columns.map((column) => (
                    <th
                      key={column}
                      className="whitespace-nowrap px-3 py-2 text-left font-medium text-slate-400"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={data.offset + i} className="border-t border-slate-800 hover:bg-slate-800/40">
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        title={formatCell(cell)}
                        className={`max-w-[320px] truncate whitespace-nowrap px-3 py-2 ${cell === null ? "text-slate-600" : "text-slate-200"}`}
                      >
                        {formatCell(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>
            {data.offset + 1}–{rangeEnd} из {data.total}
          </span>
          <div className="flex gap-2">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="rounded bg-slate-800 px-3 py-1 hover:bg-slate-700 disabled:opacity-40"
            >
              Назад
            </button>
            <button
              disabled={rangeEnd >= data.total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="rounded bg-slate-800 px-3 py-1 hover:bg-slate-700 disabled:opacity-40"
            >
              Вперёд
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { useDebounce } from "@/hooks/use-debounce.ts";
import { ChevronLeft, ChevronRight, Search, Table2 } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import {
  ErrorState,
  ErrorStateDescription,
  ErrorStateHeader,
  ErrorStateTitle,
} from "@/components/ui/error-state.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import {
  errorText,
  useBrowse,
  type BrowseKind,
} from "../_hooks/use-bot-data.ts";

const PAGE_SIZE = 25;

type Props = {
  botId: Id<"bots">;
  kind: BrowseKind;
  tableName: string | undefined;
  noun: string;
  onOpenSettings: () => void;
};

export default function DataTable({
  botId,
  kind,
  tableName,
  noun,
  onOpenSettings,
}: Props) {
  const [page, setPage] = useState(0);
  const [input, setInput] = useState("");
  const [search] = useDebounce(input, 400);
  const { data, error, isPending } = useBrowse(
    botId,
    kind,
    page,
    search,
    tableName,
  );

  if (!tableName) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Table2 />
          </EmptyMedia>
          <EmptyTitle>Таблица не выбрана</EmptyTitle>
          <EmptyDescription>
            Выберите в настройках, какая таблица базы хранит {noun}.
          </EmptyDescription>
        </EmptyHeader>
        <Button size="sm" onClick={onOpenSettings}>
          Открыть настройки
        </Button>
      </Empty>
    );
  }

  if (error) {
    return (
      <ErrorState>
        <ErrorStateHeader>
          <ErrorStateTitle>Не удалось прочитать данные</ErrorStateTitle>
          <ErrorStateDescription>
            Проверьте соединение и настройки таблицы.
          </ErrorStateDescription>
        </ErrorStateHeader>
        <details className="max-w-md text-xs text-muted-foreground">
          <summary className="cursor-pointer">Подробности</summary>
          {errorText(error)}
        </details>
      </ErrorState>
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Поиск по всем колонкам"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setPage(0);
          }}
        />
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : data.rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Ничего не найдено</EmptyTitle>
            <EmptyDescription>
              В таблице «{tableName}» нет подходящих записей.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {data.columns.map((c) => (
                  <TableHead key={c} className="whitespace-nowrap">
                    {c}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row, i) => (
                <TableRow key={i}>
                  {row.map((cell, j) => (
                    <TableCell
                      key={j}
                      className="max-w-[320px] truncate font-mono text-xs"
                      title={cell === null ? "" : String(cell)}
                    >
                      {cell === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        String(cell)
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Всего: {data.total}</span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              aria-label="Назад"
            >
              <ChevronLeft />
            </Button>
            <span>
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage(page + 1)}
              aria-label="Вперёд"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

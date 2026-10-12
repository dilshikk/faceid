import { useState } from "react";
import { useAction } from "convex/react";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api.js";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { useBotStats } from "../_hooks/use-bot-data.ts";
import StatusBadge from "./status-badge.tsx";

type Props = {
  bot: Omit<Doc<"bots">, "connectionString" | "botToken"> & {
    host: string;
    hasToken: boolean;
  };
  onOpenSettings: () => void;
};

export default function OverviewTab({ bot, onOpenSettings }: Props) {
  const check = useAction(api.bots.postgres.checkConnection);
  const queryClient = useQueryClient();
  const [checking, setChecking] = useState(false);
  const stats = useBotStats(bot._id, bot.lastCheckedAt ?? "");

  const runCheck = async () => {
    setChecking(true);
    try {
      const result = await check({ botId: bot._id });
      if (result.ok) toast.success(`Соединение работает: ${result.latencyMs} мс`);
      else toast.error("Не удалось подключиться");
      await queryClient.invalidateQueries({ queryKey: ["bot-stats"] });
    } finally {
      setChecking(false);
    }
  };

  const cards = [
    { label: "Пользователи", icon: Users, value: stats.data?.users, table: bot.usersTable },
    { label: "Записи журнала", icon: Activity, value: stats.data?.logs, table: bot.logsTable },
    { label: "Ошибки", icon: AlertTriangle, value: stats.data?.errors, table: bot.errorsTable },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <StatusBadge status={bot.status} />
              {bot.lastLatencyMs !== undefined && (
                <span className="text-sm text-muted-foreground">
                  {bot.lastLatencyMs} мс
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {bot.lastCheckedAt
                ? `Проверено: ${new Date(bot.lastCheckedAt).toLocaleString()}`
                : "Соединение ещё не проверялось"}
            </p>
            {bot.status === "offline" && bot.lastError && (
              <details className="text-xs text-destructive">
                <summary className="cursor-pointer">Подробности ошибки</summary>
                {bot.lastError}
              </details>
            )}
          </div>
          <Button onClick={runCheck} disabled={checking}>
            {checking ? <Spinner /> : <RefreshCw />}
            Проверить соединение
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map(({ label, icon: Icon, value, table }) => (
          <Card key={label}>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className="size-4" /> {label}
              </div>
              {!table ? (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="cursor-pointer text-sm text-primary underline-offset-4 hover:underline"
                >
                  Выбрать таблицу
                </button>
              ) : stats.isPending ? (
                <Skeleton className="h-9 w-20" />
              ) : (
                <div className="text-3xl font-semibold tabular-nums">
                  {value ?? "—"}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

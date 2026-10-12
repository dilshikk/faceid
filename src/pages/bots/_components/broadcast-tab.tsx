import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { useQuery as useRq } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api.js";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { errorText } from "../_hooks/use-bot-data.ts";

type Props = {
  bot: Omit<Doc<"bots">, "connectionString" | "botToken"> & {
    host: string;
    hasToken: boolean;
  };
  onOpenSettings: () => void;
};

type Result = { sent: number; blocked: number; failed: number; total: number; truncated: boolean };

export default function BroadcastTab({ bot, onOpenSettings }: Props) {
  const status = useQuery(api.access.allowlist.status, {});
  const isAdmin = status?.state === "allowed" && status.isAdmin;
  const countAction = useAction(api.bots.broadcast.countRecipients);
  const sendAction = useAction(api.bots.broadcast.send);
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const ready = Boolean(bot.usersTable && bot.chatIdColumn && bot.hasToken);
  const recipients = useRq({
    queryKey: ["bot-recipients", bot._id, bot.usersTable, bot.chatIdColumn],
    queryFn: () => countAction({ botId: bot._id }),
    enabled: ready && isAdmin,
    retry: false,
  });

  const send = async () => {
    setConfirm(false);
    setSending(true);
    setResult(null);
    try {
      const r = await sendAction({ botId: bot._id, text });
      setResult(r);
      toast.success("Рассылка завершена");
      setText("");
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSending(false);
    }
  };

  if (status === undefined) return null;
  if (!isAdmin) {
    return <p className="text-muted-foreground">Рассылку может запускать только администратор.</p>;
  }

  if (!ready) {
    return (
      <Card className="max-w-2xl">
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Для рассылки нужны токен бота, таблица пользователей и колонка с
            Telegram ID пользователя.
          </p>
          <Button onClick={onOpenSettings}>Открыть настройки</Button>
        </CardContent>
      </Card>
    );
  }

  const count = recipients.data?.count;

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Рассылка пользователям в Telegram</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            rows={6}
            maxLength={4096}
            placeholder="Текст сообщения"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={sending}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {recipients.isPending
                ? "Считаю получателей..."
                : recipients.error
                  ? "Не удалось получить список получателей"
                  : `Получателей: ${count}${recipients.data?.truncated ? " (первые 5000)" : ""}`}
            </span>
            <Button
              onClick={() => setConfirm(true)}
              disabled={sending || !text.trim() || !count}
            >
              {sending ? <Spinner /> : <Send />} Отправить всем
            </Button>
          </div>
          {sending && (
            <p className="text-sm text-muted-foreground">
              Идёт отправка, не закрывайте страницу. Это может занять несколько минут.
            </p>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="space-y-1 text-sm">
            <div>Доставлено: <b>{result.sent}</b> из {result.total}</div>
            <div>Заблокировали бота или чат недоступен: {result.blocked}</div>
            <div>Ошибки отправки: {result.failed}</div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отправить сообщение {count} пользователям?</AlertDialogTitle>
            <AlertDialogDescription>
              Сообщение уйдёт от бота «{bot.name}». Отменить рассылку после
              запуска нельзя.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={send}>Отправить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

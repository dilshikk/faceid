import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Copy, RefreshCw, Server } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api.js";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { errorText } from "../_hooks/use-bot-data.ts";
import { buildAgentScript } from "../_lib/agent-script.ts";

type Props = {
  bot: Omit<Doc<"bots">, "connectionString" | "botToken"> & {
    host: string;
    hasToken: boolean;
  };
};

const STALE_MS = 3 * 60 * 1000;

function isFresh(iso?: string): boolean {
  return iso !== undefined && Date.now() - new Date(iso).getTime() < STALE_MS;
}

function ago(iso?: string): string {
  if (!iso) return "нет данных";
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return "только что";
  if (sec < 3600) return `${Math.round(sec / 60)} мин назад`;
  if (sec < 86400) return `${Math.round(sec / 3600)} ч назад`;
  return `${Math.round(sec / 86400)} дн назад`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function Ok({ ok, yes, no }: { ok?: boolean; yes: string; no: string }) {
  if (ok === undefined) return <Badge variant="secondary">Не проверялось</Badge>;
  return <Badge variant={ok ? "secondary" : "destructive"}>{ok ? yes : no}</Badge>;
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{value}%</span>
      </div>
      <Progress value={Math.min(100, value)} />
    </div>
  );
}

function SetupDialog({ botId, initialKey, onClose }: { botId: Doc<"bots">["_id"]; initialKey: string; onClose: () => void }) {
  const rotate = useMutation(api.monitor.agents.rotateKey);
  const [key, setKey] = useState<string>(initialKey);
  const [service, setService] = useState("mybot");
  const [loading, setLoading] = useState(false);

  const rotateKey = async () => {
    setLoading(true);
    try {
      setKey(await rotate({ botId }));
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setLoading(false);
    }
  };

  const script = buildAgentScript(key, service || "mybot");
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Скопировано");
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Подключить сервер (VPS)</DialogTitle>
          <DialogDescription>
            Небольшой скрипт на вашем сервере раз в минуту присылает в панель
            загрузку процессора, память и состояние службы бота.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="svc">Имя службы systemd, в которой работает бот</Label>
            <Input id="svc" value={service} onChange={(e) => setService(e.target.value)} placeholder="mybot" />
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Скопируйте скрипт и сохраните на сервере как <code>/opt/panel-agent.sh</code>.</li>
            <li>Выполните: <code>chmod +x /opt/panel-agent.sh</code>.</li>
            <li>Добавьте в <code>crontab -e</code> строку: <code>* * * * * /opt/panel-agent.sh</code>.</li>
            <li>Через минуту данные появятся на этой вкладке.</li>
          </ol>
          <Textarea readOnly rows={10} value={script} className="font-mono text-xs" />
          <div className="flex flex-wrap justify-between gap-2">
            <Button onClick={() => copy(script)}>
              <Copy /> Скопировать скрипт
            </Button>
            <Button variant="ghost" disabled={loading} onClick={rotateKey}>
              {loading ? <Spinner /> : <RefreshCw />} Выпустить новый ключ
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Ключ даёт право только присылать данные в панель. Если он попал не
            в те руки, выпустите новый и обновите скрипт.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function MonitorTab({ bot }: Props) {
  const status = useQuery(api.access.allowlist.status, {});
  const isAdmin = status?.state === "allowed" && status.isAdmin;
  const agent = useQuery(api.monitor.agents.get, { botId: bot._id });
  const checkNow = useAction(api.monitor.checks.checkNow);
  const getKey = useMutation(api.monitor.agents.getKey);
  const [checking, setChecking] = useState(false);
  const [setupKey, setSetupKey] = useState<string | null>(null);

  const openSetup = async () => {
    try {
      setSetupKey(await getKey({ botId: bot._id }));
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const run = async () => {
    setChecking(true);
    try {
      await checkNow({ botId: bot._id });
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setChecking(false);
    }
  };

  const agentFresh = isFresh(agent?.receivedAt);

  return (
    <div className="grid max-w-4xl gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Бот и Telegram</CardTitle>
          <Button size="sm" onClick={run} disabled={checking}>
            {checking ? <Spinner /> : <RefreshCw />} Проверить
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row label="Telegram API">
            <Ok ok={bot.hasToken ? bot.telegramOk : undefined} yes="Отвечает" no="Не принимает токен" />
          </Row>
          {bot.telegramUsername && <Row label="Бот">@{bot.telegramUsername}</Row>}
          {bot.telegramLatencyMs !== undefined && (
            <Row label="Ответ Telegram">{bot.telegramLatencyMs} мс</Row>
          )}
          {bot.telegramError && (
            <p className="text-xs text-destructive">{bot.telegramError}</p>
          )}
          <Row label="База данных">
            <Ok ok={bot.status ? bot.status === "online" : undefined} yes="Доступна" no="Нет связи" />
          </Row>
          <Row label="Последняя активность">{ago(bot.lastActivityAt)}</Row>
          <Row label="Последний успешный запрос к Telegram">{ago(bot.telegramOkAt)}</Row>
          <Row label="Последняя проверка">{ago(bot.lastCheckedAt)}</Row>
          <p className="text-xs text-muted-foreground">
            Панель сама проверяет бота каждые 5 минут.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Сервер (VPS)</CardTitle>
          {isAdmin && (
            <Button size="sm" variant="ghost" onClick={openSetup}>
              <Server /> {agent?.receivedAt ? "Скрипт" : "Подключить"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {agent === undefined ? (
            <Skeleton className="h-32 w-full" />
          ) : !agent?.receivedAt ? (
            <p className="text-sm text-muted-foreground">
              Сервер ещё не подключён.
              {isAdmin ? " Нажмите «Подключить» и следуйте шагам." : " Подключить его может администратор."}
            </p>
          ) : (
            <>
              <Row label="Данные получены">
                <Badge variant={agentFresh ? "secondary" : "destructive"}>
                  {ago(agent.receivedAt)}
                </Badge>
              </Row>
              <Row label={`Служба ${agent.service ?? ""}`}>
                <Ok ok={agent.serviceState ? agent.serviceState === "active" : undefined} yes="Работает" no={agent.serviceState ?? "Не работает"} />
              </Row>
              {agent.cpu !== undefined && <Meter label="Процессор" value={Math.round(agent.cpu)} />}
              {agent.ramPercent !== undefined && (
                <Meter label={`Память (${agent.ramUsedMb} из ${agent.ramTotalMb} МБ)`} value={agent.ramPercent} />
              )}
              {agent.load1 !== undefined && <Row label="Нагрузка (1 мин)">{agent.load1}</Row>}
              {agent.uptimeSec !== undefined && (
                <Row label="Сервер работает">{Math.floor(agent.uptimeSec / 86400)} дн {Math.floor((agent.uptimeSec % 86400) / 3600)} ч</Row>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {setupKey && <SetupDialog botId={bot._id} initialKey={setupKey} onClose={() => setSetupKey(null)} />}
    </div>
  );
}

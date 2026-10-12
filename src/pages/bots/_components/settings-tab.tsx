import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "convex/react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { errorText, useBotTables } from "../_hooks/use-bot-data.ts";

type Props = {
  bot: Omit<Doc<"bots">, "connectionString" | "botToken"> & {
    host: string;
    hasToken: boolean;
  };
};

const NONE = "none";

type TableFieldProps = {
  label: string;
  value: string;
  tables: string[];
  onChange: (value: string) => void;
};

function TableField({ label, value, tables, onChange }: TableFieldProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Не использовать</SelectItem>
          {tables.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function SettingsTab({ bot }: Props) {
  const navigate = useNavigate();
  const update = useMutation(api.bots.bots.update);
  const remove = useMutation(api.bots.bots.remove);
  const tables = useBotTables(bot._id, true);

  const [name, setName] = useState(bot.name);
  const [token, setToken] = useState("");
  const [dbHost, setDbHost] = useState(bot.dbHost ?? "");
  const [dbPort, setDbPort] = useState(String(bot.dbPort ?? 5432));
  const [dbName, setDbName] = useState(bot.dbName ?? "");
  const [dbUser, setDbUser] = useState(bot.dbUser ?? "");
  const [password, setPassword] = useState("");
  const [ssl, setSsl] = useState(bot.ssl);
  const [usersTable, setUsersTable] = useState(bot.usersTable ?? NONE);
  const [logsTable, setLogsTable] = useState(bot.logsTable ?? NONE);
  const [errorsTable, setErrorsTable] = useState(bot.errorsTable ?? NONE);
  const [saving, setSaving] = useState(false);

  const names = tables.data?.map((t) => t.name) ?? [];
  // Keep a previously saved table selectable even if discovery failed.
  const withSaved = (value: string) =>
    value !== NONE && !names.includes(value) ? [...names, value] : names;
  const toValue = (v: string) => (v === NONE ? null : v);

  const save = async () => {
    setSaving(true);
    try {
      await update({
        botId: bot._id,
        name,
        ssl,
        botToken: token || undefined,
        dbHost,
        dbPort: Number(dbPort),
        dbName,
        dbUser,
        dbPassword: password || undefined,
        usersTable: toValue(usersTable),
        logsTable: toValue(logsTable),
        errorsTable: toValue(errorsTable),
      });
      setToken("");
      setPassword("");
      toast.success("Настройки сохранены");
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  const doRemove = async () => {
    await remove({ botId: bot._id });
    toast.success("Бот удалён");
    navigate("/bots");
  };

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Подключение</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="s-name">Название</Label>
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-token">Токен бота</Label>
            <Input
              id="s-token"
              type="password"
              autoComplete="off"
              placeholder={bot.hasToken ? "Сохранён. Оставьте пустым, чтобы не менять" : "Не задан"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="s-host">Хост</Label>
              <Input id="s-host" value={dbHost} onChange={(e) => setDbHost(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-port">Порт</Label>
              <Input id="s-port" type="number" value={dbPort} onChange={(e) => setDbPort(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-db">База данных</Label>
            <Input id="s-db" value={dbName} onChange={(e) => setDbName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="s-user">Логин</Label>
              <Input id="s-user" value={dbUser} onChange={(e) => setDbUser(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-pass">Пароль</Label>
              <Input
                id="s-pass"
                type="password"
                autoComplete="off"
                placeholder="Оставьте пустым, чтобы не менять"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="s-ssl">Защищённое соединение (SSL)</Label>
            <Switch id="s-ssl" checked={ssl} onCheckedChange={setSsl} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Какие таблицы показывать</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {tables.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Читаю список таблиц...
            </div>
          )}
          {tables.error && (
            <details className="text-sm text-destructive">
              <summary className="cursor-pointer">
                Не удалось получить таблицы. Проверьте соединение.
              </summary>
              {errorText(tables.error)}
            </details>
          )}
          <TableField label="Пользователи" value={usersTable} tables={withSaved(usersTable)} onChange={setUsersTable} />
          <TableField label="Журнал событий" value={logsTable} tables={withSaved(logsTable)} onChange={setLogsTable} />
          <TableField label="Ошибки" value={errorsTable} tables={withSaved(errorsTable)} onChange={setErrorsTable} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button onClick={save} disabled={saving}>
          {saving && <Spinner />} Сохранить
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Удалить бота</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить «{bot.name}»?</AlertDialogTitle>
              <AlertDialogDescription>
                Подключение будет удалено из панели. Сама база данных бота не
                затрагивается.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction onClick={doRemove}>Удалить</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

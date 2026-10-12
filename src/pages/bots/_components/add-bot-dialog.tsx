import { useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";

type Props = { onCreated?: (botId: string) => void; children: React.ReactNode };

export default function AddBotDialog({ onCreated, children }: Props) {
  const createBot = useMutation(api.bots.bots.create);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [ssl, setSsl] = useState(true);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const id = await createBot({ name, connectionString: url, ssl });
      toast.success("Бот добавлен");
      setOpen(false);
      setName("");
      setUrl("");
      onCreated?.(id);
    } catch (error) {
      toast.error(
        error instanceof ConvexError
          ? (error.data as { message: string }).message
          : "Не удалось добавить бота",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Подключить бота</DialogTitle>
            <DialogDescription>
              Укажите адрес базы данных PostgreSQL, в которой бот хранит данные.
              Таблицы выберете на следующем шаге.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="bot-name">Название</Label>
            <Input
              id="bot-name"
              required
              placeholder="Бот поддержки"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bot-url">Адрес базы данных</Label>
            <Input
              id="bot-url"
              required
              type="password"
              autoComplete="off"
              placeholder="postgresql://user:password@host:5432/dbname"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Хранится на сервере и никогда не показывается в браузере.
              Рекомендуем создать для панели отдельного пользователя базы с
              правом только на чтение.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="bot-ssl">Защищённое соединение (SSL)</Label>
            <Switch id="bot-ssl" checked={ssl} onCheckedChange={setSsl} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving && <Spinner />}
              Добавить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

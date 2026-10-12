import { useState } from "react";
import { useMutation } from "convex/react";
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
import { errorText } from "../_hooks/use-bot-data.ts";

type Props = { onCreated?: (botId: string) => void; children: React.ReactNode };

const EMPTY = {
  name: "",
  botToken: "",
  dbHost: "",
  dbPort: "5432",
  dbName: "",
  dbUser: "",
  dbPassword: "",
};

type FieldProps = {
  id: keyof typeof EMPTY;
  label: string;
  placeholder?: string;
  type?: string;
  className?: string;
  value: string;
  onChange: (id: keyof typeof EMPTY, value: string) => void;
};

function Field({ id, label, placeholder, type, className, value, onChange }: FieldProps) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label htmlFor={`bot-${id}`}>{label}</Label>
      <Input
        id={`bot-${id}`}
        required
        type={type}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(id, e.target.value)}
      />
    </div>
  );
}

export default function AddBotDialog({ onCreated, children }: Props) {
  const createBot = useMutation(api.bots.bots.create);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [ssl, setSsl] = useState(true);

  const set = (id: keyof typeof EMPTY, value: string) =>
    setForm((prev) => ({ ...prev, [id]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const id = await createBot({
        name: form.name,
        botToken: form.botToken,
        dbHost: form.dbHost,
        dbPort: Number(form.dbPort),
        dbName: form.dbName,
        dbUser: form.dbUser,
        dbPassword: form.dbPassword,
        ssl,
      });
      toast.success("Бот добавлен");
      setOpen(false);
      setForm(EMPTY);
      onCreated?.(id);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  const props = (id: keyof typeof EMPTY) => ({ id, value: form[id], onChange: set });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Добавить бота</DialogTitle>
            <DialogDescription>
              Название, токен бота и данные базы PostgreSQL. Пароль и токен
              хранятся на сервере и не показываются в браузере.
            </DialogDescription>
          </DialogHeader>
          <Field {...props("name")} label="Название" placeholder="Бот поддержки" />
          <Field {...props("botToken")} label="Токен бота" type="password" placeholder="123456:ABC-DEF..." />
          <div className="grid grid-cols-3 gap-3">
            <Field {...props("dbHost")} label="Хост" placeholder="db.example.com" className="col-span-2" />
            <Field {...props("dbPort")} label="Порт" type="number" />
          </div>
          <Field {...props("dbName")} label="База данных" placeholder="botdb" />
          <div className="grid grid-cols-2 gap-3">
            <Field {...props("dbUser")} label="Логин" placeholder="readonly_user" />
            <Field {...props("dbPassword")} label="Пароль" type="password" />
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

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api.js";
import AppHeader from "@/components/app-header.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { errorText } from "../bots/_hooks/use-bot-data.ts";

export default function AccessSettingsPage() {
  const status = useQuery(api.access.allowlist.status, {});
  const isAdmin = status?.state === "allowed" && status.isAdmin;
  const entries = useQuery(api.access.allowlist.list, isAdmin ? {} : "skip");
  const add = useMutation(api.access.allowlist.add);
  const remove = useMutation(api.access.allowlist.remove);
  const [email, setEmail] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await add({ email, isAdmin: makeAdmin });
      setEmail("");
      setMakeAdmin(false);
      toast.success("E-mail добавлен");
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const doRemove = async (id: NonNullable<typeof entries>[number]["_id"]) => {
    try {
      await remove({ id });
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Доступ</h1>
          <p className="text-sm text-muted-foreground">
            В панель входят только аккаунты Google с этими e-mail
          </p>
        </div>

        {status === undefined ? (
          <Skeleton className="h-48 w-full" />
        ) : !isAdmin ? (
          <p className="text-muted-foreground">Настройки доступа видит только администратор.</p>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Добавить e-mail</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={submit} className="space-y-4">
                  <Input
                    type="email"
                    required
                    placeholder="example@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <Label htmlFor="make-admin">Дать права администратора</Label>
                    <Switch id="make-admin" checked={makeAdmin} onCheckedChange={setMakeAdmin} />
                  </div>
                  <Button type="submit">Добавить</Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Разрешённые адреса</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {entries === undefined ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  entries.map((entry) => (
                    <div key={entry._id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                      <span className="truncate text-sm">{entry.email}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{entry.isAdmin ? "Админ" : "Наблюдатель"}</Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Удалить"
                          onClick={() => doRemove(entry._id)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

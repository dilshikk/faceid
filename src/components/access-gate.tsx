import { useMutation, useQuery } from "convex/react";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import AppHeader from "@/components/app-header.tsx";

// Shown after sign-in: only e-mails from the allowed list get through.
export default function AccessGate({ children }: { children: React.ReactNode }) {
  const status = useQuery(api.access.allowlist.status, {});
  const claim = useMutation(api.access.allowlist.claim);

  if (status === undefined) return <Skeleton className="m-8 h-64" />;
  if (status.state === "allowed") return <>{children}</>;

  const unclaimed = status.state === "unclaimed";
  return (
    <>
      <AppHeader />
      <div className="mx-auto max-w-lg px-4 py-16">
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldAlert />
            </EmptyMedia>
            <EmptyTitle>
              {unclaimed ? "Панель ещё не настроена" : "Нет доступа"}
            </EmptyTitle>
            <EmptyDescription>
              {unclaimed
                ? `Станьте администратором с адресом ${status.email ?? ""}. Потом вы сможете добавить остальные e-mail.`
                : `Адрес ${status.email ?? "вашего аккаунта"} не входит в список разрешённых. Попросите администратора добавить его.`}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {unclaimed ? (
              <Button
                onClick={() =>
                  claim({}).catch(() => toast.error("Не удалось назначить администратора"))
                }
              >
                Стать администратором
              </Button>
            ) : (
              <SignInButton signOutText="Выйти и войти другим аккаунтом" />
            )}
          </EmptyContent>
        </Empty>
      </div>
    </>
  );
}

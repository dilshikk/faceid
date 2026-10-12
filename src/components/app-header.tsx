import { Link } from "react-router-dom";
import { Radar } from "lucide-react";
import { Authenticated, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";

function AdminLink() {
  const status = useQuery(api.access.allowlist.status, {});
  if (status?.state !== "allowed" || !status.isAdmin) return null;
  return (
    <Button asChild variant="ghost" size="sm">
      <Link to="/access">Доступ</Link>
    </Button>
  );
}

export default function AppHeader() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Radar className="size-4" />
          </span>
          Пульт ботов
        </Link>
        <Authenticated>
          <div className="flex items-center gap-1">
            <AdminLink />
            <SignInButton variant="ghost" size="sm" signOutText="Выйти" />
          </div>
        </Authenticated>
      </div>
    </header>
  );
}

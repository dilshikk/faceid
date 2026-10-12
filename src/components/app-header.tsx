import { Link } from "react-router-dom";
import { Radar } from "lucide-react";
import { Authenticated } from "convex/react";
import { SignInButton } from "@/components/ui/signin.tsx";

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
          <SignInButton variant="ghost" size="sm" signOutText="Выйти" />
        </Authenticated>
      </div>
    </header>
  );
}

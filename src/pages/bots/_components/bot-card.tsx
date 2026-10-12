import { Link } from "react-router-dom";
import { ChevronRight, Database } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card.tsx";
import StatusBadge from "./status-badge.tsx";

type Props = {
  bot: {
    _id: string;
    name: string;
    host: string;
    status?: "online" | "offline";
    lastLatencyMs?: number;
  };
};

export default function BotCard({ bot }: Props) {
  return (
    <Link to={`/bots/${bot._id}`} className="block">
      <Card className="cursor-pointer transition-colors hover:border-primary/50">
        <CardContent className="flex items-center gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Database className="size-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="truncate font-medium">{bot.name}</div>
            <div className="truncate text-sm text-muted-foreground">
              {bot.host}
            </div>
          </div>
          <div className="hidden flex-col items-end gap-1 sm:flex">
            <StatusBadge status={bot.status} />
            {bot.lastLatencyMs !== undefined && (
              <span className="text-xs text-muted-foreground">
                {bot.lastLatencyMs} мс
              </span>
            )}
          </div>
          <ChevronRight className="size-4 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
}

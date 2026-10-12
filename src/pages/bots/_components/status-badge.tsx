import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";

type Props = { status?: "online" | "offline" };

export default function StatusBadge({ status }: Props) {
  const label =
    status === "online"
      ? "Онлайн"
      : status === "offline"
        ? "Нет связи"
        : "Не проверялся";
  return (
    <Badge variant="secondary" className="gap-1.5">
      <span
        className={cn(
          "size-2 rounded-full",
          status === "online" && "bg-chart-2",
          status === "offline" && "bg-destructive",
          !status && "bg-muted-foreground/50",
        )}
      />
      {label}
    </Badge>
  );
}

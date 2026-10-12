import type { ServiceStatusValue } from "../types/index.ts";

const COLORS: Record<ServiceStatusValue, string> = {
  active: "bg-emerald-500/20 text-emerald-400",
  inactive: "bg-slate-500/20 text-slate-400",
  failed: "bg-red-500/20 text-red-400",
  activating: "bg-amber-500/20 text-amber-400",
  unknown: "bg-slate-500/20 text-slate-400",
};

const LABELS: Record<ServiceStatusValue, string> = {
  active: "Активен",
  inactive: "Неактивен",
  failed: "Сбой",
  activating: "Запускается",
  unknown: "Неизвестно",
};

export default function StatusBadge({ status }: { status: ServiceStatusValue }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${COLORS[status]}`}>
      {LABELS[status]}
    </span>
  );
}

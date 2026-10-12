import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export function errorText(error: unknown): string {
  if (error instanceof ConvexError) {
    const data: unknown = error.data;
    if (typeof data === "object" && data !== null && "message" in data) {
      return String(data.message);
    }
  }
  return error instanceof Error ? error.message : "Что-то пошло не так";
}

export type BrowseKind = "users" | "logs" | "errors";

export function useBrowse(
  botId: Id<"bots">,
  kind: BrowseKind,
  page: number,
  search: string,
  tableName: string | undefined,
) {
  const browse = useAction(api.bots.postgres.browse);
  return useQuery({
    queryKey: ["bot-browse", botId, kind, tableName, page, search],
    queryFn: () =>
      browse({ botId, kind, page, search: search || undefined }),
    enabled: Boolean(tableName),
    retry: false,
  });
}

export function useBotStats(botId: Id<"bots">, version: string) {
  const stats = useAction(api.bots.postgres.stats);
  return useQuery({
    queryKey: ["bot-stats", botId, version],
    queryFn: () => stats({ botId }),
    retry: false,
  });
}

export function useBotTables(botId: Id<"bots">, enabled: boolean) {
  const discover = useAction(api.bots.postgres.discoverTables);
  return useQuery({
    queryKey: ["bot-tables", botId],
    queryFn: () => discover({ botId }),
    enabled,
    retry: false,
  });
}

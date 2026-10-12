import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import AppHeader from "@/components/app-header.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import DataTable from "./_components/data-table.tsx";
import OverviewTab from "./_components/overview-tab.tsx";
import SettingsTab from "./_components/settings-tab.tsx";
import StatusBadge from "./_components/status-badge.tsx";

export default function BotDetailPage() {
  const { botId } = useParams();
  const bot = useQuery(api.bots.bots.get, botId ? { botId } : "skip");
  const [tab, setTab] = useState("users");

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <Link
          to="/bots"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Все боты
        </Link>

        {bot === undefined ? (
          <Skeleton className="h-64 w-full" />
        ) : bot === null ? (
          <p className="text-muted-foreground">Бот не найден.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {bot.name}
              </h1>
              <StatusBadge status={bot.status} />
            </div>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="h-auto flex-wrap">
                <TabsTrigger value="users">Пользователи</TabsTrigger>
                <TabsTrigger value="overview">Обзор</TabsTrigger>
                <TabsTrigger value="logs">Журнал</TabsTrigger>
                <TabsTrigger value="errors">Ошибки</TabsTrigger>
                <TabsTrigger value="settings">Настройки</TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="pt-4">
                <OverviewTab bot={bot} onOpenSettings={() => setTab("settings")} />
              </TabsContent>
              <TabsContent value="users" className="pt-4">
                <DataTable botId={bot._id as Id<"bots">} kind="users" tableName={bot.usersTable} noun="пользователей" onOpenSettings={() => setTab("settings")} />
              </TabsContent>
              <TabsContent value="logs" className="pt-4">
                <DataTable botId={bot._id as Id<"bots">} kind="logs" tableName={bot.logsTable} noun="журнал событий" onOpenSettings={() => setTab("settings")} />
              </TabsContent>
              <TabsContent value="errors" className="pt-4">
                <DataTable botId={bot._id as Id<"bots">} kind="errors" tableName={bot.errorsTable} noun="ошибки" onOpenSettings={() => setTab("settings")} />
              </TabsContent>
              <TabsContent value="settings" className="pt-4">
                <SettingsTab key={bot._id} bot={bot} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}

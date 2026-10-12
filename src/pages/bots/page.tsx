import { useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { Bot, Plus } from "lucide-react";
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
import AppHeader from "@/components/app-header.tsx";
import AddBotDialog from "./_components/add-bot-dialog.tsx";
import BotCard from "./_components/bot-card.tsx";

function BotList() {
  const navigate = useNavigate();
  const bots = useQuery(api.bots.bots.list, {});

  if (bots === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (bots.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Bot />
          </EmptyMedia>
          <EmptyTitle>Ботов пока нет</EmptyTitle>
          <EmptyDescription>
            Подключите базу данных первого бота, чтобы увидеть его
            пользователей, журнал и ошибки.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <AddBotDialog onCreated={(id) => navigate(`/bots/${id}`)}>
            <Button size="sm">
              <Plus /> Подключить бота
            </Button>
          </AddBotDialog>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      {bots.map((bot) => (
        <BotCard key={bot._id} bot={bot} />
      ))}
    </div>
  );
}

export default function BotsPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Мои боты</h1>
            <p className="text-sm text-muted-foreground">
              Все подключённые базы данных в одном месте
            </p>
          </div>
          <AddBotDialog onCreated={(id) => navigate(`/bots/${id}`)}>
            <Button>
              <Plus /> Подключить бота
            </Button>
          </AddBotDialog>
        </div>
        <BotList />
      </main>
    </div>
  );
}

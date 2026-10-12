import { Link } from "react-router-dom";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { motion } from "motion/react";
import { Activity, AlertTriangle, Database, Users } from "lucide-react";
import AppHeader from "@/components/app-header.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";

const FEATURES = [
  { icon: Database, title: "Любая база PostgreSQL", text: "Подключите базу каждого бота по одному адресу." },
  { icon: Users, title: "Пользователи", text: "Поиск и просмотр всех пользователей бота." },
  { icon: Activity, title: "Журнал событий", text: "Что происходило в боте, от новых записей к старым." },
  { icon: AlertTriangle, title: "Ошибки", text: "Все сбои в одном месте, чтобы быстро их найти." },
];

export default function Index() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mx-auto max-w-2xl space-y-6 text-center"
        >
          <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            Все ваши боты на одном пульте
          </h1>
          <p className="text-lg text-muted-foreground text-balance">
            Подключайте базы данных ботов и смотрите пользователей, журнал и
            ошибки в одной админ-панели.
          </p>
          <div className="flex justify-center">
            <AuthLoading>
              <Skeleton className="h-10 w-40" />
            </AuthLoading>
            <Unauthenticated>
              <SignInButton size="lg" signInText="Войти" />
            </Unauthenticated>
            <Authenticated>
              <Button asChild size="lg">
                <Link to="/bots">Открыть панель</Link>
              </Button>
            </Authenticated>
          </div>
        </motion.div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 + i * 0.08, ease: "easeOut" }}
              className="space-y-2 rounded-xl border bg-card p-5"
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Icon className="size-4" />
              </div>
              <div className="font-medium">{title}</div>
              <p className="text-sm text-muted-foreground">{text}</p>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}

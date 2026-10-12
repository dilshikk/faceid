import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { DefaultProviders } from "./components/providers/default.tsx";
import AppHeader from "./components/app-header.tsx";
import { Skeleton } from "./components/ui/skeleton.tsx";
import { SignInButton } from "./components/ui/signin.tsx";
import AuthCallback from "./pages/auth/Callback.tsx";
import BotDetailPage from "./pages/bots/detail.tsx";
import BotsPage from "./pages/bots/page.tsx";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";

function Protected({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthLoading>
        <Skeleton className="m-8 h-64" />
      </AuthLoading>
      <Unauthenticated>
        <AppHeader />
        <div className="flex flex-col items-center gap-4 py-24">
          <p className="text-muted-foreground">Войдите, чтобы открыть панель</p>
          <SignInButton signInText="Войти" />
        </div>
      </Unauthenticated>
      <Authenticated>{children}</Authenticated>
    </>
  );
}

export default function App() {
  return (
    <DefaultProviders>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/bots" element={<Protected><BotsPage /></Protected>} />
          <Route path="/bots/:botId" element={<Protected><BotDetailPage /></Protected>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </DefaultProviders>
  );
}

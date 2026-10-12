import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "../hooks/useApi.ts";
import Layout from "../components/Layout.tsx";
import Login from "../pages/Login.tsx";
import Dashboard from "../pages/Dashboard.tsx";
import Services from "../pages/Services.tsx";
import ServiceDetails from "../pages/ServiceDetails.tsx";
import Logs from "../pages/Logs.tsx";
import Incidents from "../pages/Incidents.tsx";
import Settings from "../pages/Settings.tsx";
import BotUsers from "../pages/BotUsers.tsx";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const PROTECTED_ROUTES = [
  { path: "/", element: <Dashboard /> },
  { path: "/services", element: <Services /> },
  { path: "/services/:id", element: <ServiceDetails /> },
  { path: "/services/:id/logs", element: <Logs /> },
  { path: "/bot-users", element: <BotUsers /> },
  { path: "/incidents", element: <Incidents /> },
  { path: "/settings", element: <Settings /> },
];

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        {PROTECTED_ROUTES.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={
              <RequireAuth>
                <Layout>{route.element}</Layout>
              </RequireAuth>
            }
          />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

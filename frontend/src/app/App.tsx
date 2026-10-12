import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "../hooks/useApi.ts";
import Layout from "../components/Layout.tsx";
import LoginPage from "../pages/LoginPage.tsx";
import DashboardPage from "../pages/DashboardPage.tsx";
import ServicesPage from "../pages/ServicesPage.tsx";
import ServiceDetailPage from "../pages/ServiceDetailPage.tsx";
import IncidentsPage from "../pages/IncidentsPage.tsx";
import SettingsPage from "../pages/SettingsPage.tsx";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout>
                <DashboardPage />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/services"
          element={
            <RequireAuth>
              <Layout>
                <ServicesPage />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/services/:id"
          element={
            <RequireAuth>
              <Layout>
                <ServiceDetailPage />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/incidents"
          element={
            <RequireAuth>
              <Layout>
                <IncidentsPage />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <Layout>
                <SettingsPage />
              </Layout>
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

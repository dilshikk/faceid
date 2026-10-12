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

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout>
                <Dashboard />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/services"
          element={
            <RequireAuth>
              <Layout>
                <Services />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/services/:id"
          element={
            <RequireAuth>
              <Layout>
                <ServiceDetails />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/services/:id/logs"
          element={
            <RequireAuth>
              <Layout>
                <Logs />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/incidents"
          element={
            <RequireAuth>
              <Layout>
                <Incidents />
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <Layout>
                <Settings />
              </Layout>
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

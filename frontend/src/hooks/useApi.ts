import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client.ts";

// Simple polling hook: the API has no websocket layer, so pages refresh on
// an interval instead. 15s matches the default monitor interval.
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs = 15000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const result = await fetcher();
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Не удалось загрузить данные");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const id = setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);

  return { data, error, loading };
}

export function useAuth() {
  const [role, setRole] = useState<string | null>(() => sessionStorage.getItem("bcc_role"));

  const login = async (username: string, password: string) => {
    const res = await api.login(username, password);
    sessionStorage.setItem("bcc_role", res.role);
    setRole(res.role);
  };

  const logout = async () => {
    await api.logout();
    sessionStorage.removeItem("bcc_role");
    setRole(null);
  };

  return { role, isAuthenticated: role !== null, login, logout };
}

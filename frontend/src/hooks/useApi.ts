import { useCallback, useEffect, useState } from "react";
import { AUTH_EXPIRED_EVENT, api, ApiError } from "../api/client.ts";

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

// Polling + "load more" for cursor-paginated list endpoints. Polling only
// re-fetches the first page (freshest data); additional pages loaded via
// loadMore are appended and kept until the next first-page refresh.
export function usePaginatedPolling<T>(
  fetchPage: (cursor?: string) => Promise<{ items: T[]; next_cursor: string | null }>,
  intervalMs = 15000,
) {
  const [items, setItems] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadFirstPage = async () => {
      try {
        const page = await fetchPage();
        if (!cancelled) {
          setItems(page.items);
          setNextCursor(page.next_cursor);
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

    loadFirstPage();
    const id = setInterval(loadFirstPage, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    const page = await fetchPage(nextCursor);
    setItems((prev) => [...prev, ...page.items]);
    setNextCursor(page.next_cursor);
  }, [fetchPage, nextCursor]);

  return { items, nextCursor, loading, error, loadMore };
}

export function useAuth() {
  const [role, setRole] = useState<string | null>(() => sessionStorage.getItem("bcc_role"));

  // Previously a stale sessionStorage "role" could stay truthy after the
  // server-side session expired, so the app looked logged in while every
  // request 401'd. Clear it as soon as any request reports 401.
  useEffect(() => {
    const onExpired = () => {
      sessionStorage.removeItem("bcc_role");
      setRole(null);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

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

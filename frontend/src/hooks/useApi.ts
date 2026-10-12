import { useCallback, useEffect, useRef, useState } from "react";
import { AUTH_EXPIRED_EVENT, api, ApiError } from "../api/client.ts";

const LOAD_ERROR = "Не удалось загрузить данные";

// Simple polling hook: the API has no websocket layer, so pages refresh on
// an interval instead. 15s matches the default monitor interval.
//
// `deps` lists the values the fetcher depends on (route id, filters). When
// any of them changes, the data is re-fetched immediately. The fetcher itself
// is read through a ref so polling always uses the latest closure; previously
// the first closure was captured forever, so filters never took effect.
// `refresh` forces an immediate re-fetch (e.g. after a mutation).
export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs = 15000,
  deps: readonly unknown[] = [],
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const result = await fetcherRef.current();
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : LOAD_ERROR);
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
  }, [intervalMs, tick, ...deps]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return { data, error, loading, refresh };
}

// Polling + "load more" for cursor-paginated list endpoints. Polling only
// re-fetches the first page (freshest data); additional pages loaded via
// loadMore are appended and kept until the next first-page refresh.
// See usePolling for the meaning of `deps` and `refresh`.
export function usePaginatedPolling<T>(
  fetchPage: (cursor?: string) => Promise<{ items: T[]; next_cursor: string | null }>,
  intervalMs = 15000,
  deps: readonly unknown[] = [],
) {
  const [items, setItems] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fetchPageRef = useRef(fetchPage);

  useEffect(() => {
    fetchPageRef.current = fetchPage;
  });

  useEffect(() => {
    let cancelled = false;

    const loadFirstPage = async () => {
      try {
        const page = await fetchPageRef.current();
        if (!cancelled) {
          setItems(page.items);
          setNextCursor(page.next_cursor);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : LOAD_ERROR);
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
  }, [intervalMs, tick, ...deps]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    try {
      const page = await fetchPageRef.current(nextCursor);
      setItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.next_cursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : LOAD_ERROR);
    }
  }, [nextCursor]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return { items, nextCursor, loading, error, loadMore, refresh };
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

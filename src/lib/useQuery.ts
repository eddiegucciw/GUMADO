import { useCallback, useEffect, useRef, useState } from 'react';

export interface QueryState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  /** Re-run the query (e.g. after a mutation). */
  reload: () => void;
}

/**
 * Minimal data-fetching hook: re-runs when `deps` change, ignores stale
 * responses, and keeps the previous data visible while reloading.
 */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[], opts: { enabled?: boolean } = {}): QueryState<T> {
  const enabled = opts.enabled ?? true;
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(enabled);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    fnRef.current().then(
      (d) => {
        if (id === seq.current) {
          setData(d);
          setLoading(false);
        }
      },
      (e) => {
        if (id === seq.current) {
          setError(e);
          setLoading(false);
        }
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

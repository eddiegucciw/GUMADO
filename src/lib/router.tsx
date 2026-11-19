/**
 * A small, dependency-free client router (history API).
 * Patterns: "/app/plots/:id". Query strings are read with useSearchParams().
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type AnchorHTMLAttributes, type MouseEvent, type ReactNode,
} from 'react';
import { matchPath } from './path';

export { matchPath };

interface RouterState {
  pathname: string;
  search: string;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterState | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState(() => ({ pathname: window.location.pathname, search: window.location.search }));

  useEffect(() => {
    const onPop = () => setLoc({ pathname: window.location.pathname, search: window.location.search });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    const url = new URL(to, window.location.origin);
    const samePath = url.pathname === window.location.pathname;
    if (opts?.replace) window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    else window.history.pushState(null, '', url.pathname + url.search + url.hash);
    setLoc({ pathname: url.pathname, search: url.search });
    if (!samePath && !url.hash) window.scrollTo({ top: 0 });
  }, []);

  const value = useMemo(() => ({ ...loc, navigate }), [loc, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used inside RouterProvider');
  return ctx;
}

export interface RouteDef {
  path: string;
  render: (params: Record<string, string>) => ReactNode;
}

export function Routes({ routes, fallback }: { routes: RouteDef[]; fallback: ReactNode }) {
  const { pathname } = useRouter();
  for (const r of routes) {
    const params = matchPath(r.path, pathname);
    if (params) return <>{r.render(params)}</>;
  }
  return <>{fallback}</>;
}

export function useSearchParams(): [URLSearchParams, (next: Record<string, string | null | undefined>, opts?: { replace?: boolean }) => void] {
  const { search, pathname, navigate } = useRouter();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const update = useCallback(
    (next: Record<string, string | null | undefined>, opts?: { replace?: boolean }) => {
      const p = new URLSearchParams(search);
      for (const [k, v] of Object.entries(next)) {
        if (v == null || v === '') p.delete(k);
        else p.set(k, v);
      }
      const qs = p.toString();
      navigate(pathname + (qs ? `?${qs}` : ''), { replace: opts?.replace ?? true });
    },
    [search, pathname, navigate],
  );
  return [params, update];
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; replace?: boolean };

export function Link({ to, replace, onClick, ...rest }: LinkProps) {
  const { navigate } = useRouter();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === '_blank') return;
    e.preventDefault();
    navigate(to, { replace });
  };
  return <a href={to} onClick={handle} {...rest} />;
}

export function Redirect({ to }: { to: string }) {
  const { navigate } = useRouter();
  useEffect(() => navigate(to, { replace: true }), [to, navigate]);
  return null;
}

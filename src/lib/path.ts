/** Match "/app/plots/:id" against a pathname. Returns params or null. Supports a trailing "/*". */
export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const p = pattern.replace(/\/+$/, '').split('/');
  const a = pathname.replace(/\/+$/, '').split('/');
  const wildcard = p[p.length - 1] === '*';
  if (wildcard ? a.length < p.length - 1 : p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '*') break;
    if (p[i].startsWith(':')) {
      if (!a[i]) return null;
      try {
        params[p[i].slice(1)] = decodeURIComponent(a[i]);
      } catch {
        return null;
      }
    } else if (p[i] !== a[i]) return null;
  }
  return params;
}

import { useEffect, useRef, useState } from 'react';
import { LayoutGrid, Receipt, Search, Users, Wallet } from 'lucide-react';
import { globalSearch } from '../data/admin';
import type { SearchResult } from '../data/types';
import { errorMessage } from '../lib/errors';
import { useRouter } from '../lib/router';
import { useDebounced } from '../lib/useQuery';
import { Dialog } from '../ui/feedback';
import { Spinner, cx } from '../ui/core';

const KIND = {
  plot: { icon: LayoutGrid, label: 'Plot', href: (id: string) => `/app/plots/${id}` },
  buyer: { icon: Users, label: 'Buyer', href: (id: string) => `/app/buyers/${id}` },
  sale: { icon: Receipt, label: 'Sale', href: (id: string) => `/app/sales/${id}` },
  payment: { icon: Wallet, label: 'Payment', href: (id: string) => `/app/payments?open=${id}` },
} as const;

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { navigate } = useRouter();
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) {
      setQ('');
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    const term = dq.trim();
    if (term.length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    const id = ++seq.current;
    setLoading(true);
    globalSearch(term).then(
      (r) => { if (id === seq.current) { setResults(r); setActive(0); setError(null); setLoading(false); } },
      (e) => { if (id === seq.current) { setError(errorMessage(e)); setLoading(false); } },
    );
  }, [dq]);

  const go = (r: SearchResult) => {
    onClose();
    navigate(KIND[r.kind].href(r.id));
  };

  return (
    <Dialog open={open} onClose={onClose} title="Search GUMADO" description="Plot references, locations, buyer names, sale and payment references">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          data-autofocus
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === 'Enter' && results[active]) go(results[active]);
          }}
          placeholder="Search…"
          aria-label="Search"
          className="h-12 w-full rounded-xl border border-line-strong bg-surface pl-10 pr-10 text-base text-ink focus:border-accent focus:outline-none"
        />
        {loading && <Spinner className="absolute right-3 top-3.5 h-5 w-5" />}
      </div>
      <div className="mt-3 min-h-[8rem]" aria-live="polite">
        {error && <p className="px-1 py-4 text-sm text-danger">{error}</p>}
        {!error && dq.trim().length >= 2 && !loading && results.length === 0 && (
          <p className="px-1 py-6 text-center text-sm text-muted">No matching records you have access to.</p>
        )}
        {dq.trim().length < 2 && <p className="px-1 py-6 text-center text-sm text-muted">Type at least 2 characters.</p>}
        <ul role="listbox" aria-label="Results" className="space-y-1">
          {results.map((r, i) => {
            const K = KIND[r.kind];
            return (
              <li key={`${r.kind}-${r.id}`} role="option" aria-selected={i === active}>
                <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(r)}
                  className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left', i === active ? 'bg-surface-2' : 'hover:bg-surface-2')}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><K.icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{r.title}</span>
                    <span className="block truncate text-xs text-muted">{K.label} · {r.subtitle}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Dialog>
  );
}

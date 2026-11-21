import { useEffect, useState } from 'react';
import { Check, Search, UserPlus } from 'lucide-react';
import { searchBuyers } from '../data/buyers';
import type { Buyer } from '../data/types';
import { useDebounced } from '../lib/useQuery';
import { Button, Input, Spinner, cx } from '../ui/core';

/** Search-as-you-type buyer selector. */
export function BuyerPicker({ value, onChange, onCreateNew, id, invalid }: {
  value: Pick<Buyer, 'id' | 'full_name' | 'phone'> | null;
  onChange: (b: Pick<Buyer, 'id' | 'full_name' | 'phone'> | null) => void;
  onCreateNew?: () => void;
  id?: string;
  invalid?: boolean;
}) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const [results, setResults] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (value || dq.trim().length < 2) {
      setResults([]);
      return;
    }
    let alive = true;
    setLoading(true);
    searchBuyers(dq).then((r) => alive && setResults(r), () => alive && setResults([])).finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [dq, value]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent-soft px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Check className="h-4 w-4 shrink-0 text-accent" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{value.full_name}</p>
            <p className="truncate text-xs text-muted">{value.phone}</p>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Change</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input id={id} aria-invalid={invalid || undefined} placeholder="Search by name or phone" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        {loading && <Spinner className="absolute right-3 top-2.5 h-5 w-5" />}
      </div>
      {results.length > 0 && (
        <ul className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-line bg-surface">
          {results.map((b) => (
            <li key={b.id}>
              <button type="button" onClick={() => onChange(b)} className={cx('flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-surface-2')}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{b.full_name}</span>
                  <span className="block truncate text-xs text-muted">{b.phone}{b.email ? ` · ${b.email}` : ''}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {dq.trim().length >= 2 && !loading && results.length === 0 && <p className="mt-2 text-xs text-muted">No buyer matches “{dq}”.</p>}
      {onCreateNew && (
        <button type="button" onClick={onCreateNew} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
          <UserPlus className="h-4 w-4" />Register a new buyer
        </button>
      )}
    </div>
  );
}

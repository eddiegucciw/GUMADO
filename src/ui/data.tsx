import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { Link } from '../lib/router';
import { PAGE_SIZE } from '../data/db';
import { Input, cx } from './core';
import { EmptyState, ErrorState, LoadingRows } from './feedback';

// ---------------------------------------------------------------------------
// Page header
// ---------------------------------------------------------------------------
export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <header className="mb-5 sm:mb-6">
      {back && (
        <Link to={back.to} className="no-print mb-2 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
          <ChevronLeft className="h-4 w-4" />{back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[1.45rem] font-bold tracking-tight text-ink sm:text-2xl">{title}</h1>
          {description && <div className="mt-1 text-sm text-muted">{description}</div>}
        </div>
        {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Search input (debounced by the caller via useDebounced)
// ---------------------------------------------------------------------------
export function SearchInput({ value, onChange, placeholder = 'Search', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    if (v === value) return;
    const t = setTimeout(() => onChange(v), 300);
    return () => clearTimeout(t);
  }, [v, value, onChange]);
  return (
    <div className={cx('relative min-w-0', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <Input type="search" aria-label={placeholder} placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} className="pl-9 pr-9" />
      {v && (
        <button type="button" aria-label="Clear search" onClick={() => { setV(''); onChange(''); }} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="no-print flex flex-col gap-2.5 border-b border-line px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-5">{children}</div>;
}

// ---------------------------------------------------------------------------
// Data table: a real <table> on desktop, stacked cards on phones.
// ---------------------------------------------------------------------------
export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
  /** On phones: 'title' (bold first line), 'meta' (shown in card), or hidden. */
  mobile?: 'title' | 'meta' | 'end' | 'hidden';
  className?: string;
}

export function DataTable<T>({ columns, rows, rowKey, rowHref, loading, error, onRetry, empty, footer }: {
  columns: Column<T>[]; rows: T[] | undefined; rowKey: (r: T) => string; rowHref?: (r: T) => string; loading?: boolean;
  error?: unknown; onRetry?: () => void; empty?: ReactNode; footer?: ReactNode;
}) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading && !rows) return <LoadingRows />;
  if (!rows?.length) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;

  const titleCol = columns.find((c) => c.mobile === 'title') ?? columns[0];
  const endCol = columns.find((c) => c.mobile === 'end');
  const metaCols = columns.filter((c) => c.mobile === 'meta');

  return (
    <div className={cx('relative', loading && 'opacity-60 transition-opacity')}>
      {/* Desktop */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cx('px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted whitespace-nowrap', c.align === 'right' && 'text-right', c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const href = rowHref?.(r);
              return (
                <tr key={rowKey(r)} className={cx('group relative', href && 'cursor-pointer hover:bg-surface-2/70')}>
                  {columns.map((c, i) => (
                    <td key={c.key} className={cx('px-5 py-3.5 align-middle text-ink-2', c.align === 'right' && 'text-right tabular', c.className)}>
                      {href && i === 0 ? <Link to={href} className="font-semibold text-ink after:absolute after:inset-0 hover:underline focus-visible:underline">{c.cell(r)}</Link> : c.cell(r)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Mobile */}
      <ul className="divide-y divide-line md:hidden">
        {rows.map((r) => {
          const href = rowHref?.(r);
          const body = (
            <div className="flex items-start justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-ink">{titleCol.cell(r)}</div>
                {metaCols.length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8rem] text-muted">
                    {metaCols.map((c) => <span key={c.key} className="min-w-0">{c.cell(r)}</span>)}
                  </div>
                )}
              </div>
              {endCol && <div className="shrink-0 text-right text-sm tabular">{endCol.cell(r)}</div>}
            </div>
          );
          return <li key={rowKey(r)}>{href ? <Link to={href} className="block active:bg-surface-2">{body}</Link> : body}</li>;
        })}
      </ul>
      {footer}
    </div>
  );
}

export function Pagination({ page, count, onPage, pageSize = PAGE_SIZE }: { page: number; count: number; onPage: (p: number) => void; pageSize?: number }) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (count <= pageSize) return count ? <p className="border-t border-line px-5 py-3 text-xs text-muted">{count} record{count === 1 ? '' : 's'}</p> : null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(count, page * pageSize);
  return (
    <nav aria-label="Pagination" className="no-print flex items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
      <p className="text-xs text-muted tabular">{from}–{to} of {count.toLocaleString('en')}</p>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page"
          className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink-2 disabled:opacity-40 hover:bg-surface-2"><ChevronLeft className="h-4 w-4" /></button>
        <span className="px-2 text-xs font-medium text-ink-2 tabular">{page} / {pages}</span>
        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page"
          className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink-2 disabled:opacity-40 hover:bg-surface-2"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="no-print -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cx('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors',
            value === t.value ? 'bg-ink text-bg' : 'text-muted hover:bg-surface-2 hover:text-ink')}>
          {t.label}
          {t.count != null && <span className={cx('rounded-full px-1.5 text-[0.7rem]', value === t.value ? 'bg-bg/20' : 'bg-surface-3')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------
export function StatCard({ label, value, sub, icon, tone, href }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: 'accent' | 'danger' | 'success'; href?: string }) {
  const inner = (
    <div className="flex h-full flex-col rounded-2xl border border-line bg-surface p-4 transition-colors print-flat">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.72rem] font-semibold uppercase tracking-wide text-muted">{label}</p>
        {icon && <span className={cx('grid h-8 w-8 place-items-center rounded-lg', tone === 'danger' ? 'bg-danger-soft text-danger' : tone === 'success' ? 'bg-success-soft text-success' : 'bg-accent-soft text-accent')}>{icon}</span>}
      </div>
      <p className="mt-2 text-xl font-bold tracking-tight text-ink tabular sm:text-[1.4rem]">{value}</p>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
  return href ? <Link to={href} className="block rounded-2xl hover:[&>div]:border-accent/50">{inner}</Link> : inner;
}

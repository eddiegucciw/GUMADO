import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { listNotifications, markNotificationsRead, unreadNotificationCount } from '../data/admin';
import type { NotificationRow } from '../data/types';
import { formatRelative } from '../lib/dates';
import { useRouter } from '../lib/router';
import { Button, IconButton, Spinner, cx } from '../ui/core';
import { ErrorState } from '../ui/feedback';

const POLL_MS = 60_000;

function hrefFor(n: NotificationRow): string | null {
  if (!n.entity_id) return null;
  switch (n.entity_type) {
    case 'plot': return `/app/plots/${n.entity_id}`;
    case 'buyer': return `/app/buyers/${n.entity_id}`;
    case 'sale': return `/app/sales/${n.entity_id}`;
    case 'payment': return `/app/payments?open=${n.entity_id}`;
    default: return null;
  }
}

/** Bell with unread count. Polls gently (and only when the tab is visible) to suit slow connections. */
export function NotificationsBell() {
  const { navigate } = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      unreadNotificationCount().then((c) => alive && setCount(c), () => {});
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    listNotifications().then(setItems, setError);
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markAll = async () => {
    await markNotificationsRead();
    setCount(0);
    setItems((xs) => xs?.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })) ?? null);
  };

  return (
    <div className="relative" ref={ref}>
      <IconButton label={count ? `Notifications, ${count} unread` : 'Notifications'} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute right-1.5 top-1.5 grid min-w-[1.1rem] place-items-center rounded-full bg-danger px-1 text-[0.62rem] font-bold leading-[1.1rem] text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </IconButton>
      {open && (
        <div className="animate-fade fixed inset-x-3 top-16 z-[60] max-h-[70dvh] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            {count > 0 && <Button size="sm" variant="ghost" icon={<CheckCheck className="h-4 w-4" />} onClick={markAll}>Mark all read</Button>}
          </div>
          <div className="max-h-[calc(70dvh-3.5rem)] overflow-y-auto">
            {error ? <ErrorState error={error} compact /> : !items ? (
              <div className="grid place-items-center py-10"><Spinner /></div>
            ) : items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted">You're all caught up.</p>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((n) => {
                  const href = hrefFor(n);
                  return (
                    <li key={n.id}>
                      <button type="button" disabled={!href}
                        onClick={async () => {
                          if (!n.read_at) {
                            await markNotificationsRead([n.id]).catch(() => {});
                            setCount((c) => Math.max(0, c - 1));
                          }
                          setOpen(false);
                          if (href) navigate(href);
                        }}
                        className={cx('flex w-full gap-3 px-4 py-3 text-left hover:bg-surface-2', !n.read_at && 'bg-accent-soft/40')}>
                        <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-accent')} />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-ink">{n.title}</span>
                          {n.body && <span className="mt-0.5 block text-[0.8rem] text-muted">{n.body}</span>}
                          <span className="mt-1 block text-[0.7rem] text-muted">{formatRelative(n.created_at)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

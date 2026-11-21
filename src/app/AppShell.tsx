import { useEffect, useState, type ReactNode } from 'react';
import { LogOut, Menu, Moon, Search, Sun, UserCircle2, X } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Link, useRouter } from '../lib/router';
import { useTheme } from '../lib/theme';
import { IconButton, cx } from '../ui/core';
import { GlobalSearch } from './GlobalSearch';
import { LogoMark, Wordmark } from './Logo';
import { NAV, isActive, type NavItem } from './nav';
import { NotificationsBell } from './Notifications';

function useVisibleNav() {
  const { canAny } = useAuth();
  return NAV.map((s) => ({ ...s, items: s.items.filter((i) => i.any.length === 0 || canAny(...i.any)) })).filter((s) => s.items.length);
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { pathname } = useRouter();
  const active = isActive(pathname, item.to);
  return (
    <Link to={item.to} onClick={onNavigate} aria-current={active ? 'page' : undefined}
      className={cx('flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors',
        active ? 'bg-accent-soft text-accent-strong' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
      <item.icon className="h-[18px] w-[18px] shrink-0" />
      {item.label}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { access, business, signOut } = useAuth();
  const { pathname } = useRouter();
  const { theme, toggle } = useTheme();
  const nav = useVisibleNav();
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const mobileItems = nav.flatMap((s) => s.items).filter((i) => i.mobile).slice(0, 4);

  const userBlock = (
    <div className="flex items-center gap-3 rounded-xl px-2 py-2">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-3 text-sm font-bold text-ink-2">
        {(access?.full_name || access?.email || '?').slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{access?.full_name || access?.email}</p>
        <p className="truncate text-xs text-muted">{access?.role?.name}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-bg">
      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
        <Link to="/app" className="flex h-16 items-center gap-2.5 px-5">
          <LogoMark className="h-8 w-8" />
          <span className="min-w-0">
            <Wordmark className="block text-ink" />
          </span>
        </Link>
        <button type="button" onClick={() => setSearchOpen(true)}
          className="mx-3 mb-3 flex h-10 items-center gap-2 rounded-xl border border-line bg-bg px-3 text-sm text-muted hover:border-line-strong">
          <Search className="h-4 w-4" /> Search
          <kbd className="ml-auto rounded border border-line px-1.5 text-[0.65rem]">Ctrl K</kbd>
        </button>
        <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          {nav.map((s, i) => (
            <div key={i}>
              {s.section && <p className="mb-1.5 px-3 text-[0.68rem] font-bold uppercase tracking-wider text-muted">{s.section}</p>}
              <div className="space-y-0.5">{s.items.map((it) => <NavLink key={it.to} item={it} />)}</div>
            </div>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <Link to="/app/profile" className="block rounded-xl hover:bg-surface-2">{userBlock}</Link>
          <div className="mt-1 flex gap-1">
            <button type="button" onClick={toggle} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg text-xs font-semibold text-muted hover:bg-surface-2 hover:text-ink">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}{theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            <button type="button" onClick={signOut} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg text-xs font-semibold text-muted hover:bg-surface-2 hover:text-ink">
              <LogOut className="h-4 w-4" />Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Top bar */}
      <header className="no-print sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur lg:ml-64">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-5 lg:h-16">
          <Link to="/app" className="flex items-center gap-2 lg:hidden" aria-label="Dashboard">
            <LogoMark className="h-7 w-7" />
            <Wordmark className="text-[1.15rem] text-ink" />
          </Link>
          <p className="hidden truncate text-sm font-semibold text-muted lg:block">{business.name}</p>
          <div className="ml-auto flex items-center gap-1">
            <IconButton label="Search" onClick={() => setSearchOpen(true)} className="lg:hidden"><Search className="h-5 w-5" /></IconButton>
            <NotificationsBell />
            <IconButton label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggle} className="hidden sm:grid lg:hidden">
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </IconButton>
          </div>
        </div>
      </header>

      <main id="main" className="px-3 pb-28 pt-4 sm:px-5 sm:pt-6 lg:ml-64 lg:px-8 lg:pb-12">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>

      {/* Phone bottom navigation */}
      <nav aria-label="Main" className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${mobileItems.length + 1}, minmax(0, 1fr))` }}>
          {mobileItems.map((it) => {
            const active = isActive(pathname, it.to);
            return (
              <li key={it.to}>
                <Link to={it.to} aria-current={active ? 'page' : undefined}
                  className={cx('flex h-16 flex-col items-center justify-center gap-1 text-[0.68rem] font-semibold', active ? 'text-accent' : 'text-muted')}>
                  <it.icon className="h-5 w-5" />{it.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setMoreOpen(true)} aria-expanded={moreOpen}
              className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[0.68rem] font-semibold text-muted">
              <Menu className="h-5 w-5" />More
            </button>
          </li>
        </ul>
      </nav>

      {/* Phone "More" sheet */}
      {moreOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div className="animate-fade absolute inset-0 bg-black/40" onClick={() => setMoreOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label="Menu" className="animate-sheet absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="mb-2 flex items-center justify-between">
              {userBlock}
              <IconButton label="Close menu" onClick={() => setMoreOpen(false)}><X className="h-5 w-5" /></IconButton>
            </div>
            {nav.map((s, i) => (
              <div key={i} className="mt-3">
                {s.section && <p className="mb-1.5 px-3 text-[0.68rem] font-bold uppercase tracking-wider text-muted">{s.section}</p>}
                <div className="space-y-0.5">{s.items.map((it) => <NavLink key={it.to} item={it} />)}</div>
              </div>
            ))}
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4">
              <Link to="/app/profile" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-surface-2 text-sm font-semibold text-ink"><UserCircle2 className="h-4 w-4" />Profile</Link>
              <button type="button" onClick={toggle} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-surface-2 text-sm font-semibold text-ink">
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}Theme
              </button>
              <button type="button" onClick={signOut} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-surface-2 text-sm font-semibold text-ink"><LogOut className="h-4 w-4" />Sign out</button>
            </div>
          </div>
        </div>
      )}

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

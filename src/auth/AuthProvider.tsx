import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Permission } from '../lib/permissions';
import { DEFAULT_CURRENCY, type CurrencyConfig } from '../lib/money';
import { DEFAULT_TIMEZONE } from '../lib/dates';

export interface Access {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  role: { id: string; key: string; name: string } | null;
  permissions: Permission[];
}

export interface BusinessContext {
  name: string;
  currency: CurrencyConfig;
  timezone: string;
  maxUploadMb: number;
  requireSeparateVerifier: boolean;
}

interface AuthState {
  status: 'loading' | 'signed_out' | 'signed_in';
  session: Session | null;
  access: Access | null;
  business: BusinessContext;
  /** Set when the user arrived from a password-recovery or invite link. */
  recovery: boolean;
  can: (p: Permission) => boolean;
  canAny: (...p: Permission[]) => boolean;
  refresh: () => Promise<void>;
  clearRecovery: () => void;
  signOut: () => Promise<void>;
}

const DEFAULT_BUSINESS: BusinessContext = {
  name: 'GUMADO', currency: DEFAULT_CURRENCY, timezone: DEFAULT_TIMEZONE, maxUploadMb: 20, requireSeparateVerifier: false,
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [access, setAccess] = useState<Access | null>(null);
  const [business, setBusiness] = useState<BusinessContext>(DEFAULT_BUSINESS);
  const [recovery, setRecovery] = useState(() => /type=(recovery|invite)/.test(window.location.hash) || /invite=1/.test(window.location.search));
  const loadedFor = useRef<string | null>(null);

  const loadAccess = useCallback(async (s: Session | null) => {
    if (!s) {
      loadedFor.current = null;
      setAccess(null);
      setStatus('signed_out');
      return;
    }
    const { data, error } = await supabase.rpc('my_access');
    if (error || !data) {
      setAccess(null);
      setStatus('signed_in');
      return;
    }
    const a = data as Access;
    setAccess(a);
    if (a.is_active && a.role) {
      const { data: bs } = await supabase
        .from('business_settings')
        .select('business_name, currency_code, currency_minor_units, timezone, max_upload_mb, require_separate_verifier')
        .single();
      if (bs) {
        setBusiness({
          name: bs.business_name,
          currency: { code: bs.currency_code, minorUnits: bs.currency_minor_units },
          timezone: bs.timezone,
          maxUploadMb: bs.max_upload_mb,
          requireSeparateVerifier: bs.require_separate_verifier,
        });
      }
    }
    loadedFor.current = s.user.id;
    setStatus('signed_in');
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      void loadAccess(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(s);
      // Avoid calling Supabase inside the callback synchronously (documented deadlock risk).
      if (event === 'SIGNED_OUT' || (s && loadedFor.current !== s.user.id) || event === 'USER_UPDATED') {
        setTimeout(() => void loadAccess(s), 0);
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadAccess]);

  const perms = useMemo(() => new Set(access?.is_active ? access.permissions : []), [access]);
  const can = useCallback((p: Permission) => perms.has(p), [perms]);
  const canAny = useCallback((...p: Permission[]) => p.some((x) => perms.has(x)), [perms]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      session,
      access,
      business,
      recovery,
      can,
      canAny,
      refresh: () => loadAccess(session),
      clearRecovery: () => setRecovery(false),
      signOut: async () => {
        setRecovery(false);
        await supabase.auth.signOut();
      },
    }),
    [status, session, access, business, recovery, can, canAny, loadAccess],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Render children only when the user holds the permission (UI convenience; the database enforces it). */
export function Can({ permission, any, children, fallback = null }: { permission?: Permission; any?: Permission[]; children: ReactNode; fallback?: ReactNode }) {
  const { can, canAny } = useAuth();
  const ok = permission ? can(permission) : any ? canAny(...any) : true;
  return <>{ok ? children : fallback}</>;
}

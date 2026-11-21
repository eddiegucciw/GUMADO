import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, CheckCircle2, Clock, LogOut, MailCheck, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { Link, useRouter } from '../../lib/router';
import { LogoMark, Wordmark } from '../../app/Logo';
import { Button, Field, Input } from '../../ui/core';
import { CinematicImage } from '../landing/CinematicImage';

export const MIN_PASSWORD = 10;

function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-charcoal lg:block">
        <CinematicImage src="/images/auth-panel.jpg" alt="" className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-charcoal/40 to-transparent" />
        <div className="absolute inset-x-12 bottom-12 text-ivory">
          <p className="font-serif text-4xl leading-tight">Every Plot. Every Transaction. Every Detail.</p>
          <p className="mt-3 max-w-md text-sm text-champagne/80">The operational workspace for your land sales business.</p>
        </div>
      </div>
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <Link to="/" className="inline-flex items-center gap-2.5 self-start">
          <LogoMark className="h-8 w-8" />
          <Wordmark className="text-ink" />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger">{message}</p>;
}

export function SignInPage() {
  const { status, access } = useAuth();
  const { navigate, search } = useRouter();
  const nextParam = new URLSearchParams(search).get('next');
  const next = nextParam && nextParam.startsWith('/app') && !nextParam.startsWith('//') ? nextParam : '/app';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'signed_in' && access) navigate(next, { replace: true });
  }, [status, access, navigate, next]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(errorMessage(err));
  };

  return (
    <AuthLayout title="Sign in" subtitle="Staff access to your GUMADO workspace.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field label="Email address" required>
          {(id) => <Input id={id} type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Password" required>
          {(id) => <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={!email || !password}>Sign in</Button>
        <div className="flex justify-between text-sm">
          <Link to="/forgot-password" className="font-semibold text-accent hover:underline">Forgot password?</Link>
          <Link to="/" className="text-muted hover:text-ink">Back to site</Link>
        </div>
        <p className="pt-2 text-xs text-muted">New staff accounts are created by invitation from your administrator.</p>
      </form>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    // Don't reveal whether an account exists; only surface rate-limit/network problems.
    if (err && /rate|network|fetch/i.test(err.message)) setError(errorMessage(err));
    else setSent(true);
  };

  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a secure link to choose a new password.">
      {sent ? (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-2xl bg-success-soft p-4 text-sm text-success">
            <MailCheck className="h-5 w-5 shrink-0" />
            <p>If an account exists for <strong>{email}</strong>, a reset link is on its way. It expires after one hour.</p>
          </div>
          <Link to="/sign-in" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent"><ArrowLeft className="h-4 w-4" />Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormError message={error} />
          <Field label="Email address" required>
            {(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email)}>Send reset link</Button>
          <Link to="/sign-in" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Back to sign in</Link>
        </form>
      )}
    </AuthLayout>
  );
}

/** Used for both password recovery and accepting an invitation. */
export function ResetPasswordPage() {
  const { session, status, clearRecovery } = useAuth();
  const { navigate, search } = useRouter();
  const invite = /invite=1/.test(search) || /type=invite/.test(window.location.hash);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 2500);
    return () => clearTimeout(t);
  }, []);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== password;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD || password !== confirm) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(errorMessage(err));
    else {
      clearRecovery();
      setDone(true);
      window.history.replaceState(null, '', '/reset-password');
    }
  };

  if (!session && (status === 'loading' || !waited)) {
    return <AuthLayout title={invite ? 'Accept invitation' : 'Choose a new password'} subtitle="Checking your secure link…"><div className="h-8 w-8 animate-spin rounded-full border-2 border-line-strong border-t-accent" /></AuthLayout>;
  }
  if (!session) {
    return (
      <AuthLayout title="This link has expired" subtitle="Reset and invitation links work once and expire after a short time.">
        <Link to="/forgot-password" className="font-semibold text-accent hover:underline">Request a new reset link</Link>
      </AuthLayout>
    );
  }
  if (done) {
    return (
      <AuthLayout title="Password saved">
        <div className="flex gap-3 rounded-2xl bg-success-soft p-4 text-sm text-success"><CheckCircle2 className="h-5 w-5 shrink-0" />Your password has been set.</div>
        <Button variant="primary" size="lg" className="mt-6 w-full" onClick={() => navigate('/app', { replace: true })}>Continue to GUMADO</Button>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title={invite ? 'Welcome to GUMADO' : 'Choose a new password'} subtitle={invite ? 'Set a password to finish creating your staff account.' : `For ${session.user.email}`}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field label="New password" required hint={`At least ${MIN_PASSWORD} characters. A short phrase is easier to remember.`} error={tooShort ? `Use at least ${MIN_PASSWORD} characters.` : null}>
          {(id, d, inv) => <Input id={id} type="password" autoComplete="new-password" aria-describedby={d} aria-invalid={inv} value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Field label="Confirm password" required error={mismatch ? 'Passwords do not match.' : null}>
          {(id, d, inv) => <Input id={id} type="password" autoComplete="new-password" aria-describedby={d} aria-invalid={inv} value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={password.length < MIN_PASSWORD || password !== confirm}>Save password</Button>
      </form>
    </AuthLayout>
  );
}

export function AccessPendingPage() {
  const { access, signOut, refresh } = useAuth();
  const deactivated = access && access.role && !access.is_active;
  return (
    <AuthLayout title={deactivated ? 'Access paused' : 'Waiting for access'}
      subtitle={deactivated ? 'An administrator has paused your access to GUMADO.' : 'Your account exists but has not been given a role yet.'}>
      <div className="flex gap-3 rounded-2xl bg-warning-soft p-4 text-sm text-warning">
        {deactivated ? <ShieldAlert className="h-5 w-5 shrink-0" /> : <Clock className="h-5 w-5 shrink-0" />}
        <p>Signed in as <strong>{access?.email}</strong>. Ask your GUMADO administrator to {deactivated ? 'restore your access' : 'assign you a role'}.</p>
      </div>
      <div className="mt-6 flex gap-2">
        <Button onClick={() => void refresh()}>Check again</Button>
        <Button variant="ghost" icon={<LogOut className="h-4 w-4" />} onClick={signOut}>Sign out</Button>
      </div>
    </AuthLayout>
  );
}

export function ConfigMissingPage() {
  return (
    <AuthLayout title="GUMADO is not configured" subtitle="The app can't find its Supabase connection settings.">
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-4 text-sm text-ink-2">
        <p>Set these environment variables and rebuild:</p>
        <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs">VITE_SUPABASE_URL{'\n'}VITE_SUPABASE_ANON_KEY</pre>
        <p className="text-muted">See <code>docs/DEPLOYMENT.md</code>.</p>
      </div>
    </AuthLayout>
  );
}

import { lazy, Suspense, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { env } from './lib/env';
import type { Permission } from './lib/permissions';
import { Redirect, RouterProvider, Routes, useRouter, type RouteDef } from './lib/router';
import { EmptyState, PageLoader, ToastProvider } from './ui/feedback';
import { ButtonLink } from './ui/core';
import { LandingPage } from './pages/landing/LandingPage';
import { AccessPendingPage, ConfigMissingPage, ForgotPasswordPage, ResetPasswordPage, SignInPage } from './pages/auth/AuthPages';

// The operational app is loaded only after sign-in, keeping the public site fast.
const AppShell = lazy(() => import('./app/AppShell').then((m) => ({ default: m.AppShell })));
const Dashboard = lazy(() => import('./pages/app/Dashboard'));
const PlotsPage = lazy(() => import('./pages/app/plots/PlotsPage'));
const PlotDetailPage = lazy(() => import('./pages/app/plots/PlotDetailPage'));
const BuyersPage = lazy(() => import('./pages/app/buyers/BuyersPage'));
const BuyerDetailPage = lazy(() => import('./pages/app/buyers/BuyerDetailPage'));
const SalesPage = lazy(() => import('./pages/app/sales/SalesPage'));
const NewSalePage = lazy(() => import('./pages/app/sales/NewSalePage'));
const SaleDetailPage = lazy(() => import('./pages/app/sales/SaleDetailPage'));
const PaymentsPage = lazy(() => import('./pages/app/payments/PaymentsPage'));
const DocumentsPage = lazy(() => import('./pages/app/DocumentsPage'));
const ReportsPage = lazy(() => import('./pages/app/reports/ReportsPage'));
const StaffPage = lazy(() => import('./pages/app/admin/StaffPage'));
const AuditPage = lazy(() => import('./pages/app/admin/AuditPage'));
const SettingsPage = lazy(() => import('./pages/app/admin/SettingsPage'));
const ProfilePage = lazy(() => import('./pages/app/ProfilePage'));

function Guard({ any, children }: { any?: Permission[]; children: ReactNode }) {
  const { canAny } = useAuth();
  if (any?.length && !canAny(...any)) {
    return <EmptyState title="You don't have access to this page" description="Ask an administrator if you need it." action={<ButtonLink to="/app">Go to dashboard</ButtonLink>} />;
  }
  return <>{children}</>;
}

const appRoutes: RouteDef[] = [
  { path: '/app', render: () => <Dashboard /> },
  { path: '/app/plots', render: () => <Guard any={['plots.view']}><PlotsPage /></Guard> },
  { path: '/app/plots/:id', render: (p) => <Guard any={['plots.view']}><PlotDetailPage id={p.id} /></Guard> },
  { path: '/app/buyers', render: () => <Guard any={['buyers.view']}><BuyersPage /></Guard> },
  { path: '/app/buyers/:id', render: (p) => <Guard any={['buyers.view']}><BuyerDetailPage id={p.id} /></Guard> },
  { path: '/app/sales', render: () => <Guard any={['sales.view_all', 'sales.view_own']}><SalesPage /></Guard> },
  { path: '/app/sales/new', render: () => <Guard any={['sales.create']}><NewSalePage /></Guard> },
  { path: '/app/sales/:id', render: (p) => <Guard any={['sales.view_all', 'sales.view_own']}><SaleDetailPage id={p.id} /></Guard> },
  { path: '/app/payments', render: () => <Guard any={['payments.view']}><PaymentsPage /></Guard> },
  { path: '/app/documents', render: () => <Guard any={['documents.view']}><DocumentsPage /></Guard> },
  { path: '/app/reports', render: () => <Guard any={['reports.view']}><ReportsPage /></Guard> },
  { path: '/app/staff', render: () => <Guard any={['users.manage']}><StaffPage /></Guard> },
  { path: '/app/audit', render: () => <Guard any={['audit.view']}><AuditPage /></Guard> },
  { path: '/app/settings', render: () => <Guard any={['settings.manage']}><SettingsPage /></Guard> },
  { path: '/app/profile', render: () => <ProfilePage /> },
];

function ProtectedApp() {
  const { status, access, recovery } = useAuth();
  const { pathname, search } = useRouter();
  if (status === 'loading') return <PageLoader />;
  if (status === 'signed_out') return <Redirect to={`/sign-in?next=${encodeURIComponent(pathname + search)}`} />;
  if (recovery) return <Redirect to="/reset-password" />;
  if (!access || !access.is_active || !access.role) return <AccessPendingPage />;
  return (
    <Suspense fallback={<PageLoader />}>
      <AppShell>
        <Suspense fallback={<PageLoader />}>
          <Routes routes={appRoutes} fallback={<EmptyState title="Page not found" action={<ButtonLink to="/app">Go to dashboard</ButtonLink>} />} />
        </Suspense>
      </AppShell>
    </Suspense>
  );
}

function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-6">
      <EmptyState title="Page not found" description="The page you're looking for doesn't exist." action={<ButtonLink to="/" variant="primary">Go to the home page</ButtonLink>} />
    </div>
  );
}

const topRoutes: RouteDef[] = [
  { path: '/', render: () => <LandingPage /> },
  { path: '/sign-in', render: () => (env.configured ? <SignInPage /> : <ConfigMissingPage />) },
  { path: '/forgot-password', render: () => (env.configured ? <ForgotPasswordPage /> : <ConfigMissingPage />) },
  { path: '/reset-password', render: () => (env.configured ? <ResetPasswordPage /> : <ConfigMissingPage />) },
  { path: '/app/*', render: () => (env.configured ? <ProtectedApp /> : <ConfigMissingPage />) },
];

export default function App() {
  return (
    <RouterProvider>
      <AuthProvider>
        <ToastProvider>
          <Routes routes={topRoutes} fallback={<NotFound />} />
        </ToastProvider>
      </AuthProvider>
    </RouterProvider>
  );
}

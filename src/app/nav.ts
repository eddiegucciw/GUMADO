import {
  BarChart3, Building2, FileText, History, LayoutDashboard, LayoutGrid, Receipt, Settings, ShieldCheck, Users, Wallet, type LucideIcon,
} from 'lucide-react';
import type { Permission } from '../lib/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shown if the user holds ANY of these. */
  any: Permission[];
  /** Pinned to the phone bottom bar. */
  mobile?: boolean;
}

export const NAV: { section?: string; items: NavItem[] }[] = [
  {
    items: [
      { to: '/app', label: 'Dashboard', icon: LayoutDashboard, any: [], mobile: true },
      { to: '/app/plots', label: 'Plots', icon: LayoutGrid, any: ['plots.view'], mobile: true },
      { to: '/app/buyers', label: 'Buyers', icon: Users, any: ['buyers.view'] },
      { to: '/app/sales', label: 'Sales', icon: Receipt, any: ['sales.view_all', 'sales.view_own'], mobile: true },
      { to: '/app/payments', label: 'Payments', icon: Wallet, any: ['payments.view'], mobile: true },
      { to: '/app/documents', label: 'Documents', icon: FileText, any: ['documents.view'] },
      { to: '/app/reports', label: 'Reports', icon: BarChart3, any: ['reports.view'] },
    ],
  },
  {
    section: 'Administration',
    items: [
      { to: '/app/staff', label: 'Staff & roles', icon: ShieldCheck, any: ['users.manage'] },
      { to: '/app/audit', label: 'Audit log', icon: History, any: ['audit.view'] },
      { to: '/app/settings', label: 'Business settings', icon: Settings, any: ['settings.manage'] },
    ],
  },
];

export const ICONS = { Building2 };

export function isActive(pathname: string, to: string) {
  return to === '/app' ? pathname === '/app' : pathname === to || pathname.startsWith(to + '/');
}

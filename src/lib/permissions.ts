/** Mirrors public.permissions. The database is the authority; the UI only uses these to hide actions. */
export const PERMISSIONS = [
  'plots.view', 'plots.manage', 'plots.archive',
  'buyers.view', 'buyers.manage', 'buyers.view_sensitive', 'buyers.export', 'buyers.archive',
  'sales.view_all', 'sales.view_own', 'sales.create', 'sales.edit', 'sales.cancel',
  'payments.view', 'payments.record', 'payments.verify', 'payments.reverse',
  'documents.view', 'documents.upload', 'documents.archive',
  'reports.view', 'reports.export',
  'audit.view', 'users.manage', 'settings.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

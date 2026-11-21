import { useState } from 'react';
import { FileDown, FileSpreadsheet, Printer } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { exportPdf, exportXlsx, type ExportColumn, type ExportSpec } from '../lib/exporters';
import type { Permission } from '../lib/permissions';
import { Button } from '../ui/core';
import { useToast } from '../ui/feedback';

/**
 * PDF / Excel / Print actions. `load` fetches ALL matching records (not just
 * the visible page) at the moment of export.
 */
export function ExportButtons<T>({ title, subtitle, columns, load, permission = 'reports.export', meta, notes, print = true }: {
  title: string; subtitle?: string; columns: ExportColumn<T>[]; load: () => Promise<T[]>; permission?: Permission;
  meta?: [string, string][]; notes?: string[]; print?: boolean;
}) {
  const { can, business } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null);
  if (!can(permission)) return null;

  const run = async (kind: 'pdf' | 'xlsx') => {
    setBusy(kind);
    try {
      const rows = await load();
      const spec: ExportSpec<T> = { title, subtitle, columns, rows, currency: business.currency, businessName: business.name, timezone: business.timezone, meta, notes };
      if (kind === 'pdf') exportPdf(spec);
      else exportXlsx(spec);
      toast.success(`Exported ${rows.length.toLocaleString('en')} record${rows.length === 1 ? '' : 's'}.`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="no-print flex flex-wrap gap-2">
      <Button size="sm" icon={<FileDown className="h-4 w-4" />} loading={busy === 'pdf'} onClick={() => run('pdf')}>PDF</Button>
      <Button size="sm" icon={<FileSpreadsheet className="h-4 w-4" />} loading={busy === 'xlsx'} onClick={() => run('xlsx')}>Excel</Button>
      {print && <Button size="sm" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print</Button>}
    </div>
  );
}

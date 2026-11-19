import { formatDate, formatDateTime } from './dates';
import { saveBytes, safeFileName, PDF_MIME, XLSX_MIME } from './download';
import { formatMoney, sumMinor, toMajorNumber, type CurrencyConfig } from './money';
import { buildPdf } from './pdf';
import { buildXlsx } from './xlsx';

export type ExportKind = 'text' | 'money' | 'date' | 'integer' | 'number';

export interface ExportColumn<T> {
  header: string;
  kind?: ExportKind;
  value: (row: T) => string | number | null | undefined;
  /** Include a total of this column (money / integer). */
  total?: boolean;
}

export interface ExportSpec<T> {
  title: string;
  subtitle?: string;
  columns: ExportColumn<T>[];
  rows: T[];
  currency: CurrencyConfig;
  businessName: string;
  timezone: string;
  meta?: [string, string][];
  notes?: string[];
  landscape?: boolean;
}

function totalsRow<T>(spec: ExportSpec<T>): (number | null)[] | null {
  if (!spec.columns.some((c) => c.total)) return null;
  return spec.columns.map((c) => (c.total ? sumMinor(spec.rows.map((r) => Number(c.value(r) ?? 0))) : null));
}

export function exportXlsx<T>(spec: ExportSpec<T>) {
  const mu = spec.currency.minorUnits;
  const totals = totalsRow(spec);
  const rows = spec.rows.map((r) =>
    spec.columns.map((c) => {
      const v = c.value(r);
      if (v == null) return null;
      if (c.kind === 'money') return toMajorNumber(Number(v), mu);
      if (c.kind === 'date') return formatDate(String(v));
      return v;
    }),
  );
  if (totals) rows.push(spec.columns.map((c, i) => (i === 0 ? 'Total' : totals[i] == null ? null : c.kind === 'money' ? toMajorNumber(totals[i]!, mu) : totals[i])));
  const bytes = buildXlsx([
    {
      name: spec.title,
      preface: [`${spec.businessName} — ${spec.title}`, ...(spec.subtitle ? [spec.subtitle] : []), `Generated ${formatDateTime(new Date().toISOString(), spec.timezone)}`],
      columns: spec.columns.map((c) => ({
        header: c.kind === 'money' ? `${c.header} (${spec.currency.code})` : c.header,
        kind: c.kind === 'money' ? 'money' : c.kind === 'integer' ? 'integer' : c.kind === 'number' ? 'number' : 'text',
      })),
      rows,
    },
  ]);
  saveBytes(bytes, `${safeFileName(`${spec.businessName}-${spec.title}`)}.xlsx`, XLSX_MIME);
}

export function exportPdf<T>(spec: ExportSpec<T>) {
  const totals = totalsRow(spec);
  const fmt = (c: ExportColumn<T>, v: string | number | null | undefined) => {
    if (v == null || v === '') return '';
    if (c.kind === 'money') return formatMoney(Number(v), spec.currency, { withCode: false, fixed: true });
    if (c.kind === 'date') return formatDate(String(v));
    if (c.kind === 'integer') return Number(v).toLocaleString('en');
    return String(v);
  };
  const bytes = buildPdf({
    title: spec.title,
    subtitle: spec.subtitle,
    businessName: spec.businessName,
    meta: spec.meta,
    orientation: spec.landscape || spec.columns.length > 6 ? 'landscape' : 'portrait',
    tables: [{
      columns: spec.columns.map((c) => ({
        header: c.kind === 'money' ? `${c.header} (${spec.currency.code})` : c.header,
        align: c.kind === 'money' || c.kind === 'integer' || c.kind === 'number' ? 'right' : 'left',
      })),
      rows: spec.rows.map((r) => spec.columns.map((c) => fmt(c, c.value(r)))),
      totals: totals ? spec.columns.map((c, i) => (i === 0 ? 'Total' : totals[i] == null ? '' : fmt(c, totals[i]))) : undefined,
    }],
    notes: spec.notes,
    generatedAt: formatDateTime(new Date().toISOString(), spec.timezone),
  });
  saveBytes(bytes, `${safeFileName(`${spec.businessName}-${spec.title}`)}.pdf`, PDF_MIME);
}

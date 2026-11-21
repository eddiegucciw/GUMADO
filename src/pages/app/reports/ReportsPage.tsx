import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { useAuth } from '../../../auth/AuthProvider';
import { BuyerPicker } from '../../../components/BuyerPicker';
import { ExportButtons } from '../../../components/ExportButtons';
import { listAllPayments } from '../../../data/payments';
import { listAllPlots } from '../../../data/plots';
import { agentPerformance, collections, salesByLocation } from '../../../data/reports';
import { listAllSales } from '../../../data/sales';
import type { Buyer } from '../../../data/types';
import { formatDate, formatDateTime } from '../../../lib/dates';
import type { ExportColumn } from '../../../lib/exporters';
import { formatMoney, sumMinor } from '../../../lib/money';
import { useSearchParams } from '../../../lib/router';
import { useQuery } from '../../../lib/useQuery';
import { Card, CardHeader, Field, Select, cx } from '../../../ui/core';
import { PageHeader } from '../../../ui/data';
import { EmptyState, ErrorState, LoadingRows } from '../../../ui/feedback';
import { DateRangePicker, useDateRange } from '../../../ui/inputs';
import { formatSize } from '../plots/PlotsPage';
import { paymentStatusLabel, salePaymentStatusLabel } from '../../../ui/status';

type ReportKey = 'available' | 'sold' | 'sales' | 'location' | 'revenue' | 'outstanding' | 'payments' | 'buyer' | 'agents';

interface ReportDef {
  key: ReportKey;
  label: string;
  description: string;
  period: boolean;
  needs?: 'sales.view_all';
}

const REPORTS: ReportDef[] = [
  { key: 'available', label: 'Available plots', description: 'Plots currently available for sale, with asking prices.', period: false },
  { key: 'sold', label: 'Sold plots', description: 'Plots currently marked Sold, with their sale prices.', period: false },
  { key: 'sales', label: 'Sales by date', description: 'Every sale recorded in the period, with paid and outstanding amounts.', period: true },
  { key: 'location', label: 'Sales by location', description: 'Active sales in the period grouped by county and estate.', period: true },
  { key: 'revenue', label: 'Revenue collected', description: 'Confirmed payments received in the period, by month and method.', period: true },
  { key: 'outstanding', label: 'Outstanding balances', description: 'Active sales with money still owed, as of today.', period: false },
  { key: 'payments', label: 'Payment history', description: 'All payments dated in the period, including pending, rejected and reversed.', period: true },
  { key: 'buyer', label: 'Buyer purchase history', description: 'Everything one buyer has purchased and paid.', period: false },
  { key: 'agents', label: 'Agent performance', description: 'Sales and collections per agent in the period.', period: true, needs: 'sales.view_all' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;

export default function ReportsPage() {
  const { business, can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [range, setRange] = useDateRange('mtd');
  const [buyer, setBuyer] = useState<Pick<Buyer, 'id' | 'full_name' | 'phone'> | null>(null);
  const available = REPORTS.filter((r) => !r.needs || can(r.needs));
  const key = (available.find((r) => r.key === sp.get('r'))?.key ?? 'sales') as ReportKey;
  const def = REPORTS.find((r) => r.key === key)!;
  const periodText = def.period ? `${formatDate(range.from)} – ${formatDate(range.to)}` : `As at ${formatDateTime(new Date().toISOString(), business.timezone)}`;

  const { columns, load } = useMemo((): { columns: ExportColumn<AnyRow>[]; load: () => Promise<AnyRow[]> } => {
    switch (key) {
      case 'available':
        return {
          load: () => listAllPlots({ status: 'available', sort: 'reference' }),
          columns: [
            { header: 'Reference', value: (p) => p.reference }, { header: 'Name', value: (p) => p.name }, { header: 'County', value: (p) => p.county },
            { header: 'Estate', value: (p) => p.estate }, { header: 'Size', value: (p) => formatSize(p) },
            { header: 'Asking price', kind: 'money', value: (p) => p.asking_price, total: true },
          ],
        };
      case 'sold':
        return {
          load: () => listAllPlots({ status: 'sold', sort: 'reference' }),
          columns: [
            { header: 'Reference', value: (p) => p.reference }, { header: 'Name', value: (p) => p.name }, { header: 'County', value: (p) => p.county },
            { header: 'Estate', value: (p) => p.estate }, { header: 'Sale', value: (p) => p.active_sale_reference },
            { header: 'Asking price', kind: 'money', value: (p) => p.asking_price, total: true }, { header: 'Sale price', kind: 'money', value: (p) => p.sale_price, total: true },
          ],
        };
      case 'sales':
        return {
          load: () => listAllSales({ from: range.from, to: range.to }),
          columns: [
            { header: 'Date', kind: 'date', value: (s) => s.sale_date }, { header: 'Sale', value: (s) => s.reference }, { header: 'Plot', value: (s) => s.plot_reference },
            { header: 'Buyer', value: (s) => s.buyer_name }, { header: 'Agent', value: (s) => s.agent_name }, { header: 'Status', value: (s) => salePaymentStatusLabel(s.payment_status) },
            { header: 'Price', kind: 'money', value: (s) => (s.status === 'active' ? s.sale_price : 0), total: true },
            { header: 'Paid', kind: 'money', value: (s) => s.total_paid, total: true }, { header: 'Outstanding', kind: 'money', value: (s) => s.outstanding, total: true },
          ],
        };
      case 'location':
        return {
          load: () => salesByLocation(range.from, range.to),
          columns: [
            { header: 'County', value: (r) => r.county }, { header: 'Estate', value: (r) => r.estate }, { header: 'Sales', kind: 'integer', value: (r) => r.sales_count, total: true },
            { header: 'Sales value', kind: 'money', value: (r) => r.sales_value, total: true }, { header: 'Collected', kind: 'money', value: (r) => r.collected, total: true },
            { header: 'Outstanding', kind: 'money', value: (r) => r.outstanding, total: true },
          ],
        };
      case 'revenue':
        return {
          load: () => collections(range.from, range.to),
          columns: [
            { header: 'Month', value: (r) => formatDate(r.month).replace(/^\d+ /, '') }, { header: 'Method', value: (r) => r.method_name },
            { header: 'Payments', kind: 'integer', value: (r) => r.payments_count, total: true }, { header: 'Amount collected', kind: 'money', value: (r) => r.amount, total: true },
          ],
        };
      case 'outstanding':
        return {
          load: () => listAllSales({ status: 'active', withBalance: true }),
          columns: [
            { header: 'Sale', value: (s) => s.reference }, { header: 'Plot', value: (s) => s.plot_reference }, { header: 'Buyer', value: (s) => s.buyer_name },
            { header: 'Phone', value: (s) => s.buyer_phone }, { header: 'Due by', kind: 'date', value: (s) => s.balance_due_date }, { header: 'Status', value: (s) => salePaymentStatusLabel(s.payment_status) },
            { header: 'Price', kind: 'money', value: (s) => s.sale_price, total: true }, { header: 'Paid', kind: 'money', value: (s) => s.total_paid, total: true },
            { header: 'Outstanding', kind: 'money', value: (s) => s.outstanding, total: true },
          ],
        };
      case 'payments':
        return {
          load: () => listAllPayments({ from: range.from, to: range.to }),
          columns: [
            { header: 'Date', kind: 'date', value: (p) => p.paid_on }, { header: 'Receipt', value: (p) => p.receipt_number }, { header: 'Buyer', value: (p) => p.buyer_name },
            { header: 'Sale', value: (p) => p.sale_reference }, { header: 'Method', value: (p) => p.method_name }, { header: 'Reference', value: (p) => p.transaction_reference },
            { header: 'Status', value: (p) => paymentStatusLabel(p.status) },
            { header: 'Confirmed amount', kind: 'money', value: (p) => (p.status === 'confirmed' ? p.amount : 0), total: true },
            { header: 'Amount', kind: 'money', value: (p) => p.amount },
          ],
        };
      case 'buyer':
        return {
          load: () => (buyer ? listAllSales({ buyerId: buyer.id }) : Promise.resolve([])),
          columns: [
            { header: 'Date', kind: 'date', value: (s) => s.sale_date }, { header: 'Sale', value: (s) => s.reference }, { header: 'Plot', value: (s) => s.plot_reference },
            { header: 'Location', value: (s) => [s.estate, s.county].filter(Boolean).join(', ') }, { header: 'Status', value: (s) => salePaymentStatusLabel(s.payment_status) },
            { header: 'Price', kind: 'money', value: (s) => (s.status === 'active' ? s.sale_price : 0), total: true }, { header: 'Paid', kind: 'money', value: (s) => s.total_paid, total: true },
            { header: 'Outstanding', kind: 'money', value: (s) => s.outstanding, total: true },
          ],
        };
      case 'agents':
        return {
          load: () => agentPerformance(range.from, range.to),
          columns: [
            { header: 'Agent', value: (r) => r.agent_name }, { header: 'Sales', kind: 'integer', value: (r) => r.sales_count, total: true },
            { header: 'Sales value', kind: 'money', value: (r) => r.sales_value, total: true }, { header: 'Collected in period', kind: 'money', value: (r) => r.collected_in_period, total: true },
            { header: 'Outstanding (all time)', kind: 'money', value: (r) => r.outstanding, total: true },
          ],
        };
    }
  }, [key, range.from, range.to, buyer]);

  const data = useQuery(load, [key, range.from, range.to, buyer?.id]);
  const rows = data.data ?? [];
  const display = (c: ExportColumn<AnyRow>, r: AnyRow) => {
    const v = c.value(r);
    if (v == null || v === '') return '—';
    if (c.kind === 'money') return formatMoney(Number(v), business.currency);
    if (c.kind === 'date') return formatDate(String(v));
    if (c.kind === 'integer') return Number(v).toLocaleString('en');
    return String(v);
  };
  const totals = columns.filter((c) => c.total && c.kind === 'money');
  const SHOWN = 500;

  return (
    <>
      <PageHeader title="Reports" description="Generated from live records using the same rules as the dashboard: only confirmed payments count as collected." />
      <div className="grid gap-4 lg:grid-cols-[15rem_1fr] sm:gap-5">
        <nav aria-label="Reports" className="no-print">
          <Select aria-label="Report" className="lg:hidden" value={key} onChange={(e) => setSp({ r: e.target.value })}>
            {available.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </Select>
          <ul className="hidden space-y-0.5 lg:block">
            {available.map((r) => (
              <li key={r.key}>
                <button type="button" onClick={() => setSp({ r: r.key })} aria-current={r.key === key ? 'page' : undefined}
                  className={cx('w-full rounded-xl px-3 py-2 text-left text-sm font-semibold', r.key === key ? 'bg-accent-soft text-accent-strong' : 'text-ink-2 hover:bg-surface-2')}>
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title={def.label} description={<>{def.description} <span className="font-medium text-ink-2">{periodText}</span></>}
              actions={<ExportButtons title={def.label} subtitle={periodText + (key === 'buyer' && buyer ? ` · ${buyer.full_name}` : '')} columns={columns} load={load}
                notes={['Collected amounts include confirmed payments only. Pending, rejected and reversed payments are excluded.']} />} />
            <div className="no-print flex flex-wrap items-end gap-3 border-b border-line px-4 py-3 sm:px-5">
              {def.period && <DateRangePicker value={range} onChange={setRange} />}
              {key === 'buyer' && <Field label="Buyer" className="w-full max-w-md">{(id) => <BuyerPicker id={id} value={buyer} onChange={setBuyer} />}</Field>}
            </div>
            <div className="print-only px-5 pt-4"><p className="text-lg font-bold">{business.name} · {def.label}</p><p className="text-sm">{periodText}</p></div>

            {data.data && rows.length > 0 && (
              <div className="grid grid-cols-2 gap-3 border-b border-line px-4 py-4 sm:grid-cols-4 sm:px-5">
                <div><p className="text-xs text-muted">Rows</p><p className="text-lg font-bold text-ink tabular">{rows.length.toLocaleString('en')}</p></div>
                {totals.slice(0, 3).map((c) => (
                  <div key={c.header}><p className="text-xs text-muted">{c.header}</p><p className="text-lg font-bold text-ink tabular">{formatMoney(sumMinor(rows.map((r) => Number(c.value(r) ?? 0))), business.currency)}</p></div>
                ))}
              </div>
            )}

            {data.error ? <ErrorState error={data.error} onRetry={data.reload} /> : !data.data || data.loading ? <LoadingRows /> :
              key === 'buyer' && !buyer ? <EmptyState compact title="Choose a buyer" description="Search for the buyer above to see their purchase history." /> :
                rows.length === 0 ? <EmptyState icon={<BarChart3 className="h-5 w-5" />} title="No records for this selection" description={def.period ? 'Try a longer period.' : undefined} /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-line text-left">
                        {columns.map((c) => <th key={c.header} scope="col" className={cx('whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted sm:px-5', (c.kind === 'money' || c.kind === 'integer') && 'text-right')}>{c.header}</th>)}
                      </tr></thead>
                      <tbody className="divide-y divide-line">
                        {rows.slice(0, SHOWN).map((r, i) => (
                          <tr key={i}>
                            {columns.map((c) => <td key={c.header} className={cx('whitespace-nowrap px-4 py-2.5 text-ink-2 sm:px-5', (c.kind === 'money' || c.kind === 'integer') && 'text-right tabular')}>{display(c, r)}</td>)}
                          </tr>
                        ))}
                      </tbody>
                      {columns.some((c) => c.total) && (
                        <tfoot><tr className="border-t-2 border-line-strong font-bold text-ink">
                          {columns.map((c, i) => (
                            <td key={c.header} className={cx('whitespace-nowrap px-4 py-3 sm:px-5', (c.kind === 'money' || c.kind === 'integer') && 'text-right tabular')}>
                              {i === 0 ? 'Total' : c.total ? (c.kind === 'money' ? formatMoney(sumMinor(rows.map((r) => Number(c.value(r) ?? 0))), business.currency) : sumMinor(rows.map((r) => Number(c.value(r) ?? 0))).toLocaleString('en')) : ''}
                            </td>
                          ))}
                        </tr></tfoot>
                      )}
                    </table>
                    {rows.length > SHOWN && <p className="no-print border-t border-line px-5 py-3 text-xs text-muted">Showing the first {SHOWN} of {rows.length.toLocaleString('en')} rows. Totals and exports include every row.</p>}
                  </div>
                )}
          </Card>
        </div>
      </div>
    </>
  );
}

import { useState } from 'react';
import { Plus, Search, Wallet } from 'lucide-react';
import { useAuth } from '../../../auth/AuthProvider';
import { ExportButtons } from '../../../components/ExportButtons';
import { getPayment, listAllPayments, listMethods, listPayments, type PaymentFilters } from '../../../data/payments';
import { listSales } from '../../../data/sales';
import type { Payment, PaymentStatus, Sale } from '../../../data/types';
import { formatDate, formatDateTime } from '../../../lib/dates';
import { formatMoney } from '../../../lib/money';
import { Link, useSearchParams } from '../../../lib/router';
import { useDebounced, useQuery } from '../../../lib/useQuery';
import { Button, Card, Input, KeyValue, Select, Spinner } from '../../../ui/core';
import { DataTable, FilterBar, PageHeader, Pagination, SearchInput, Tabs, type Column } from '../../../ui/data';
import { Dialog, EmptyState, ErrorState } from '../../../ui/feedback';
import { PaymentStatusBadge, paymentStatusLabel } from '../../../ui/status';
import { PaymentActions } from './PaymentActions';
import { RecordPaymentDialog } from './RecordPaymentDialog';

function SalePickerDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (s: Sale) => void }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const sales = useQuery(() => listSales({ q: dq, status: 'active', withBalance: true }, 1), [dq], { enabled: open });
  const { business } = useAuth();
  return (
    <Dialog open={open} onClose={onClose} title="Record payment for which sale?">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input data-autofocus placeholder="Sale ref, plot or buyer" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" aria-label="Search sales" />
      </div>
      <div className="mt-3">
        {sales.error ? <ErrorState compact error={sales.error} /> : !sales.data ? <div className="grid place-items-center py-6"><Spinner /></div> :
          sales.data.rows.length === 0 ? <p className="py-6 text-center text-sm text-muted">No active sales with a balance match.</p> : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {sales.data.rows.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => onPick(s)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-surface-2">
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink">Plot {s.plot_reference} · {s.buyer_name ?? '—'}</span><span className="block truncate text-xs text-muted">{s.reference}</span></span>
                    <span className="shrink-0 text-right text-sm font-semibold text-ink tabular">{formatMoney(s.outstanding, business.currency)}<span className="block text-[0.68rem] font-normal text-muted">outstanding</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </div>
    </Dialog>
  );
}

export default function PaymentsPage() {
  const { business, can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const page = Number(sp.get('page') ?? 1) || 1;
  const filters: PaymentFilters = {
    q: sp.get('q') ?? '',
    status: (sp.get('status') as PaymentStatus) || '',
    from: sp.get('from') ?? '',
    to: sp.get('to') ?? '',
    methodId: sp.get('method') ?? '',
  };
  const data = useQuery(() => listPayments(filters, page), [JSON.stringify(filters), page]);
  const pendingCount = useQuery(async () => (await listPayments({ status: 'pending' }, 1)).count, [data.data]);
  const methods = useQuery(() => listMethods(true), []);
  const openId = sp.get('open');
  const opened = useQuery(() => (openId ? getPayment(openId) : Promise.resolve(null)), [openId]);
  const [picking, setPicking] = useState(false);
  const [recordFor, setRecordFor] = useState<Sale | null>(null);
  const money = (v: number) => formatMoney(v, business.currency);
  const set = (k: Record<string, string | null>) => setSp({ ...k, page: null });
  const reload = () => { data.reload(); opened.reload(); };

  const columns: Column<Payment>[] = [
    { key: 'date', header: 'Date', cell: (p) => formatDate(p.paid_on), mobile: 'meta' },
    { key: 'buyer', header: 'Buyer', cell: (p) => p.buyer_name ?? '—', mobile: 'title' },
    { key: 'sale', header: 'Sale / plot', cell: (p) => <span>{p.sale_reference}<span className="block text-xs text-muted">Plot {p.plot_reference}</span></span>, mobile: 'hidden' },
    { key: 'method', header: 'Method', cell: (p) => <span>{p.method_name}{p.transaction_reference && <span className="block text-xs text-muted">{p.transaction_reference}</span>}</span>, mobile: 'meta' },
    { key: 'amount', header: 'Amount', align: 'right', mobile: 'end', cell: (p) => <span><span className="font-semibold text-ink">{money(p.amount)}</span><span className="mt-1 block md:hidden"><PaymentStatusBadge status={p.status} /></span></span> },
    { key: 'status', header: 'Status', cell: (p) => <PaymentStatusBadge status={p.status} />, mobile: 'hidden' },
  ];

  return (
    <>
      <PageHeader title="Payments" description="Manual payment ledger. Only confirmed payments count towards collections and balances."
        actions={<>
          <ExportButtons title="Payment history" subtitle={filters.status ? paymentStatusLabel(filters.status) : 'All payments'} load={() => listAllPayments(filters)}
            columns={[
              { header: 'Receipt', value: (p) => p.receipt_number }, { header: 'Date', kind: 'date', value: (p) => p.paid_on },
              { header: 'Buyer', value: (p) => p.buyer_name }, { header: 'Sale', value: (p) => p.sale_reference }, { header: 'Plot', value: (p) => p.plot_reference },
              { header: 'Method', value: (p) => p.method_name }, { header: 'Reference', value: (p) => p.transaction_reference },
              { header: 'Amount', kind: 'money', value: (p) => p.amount, total: true }, { header: 'Status', value: (p) => paymentStatusLabel(p.status) },
              { header: 'Recorded by', value: (p) => p.recorded_by_name },
            ]} />
          {can('payments.record') && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setPicking(true)}>Record payment</Button>}
        </>} />

      <div className="mb-3">
        <Tabs label="Payment status" value={filters.status || 'all'} onChange={(v) => set({ status: v === 'all' ? null : v })}
          tabs={[
            { value: 'all', label: 'All' },
            { value: 'pending', label: 'Awaiting confirmation', count: pendingCount.data },
            { value: 'confirmed', label: 'Confirmed' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'reversed', label: 'Reversed' },
          ]} />
      </div>

      <Card>
        <FilterBar>
          <SearchInput value={filters.q ?? ''} onChange={(q) => set({ q })} placeholder="Receipt, M-Pesa code, buyer, sale" className="sm:w-72" />
          <Select aria-label="Method" className="sm:w-44" value={filters.methodId} onChange={(e) => set({ method: e.target.value })}>
            <option value="">All methods</option>
            {methods.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
          <div className="flex items-center gap-2">
            <Input type="date" aria-label="From date" className="w-auto" value={filters.from} onChange={(e) => set({ from: e.target.value })} />
            <span className="text-muted">–</span>
            <Input type="date" aria-label="To date" className="w-auto" value={filters.to} onChange={(e) => set({ to: e.target.value })} />
          </div>
        </FilterBar>
        <DataTable columns={columns} rows={data.data?.rows} rowKey={(p) => p.id} rowHref={(p) => `/app/payments?${new URLSearchParams({ ...Object.fromEntries(sp), open: p.id })}`}
          loading={data.loading} error={data.error} onRetry={data.reload}
          empty={<EmptyState icon={<Wallet className="h-5 w-5" />} title={filters.status === 'pending' ? 'Nothing is waiting for confirmation' : 'No payments found'} />} />
        <Pagination page={page} count={data.data?.count ?? 0} onPage={(p) => setSp({ page: String(p) }, { replace: false })} />
      </Card>

      <Dialog open={!!openId} onClose={() => setSp({ open: null })} title={opened.data ? `Payment ${opened.data.receipt_number}` : 'Payment'}>
        {opened.error ? <ErrorState compact error={opened.error} /> : !opened.data ? (opened.loading ? <div className="grid place-items-center py-8"><Spinner /></div> : <p className="text-sm text-muted">Payment not found.</p>) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-2xl font-bold text-ink tabular">{money(opened.data.amount)}</p>
              <PaymentStatusBadge status={opened.data.status} />
            </div>
            <KeyValue items={[
              ['Buyer', opened.data.buyer_name],
              ['Sale', <Link key="s" to={`/app/sales/${opened.data.sale_id}`} className="font-semibold text-accent hover:underline">{opened.data.sale_reference} · Plot {opened.data.plot_reference}</Link>],
              ['Payment date', formatDate(opened.data.paid_on)],
              ['Method', opened.data.method_name],
              ['Transaction reference', opened.data.transaction_reference],
              ['Recorded', `${opened.data.recorded_by_name} · ${formatDateTime(opened.data.recorded_at, business.timezone)}`],
              ['Confirmed / reviewed', opened.data.verified_by_name ? `${opened.data.verified_by_name} · ${formatDateTime(opened.data.verified_at, business.timezone)}` : '—'],
              ['Reason', opened.data.status_reason],
              ['Notes', opened.data.notes],
            ]} />
            <PaymentActions payment={opened.data} onChanged={reload} />
          </div>
        )}
      </Dialog>

      <SalePickerDialog open={picking} onClose={() => setPicking(false)} onPick={(s) => { setPicking(false); setRecordFor(s); }} />
      <RecordPaymentDialog open={!!recordFor} onClose={() => setRecordFor(null)} sale={recordFor} onRecorded={reload} />
    </>
  );
}

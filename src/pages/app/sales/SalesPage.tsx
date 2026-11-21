import { Plus, Receipt } from 'lucide-react';
import { useAuth, Can } from '../../../auth/AuthProvider';
import { ExportButtons } from '../../../components/ExportButtons';
import { listStaff } from '../../../data/admin';
import { listAllSales, listSales, SALE_PAYMENT_STATUSES, type SaleFilters } from '../../../data/sales';
import type { Sale, SalePaymentStatus } from '../../../data/types';
import { formatDate } from '../../../lib/dates';
import { formatMoney } from '../../../lib/money';
import { useSearchParams } from '../../../lib/router';
import { useQuery } from '../../../lib/useQuery';
import { ButtonLink, Card, Input, Select } from '../../../ui/core';
import { DataTable, FilterBar, PageHeader, Pagination, SearchInput, type Column } from '../../../ui/data';
import { EmptyState } from '../../../ui/feedback';
import { SaleStatusBadge, salePaymentStatusLabel } from '../../../ui/status';

export default function SalesPage() {
  const { business, can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const page = Number(sp.get('page') ?? 1) || 1;
  const filters: SaleFilters = {
    q: sp.get('q') ?? '',
    paymentStatus: (sp.get('pay') as SalePaymentStatus) || '',
    from: sp.get('from') ?? '',
    to: sp.get('to') ?? '',
    agentId: sp.get('agent') ?? '',
    withBalance: sp.get('balance') === '1',
  };
  const data = useQuery(() => listSales(filters, page), [JSON.stringify(filters), page]);
  const staff = useQuery(listStaff, [], { enabled: can('sales.view_all') });
  const money = (v: number) => formatMoney(v, business.currency);
  const set = (k: Record<string, string | null>) => setSp({ ...k, page: null });

  const columns: Column<Sale>[] = [
    { key: 'ref', header: 'Sale', cell: (s) => s.reference, mobile: 'hidden' },
    { key: 'plot', header: 'Plot', cell: (s) => <span><span className="font-semibold text-ink">{s.plot_reference}</span><span className="block text-xs text-muted">{s.estate ?? s.county}</span></span>, mobile: 'title' },
    { key: 'buyer', header: 'Buyer', cell: (s) => s.buyer_name ?? '—', mobile: 'meta' },
    { key: 'date', header: 'Date', cell: (s) => formatDate(s.sale_date), mobile: 'meta' },
    { key: 'agent', header: 'Agent', cell: (s) => s.agent_name, mobile: 'hidden' },
    { key: 'price', header: 'Price', align: 'right', cell: (s) => money(s.sale_price), mobile: 'hidden' },
    { key: 'out', header: 'Outstanding', align: 'right', mobile: 'end', cell: (s) => <span><span className="font-semibold text-ink">{money(s.outstanding)}</span><span className="mt-1 block md:hidden"><SaleStatusBadge status={s.payment_status} /></span></span> },
    { key: 'status', header: 'Status', cell: (s) => <SaleStatusBadge status={s.payment_status} />, mobile: 'hidden' },
  ];

  return (
    <>
      <PageHeader title="Sales" description={data.data ? `${data.data.count.toLocaleString('en')} sale${data.data.count === 1 ? '' : 's'}` : ' '}
        actions={<>
          <ExportButtons title="Sales" subtitle={filters.from || filters.to ? `${filters.from ? formatDate(filters.from) : 'Start'} – ${filters.to ? formatDate(filters.to) : 'today'}` : 'All dates'}
            load={() => listAllSales(filters)}
            columns={[
              { header: 'Sale', value: (s) => s.reference }, { header: 'Date', kind: 'date', value: (s) => s.sale_date },
              { header: 'Plot', value: (s) => s.plot_reference }, { header: 'County', value: (s) => s.county }, { header: 'Estate', value: (s) => s.estate },
              { header: 'Buyer', value: (s) => s.buyer_name }, { header: 'Agent', value: (s) => s.agent_name },
              { header: 'Price', kind: 'money', value: (s) => s.sale_price, total: true }, { header: 'Paid', kind: 'money', value: (s) => s.total_paid, total: true },
              { header: 'Outstanding', kind: 'money', value: (s) => s.outstanding, total: true }, { header: 'Status', value: (s) => salePaymentStatusLabel(s.payment_status) },
            ]} />
          <Can permission="sales.create"><ButtonLink to="/app/sales/new" variant="primary" icon={<Plus className="h-4 w-4" />}>New sale</ButtonLink></Can>
        </>} />
      <Card>
        <FilterBar>
          <SearchInput value={filters.q ?? ''} onChange={(q) => set({ q })} placeholder="Sale ref, plot, buyer or estate" className="sm:w-72" />
          <Select aria-label="Payment status" className="sm:w-44" value={filters.paymentStatus} onChange={(e) => set({ pay: e.target.value })}>
            <option value="">All statuses</option>
            {SALE_PAYMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          {can('sales.view_all') && (
            <Select aria-label="Agent" className="sm:w-44" value={filters.agentId} onChange={(e) => set({ agent: e.target.value })}>
              <option value="">All agents</option>
              {staff.data?.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
            </Select>
          )}
          <div className="flex items-center gap-2">
            <Input type="date" aria-label="From date" className="w-auto" value={filters.from} onChange={(e) => set({ from: e.target.value })} />
            <span className="text-muted">–</span>
            <Input type="date" aria-label="To date" className="w-auto" value={filters.to} onChange={(e) => set({ to: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" className="accent-[var(--accent)]" checked={!!filters.withBalance} onChange={(e) => set({ balance: e.target.checked ? '1' : null })} />
            Balance due
          </label>
        </FilterBar>
        <DataTable columns={columns} rows={data.data?.rows} rowKey={(s) => s.id} rowHref={(s) => `/app/sales/${s.id}`} loading={data.loading} error={data.error} onRetry={data.reload}
          empty={<EmptyState icon={<Receipt className="h-5 w-5" />} title="No sales found" description={filters.q || filters.paymentStatus || filters.from ? 'Try changing the filters.' : 'Recorded sales appear here.'}
            action={<Can permission="sales.create"><ButtonLink to="/app/sales/new" variant="primary">Record a sale</ButtonLink></Can>} />} />
        <Pagination page={page} count={data.data?.count ?? 0} onPage={(p) => setSp({ page: String(p) }, { replace: false })} />
      </Card>
    </>
  );
}

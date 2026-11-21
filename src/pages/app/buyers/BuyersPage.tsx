import { useState } from 'react';
import { UserPlus, Users } from 'lucide-react';
import { useAuth, Can } from '../../../auth/AuthProvider';
import { ExportButtons } from '../../../components/ExportButtons';
import { listAllBuyers, listBuyers, type BuyerFilters } from '../../../data/buyers';
import type { Buyer } from '../../../data/types';
import { formatDate } from '../../../lib/dates';
import { formatMoney } from '../../../lib/money';
import { useRouter, useSearchParams } from '../../../lib/router';
import { useQuery } from '../../../lib/useQuery';
import { Button, Card } from '../../../ui/core';
import { DataTable, FilterBar, PageHeader, Pagination, SearchInput, type Column } from '../../../ui/data';
import { EmptyState } from '../../../ui/feedback';
import { BuyerFormDialog } from './BuyerForm';

export default function BuyersPage() {
  const { business } = useAuth();
  const { navigate } = useRouter();
  const [sp, setSp] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const page = Number(sp.get('page') ?? 1) || 1;
  const filters: BuyerFilters = { q: sp.get('q') ?? '', withBalance: sp.get('balance') === '1', archived: sp.get('archived') === '1' };
  const data = useQuery(() => listBuyers(filters, page), [JSON.stringify(filters), page]);
  const money = (v: number) => formatMoney(v, business.currency);

  const columns: Column<Buyer>[] = [
    { key: 'name', header: 'Name', cell: (b) => b.full_name, mobile: 'title' },
    { key: 'phone', header: 'Phone', cell: (b) => b.phone, mobile: 'meta' },
    { key: 'email', header: 'Email', cell: (b) => b.email ?? '—', mobile: 'hidden' },
    { key: 'sales', header: 'Active purchases', align: 'right', cell: (b) => b.active_sales, mobile: 'meta' },
    { key: 'out', header: 'Outstanding', align: 'right', mobile: 'end', cell: (b) => <span className={b.outstanding > 0 ? 'font-semibold text-warning' : 'text-muted'}>{money(b.outstanding)}</span> },
    { key: 'reg', header: 'Registered', cell: (b) => formatDate(b.registered_on), mobile: 'hidden' },
  ];

  return (
    <>
      <PageHeader title="Buyers" description={data.data ? `${data.data.count.toLocaleString('en')} buyer${data.data.count === 1 ? '' : 's'}` : ' '}
        actions={<>
          <ExportButtons permission="buyers.export" title="Buyers" load={() => listAllBuyers(filters)}
            columns={[
              { header: 'Name', value: (b) => b.full_name },
              { header: 'Phone', value: (b) => b.phone },
              { header: 'Email', value: (b) => b.email },
              { header: 'Registered', kind: 'date', value: (b) => b.registered_on },
              { header: 'Active purchases', kind: 'integer', value: (b) => b.active_sales },
              { header: 'Purchased', kind: 'money', value: (b) => b.total_purchased, total: true },
              { header: 'Paid', kind: 'money', value: (b) => b.total_paid, total: true },
              { header: 'Outstanding', kind: 'money', value: (b) => b.outstanding, total: true },
            ]} />
          <Can permission="buyers.manage"><Button variant="primary" icon={<UserPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>Register buyer</Button></Can>
        </>} />
      <Card>
        <FilterBar>
          <SearchInput value={filters.q ?? ''} onChange={(q) => setSp({ q, page: null })} placeholder="Name, phone or email" className="sm:w-80" />
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" className="accent-[var(--accent)]" checked={!!filters.withBalance} onChange={(e) => setSp({ balance: e.target.checked ? '1' : null, page: null })} />
            With outstanding balance
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" className="accent-[var(--accent)]" checked={!!filters.archived} onChange={(e) => setSp({ archived: e.target.checked ? '1' : null, page: null })} />
            Archived
          </label>
        </FilterBar>
        <DataTable columns={columns} rows={data.data?.rows} rowKey={(b) => b.id} rowHref={(b) => `/app/buyers/${b.id}`} loading={data.loading} error={data.error} onRetry={data.reload}
          empty={<EmptyState icon={<Users className="h-5 w-5" />} title={filters.q ? 'No buyers match your search' : 'No buyers registered yet'}
            action={!filters.q && <Can permission="buyers.manage"><Button variant="primary" onClick={() => setCreating(true)}>Register buyer</Button></Can>} />} />
        <Pagination page={page} count={data.data?.count ?? 0} onPage={(p) => setSp({ page: String(p) }, { replace: false })} />
      </Card>
      <BuyerFormDialog open={creating} onClose={() => setCreating(false)} onSaved={(b) => navigate(`/app/buyers/${b.id}`)} />
    </>
  );
}

import { History } from 'lucide-react';
import { useAuth } from '../../../auth/AuthProvider';
import { actionLabel, ChangeSummary } from '../../../components/History';
import { listAudit, listStaff, type AuditFilters } from '../../../data/admin';
import type { AuditEntry } from '../../../data/types';
import { formatDateTime } from '../../../lib/dates';
import { useSearchParams } from '../../../lib/router';
import { useQuery } from '../../../lib/useQuery';
import { Card, Input, Select } from '../../../ui/core';
import { DataTable, FilterBar, PageHeader, Pagination, type Column } from '../../../ui/data';
import { EmptyState } from '../../../ui/feedback';

const TABLES = [
  ['plots', 'Plots'], ['buyers', 'Buyers'], ['buyer_identities', 'Buyer identification'], ['sales', 'Sales'], ['payments', 'Payments'],
  ['documents', 'Documents'], ['profiles', 'Staff'], ['roles', 'Roles'], ['role_permissions', 'Role permissions'],
  ['payment_methods', 'Payment methods'], ['business_settings', 'Business settings'],
];

export default function AuditPage() {
  const { business } = useAuth();
  const [sp, setSp] = useSearchParams();
  const page = Number(sp.get('page') ?? 1) || 1;
  const f: AuditFilters = { table: sp.get('table') ?? '', actorId: sp.get('actor') ?? '', from: sp.get('from') ?? '', to: sp.get('to') ?? '' };
  const data = useQuery(() => listAudit(f, page), [JSON.stringify(f), page]);
  const staff = useQuery(listStaff, []);
  const who = (id: string | null) => (id ? staff.data?.find((s) => s.id === id)?.full_name || staff.data?.find((s) => s.id === id)?.email || 'Staff member' : 'System');
  const set = (k: Record<string, string | null>) => setSp({ ...k, page: null });

  const columns: Column<AuditEntry>[] = [
    { key: 'when', header: 'When', cell: (a) => <span className="whitespace-nowrap">{formatDateTime(a.occurred_at, business.timezone)}</span>, mobile: 'meta' },
    { key: 'who', header: 'User', cell: (a) => who(a.actor_id), mobile: 'meta' },
    { key: 'what', header: 'Action', mobile: 'title', cell: (a) => <span><span className="font-semibold text-ink">{actionLabel(a.action)}</span><span className="block text-xs text-muted">{a.table_name}{a.record_id ? ` · ${a.record_id.slice(0, 8)}` : ''}</span></span> },
    { key: 'changes', header: 'Changes', mobile: 'meta', cell: (a) => <ChangeSummary fields={a.changed_fields ?? (a.new_data ? Object.keys(a.new_data).slice(0, 6) : null)} before={a.old_data && a.changed_fields ? a.old_data : null} after={a.new_data} /> },
  ];

  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of every important change. Entries cannot be edited or deleted." />
      <Card>
        <FilterBar>
          <Select aria-label="Record type" className="sm:w-52" value={f.table} onChange={(e) => set({ table: e.target.value })}>
            <option value="">All record types</option>
            {TABLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Select aria-label="User" className="sm:w-52" value={f.actorId} onChange={(e) => set({ actor: e.target.value })}>
            <option value="">All users</option>
            {staff.data?.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
          </Select>
          <div className="flex items-center gap-2">
            <Input type="date" aria-label="From date" className="w-auto" value={f.from} onChange={(e) => set({ from: e.target.value })} />
            <span className="text-muted">–</span>
            <Input type="date" aria-label="To date" className="w-auto" value={f.to} onChange={(e) => set({ to: e.target.value })} />
          </div>
        </FilterBar>
        <DataTable columns={columns} rows={data.data?.rows} rowKey={(a) => String(a.id)} loading={data.loading} error={data.error} onRetry={data.reload}
          empty={<EmptyState icon={<History className="h-5 w-5" />} title="No audit entries for this selection" />} />
        <Pagination page={page} pageSize={50} count={data.data?.count ?? 0} onPage={(p) => setSp({ page: String(p) }, { replace: false })} />
      </Card>
    </>
  );
}

import { useState } from 'react';
import { LayoutGrid, Plus, SlidersHorizontal } from 'lucide-react';
import { useAuth, Can } from '../../../auth/AuthProvider';
import { ExportButtons } from '../../../components/ExportButtons';
import { listAllPlots, listPlots, PLOT_STATUSES, plotLocations, SIZE_UNITS, type PlotFilters } from '../../../data/plots';
import type { Plot, PlotStatus, SizeUnit } from '../../../data/types';
import { formatMoney, parseMoney } from '../../../lib/money';
import { useRouter, useSearchParams } from '../../../lib/router';
import { useQuery } from '../../../lib/useQuery';
import { Button, Card, Input, Select } from '../../../ui/core';
import { DataTable, FilterBar, PageHeader, Pagination, SearchInput, type Column } from '../../../ui/data';
import { EmptyState } from '../../../ui/feedback';
import { PlotStatusBadge, plotStatusLabel } from '../../../ui/status';
import { PlotFormDialog } from './PlotForm';

export function formatSize(p: Pick<Plot, 'size' | 'size_unit'>) {
  const u = SIZE_UNITS.find((x) => x.value === p.size_unit)!;
  return `${Number(p.size).toLocaleString('en', { maximumFractionDigits: 4 })} ${u.short}`;
}

export default function PlotsPage() {
  const { business } = useAuth();
  const { navigate } = useRouter();
  const [sp, setSp] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const [creating, setCreating] = useState(sp.get('new') === '1');
  const page = Number(sp.get('page') ?? 1) || 1;

  const filters: PlotFilters = {
    q: sp.get('q') ?? '',
    status: (sp.get('status') as PlotStatus) || '',
    county: sp.get('county') ?? '',
    estate: sp.get('estate') ?? '',
    sizeUnit: (sp.get('unit') as SizeUnit) || 'acres',
    sizeMin: sp.get('smin') ? Number(sp.get('smin')) : undefined,
    sizeMax: sp.get('smax') ? Number(sp.get('smax')) : undefined,
    priceMin: sp.get('pmin') ? parseMoney(sp.get('pmin')!, business.currency.minorUnits) ?? undefined : undefined,
    priceMax: sp.get('pmax') ? parseMoney(sp.get('pmax')!, business.currency.minorUnits) ?? undefined : undefined,
    archived: sp.get('archived') === '1',
    sort: (sp.get('sort') as PlotFilters['sort']) || 'reference',
  };
  const key = JSON.stringify(filters);
  const data = useQuery(() => listPlots(filters, page), [key, page]);
  const locations = useQuery(plotLocations, []);
  const money = (v: number | null) => formatMoney(v, business.currency);
  const set = (k: Record<string, string | null>) => setSp({ ...k, page: null });
  const activeFilterCount = ['status', 'county', 'estate', 'smin', 'smax', 'pmin', 'pmax', 'archived'].filter((k) => sp.get(k)).length;

  const columns: Column<Plot>[] = [
    { key: 'ref', header: 'Reference', cell: (p) => p.reference, mobile: 'title' },
    { key: 'name', header: 'Name', cell: (p) => <span className="line-clamp-1">{p.name}</span>, mobile: 'meta' },
    { key: 'loc', header: 'Location', cell: (p) => [p.estate, p.town, p.county].filter(Boolean).join(', '), mobile: 'meta' },
    { key: 'size', header: 'Size', cell: (p) => formatSize(p), align: 'right', mobile: 'meta' },
    { key: 'price', header: 'Price', align: 'right', mobile: 'end',
      cell: (p) => <span className="font-semibold text-ink">{money(p.sale_price ?? p.asking_price)}{p.sale_price != null && <span className="block text-[0.68rem] font-normal text-muted">sale price</span>}</span> },
    { key: 'status', header: 'Status', mobile: 'meta', cell: (p) => <span className="inline-flex items-center gap-1.5"><PlotStatusBadge status={p.status} />{p.reservation_expired && <span className="text-[0.68rem] font-semibold text-danger">expired</span>}</span> },
  ];

  return (
    <>
      <PageHeader title="Plot inventory" description={data.data ? `${data.data.count.toLocaleString('en')} plot${data.data.count === 1 ? '' : 's'}${filters.archived ? ' (archived)' : ''}` : ' '}
        actions={<>
          <ExportButtons title="Plot inventory" subtitle={filters.status ? `${plotStatusLabel(filters.status)} plots` : 'All plots'} load={() => listAllPlots(filters)}
            columns={[
              { header: 'Reference', value: (p) => p.reference },
              { header: 'Name', value: (p) => p.name },
              { header: 'County', value: (p) => p.county },
              { header: 'Town', value: (p) => p.town },
              { header: 'Estate', value: (p) => p.estate },
              { header: 'Size', value: (p) => formatSize(p) },
              { header: 'Asking price', kind: 'money', value: (p) => p.asking_price, total: true },
              { header: 'Sale price', kind: 'money', value: (p) => p.sale_price },
              { header: 'Status', value: (p) => plotStatusLabel(p.status) },
              { header: 'Registered', kind: 'date', value: (p) => p.registered_on },
            ]} />
          <Can permission="plots.manage"><Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Register plot</Button></Can>
        </>} />

      <Card>
        <FilterBar>
          <SearchInput value={filters.q ?? ''} onChange={(q) => set({ q })} placeholder="Reference, name or location" className="sm:w-72" />
          <Select aria-label="Status" className="sm:w-40" value={filters.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">All statuses</option>
            {PLOT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          <Select aria-label="Sort" className="sm:w-44" value={filters.sort} onChange={(e) => set({ sort: e.target.value })}>
            <option value="reference">Sort: reference</option>
            <option value="newest">Sort: newest</option>
            <option value="price_asc">Sort: price low → high</option>
            <option value="price_desc">Sort: price high → low</option>
            <option value="size">Sort: largest</option>
          </Select>
          <Button icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
            More filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </Button>
        </FilterBar>
        {showFilters && (
          <div className="no-print grid gap-3 border-b border-line bg-surface-2/50 px-4 py-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-4">
            <Select aria-label="County" value={filters.county} onChange={(e) => set({ county: e.target.value })}>
              <option value="">All counties</option>
              {locations.data?.counties.map((c) => <option key={c}>{c}</option>)}
            </Select>
            <Select aria-label="Estate" value={filters.estate} onChange={(e) => set({ estate: e.target.value })}>
              <option value="">All estates / projects</option>
              {locations.data?.estates.map((c) => <option key={c}>{c}</option>)}
            </Select>
            <div className="flex items-center gap-2">
              <Input aria-label="Minimum size" inputMode="decimal" placeholder="Min size" defaultValue={sp.get('smin') ?? ''} onBlur={(e) => set({ smin: e.target.value || null })} />
              <Input aria-label="Maximum size" inputMode="decimal" placeholder="Max" defaultValue={sp.get('smax') ?? ''} onBlur={(e) => set({ smax: e.target.value || null })} />
              <Select aria-label="Size unit" className="w-24 shrink-0" value={filters.sizeUnit} onChange={(e) => set({ unit: e.target.value })}>
                {SIZE_UNITS.map((u) => <option key={u.value} value={u.value}>{u.short}</option>)}
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Input aria-label="Minimum price" inputMode="numeric" placeholder={`Min ${business.currency.code}`} defaultValue={sp.get('pmin') ?? ''} onBlur={(e) => set({ pmin: e.target.value || null })} />
              <Input aria-label="Maximum price" inputMode="numeric" placeholder="Max" defaultValue={sp.get('pmax') ?? ''} onBlur={(e) => set({ pmax: e.target.value || null })} />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" className="accent-[var(--accent)]" checked={filters.archived} onChange={(e) => set({ archived: e.target.checked ? '1' : null })} />
              Show archived plots
            </label>
            {activeFilterCount > 0 && <Button size="sm" variant="ghost" onClick={() => set({ status: null, county: null, estate: null, smin: null, smax: null, pmin: null, pmax: null, archived: null })}>Clear filters</Button>}
          </div>
        )}
        <DataTable columns={columns} rows={data.data?.rows} rowKey={(p) => p.id} rowHref={(p) => `/app/plots/${p.id}`}
          loading={data.loading} error={data.error} onRetry={data.reload}
          empty={<EmptyState icon={<LayoutGrid className="h-5 w-5" />} title={filters.q || activeFilterCount ? 'No plots match these filters' : 'No plots registered yet'}
            description={filters.q || activeFilterCount ? 'Try clearing a filter.' : 'Register your first plot to start building the inventory.'}
            action={!filters.q && !activeFilterCount && <Can permission="plots.manage"><Button variant="primary" onClick={() => setCreating(true)}>Register plot</Button></Can>} />} />
        <Pagination page={page} count={data.data?.count ?? 0} onPage={(p) => setSp({ page: String(p) }, { replace: false })} />
      </Card>

      <PlotFormDialog open={creating} onClose={() => { setCreating(false); if (sp.get('new')) setSp({ new: null }); }} onSaved={(id) => navigate(`/app/plots/${id}`)} />
    </>
  );
}

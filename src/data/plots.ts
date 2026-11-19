import { fetchAll, rangeFor, searchTerm, supabase, unwrap, unwrapPage } from './db';
import type { Page, Plot, PlotHistoryEntry, PlotStatus, SizeUnit } from './types';

export const SIZE_UNITS: { value: SizeUnit; label: string; short: string; sqm: number }[] = [
  { value: 'acres', label: 'Acres', short: 'ac', sqm: 4046.8564224 },
  { value: 'hectares', label: 'Hectares', short: 'ha', sqm: 10000 },
  { value: 'square_metres', label: 'Square metres', short: 'm²', sqm: 1 },
  { value: 'square_feet', label: 'Square feet', short: 'ft²', sqm: 0.09290304 },
];

export const PLOT_STATUSES: { value: PlotStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'sold', label: 'Sold' },
  { value: 'unavailable', label: 'Unavailable' },
];

export interface PlotFilters {
  q?: string;
  status?: PlotStatus | '';
  county?: string;
  estate?: string;
  /** Size bounds expressed in `sizeUnit`. */
  sizeMin?: number;
  sizeMax?: number;
  sizeUnit?: SizeUnit;
  /** Price bounds in minor units. */
  priceMin?: number;
  priceMax?: number;
  archived?: boolean;
  sort?: 'reference' | 'newest' | 'price_asc' | 'price_desc' | 'size';
}

function applyFilters(f: PlotFilters) {
  let q = supabase.from('v_plots').select('*', { count: 'exact' });
  q = f.archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
  const term = searchTerm(f.q);
  if (term) {
    const t = `*${term}*`;
    q = q.or(`reference.ilike.${t},name.ilike.${t},county.ilike.${t},town.ilike.${t},estate.ilike.${t},location.ilike.${t}`);
  }
  if (f.status) q = q.eq('status', f.status);
  if (f.county) q = q.eq('county', f.county);
  if (f.estate) q = q.eq('estate', f.estate);
  const factor = SIZE_UNITS.find((u) => u.value === (f.sizeUnit ?? 'acres'))!.sqm;
  if (f.sizeMin != null) q = q.gte('size_sq_m', f.sizeMin * factor - 0.01);
  if (f.sizeMax != null) q = q.lte('size_sq_m', f.sizeMax * factor + 0.01);
  if (f.priceMin != null) q = q.gte('asking_price', f.priceMin);
  if (f.priceMax != null) q = q.lte('asking_price', f.priceMax);
  switch (f.sort) {
    case 'newest': q = q.order('created_at', { ascending: false }); break;
    case 'price_asc': q = q.order('asking_price', { ascending: true }); break;
    case 'price_desc': q = q.order('asking_price', { ascending: false }); break;
    case 'size': q = q.order('size_sq_m', { ascending: false }); break;
    default: q = q.order('reference', { ascending: true });
  }
  return q;
}

export function listPlots(f: PlotFilters, page: number): Promise<Page<Plot>> {
  const [a, b] = rangeFor(page);
  return unwrapPage<Plot>(applyFilters(f).range(a, b));
}

export function listAllPlots(f: PlotFilters): Promise<Plot[]> {
  return fetchAll<Plot>(() => applyFilters(f));
}

export async function getPlot(id: string): Promise<Plot | null> {
  return unwrap<Plot | null>(supabase.from('v_plots').select('*').eq('id', id).maybeSingle());
}

/** Distinct counties and estates for filter dropdowns. */
export async function plotLocations(): Promise<{ counties: string[]; estates: string[] }> {
  const rows = await fetchAll<{ county: string; estate: string | null }>(() =>
    supabase.from('plots').select('county, estate').order('county'),
  );
  const counties = [...new Set(rows.map((r) => r.county))].sort();
  const estates = [...new Set(rows.map((r) => r.estate).filter(Boolean) as string[])].sort();
  return { counties, estates };
}

export interface PlotInput {
  reference: string;
  name: string;
  description: string | null;
  county: string;
  town: string | null;
  estate: string | null;
  location: string | null;
  size: number;
  size_unit: SizeUnit;
  asking_price: number;
  status: 'available' | 'unavailable';
  registered_on: string;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
}

export async function createPlot(input: PlotInput): Promise<string> {
  const row = await unwrap<{ id: string }>(supabase.from('plots').insert(input).select('id').single());
  return row.id;
}

export async function updatePlot(id: string, input: Partial<PlotInput>): Promise<void> {
  await unwrap(supabase.from('plots').update(input).eq('id', id).select('id').single());
}

export async function setPlotArchived(id: string, archived: boolean): Promise<void> {
  await unwrap(supabase.rpc('set_plot_archived', { p_plot_id: id, p_archived: archived }));
}

export async function reservePlot(plotId: string, buyerId: string, until: string | null): Promise<void> {
  await unwrap(supabase.rpc('reserve_plot', { p_plot_id: plotId, p_buyer_id: buyerId, p_until: until }));
}

export async function releaseReservation(plotId: string): Promise<void> {
  await unwrap(supabase.rpc('release_plot_reservation', { p_plot_id: plotId }));
}

export function plotHistory(id: string): Promise<PlotHistoryEntry[]> {
  return unwrap<PlotHistoryEntry[]>(supabase.rpc('plot_history', { p_plot_id: id }));
}

import { useState } from 'react';
import { Archive, ArchiveRestore, BookmarkPlus, BookmarkX, MapPin, Pencil, Receipt, ShoppingBag } from 'lucide-react';
import { useAuth } from '../../../auth/AuthProvider';
import { BuyerPicker } from '../../../components/BuyerPicker';
import { DocumentsPanel } from '../../../components/DocumentsPanel';
import { Timeline } from '../../../components/History';
import { getPlot, plotHistory, releaseReservation, reservePlot, setPlotArchived } from '../../../data/plots';
import type { Buyer } from '../../../data/types';
import { formatDate } from '../../../lib/dates';
import { formatMoney } from '../../../lib/money';
import { Link } from '../../../lib/router';
import { useQuery } from '../../../lib/useQuery';
import { Badge, Button, ButtonLink, Card, CardHeader, Field, Input, KeyValue } from '../../../ui/core';
import { PageHeader } from '../../../ui/data';
import { ConfirmDialog, Dialog, EmptyState, ErrorState, LoadingRows, PageLoader, useToast } from '../../../ui/feedback';
import { useBusinessToday } from '../../../ui/inputs';
import { PlotStatusBadge } from '../../../ui/status';
import { PlotFormDialog } from './PlotForm';
import { formatSize } from './PlotsPage';

export default function PlotDetailPage({ id }: { id: string }) {
  const { can, business } = useAuth();
  const toast = useToast();
  const today = useBusinessToday();
  const plot = useQuery(() => getPlot(id), [id]);
  const history = useQuery(() => plotHistory(id), [id]);
  const [editing, setEditing] = useState(false);
  const [reserving, setReserving] = useState(false);
  const [buyer, setBuyer] = useState<Pick<Buyer, 'id' | 'full_name' | 'phone'> | null>(null);
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'archive' | 'restore' | 'release' | null>(null);

  if (plot.error) return <Card><ErrorState error={plot.error} onRetry={plot.reload} /></Card>;
  if (!plot.data) return plot.loading ? <PageLoader /> : <EmptyState title="Plot not found" description="It may not exist or you may not have access." action={<ButtonLink to="/app/plots">Back to plots</ButtonLink>} />;
  const p = plot.data;
  const money = (v: number | null) => formatMoney(v, business.currency);
  const reload = () => { plot.reload(); history.reload(); };
  const archived = !!p.archived_at;

  const reserve = async () => {
    if (!buyer) return;
    setBusy(true);
    try {
      await reservePlot(p.id, buyer.id, until || null);
      toast.success(`Plot ${p.reference} reserved for ${buyer.full_name}.`);
      setReserving(false);
      reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader back={{ to: '/app/plots', label: 'Plots' }}
        title={<span className="flex flex-wrap items-center gap-2">Plot {p.reference} <PlotStatusBadge status={p.status} />{archived && <Badge>Archived</Badge>}</span>}
        description={p.name}
        actions={<>
          {!archived && can('sales.create') && (p.status === 'available' || p.status === 'reserved') && !p.active_sale_id && (
            <ButtonLink to={`/app/sales/new?plot=${p.id}${p.reserved_for_buyer_id ? `&buyer=${p.reserved_for_buyer_id}` : ''}`} variant="primary" icon={<ShoppingBag className="h-4 w-4" />}>Record sale</ButtonLink>
          )}
          {!archived && can('sales.create') && p.status === 'available' && <Button icon={<BookmarkPlus className="h-4 w-4" />} onClick={() => { setBuyer(null); setUntil(''); setReserving(true); }}>Reserve</Button>}
          {!archived && can('sales.create') && p.status === 'reserved' && !p.active_sale_id && <Button icon={<BookmarkX className="h-4 w-4" />} onClick={() => setConfirm('release')}>Release reservation</Button>}
          {!archived && can('plots.manage') && <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Edit</Button>}
          {can('plots.archive') && (archived
            ? <Button icon={<ArchiveRestore className="h-4 w-4" />} onClick={() => setConfirm('restore')}>Restore</Button>
            : (p.status === 'available' || p.status === 'unavailable') && <Button variant="ghost" icon={<Archive className="h-4 w-4" />} onClick={() => setConfirm('archive')}>Archive</Button>)}
        </>} />

      <div className="grid gap-4 lg:grid-cols-3 sm:gap-5">
        <div className="space-y-4 sm:space-y-5 lg:col-span-2">
          {p.active_sale_id && (
            <Link to={`/app/sales/${p.active_sale_id}`} className="flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-accent-strong hover:border-accent">
              <Receipt className="h-5 w-5 shrink-0" />
              <span className="flex-1">Active sale <strong>{p.active_sale_reference ?? ''}</strong>{p.sale_price != null && <> at <strong>{money(p.sale_price)}</strong></>}</span>
              <span className="font-semibold">View sale →</span>
            </Link>
          )}
          {p.status === 'reserved' && !p.active_sale_id && (
            <div className="rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
              Reserved for <strong>{p.reserved_for_name ?? 'a buyer'}</strong>{p.reserved_until ? ` until ${formatDate(p.reserved_until)}` : ''}.
              {p.reservation_expired && <strong> This reservation has expired. Release it to make the plot available.</strong>}
            </div>
          )}
          <Card>
            <CardHeader title="Plot details" />
            <div className="p-4 sm:p-5">
              <KeyValue items={[
                ['Reference', p.reference],
                ['Name / description', p.name],
                ['County', p.county],
                ['Town / area', p.town],
                ['Estate / project', p.estate],
                ['Location', p.location],
                ['Size', formatSize(p)],
                ['Asking price', money(p.asking_price)],
                ['Sale price', p.sale_price != null ? money(p.sale_price) : p.status === 'sold' ? 'Not visible to you' : '—'],
                ['Registered', formatDate(p.registered_on)],
                ['GPS', p.latitude != null ? (
                  <a className="inline-flex items-center gap-1 font-semibold text-accent hover:underline" target="_blank" rel="noopener noreferrer"
                    href={`https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=17/${p.latitude}/${p.longitude}`}>
                    <MapPin className="h-3.5 w-3.5" />{p.latitude}, {p.longitude}
                  </a>) : '—'],
              ]} />
              {p.description && <div className="mt-5 border-t border-line pt-4"><p className="text-xs font-medium uppercase tracking-wide text-muted">Description</p><p className="mt-1 whitespace-pre-line text-sm text-ink">{p.description}</p></div>}
              {p.notes && <div className="mt-4 rounded-xl bg-surface-2 p-3"><p className="text-xs font-semibold text-muted">Internal notes</p><p className="mt-1 whitespace-pre-line text-sm text-ink-2">{p.notes}</p></div>}
            </div>
          </Card>
          <DocumentsPanel link={{ plotId: p.id }} defaultCategory="plot_record" />
        </div>
        <Card>
          <CardHeader title="Plot history" description="Every change, from the audit trail" />
          <div className="p-4 sm:p-5">
            {history.error ? <ErrorState compact error={history.error} onRetry={history.reload} /> : !history.data ? <LoadingRows rows={3} /> :
              history.data.length === 0 ? <p className="text-sm text-muted">No history yet.</p> :
                <Timeline items={history.data.map((h) => ({ at: h.occurred_at, who: h.actor_name, action: h.action, fields: h.changed_fields, before: h.old_data, after: h.new_data }))} />}
          </div>
        </Card>
      </div>

      <PlotFormDialog open={editing} onClose={() => setEditing(false)} plot={p} onSaved={reload} />

      <Dialog open={reserving} onClose={() => !busy && setReserving(false)} title={`Reserve plot ${p.reference}`}
        description="The plot is held for this buyer and can't be sold to anyone else until the reservation is released."
        footer={<><Button onClick={() => setReserving(false)} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} disabled={!buyer} onClick={reserve}>Reserve plot</Button></>}>
        <div className="space-y-4">
          <Field label="Buyer" required>{(fid) => <BuyerPicker id={fid} value={buyer} onChange={setBuyer} />}</Field>
          <Field label="Reserved until" hint="Optional. GUMADO flags the reservation once this date passes; staff release it manually.">
            {(fid, d) => <Input id={fid} type="date" min={today} aria-describedby={d} value={until} onChange={(e) => setUntil(e.target.value)} />}
          </Field>
        </div>
      </Dialog>

      <ConfirmDialog open={confirm === 'archive'} onClose={() => setConfirm(null)} title="Archive this plot?" confirmLabel="Archive plot"
        message="Archived plots are hidden from the inventory and can't be sold. You can restore them later. Nothing is deleted."
        onConfirm={async () => { await setPlotArchived(p.id, true); toast.success('Plot archived.'); reload(); }} />
      <ConfirmDialog open={confirm === 'restore'} onClose={() => setConfirm(null)} title="Restore this plot?" confirmLabel="Restore"
        message="The plot returns to the active inventory with its previous status."
        onConfirm={async () => { await setPlotArchived(p.id, false); toast.success('Plot restored.'); reload(); }} />
      <ConfirmDialog open={confirm === 'release'} onClose={() => setConfirm(null)} title="Release reservation?" confirmLabel="Release"
        message={<>Plot {p.reference} will become available to other buyers{p.reserved_for_name ? <> (currently reserved for <strong>{p.reserved_for_name}</strong>)</> : ''}.</>}
        onConfirm={async () => { await releaseReservation(p.id); toast.success('Reservation released.'); reload(); }} />
    </>
  );
}

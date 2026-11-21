import { useState } from 'react';
import { Archive, ArchiveRestore, Lock, Mail, Pencil, Phone, ShoppingBag } from 'lucide-react';
import { useAuth } from '../../../auth/AuthProvider';
import { DocumentsPanel } from '../../../components/DocumentsPanel';
import { ExportButtons } from '../../../components/ExportButtons';
import { getBuyer, getIdentity, ID_TYPES, setBuyerArchived } from '../../../data/buyers';
import { listAllPayments } from '../../../data/payments';
import { listAllSales } from '../../../data/sales';
import { formatDate } from '../../../lib/dates';
import { formatMoney } from '../../../lib/money';
import { Link } from '../../../lib/router';
import { useQuery } from '../../../lib/useQuery';
import { Badge, Button, ButtonLink, Card, CardHeader, KeyValue } from '../../../ui/core';
import { PageHeader, StatCard } from '../../../ui/data';
import { ConfirmDialog, EmptyState, ErrorState, LoadingRows, PageLoader, useToast } from '../../../ui/feedback';
import { PaymentStatusBadge, SaleStatusBadge, paymentStatusLabel, salePaymentStatusLabel } from '../../../ui/status';
import { BuyerFormDialog } from './BuyerForm';

export default function BuyerDetailPage({ id }: { id: string }) {
  const { can, canAny, business } = useAuth();
  const toast = useToast();
  const buyer = useQuery(() => getBuyer(id), [id]);
  const identity = useQuery(() => getIdentity(id), [id], { enabled: can('buyers.view_sensitive') });
  const sales = useQuery(() => listAllSales({ buyerId: id }), [id], { enabled: canAny('sales.view_all', 'sales.view_own') });
  const payments = useQuery(() => listAllPayments({ buyerId: id }), [id], { enabled: can('payments.view') });
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<'archive' | 'restore' | null>(null);

  if (buyer.error) return <Card><ErrorState error={buyer.error} onRetry={buyer.reload} /></Card>;
  if (!buyer.data) return buyer.loading ? <PageLoader /> : <EmptyState title="Buyer not found" action={<ButtonLink to="/app/buyers">Back to buyers</ButtonLink>} />;
  const b = buyer.data;
  const money = (v: number) => formatMoney(v, business.currency);
  const archived = !!b.archived_at;
  const reload = () => { buyer.reload(); identity.reload(); };

  return (
    <>
      <PageHeader back={{ to: '/app/buyers', label: 'Buyers' }}
        title={<span className="flex flex-wrap items-center gap-2">{b.full_name}{archived && <Badge>Archived</Badge>}</span>}
        description={`Registered ${formatDate(b.registered_on)}`}
        actions={<>
          {!archived && can('sales.create') && <ButtonLink to={`/app/sales/new?buyer=${b.id}`} variant="primary" icon={<ShoppingBag className="h-4 w-4" />}>New sale</ButtonLink>}
          {!archived && can('buyers.manage') && <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Edit</Button>}
          {can('buyers.archive') && (archived
            ? <Button icon={<ArchiveRestore className="h-4 w-4" />} onClick={() => setConfirm('restore')}>Restore</Button>
            : <Button variant="ghost" icon={<Archive className="h-4 w-4" />} onClick={() => setConfirm('archive')}>Archive</Button>)}
        </>} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:mb-5 lg:grid-cols-4">
        <StatCard label="Active purchases" value={b.active_sales} />
        <StatCard label="Purchased" value={money(b.total_purchased)} />
        <StatCard label="Paid (confirmed)" value={money(b.total_paid)} tone="success" />
        <StatCard label="Outstanding" value={money(b.outstanding)} tone={b.outstanding > 0 ? 'danger' : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 sm:gap-5">
        <div className="space-y-4 sm:space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Purchases" description="Every plot this buyer has bought, including cancelled sales" actions={
              sales.data && sales.data.length > 0 && (
                <ExportButtons permission="buyers.export" print={false} title={`Purchase history — ${b.full_name}`} load={async () => sales.data!}
                  columns={[
                    { header: 'Sale', value: (s) => s.reference }, { header: 'Plot', value: (s) => s.plot_reference }, { header: 'Date', kind: 'date', value: (s) => s.sale_date },
                    { header: 'Price', kind: 'money', value: (s) => s.sale_price, total: true }, { header: 'Paid', kind: 'money', value: (s) => s.total_paid, total: true },
                    { header: 'Outstanding', kind: 'money', value: (s) => s.outstanding, total: true }, { header: 'Status', value: (s) => salePaymentStatusLabel(s.payment_status) },
                  ]} />
              )} />
            {sales.error ? <ErrorState compact error={sales.error} onRetry={sales.reload} /> : !sales.data ? <LoadingRows rows={2} /> :
              sales.data.length === 0 ? <EmptyState compact title="No purchases yet" /> : (
                <ul className="divide-y divide-line">
                  {sales.data.map((s) => (
                    <li key={s.id}>
                      <Link to={`/app/sales/${s.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2 sm:px-5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink">Plot {s.plot_reference} · {s.plot_name}</p>
                          <p className="truncate text-xs text-muted">{s.reference} · {formatDate(s.sale_date)} · {[s.estate, s.county].filter(Boolean).join(', ')}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-ink tabular">{money(s.sale_price)}</p>
                          <SaleStatusBadge status={s.payment_status} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
          </Card>
          {can('payments.view') && (
            <Card>
              <CardHeader title="Payment history" actions={payments.data && payments.data.length > 0 && (
                <ExportButtons permission="buyers.export" print={false} title={`Payment history — ${b.full_name}`} load={async () => payments.data!}
                  columns={[
                    { header: 'Receipt', value: (p) => p.receipt_number }, { header: 'Date', kind: 'date', value: (p) => p.paid_on }, { header: 'Sale', value: (p) => p.sale_reference },
                    { header: 'Method', value: (p) => p.method_name }, { header: 'Reference', value: (p) => p.transaction_reference },
                    { header: 'Amount', kind: 'money', value: (p) => p.amount }, { header: 'Status', value: (p) => paymentStatusLabel(p.status) },
                  ]} />
              )} />
              {payments.error ? <ErrorState compact error={payments.error} onRetry={payments.reload} /> : !payments.data ? <LoadingRows rows={2} /> :
                payments.data.length === 0 ? <EmptyState compact title="No payments recorded" /> : (
                  <ul className="divide-y divide-line">
                    {payments.data.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink">{p.receipt_number} · {p.method_name}</p>
                          <p className="truncate text-xs text-muted">{formatDate(p.paid_on)} · {p.sale_reference}{p.transaction_reference ? ` · ${p.transaction_reference}` : ''}</p>
                        </div>
                        <div className="text-right"><p className="text-sm font-semibold text-ink tabular">{money(p.amount)}</p><PaymentStatusBadge status={p.status} /></div>
                      </li>
                    ))}
                  </ul>
                )}
            </Card>
          )}
          <DocumentsPanel link={{ buyerId: b.id }} />
        </div>
        <div className="space-y-4 sm:space-y-5">
          <Card>
            <CardHeader title="Contact" />
            <div className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-col gap-2">
                <a href={`tel:${b.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline"><Phone className="h-4 w-4" />{b.phone}</a>
                {b.email && <a href={`mailto:${b.email}`} className="inline-flex items-center gap-2 break-all text-sm font-semibold text-accent hover:underline"><Mail className="h-4 w-4" />{b.email}</a>}
              </div>
              <KeyValue columns={1} items={[['Address', b.address], ['Notes', b.notes ? <span className="whitespace-pre-line">{b.notes}</span> : null]]} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Identification" />
            <div className="p-4 sm:p-5">
              {!can('buyers.view_sensitive') ? (
                <p className="flex items-center gap-2 text-sm text-muted"><Lock className="h-4 w-4" />Restricted to staff with permission to view sensitive buyer details.</p>
              ) : identity.data ? (
                <KeyValue columns={1} items={[['Type', ID_TYPES.find((t) => t.value === identity.data!.id_type)?.label ?? identity.data.id_type], ['Number', identity.data.id_number]]} />
              ) : identity.loading ? <LoadingRows rows={1} /> : <p className="text-sm text-muted">Not recorded.</p>}
            </div>
          </Card>
        </div>
      </div>

      <BuyerFormDialog open={editing} onClose={() => setEditing(false)} buyer={b} onSaved={reload} />
      <ConfirmDialog open={confirm === 'archive'} onClose={() => setConfirm(null)} title="Archive this buyer?" confirmLabel="Archive"
        message="Archived buyers are hidden from lists and can't be used for new sales. Their history is kept." onConfirm={async () => { await setBuyerArchived(b.id, true); toast.success('Buyer archived.'); reload(); }} />
      <ConfirmDialog open={confirm === 'restore'} onClose={() => setConfirm(null)} title="Restore this buyer?" confirmLabel="Restore"
        message="The buyer returns to the active list." onConfirm={async () => { await setBuyerArchived(b.id, false); toast.success('Buyer restored.'); reload(); }} />
    </>
  );
}

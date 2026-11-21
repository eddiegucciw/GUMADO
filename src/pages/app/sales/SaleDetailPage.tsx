import { useEffect, useState } from 'react';
import { Ban, FileDown, Pencil, Printer, Wallet } from 'lucide-react';
import { useAuth } from '../../../auth/AuthProvider';
import { DocumentsPanel } from '../../../components/DocumentsPanel';
import { listStaff } from '../../../data/admin';
import { listAllPayments } from '../../../data/payments';
import { cancelSale, getSale, updateSale } from '../../../data/sales';
import { formatDate, formatDateTime } from '../../../lib/dates';
import { formatMoney } from '../../../lib/money';
import { downloadSaleStatement } from '../../../lib/statements';
import { Link } from '../../../lib/router';
import { useQuery } from '../../../lib/useQuery';
import { Badge, Button, ButtonLink, Card, CardHeader, Field, Input, KeyValue, Select, Textarea } from '../../../ui/core';
import { PageHeader } from '../../../ui/data';
import { ConfirmDialog, Dialog, EmptyState, ErrorState, LoadingRows, PageLoader, useToast } from '../../../ui/feedback';
import { PaymentStatusBadge, SaleStatusBadge } from '../../../ui/status';
import { PaymentActions } from '../payments/PaymentActions';
import { RecordPaymentDialog } from '../payments/RecordPaymentDialog';

export default function SaleDetailPage({ id }: { id: string }) {
  const { can, business } = useAuth();
  const toast = useToast();
  const sale = useQuery(() => getSale(id), [id]);
  const payments = useQuery(() => listAllPayments({ saleId: id }), [id], { enabled: can('payments.view') });
  const staff = useQuery(listStaff, [], { enabled: can('sales.view_all') && can('sales.edit') });
  const [recording, setRecording] = useState(false);
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [edit, setEdit] = useState({ due: '', terms: '', notes: '', agent: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sale.data && editing) setEdit({ due: sale.data.balance_due_date ?? '', terms: sale.data.payment_terms ?? '', notes: sale.data.notes ?? '', agent: sale.data.agent_id });
  }, [editing, sale.data]);

  if (sale.error) return <Card><ErrorState error={sale.error} onRetry={sale.reload} /></Card>;
  if (!sale.data) return sale.loading ? <PageLoader /> : <EmptyState title="Sale not found" description="It may not exist or you may not have access." action={<ButtonLink to="/app/sales">Back to sales</ButtonLink>} />;
  const s = sale.data;
  const money = (v: number) => formatMoney(v, business.currency);
  const active = s.status === 'active';
  const reload = () => { sale.reload(); payments.reload(); };
  const ctx = { businessName: business.name, currency: business.currency, timezone: business.timezone };
  const paidPct = Math.min(100, Math.round((s.total_paid / s.sale_price) * 100));

  const saveEdit = async () => {
    if (edit.due && edit.due < s.sale_date) return toast.error('The balance due date must be on or after the sale date.');
    setSaving(true);
    try {
      await updateSale(s.id, { balanceDueDate: edit.due || null, paymentTerms: edit.terms.trim() || null, notes: edit.notes.trim() || null, agentId: edit.agent || s.agent_id });
      toast.success('Sale updated.');
      setEditing(false);
      reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader back={{ to: '/app/sales', label: 'Sales' }}
        title={<span className="flex flex-wrap items-center gap-2">{s.reference} <SaleStatusBadge status={s.payment_status} /></span>}
        description={<>Plot <Link to={`/app/plots/${s.plot_id}`} className="font-semibold text-accent hover:underline">{s.plot_reference}</Link> · {s.buyer_name ? <Link to={`/app/buyers/${s.buyer_id}`} className="font-semibold text-accent hover:underline">{s.buyer_name}</Link> : 'Buyer'} · {formatDate(s.sale_date)}</>}
        actions={<>
          {active && can('payments.record') && s.outstanding - s.pending_amount > 0 && <Button variant="primary" icon={<Wallet className="h-4 w-4" />} onClick={() => setRecording(true)}>Record payment</Button>}
          {can('payments.view') && <Button icon={<FileDown className="h-4 w-4" />} onClick={() => downloadSaleStatement(s, payments.data ?? [], ctx)} disabled={!payments.data}>Statement</Button>}
          <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print</Button>
          {active && can('sales.edit') && <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Edit terms</Button>}
          {active && can('sales.cancel') && <Button variant="ghost" icon={<Ban className="h-4 w-4" />} onClick={() => setCancelling(true)}>Cancel sale</Button>}
        </>} />

      <div className="print-only mb-4"><p className="text-lg font-bold">{business.name} · Statement {s.reference}</p><p className="text-sm">Printed {formatDateTime(new Date().toISOString(), business.timezone)}</p></div>

      {!active && (
        <div className="mb-4 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink-2">
          <strong>Cancelled</strong> on {formatDateTime(s.cancelled_at, business.timezone)}. Reason: {s.cancellation_reason}. Confirmed payments remain on record; any refund is handled outside GUMADO.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3 sm:gap-5">
        <div className="space-y-4 sm:space-y-5 lg:col-span-2">
          <Card>
            <div className="grid gap-4 p-4 sm:grid-cols-3 sm:p-5">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-muted">Sale price</p><p className="mt-1 text-xl font-bold text-ink tabular">{money(s.sale_price)}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-wide text-muted">Paid (confirmed)</p><p className="mt-1 text-xl font-bold text-success tabular">{money(s.total_paid)}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-wide text-muted">Outstanding</p><p className="mt-1 text-xl font-bold text-ink tabular">{money(s.outstanding)}</p></div>
              <div className="sm:col-span-3">
                <div className="h-2 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-accent" style={{ width: `${paidPct}%` }} /></div>
                <p className="mt-1.5 text-xs text-muted">{paidPct}% paid{s.pending_amount > 0 && <> · <span className="font-semibold text-warning">{money(s.pending_amount)} awaiting confirmation</span> (not counted yet)</>}</p>
              </div>
            </div>
          </Card>

          {can('payments.view') && (
            <Card>
              <CardHeader title="Payments" description="Only confirmed payments reduce the balance." />
              {payments.error ? <ErrorState compact error={payments.error} onRetry={payments.reload} /> : !payments.data ? <LoadingRows rows={2} /> :
                payments.data.length === 0 ? <EmptyState compact icon={<Wallet className="h-5 w-5" />} title="No payments recorded yet"
                  action={active && can('payments.record') && <Button size="sm" variant="primary" onClick={() => setRecording(true)}>Record payment</Button>} /> : (
                  <ul className="divide-y divide-line">
                    {payments.data.map((p) => (
                      <li key={p.id} className="px-4 py-3.5 sm:px-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink">{money(p.amount)} <span className="font-normal text-muted">via {p.method_name}</span></p>
                            <p className="mt-0.5 text-xs text-muted">{formatDate(p.paid_on)} · {p.receipt_number}{p.transaction_reference ? ` · ref ${p.transaction_reference}` : ''}</p>
                            <p className="mt-0.5 text-xs text-muted">Recorded by {p.recorded_by_name}{p.verified_by_name && p.status !== 'pending' ? ` · ${p.status === 'rejected' ? 'rejected' : 'confirmed'} by ${p.verified_by_name}` : ''}</p>
                            {p.status_reason && <p className="mt-1 text-xs text-ink-2">Reason: {p.status_reason}</p>}
                          </div>
                          <PaymentStatusBadge status={p.status} />
                        </div>
                        <div className="no-print mt-2.5"><PaymentActions payment={p} onChanged={reload} compact /></div>
                      </li>
                    ))}
                  </ul>
                )}
            </Card>
          )}
          <DocumentsPanel link={{ saleId: s.id, plotId: s.plot_id, buyerId: s.buyer_id }} defaultCategory="sale_agreement" title="Sale documents" />
        </div>
        <Card>
          <CardHeader title="Terms" />
          <div className="p-4 sm:p-5">
            <KeyValue columns={1} items={[
              ['Plot', <Link key="p" to={`/app/plots/${s.plot_id}`} className="font-semibold text-accent hover:underline">{s.plot_reference} · {s.plot_name}</Link>],
              ['Location', [s.estate, s.town, s.county].filter(Boolean).join(', ')],
              ['Buyer', s.buyer_name ? <span key="b">{s.buyer_name}<span className="block text-xs text-muted">{s.buyer_phone}</span></span> : null],
              ['Agent', s.agent_name],
              ['Agreed deposit', money(s.deposit_amount)],
              ['Balance due by', s.balance_due_date ? <span key="d" className={s.payment_status === 'overdue' ? 'font-semibold text-danger' : ''}>{formatDate(s.balance_due_date)}</span> : 'Not set'],
              ['Payment terms', s.payment_terms ? <span key="t" className="whitespace-pre-line">{s.payment_terms}</span> : null],
              ['Notes', s.notes ? <span key="n" className="whitespace-pre-line">{s.notes}</span> : null],
              ['Recorded', formatDateTime(s.created_at, business.timezone)],
            ]} />
            {s.status === 'active' && s.payment_status === 'completed' && <Badge tone="success" className="mt-4">Fully paid</Badge>}
          </div>
        </Card>
      </div>

      <RecordPaymentDialog open={recording} onClose={() => setRecording(false)} sale={s} onRecorded={reload} />

      <Dialog open={editing} onClose={() => !saving && setEditing(false)} title={`Edit terms · ${s.reference}`}
        description="The plot, buyer, price and sale date can't be changed. To correct those, cancel and re-record the sale."
        footer={<><Button onClick={() => setEditing(false)} disabled={saving}>Cancel</Button><Button variant="primary" loading={saving} onClick={saveEdit}>Save</Button></>}>
        <div className="space-y-4">
          <Field label="Balance due by">{(fid) => <Input id={fid} type="date" min={s.sale_date} value={edit.due} onChange={(e) => setEdit({ ...edit, due: e.target.value })} />}</Field>
          <Field label="Payment terms">{(fid) => <Textarea id={fid} maxLength={2000} value={edit.terms} onChange={(e) => setEdit({ ...edit, terms: e.target.value })} />}</Field>
          {can('sales.view_all') && (
            <Field label="Sales agent">{(fid) => (
              <Select id={fid} value={edit.agent} onChange={(e) => setEdit({ ...edit, agent: e.target.value })}>
                {staff.data?.filter((x) => x.is_active || x.id === s.agent_id).map((x) => <option key={x.id} value={x.id}>{x.full_name || x.email}</option>)}
              </Select>
            )}</Field>
          )}
          <Field label="Notes">{(fid) => <Textarea id={fid} maxLength={4000} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />}</Field>
        </div>
      </Dialog>

      <ConfirmDialog open={cancelling} onClose={() => setCancelling(false)} title={`Cancel sale ${s.reference}?`} confirmLabel="Cancel sale" tone="danger" requireReason reasonLabel="Reason for cancellation"
        message={<div className="space-y-2">
          <p>Plot <strong>{s.plot_reference}</strong> will become available again. The sale stays on record as cancelled.</p>
          {s.pending_amount > 0 && <p>{money(s.pending_amount)} awaiting confirmation will be marked rejected.</p>}
          {s.total_paid > 0 && <p className="font-semibold text-warning">{money(s.total_paid)} has been confirmed on this sale. Refunds are handled outside GUMADO.</p>}
        </div>}
        onConfirm={async (reason) => { await cancelSale(s.id, reason); toast.success('Sale cancelled. The plot is available again.'); reload(); }} />
    </>
  );
}

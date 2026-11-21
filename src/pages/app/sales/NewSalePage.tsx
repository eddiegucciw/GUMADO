import { useEffect, useMemo, useState } from 'react';
import { Check, LayoutGrid, Search } from 'lucide-react';
import { useAuth } from '../../../auth/AuthProvider';
import { BuyerPicker } from '../../../components/BuyerPicker';
import { listStaff } from '../../../data/admin';
import { getBuyer } from '../../../data/buyers';
import { newRequestId } from '../../../data/db';
import { listMethods } from '../../../data/payments';
import { getPlot, listPlots } from '../../../data/plots';
import { createSale } from '../../../data/sales';
import type { Buyer, Plot } from '../../../data/types';
import { formatMoney } from '../../../lib/money';
import { useRouter, useSearchParams } from '../../../lib/router';
import { useDebounced, useQuery } from '../../../lib/useQuery';
import { Button, Card, CardHeader, Checkbox, Field, Input, Select, Spinner, Textarea, cx } from '../../../ui/core';
import { PageHeader } from '../../../ui/data';
import { useToast } from '../../../ui/feedback';
import { MoneyInput, useBusinessToday } from '../../../ui/inputs';
import { PlotStatusBadge } from '../../../ui/status';
import { BuyerFormDialog } from '../buyers/BuyerForm';
import { formatSize } from '../plots/PlotsPage';

function PlotPicker({ value, onChange }: { value: Plot | null; onChange: (p: Plot | null) => void }) {
  const { business } = useAuth();
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const plots = useQuery(async () => {
    const [a, r] = await Promise.all([listPlots({ q: dq, status: 'available' }, 1), listPlots({ q: dq, status: 'reserved' }, 1)]);
    return [...a.rows, ...r.rows.filter((p) => !p.active_sale_id)].slice(0, 12);
  }, [dq], { enabled: !value });

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent-soft px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Check className="h-4 w-4 shrink-0 text-accent" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">Plot {value.reference} · {value.name}</p>
            <p className="truncate text-xs text-muted">{[value.estate, value.county].filter(Boolean).join(', ')} · {formatSize(value)} · asking {formatMoney(value.asking_price, business.currency)}</p>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Change</Button>
      </div>
    );
  }
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input placeholder="Search available plots by reference or location" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" aria-label="Search plots" />
      </div>
      <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-line">
        {plots.loading && !plots.data ? <div className="grid place-items-center py-6"><Spinner /></div> : plots.data?.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted">No available plots match.</p>
        ) : (
          <ul className="divide-y divide-line">
            {plots.data?.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onChange(p)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{p.reference} · {p.name}</span>
                    <span className="block truncate text-xs text-muted">{[p.estate, p.county].filter(Boolean).join(', ')} · {formatSize(p)}{p.status === 'reserved' && p.reserved_for_name ? ` · reserved for ${p.reserved_for_name}` : ''}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold text-ink tabular">{formatMoney(p.asking_price, business.currency)}</span>
                    <PlotStatusBadge status={p.status} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function NewSalePage() {
  const { access, can, business } = useAuth();
  const { navigate } = useRouter();
  const [sp] = useSearchParams();
  const toast = useToast();
  const today = useBusinessToday();
  const canAssign = can('sales.view_all');
  const canConfirm = can('payments.verify') && !business.requireSeparateVerifier;

  const [plot, setPlot] = useState<Plot | null>(null);
  const [buyer, setBuyer] = useState<Pick<Buyer, 'id' | 'full_name' | 'phone'> | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [deposit, setDeposit] = useState<number | null>(0);
  const [saleDate, setSaleDate] = useState(today);
  const [dueDate, setDueDate] = useState('');
  const [terms, setTerms] = useState('');
  const [notes, setNotes] = useState('');
  const [agentId, setAgentId] = useState(access?.id ?? '');
  const [withPayment, setWithPayment] = useState(false);
  const [payAmount, setPayAmount] = useState<number | null>(null);
  const [payMethod, setPayMethod] = useState('');
  const [payRef, setPayRef] = useState('');
  const [payConfirm, setPayConfirm] = useState(canConfirm);
  const [requestId] = useState(newRequestId);
  const [creatingBuyer, setCreatingBuyer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const staff = useQuery(listStaff, [], { enabled: canAssign });
  const methods = useQuery(() => listMethods(), []);
  const method = useMemo(() => methods.data?.find((m) => m.id === payMethod), [methods.data, payMethod]);

  // Pre-fill from ?plot= and ?buyer=
  useEffect(() => {
    const pid = sp.get('plot');
    if (pid) getPlot(pid).then((p) => p && (p.status === 'available' || p.status === 'reserved') && !p.active_sale_id && setPlot(p), () => {});
    const bid = sp.get('buyer');
    if (bid) getBuyer(bid).then((b) => b && !b.archived_at && setBuyer(b), () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (plot && price == null) setPrice(plot.asking_price); }, [plot, price]);
  useEffect(() => { if (!payMethod && methods.data?.length) setPayMethod(methods.data[0].id); }, [methods.data, payMethod]);
  useEffect(() => { if (withPayment && payAmount == null && deposit) setPayAmount(deposit); }, [withPayment, deposit, payAmount]);

  const reservedForOther = plot?.status === 'reserved' && buyer && plot.reserved_for_buyer_id !== buyer.id;
  const money = (v: number) => formatMoney(v, business.currency);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!plot) e.plot = 'Choose the plot being sold.';
    if (!buyer) e.buyer = 'Choose or register the buyer.';
    if (reservedForOther) e.buyer = `Plot ${plot!.reference} is reserved for ${plot!.reserved_for_name ?? 'another buyer'}.`;
    if (price == null || price <= 0) e.price = 'Enter the agreed sale price.';
    if (deposit == null || deposit < 0) e.deposit = 'Enter the deposit (0 if none).';
    else if (price != null && deposit > price) e.deposit = 'The deposit cannot exceed the sale price.';
    if (!saleDate || saleDate > today) e.saleDate = 'The sale date cannot be in the future.';
    if (dueDate && dueDate < saleDate) e.dueDate = 'The balance due date must be on or after the sale date.';
    if (withPayment) {
      if (payAmount == null || payAmount <= 0) e.payAmount = 'Enter the amount received.';
      else if (price != null && payAmount > price) e.payAmount = 'The payment cannot exceed the sale price.';
      if (method?.requires_reference && payRef.trim().length < 3) e.payRef = `Enter the ${method.name} reference.`;
    }
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error('Please check the highlighted fields.');
      return;
    }
    setBusy(true);
    try {
      const id = await createSale({
        plotId: plot!.id, buyerId: buyer!.id, salePrice: price!, saleDate, depositAmount: deposit ?? 0,
        balanceDueDate: dueDate || null, paymentTerms: terms.trim() || null, notes: notes.trim() || null,
        agentId: canAssign ? agentId || null : null,
        initialPayment: withPayment ? {
          amount: payAmount!, paid_on: saleDate, method_id: payMethod, transaction_reference: payRef.trim() || null,
          notes: 'Recorded with the sale', client_request_id: requestId, confirm: payConfirm && canConfirm,
        } : null,
      });
      toast.success(`Sale recorded. Plot ${plot!.reference} is no longer available to other buyers.`);
      navigate(`/app/sales/${id}`, { replace: true });
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const err = (k: string) => errors[k] ?? null;

  return (
    <>
      <PageHeader back={{ to: '/app/sales', label: 'Sales' }} title="Record a sale" description="The plot is locked to this buyer the moment the sale is saved." />
      <div className="grid gap-4 lg:grid-cols-3 sm:gap-5">
        <div className="space-y-4 sm:space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="1 · Plot" />
            <div className="p-4 sm:p-5">
              <Field label="Plot" required error={err('plot')}>{() => <PlotPicker value={plot} onChange={(p) => { setPlot(p); setPrice(p?.asking_price ?? null); }} />}</Field>
            </div>
          </Card>
          <Card>
            <CardHeader title="2 · Buyer" />
            <div className="p-4 sm:p-5">
              <Field label="Buyer" required error={err('buyer')}>
                {(id, _d, inv) => <BuyerPicker id={id} invalid={inv} value={buyer} onChange={setBuyer} onCreateNew={can('buyers.manage') ? () => setCreatingBuyer(true) : undefined} />}
              </Field>
            </div>
          </Card>
          <Card>
            <CardHeader title="3 · Terms" />
            <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
              <Field label="Agreed sale price" required error={err('price')}
                hint={plot && price != null && price !== plot.asking_price ? `Asking price was ${money(plot.asking_price)}.` : undefined}>
                {(id, d, inv) => <MoneyInput id={id} describedBy={d} invalid={inv} value={price} onChange={setPrice} />}
              </Field>
              <Field label="Deposit (agreed)" error={err('deposit')} hint="The deposit agreed in the terms. Money counts only when recorded as a payment.">
                {(id, d, inv) => <MoneyInput id={id} describedBy={d} invalid={inv} value={deposit} onChange={setDeposit} />}
              </Field>
              <Field label="Sale date" required error={err('saleDate')}>
                {(id, d, inv) => <Input id={id} type="date" max={today} aria-describedby={d} aria-invalid={inv} value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />}
              </Field>
              <Field label="Balance due by" error={err('dueDate')} hint="Used for overdue status and reminders.">
                {(id, d, inv) => <Input id={id} type="date" min={saleDate} aria-describedby={d} aria-invalid={inv} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}
              </Field>
              <Field label="Payment terms" className="sm:col-span-2" hint="e.g. “30% deposit, balance in 6 monthly instalments”.">
                {(id, d) => <Textarea id={id} aria-describedby={d} maxLength={2000} value={terms} onChange={(e) => setTerms(e.target.value)} />}
              </Field>
              {canAssign && (
                <Field label="Sales agent" required>
                  {(id) => (
                    <Select id={id} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                      {staff.data?.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}{s.id === access?.id ? ' (you)' : ''}</option>)}
                    </Select>
                  )}
                </Field>
              )}
              <Field label="Notes" className={cx(!canAssign && 'sm:col-span-2')}>{(id) => <Textarea id={id} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
            </div>
          </Card>
          {can('payments.record') && (
            <Card>
              <CardHeader title="4 · Payment received today (optional)" />
              <div className="space-y-4 p-4 sm:p-5">
                <Checkbox checked={withPayment} onChange={setWithPayment} label="Record a payment with this sale" description="For example, the deposit paid at signing." />
                {withPayment && (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Amount" required error={err('payAmount')}>{(id, d, inv) => <MoneyInput id={id} describedBy={d} invalid={inv} value={payAmount} onChange={setPayAmount} />}</Field>
                    <Field label="Method" required>
                      {(id) => <Select id={id} value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>{methods.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>}
                    </Field>
                    <Field label="Reference" required={method?.requires_reference} error={err('payRef')}>
                      {(id, d, inv) => <Input id={id} aria-describedby={d} aria-invalid={inv} maxLength={60} value={payRef} onChange={(e) => setPayRef(e.target.value)} />}
                    </Field>
                    {canConfirm && <div className="sm:col-span-3"><Checkbox checked={payConfirm} onChange={setPayConfirm} label="I have verified this money was received — confirm now" /></div>}
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader title="Summary" />
            <div className="space-y-3 p-4 text-sm sm:p-5">
              <div className="flex items-start gap-2"><LayoutGrid className="mt-0.5 h-4 w-4 text-muted" /><span>{plot ? <>Plot <strong>{plot.reference}</strong></> : <span className="text-muted">No plot chosen</span>}</span></div>
              <div className="flex justify-between"><span className="text-muted">Buyer</span><span className="font-semibold text-ink">{buyer?.full_name ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted">Sale price</span><span className="font-semibold text-ink tabular">{price != null ? money(price) : '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted">Deposit</span><span className="text-ink tabular">{deposit != null ? money(deposit) : '—'}</span></div>
              {withPayment && <div className="flex justify-between"><span className="text-muted">Paid today</span><span className="text-ink tabular">{payAmount != null ? money(payAmount) : '—'}{!(payConfirm && canConfirm) && ' (pending)'}</span></div>}
              <div className="flex justify-between border-t border-line pt-3"><span className="font-semibold text-ink">Outstanding after</span>
                <span className="font-bold text-ink tabular">{price != null ? money(price - (withPayment && payConfirm && canConfirm ? payAmount ?? 0 : 0)) : '—'}</span></div>
              {reservedForOther && <p className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">This plot is reserved for another buyer.</p>}
              <Button variant="primary" size="lg" className="mt-2 w-full" loading={busy} onClick={submit}>Record sale</Button>
              <p className="text-xs text-muted">If someone else sells this plot at the same moment, GUMADO will stop the second sale automatically.</p>
            </div>
          </Card>
        </div>
      </div>
      <BuyerFormDialog open={creatingBuyer} onClose={() => setCreatingBuyer(false)} onSaved={(b) => setBuyer(b)} />
    </>
  );
}

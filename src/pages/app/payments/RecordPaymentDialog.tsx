import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../auth/AuthProvider';
import { listMethods, recordPayment } from '../../../data/payments';
import type { Sale } from '../../../data/types';
import { newRequestId } from '../../../data/db';
import { toAppError } from '../../../lib/errors';
import { formatMoney } from '../../../lib/money';
import { useQuery } from '../../../lib/useQuery';
import { Button, Checkbox, Field, Input, Select, Textarea } from '../../../ui/core';
import { Dialog, useToast } from '../../../ui/feedback';
import { MoneyInput, useBusinessToday } from '../../../ui/inputs';

export function RecordPaymentDialog({ open, onClose, sale, onRecorded }: { open: boolean; onClose: () => void; sale: Sale | null; onRecorded: () => void }) {
  const { can, business } = useAuth();
  const toast = useToast();
  const today = useBusinessToday();
  const methods = useQuery(() => listMethods(), [], { enabled: open });
  const [amount, setAmount] = useState<number | null>(null);
  const [paidOn, setPaidOn] = useState(today);
  const [methodId, setMethodId] = useState('');
  const [ref, setRef] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmNow, setConfirmNow] = useState(false);
  const [requestId, setRequestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState(false);

  const available = sale ? sale.outstanding - sale.pending_amount : 0;
  const method = useMemo(() => methods.data?.find((m) => m.id === methodId), [methods.data, methodId]);
  const canConfirm = can('payments.verify') && !business.requireSeparateVerifier;

  useEffect(() => {
    if (!open) return;
    setAmount(null);
    setPaidOn(today);
    setRef('');
    setNotes('');
    setError(null);
    setDuplicateWarning(false);
    setConfirmNow(canConfirm);
    setRequestId(newRequestId()); // one id per payment attempt → retries are idempotent
  }, [open, today, canConfirm]);

  useEffect(() => {
    if (!methodId && methods.data?.length) setMethodId(methods.data[0].id);
  }, [methods.data, methodId]);

  if (!sale) return null;
  const money = (v: number) => formatMoney(v, business.currency);

  const submit = async (allowDuplicate = false) => {
    setError(null);
    if (amount == null || amount <= 0) return setError('Enter the amount received.');
    if (amount > available) return setError(`The amount can't exceed ${money(available)} (outstanding balance minus payments awaiting confirmation).`);
    if (!paidOn || paidOn > today) return setError('The payment date cannot be in the future.');
    if (!method) return setError('Choose a payment method.');
    if (method.requires_reference && ref.trim().length < 3) return setError(`Enter the ${method.name} transaction reference.`);
    setBusy(true);
    try {
      await recordPayment({
        saleId: sale.id, amount, paidOn, methodId, transactionReference: ref.trim() || null, notes: notes.trim() || null,
        clientRequestId: requestId, confirm: confirmNow && canConfirm, allowPossibleDuplicate: allowDuplicate,
      });
      toast.success(confirmNow && canConfirm ? 'Payment recorded and confirmed.' : 'Payment recorded. It will count once confirmed.');
      onRecorded();
      onClose();
    } catch (e) {
      const err = toAppError(e);
      if (err.code === 'POSSIBLE_DUPLICATE') setDuplicateWarning(true);
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? () => {} : onClose} title="Record payment" description={`${sale.reference} · Plot ${sale.plot_reference}${sale.buyer_name ? ` · ${sale.buyer_name}` : ''}`}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => submit(false)}>Record payment</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); void submit(false); }} className="space-y-4" noValidate>
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-surface-2 p-3 text-center text-xs">
          <div><p className="text-muted">Sale price</p><p className="mt-0.5 font-semibold text-ink tabular">{money(sale.sale_price)}</p></div>
          <div><p className="text-muted">Confirmed</p><p className="mt-0.5 font-semibold text-success tabular">{money(sale.total_paid)}</p></div>
          <div><p className="text-muted">Can still receive</p><p className="mt-0.5 font-semibold text-ink tabular">{money(available)}</p></div>
        </div>
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger">{error}</p>}
        {duplicateWarning && (
          <div role="alert" className="rounded-xl border border-warning/40 bg-warning-soft p-3.5 text-sm text-warning">
            <p className="font-semibold">This looks like a duplicate.</p>
            <p className="mt-1">An identical payment (same amount, date and method) was recorded on this sale in the last 15 minutes.</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => setDuplicateWarning(false)}>Go back</Button>
              <Button size="sm" variant="primary" loading={busy} onClick={() => submit(true)}>It's a separate payment, record it</Button>
            </div>
          </div>
        )}
        <Field label="Amount received" required>{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Payment date" required>{(id) => <Input id={id} type="date" max={today} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />}</Field>
          <Field label="Method" required>
            {(id) => (
              <Select id={id} value={methodId} onChange={(e) => setMethodId(e.target.value)}>
                {methods.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Transaction reference" required={method?.requires_reference}
          hint={method?.name === 'M-Pesa' ? 'The M-Pesa confirmation code, e.g. QK7XXXXXXX. Each code can only be recorded once.' : 'Bank slip, cheque number or receipt number.'}>
          {(id, d) => <Input id={id} aria-describedby={d} maxLength={60} autoCapitalize="characters" value={ref} onChange={(e) => setRef(e.target.value)} />}
        </Field>
        <Field label="Notes">{(id) => <Textarea id={id} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
        {canConfirm ? (
          <Checkbox checked={confirmNow} onChange={setConfirmNow} label="I have verified this money was received — confirm now"
            description="Unconfirmed payments are recorded but don't reduce the balance until someone confirms them." />
        ) : (
          <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-muted">This payment will be marked <strong>awaiting confirmation</strong>. It reduces the balance only after {business.requireSeparateVerifier ? 'another' : 'a'} staff member with confirmation rights confirms it.</p>
        )}
        <p className="text-xs text-muted">Payments are recorded manually. GUMADO is not connected to M-Pesa or bank systems.</p>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

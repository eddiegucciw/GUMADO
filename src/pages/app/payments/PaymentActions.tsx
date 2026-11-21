import { useState } from 'react';
import { Check, FileDown, Undo2, X } from 'lucide-react';
import { useAuth } from '../../../auth/AuthProvider';
import { rejectPayment, reversePayment, verifyPayment } from '../../../data/payments';
import { getSale } from '../../../data/sales';
import type { Payment } from '../../../data/types';
import { formatMoney } from '../../../lib/money';
import { downloadPaymentReceipt } from '../../../lib/statements';
import { Button } from '../../../ui/core';
import { ConfirmDialog, useToast } from '../../../ui/feedback';

/** Confirm / reject / reverse / receipt actions for a payment, each permission-gated. */
export function PaymentActions({ payment, onChanged, compact }: { payment: Payment; onChanged: () => void; compact?: boolean }) {
  const { can, access, business } = useAuth();
  const toast = useToast();
  const [dialog, setDialog] = useState<'confirm' | 'reject' | 'reverse' | null>(null);
  const [busy, setBusy] = useState(false);
  const amount = formatMoney(payment.amount, business.currency);
  const ownRecord = payment.recorded_by === access?.id;
  const canVerify = can('payments.verify') && payment.status === 'pending' && payment.sale_status === 'active' && !(business.requireSeparateVerifier && ownRecord);
  const size = compact ? 'sm' : 'md';

  const receipt = async () => {
    setBusy(true);
    try {
      const sale = await getSale(payment.sale_id);
      downloadPaymentReceipt(payment, sale, { businessName: business.name, currency: business.currency, timezone: business.timezone });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {canVerify && <Button size={size} variant="primary" icon={<Check className="h-4 w-4" />} onClick={() => setDialog('confirm')}>Confirm</Button>}
      {can('payments.verify') && payment.status === 'pending' && <Button size={size} icon={<X className="h-4 w-4" />} onClick={() => setDialog('reject')}>Reject</Button>}
      {can('payments.reverse') && payment.status === 'confirmed' && <Button size={size} variant="ghost" icon={<Undo2 className="h-4 w-4" />} onClick={() => setDialog('reverse')}>Reverse</Button>}
      {payment.status === 'confirmed' && <Button size={size} variant="ghost" loading={busy} icon={<FileDown className="h-4 w-4" />} onClick={receipt}>Receipt</Button>}

      <ConfirmDialog open={dialog === 'confirm'} onClose={() => setDialog(null)} title="Confirm this payment?" confirmLabel="Confirm payment"
        message={<>Confirm that <strong>{amount}</strong>{payment.transaction_reference ? <> (ref. <strong>{payment.transaction_reference}</strong>)</> : ''} via {payment.method_name} was actually received. It will reduce the buyer's balance.</>}
        onConfirm={async () => { await verifyPayment(payment.id); toast.success('Payment confirmed.'); onChanged(); }} />
      <ConfirmDialog open={dialog === 'reject'} onClose={() => setDialog(null)} title="Reject this payment?" confirmLabel="Reject payment" tone="danger" requireReason
        message={<>Reject the recorded payment of <strong>{amount}</strong>. Use this when the money was not received or the record is wrong. The record is kept.</>}
        onConfirm={async (reason) => { await rejectPayment(payment.id, reason); toast.success('Payment rejected.'); onChanged(); }} />
      <ConfirmDialog open={dialog === 'reverse'} onClose={() => setDialog(null)} title="Reverse this confirmed payment?" confirmLabel="Reverse payment" tone="danger" requireReason
        message={<>Reversing removes <strong>{amount}</strong> from the amount paid (for example a bounced cheque or a refund). The original record stays in the ledger and audit trail.</>}
        onConfirm={async (reason) => { await reversePayment(payment.id, reason); toast.success('Payment reversed.'); onChanged(); }} />
    </div>
  );
}

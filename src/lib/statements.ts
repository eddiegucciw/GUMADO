import type { Payment, Sale } from '../data/types';
import { formatDate, formatDateTime } from './dates';
import { PDF_MIME, safeFileName, saveBytes } from './download';
import { formatMoney, type CurrencyConfig } from './money';
import { buildPdf } from './pdf';

interface Ctx { businessName: string; currency: CurrencyConfig; timezone: string }

const statusText: Record<string, string> = {
  pending: 'Awaiting confirmation', confirmed: 'Confirmed', rejected: 'Rejected', reversed: 'Reversed',
  partially_paid: 'Partially paid', completed: 'Completed', overdue: 'Overdue', cancelled: 'Cancelled',
};

/** Transaction statement for one sale: terms, every payment, and the balance. */
export function downloadSaleStatement(sale: Sale, payments: Payment[], ctx: Ctx) {
  const m = (v: number) => formatMoney(v, ctx.currency, { fixed: true });
  const bytes = buildPdf({
    title: `Statement of account · ${sale.reference}`,
    subtitle: `As at ${formatDateTime(new Date().toISOString(), ctx.timezone)}`,
    businessName: ctx.businessName,
    meta: [
      ['Buyer', sale.buyer_name ?? '—'],
      ['Plot', `${sale.plot_reference} · ${sale.plot_name}`],
      ['Location', [sale.estate, sale.town, sale.county].filter(Boolean).join(', ')],
      ['Sale date', formatDate(sale.sale_date)],
      ['Sale price', m(sale.sale_price)],
      ['Agreed deposit', m(sale.deposit_amount)],
      ['Balance due by', sale.balance_due_date ? formatDate(sale.balance_due_date) : 'Not set'],
      ['Payment terms', sale.payment_terms ?? '—'],
      ['Status', sale.status === 'cancelled' ? `Cancelled — ${sale.cancellation_reason ?? ''}` : statusText[sale.payment_status]],
    ],
    tables: [
      {
        heading: 'Payments',
        columns: [{ header: 'Date' }, { header: 'Receipt' }, { header: 'Method' }, { header: 'Reference' }, { header: 'Status' }, { header: 'Amount', align: 'right' }],
        rows: payments.map((p) => [formatDate(p.paid_on), p.receipt_number, p.method_name, p.transaction_reference ?? '', statusText[p.status], m(p.amount)]),
      },
      {
        heading: 'Balance',
        columns: [{ header: 'Item' }, { header: 'Amount', align: 'right' }],
        rows: [
          ['Sale price', m(sale.sale_price)],
          ['Confirmed payments', m(sale.total_paid)],
          ['Payments awaiting confirmation (not counted)', m(sale.pending_amount)],
        ],
        totals: ['Outstanding balance', m(sale.outstanding)],
      },
    ],
    notes: [
      'Only confirmed payments reduce the outstanding balance. Rejected and reversed payments are listed for completeness and are not counted.',
      'This statement is generated from GUMADO records. It is not a legal title document.',
    ],
    generatedAt: formatDateTime(new Date().toISOString(), ctx.timezone),
  });
  saveBytes(bytes, `${safeFileName(`Statement-${sale.reference}`)}.pdf`, PDF_MIME);
}

/** Receipt for one confirmed payment. */
export function downloadPaymentReceipt(p: Payment, sale: Sale | null, ctx: Ctx) {
  const m = (v: number) => formatMoney(v, ctx.currency, { fixed: true });
  const bytes = buildPdf({
    title: `Payment receipt · ${p.receipt_number}`,
    businessName: ctx.businessName,
    subtitle: p.status === 'confirmed' ? 'Confirmed payment' : `Status: ${statusText[p.status]} (not a confirmed receipt)`,
    meta: [
      ['Received from', p.buyer_name ?? '—'],
      ['Amount', m(p.amount)],
      ['Payment date', formatDate(p.paid_on)],
      ['Method', p.method_name],
      ['Transaction reference', p.transaction_reference ?? '—'],
      ['For sale', `${p.sale_reference} · Plot ${p.plot_reference}`],
      ...(sale ? [['Balance after confirmed payments', m(sale.outstanding)] as [string, string]] : []),
      ['Recorded by', `${p.recorded_by_name} · ${formatDateTime(p.recorded_at, ctx.timezone)}`],
      ['Confirmed by', p.verified_by_name && p.status === 'confirmed' ? `${p.verified_by_name} · ${formatDateTime(p.verified_at, ctx.timezone)}` : '—'],
    ],
    notes: ['Generated from GUMADO records.'],
    generatedAt: formatDateTime(new Date().toISOString(), ctx.timezone),
  });
  saveBytes(bytes, `${safeFileName(`Receipt-${p.receipt_number}`)}.pdf`, PDF_MIME);
}

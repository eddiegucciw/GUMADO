import { fetchAll, rangeFor, searchTerm, supabase, unwrap, unwrapPage } from './db';
import type { Page, Payment, PaymentMethod, PaymentStatus } from './types';

export const PAYMENT_STATUSES: { value: PaymentStatus; label: string }[] = [
  { value: 'pending', label: 'Awaiting confirmation' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'reversed', label: 'Reversed' },
];

export interface PaymentFilters {
  q?: string;
  status?: PaymentStatus | '';
  from?: string;
  to?: string;
  methodId?: string;
  saleId?: string;
  buyerId?: string;
}

function query(f: PaymentFilters) {
  let q = supabase.from('v_payments').select('*', { count: 'exact' });
  const term = searchTerm(f.q);
  if (term) q = q.or(`receipt_number.ilike.*${term}*,transaction_reference.ilike.*${term}*,sale_reference.ilike.*${term}*,buyer_name.ilike.*${term}*,plot_reference.ilike.*${term}*`);
  if (f.status) q = q.eq('status', f.status);
  if (f.from) q = q.gte('paid_on', f.from);
  if (f.to) q = q.lte('paid_on', f.to);
  if (f.methodId) q = q.eq('method_id', f.methodId);
  if (f.saleId) q = q.eq('sale_id', f.saleId);
  if (f.buyerId) q = q.eq('buyer_id', f.buyerId);
  return q.order('paid_on', { ascending: false }).order('recorded_at', { ascending: false });
}

export function listPayments(f: PaymentFilters, page: number): Promise<Page<Payment>> {
  const [a, b] = rangeFor(page);
  return unwrapPage<Payment>(query(f).range(a, b));
}

export function listAllPayments(f: PaymentFilters): Promise<Payment[]> {
  return fetchAll<Payment>(() => query(f));
}

export function getPayment(id: string): Promise<Payment | null> {
  return unwrap<Payment | null>(supabase.from('v_payments').select('*').eq('id', id).maybeSingle());
}

export function listMethods(includeInactive = false): Promise<PaymentMethod[]> {
  let q = supabase.from('payment_methods').select('*');
  if (!includeInactive) q = q.eq('is_active', true);
  return unwrap<PaymentMethod[]>(q.order('sort_order').order('name'));
}

export interface RecordPaymentInput {
  saleId: string;
  amount: number;
  paidOn: string;
  methodId: string;
  transactionReference: string | null;
  notes: string | null;
  clientRequestId: string;
  confirm: boolean;
  allowPossibleDuplicate?: boolean;
}

export function recordPayment(i: RecordPaymentInput): Promise<string> {
  return unwrap<string>(
    supabase.rpc('record_payment', {
      p_sale_id: i.saleId,
      p_amount: i.amount,
      p_paid_on: i.paidOn,
      p_method_id: i.methodId,
      p_transaction_reference: i.transactionReference,
      p_notes: i.notes,
      p_client_request_id: i.clientRequestId,
      p_confirm: i.confirm,
      p_allow_possible_duplicate: i.allowPossibleDuplicate ?? false,
    }),
  );
}

export async function verifyPayment(id: string): Promise<void> {
  await unwrap(supabase.rpc('verify_payment', { p_payment_id: id }));
}

export async function rejectPayment(id: string, reason: string): Promise<void> {
  await unwrap(supabase.rpc('reject_payment', { p_payment_id: id, p_reason: reason }));
}

export async function reversePayment(id: string, reason: string): Promise<void> {
  await unwrap(supabase.rpc('reverse_payment', { p_payment_id: id, p_reason: reason }));
}

export async function saveMethod(m: Partial<PaymentMethod> & { name: string }): Promise<void> {
  const values = { name: m.name.trim(), requires_reference: m.requires_reference ?? false, is_active: m.is_active ?? true, sort_order: m.sort_order ?? 100 };
  if (m.id) await unwrap(supabase.from('payment_methods').update(values).eq('id', m.id).select('id').single());
  else await unwrap(supabase.from('payment_methods').insert(values).select('id').single());
}

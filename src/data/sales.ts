import { fetchAll, rangeFor, searchTerm, supabase, unwrap, unwrapPage } from './db';
import type { Page, Sale, SalePaymentStatus, SaleStatus } from './types';

export const SALE_PAYMENT_STATUSES: { value: SalePaymentStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'partially_paid', label: 'Partially paid' },
  { value: 'completed', label: 'Completed' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
];

export interface SaleFilters {
  q?: string;
  status?: SaleStatus | '';
  paymentStatus?: SalePaymentStatus | '';
  from?: string;
  to?: string;
  agentId?: string;
  buyerId?: string;
  county?: string;
  withBalance?: boolean;
}

function query(f: SaleFilters) {
  let q = supabase.from('v_sales').select('*', { count: 'exact' });
  const term = searchTerm(f.q);
  if (term) q = q.or(`reference.ilike.*${term}*,plot_reference.ilike.*${term}*,buyer_name.ilike.*${term}*,estate.ilike.*${term}*`);
  if (f.status) q = q.eq('status', f.status);
  if (f.paymentStatus) q = q.eq('payment_status', f.paymentStatus);
  if (f.from) q = q.gte('sale_date', f.from);
  if (f.to) q = q.lte('sale_date', f.to);
  if (f.agentId) q = q.eq('agent_id', f.agentId);
  if (f.buyerId) q = q.eq('buyer_id', f.buyerId);
  if (f.county) q = q.eq('county', f.county);
  if (f.withBalance) q = q.gt('outstanding', 0);
  return q.order('sale_date', { ascending: false }).order('created_at', { ascending: false });
}

export function listSales(f: SaleFilters, page: number): Promise<Page<Sale>> {
  const [a, b] = rangeFor(page);
  return unwrapPage<Sale>(query(f).range(a, b));
}

export function listAllSales(f: SaleFilters): Promise<Sale[]> {
  return fetchAll<Sale>(() => query(f));
}

export function getSale(id: string): Promise<Sale | null> {
  return unwrap<Sale | null>(supabase.from('v_sales').select('*').eq('id', id).maybeSingle());
}

export interface InitialPayment {
  amount: number;
  paid_on: string;
  method_id: string;
  transaction_reference: string | null;
  notes: string | null;
  client_request_id: string;
  confirm: boolean;
}

export interface CreateSaleInput {
  plotId: string;
  buyerId: string;
  salePrice: number;
  saleDate: string;
  depositAmount: number;
  balanceDueDate: string | null;
  paymentTerms: string | null;
  notes: string | null;
  agentId: string | null;
  initialPayment: InitialPayment | null;
}

export async function createSale(i: CreateSaleInput): Promise<string> {
  return unwrap<string>(
    supabase.rpc('create_sale', {
      p_plot_id: i.plotId,
      p_buyer_id: i.buyerId,
      p_sale_price: i.salePrice,
      p_sale_date: i.saleDate,
      p_deposit_amount: i.depositAmount,
      p_balance_due_date: i.balanceDueDate,
      p_payment_terms: i.paymentTerms,
      p_notes: i.notes,
      p_agent_id: i.agentId,
      p_initial_payment: i.initialPayment,
    }),
  );
}

export async function updateSale(id: string, v: { balanceDueDate: string | null; paymentTerms: string | null; notes: string | null; agentId: string }) {
  await unwrap(
    supabase.rpc('update_sale', {
      p_sale_id: id, p_balance_due_date: v.balanceDueDate, p_payment_terms: v.paymentTerms, p_notes: v.notes, p_agent_id: v.agentId,
    }),
  );
}

export async function cancelSale(id: string, reason: string): Promise<void> {
  await unwrap(supabase.rpc('cancel_sale', { p_sale_id: id, p_reason: reason }));
}

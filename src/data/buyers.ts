import { fetchAll, rangeFor, searchTerm, supabase, unwrap, unwrapPage } from './db';
import type { Buyer, BuyerIdentity, Page } from './types';

export const ID_TYPES: { value: BuyerIdentity['id_type']; label: string }[] = [
  { value: 'national_id', label: 'National ID' },
  { value: 'passport', label: 'Passport' },
  { value: 'alien_id', label: 'Alien ID' },
  { value: 'company_registration', label: 'Company registration' },
  { value: 'other', label: 'Other' },
];

export interface BuyerFilters {
  q?: string;
  withBalance?: boolean;
  archived?: boolean;
}

function query(f: BuyerFilters) {
  let q = supabase.from('v_buyers').select('*', { count: 'exact' });
  q = f.archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
  const term = searchTerm(f.q);
  if (term) q = q.or(`full_name.ilike.*${term}*,phone.ilike.*${term}*,email.ilike.*${term}*`);
  if (f.withBalance) q = q.gt('outstanding', 0);
  return q.order('full_name');
}

export function listBuyers(f: BuyerFilters, page: number): Promise<Page<Buyer>> {
  const [a, b] = rangeFor(page);
  return unwrapPage<Buyer>(query(f).range(a, b));
}

export function listAllBuyers(f: BuyerFilters): Promise<Buyer[]> {
  return fetchAll<Buyer>(() => query(f));
}

/** Quick picker search (sale form, reservations). */
export async function searchBuyers(q: string): Promise<Buyer[]> {
  return (await listBuyers({ q }, 1)).rows.slice(0, 10);
}

export function getBuyer(id: string): Promise<Buyer | null> {
  return unwrap<Buyer | null>(supabase.from('v_buyers').select('*').eq('id', id).maybeSingle());
}

export interface BuyerInput {
  full_name: string;
  phone: string;
  email: string | null;
  address: string | null;
  registered_on: string;
  notes: string | null;
}

export async function createBuyer(input: BuyerInput, identity?: Omit<BuyerIdentity, 'buyer_id'> | null): Promise<string> {
  const row = await unwrap<{ id: string }>(supabase.from('buyers').insert(input).select('id').single());
  if (identity) await upsertIdentity({ ...identity, buyer_id: row.id });
  return row.id;
}

export async function updateBuyer(id: string, input: Partial<BuyerInput>): Promise<void> {
  await unwrap(supabase.from('buyers').update(input).eq('id', id).select('id').single());
}

export async function setBuyerArchived(id: string, archived: boolean): Promise<void> {
  await unwrap(supabase.rpc('set_buyer_archived', { p_buyer_id: id, p_archived: archived }));
}

/** Returns null if none recorded OR the user lacks buyers.view_sensitive (RLS hides it). */
export function getIdentity(buyerId: string): Promise<BuyerIdentity | null> {
  return unwrap<BuyerIdentity | null>(supabase.from('buyer_identities').select('buyer_id, id_type, id_number').eq('buyer_id', buyerId).maybeSingle());
}

export async function upsertIdentity(identity: BuyerIdentity): Promise<void> {
  const existing = await getIdentity(identity.buyer_id);
  if (existing) {
    await unwrap(supabase.from('buyer_identities').update({ id_type: identity.id_type, id_number: identity.id_number.trim() }).eq('buyer_id', identity.buyer_id).select('buyer_id').single());
  } else {
    await unwrap(supabase.from('buyer_identities').insert({ ...identity, id_number: identity.id_number.trim() }).select('buyer_id').single());
  }
}

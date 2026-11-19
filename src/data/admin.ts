import { rangeFor, supabase, unwrap, unwrapPage } from './db';
import type { AuditEntry, BusinessSettings, NotificationRow, Page, PermissionDef, Role, SearchResult, StaffMember } from './types';

// ---- Staff, roles & permissions ---------------------------------------------
export function listStaff(): Promise<StaffMember[]> {
  return unwrap<StaffMember[]>(supabase.from('profiles').select('id, email, full_name, phone, role_id, is_active, created_at').order('full_name'));
}

export async function updateStaff(id: string, values: Partial<Pick<StaffMember, 'full_name' | 'phone' | 'role_id' | 'is_active'>>): Promise<void> {
  await unwrap(supabase.from('profiles').update(values).eq('id', id).select('id').single());
}

/** Sends an invitation email via the invite-user Edge Function (service role stays server-side). */
export async function inviteStaff(input: { email: string; full_name: string; role_id: string }): Promise<void> {
  const { data, error } = await supabase.functions.invoke('invite-user', { body: input });
  if (error) {
    // Edge Function errors carry a JSON body with a safe message.
    let message = 'The invitation could not be sent.';
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') message = (await ctx.json()).error ?? message;
    } catch {
      /* keep default */
    }
    throw Object.assign(new Error(message), { hint: 'FORBIDDEN', message });
  }
  if (data && (data as { error?: string }).error) throw Object.assign(new Error((data as { error: string }).error), { hint: 'FORBIDDEN' });
}

export function listRoles(): Promise<Role[]> {
  return unwrap<Role[]>(supabase.from('roles').select('id, key, name, description, is_system').order('is_system', { ascending: false }).order('name'));
}

export function listPermissions(): Promise<PermissionDef[]> {
  return unwrap<PermissionDef[]>(supabase.from('permissions').select('*').order('category').order('key'));
}

export async function listRolePermissions(): Promise<Record<string, Set<string>>> {
  const rows = await unwrap<{ role_id: string; permission_key: string }[]>(supabase.from('role_permissions').select('role_id, permission_key'));
  const map: Record<string, Set<string>> = {};
  for (const r of rows) (map[r.role_id] ??= new Set()).add(r.permission_key);
  return map;
}

export async function setRolePermission(roleId: string, key: string, granted: boolean): Promise<void> {
  if (granted) await unwrap(supabase.from('role_permissions').insert({ role_id: roleId, permission_key: key }));
  else await unwrap(supabase.from('role_permissions').delete().eq('role_id', roleId).eq('permission_key', key));
}

export async function createRole(name: string, description: string | null): Promise<void> {
  const key = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'r_$1').slice(0, 40) || 'role';
  await unwrap(supabase.from('roles').insert({ key, name: name.trim(), description }).select('id').single());
}

export async function updateRole(id: string, values: { name: string; description: string | null }): Promise<void> {
  await unwrap(supabase.from('roles').update(values).eq('id', id).select('id').single());
}

export async function deleteRole(id: string): Promise<void> {
  await unwrap(supabase.from('roles').delete().eq('id', id));
}

// ---- Settings ---------------------------------------------------------------------
export function getSettings(): Promise<BusinessSettings> {
  return unwrap<BusinessSettings>(supabase.from('business_settings').select('*').single());
}

export async function updateSettings(values: Partial<Omit<BusinessSettings, 'updated_at'>>): Promise<void> {
  await unwrap(supabase.from('business_settings').update(values).eq('id', true).select('updated_at').single());
}

// ---- Audit log --------------------------------------------------------------------
export interface AuditFilters {
  table?: string;
  actorId?: string;
  from?: string;
  to?: string;
  q?: string;
}

export function listAudit(f: AuditFilters, page: number): Promise<Page<AuditEntry>> {
  let q = supabase.from('audit_log').select('*', { count: 'exact' });
  if (f.table) q = q.eq('table_name', f.table);
  if (f.actorId) q = q.eq('actor_id', f.actorId);
  if (f.from) q = q.gte('occurred_at', `${f.from}T00:00:00+03:00`);
  if (f.to) q = q.lte('occurred_at', `${f.to}T23:59:59.999+03:00`);
  if (f.q) q = q.ilike('action', `%${f.q.replace(/[%_\\]/g, '')}%`);
  const [a, b] = rangeFor(page, 50);
  return unwrapPage<AuditEntry>(q.order('occurred_at', { ascending: false }).range(a, b));
}

// ---- Notifications ----------------------------------------------------------------
export function listNotifications(limit = 30): Promise<NotificationRow[]> {
  return unwrap<NotificationRow[]>(supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit));
}

export async function unreadNotificationCount(): Promise<number> {
  const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationsRead(ids?: string[]): Promise<void> {
  let q = supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (ids?.length) q = q.in('id', ids);
  await unwrap(q);
}

// ---- Search -----------------------------------------------------------------------
export function globalSearch(q: string): Promise<SearchResult[]> {
  return unwrap<SearchResult[]>(supabase.rpc('global_search', { p_query: q }));
}

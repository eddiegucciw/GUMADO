import { Fragment, useMemo, useState } from 'react';
import { Lock, Plus, Trash2, UserPlus } from 'lucide-react';
import { useAuth } from '../../../auth/AuthProvider';
import {
  createRole, deleteRole, inviteStaff, listPermissions, listRolePermissions, listRoles, listStaff, setRolePermission, updateRole, updateStaff,
} from '../../../data/admin';
import type { Role, StaffMember } from '../../../data/types';
import { formatDate } from '../../../lib/dates';
import { useSearchParams } from '../../../lib/router';
import { useQuery } from '../../../lib/useQuery';
import { Badge, Button, Card, CardHeader, Field, IconButton, Input, Select, Textarea, cx } from '../../../ui/core';
import { DataTable, PageHeader, Tabs, type Column } from '../../../ui/data';
import { ConfirmDialog, Dialog, ErrorState, LoadingRows, useToast } from '../../../ui/feedback';

function InviteDialog({ open, onClose, roles, onDone }: { open: boolean; onClose: () => void; roles: Role[]; onDone: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (name.trim().length < 2) return setError('Enter their name.');
    if (!roleId) return setError('Choose a role.');
    setBusy(true);
    try {
      await inviteStaff({ email: email.trim().toLowerCase(), full_name: name.trim(), role_id: roleId });
      toast.success(`Invitation sent to ${email.trim()}.`);
      setEmail(''); setName(''); setRoleId('');
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The invitation could not be sent.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={busy ? () => {} : onClose} title="Invite a staff member" description="They'll receive an email to set their password. Access starts with the role you choose."
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Send invitation</Button></>}>
      <div className="space-y-4">
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger">{error}</p>}
        <Field label="Full name" required>{(id) => <Input id={id} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Email address" required>{(id) => <Input id={id} type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Role" required>{(id) => (
          <Select id={id} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">Choose a role…</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        )}</Field>
      </div>
    </Dialog>
  );
}

function StaffTab() {
  const { access } = useAuth();
  const toast = useToast();
  const staff = useQuery(listStaff, []);
  const roles = useQuery(listRoles, []);
  const [inviting, setInviting] = useState(false);
  const [confirm, setConfirm] = useState<{ member: StaffMember; active: boolean } | null>(null);
  const roleName = (id: string | null) => roles.data?.find((r) => r.id === id)?.name ?? 'No role';

  const changeRole = async (m: StaffMember, roleId: string) => {
    try {
      await updateStaff(m.id, { role_id: roleId || null });
      toast.success(`${m.full_name || m.email} is now ${roleName(roleId)}.`);
      staff.reload();
    } catch (e) {
      toast.error(e);
    }
  };

  const columns: Column<StaffMember>[] = [
    { key: 'name', header: 'Name', mobile: 'title', cell: (m) => <span>{m.full_name || '—'}{m.id === access?.id && <span className="ml-1.5 text-xs font-normal text-muted">(you)</span>}</span> },
    { key: 'email', header: 'Email', mobile: 'meta', cell: (m) => m.email },
    { key: 'role', header: 'Role', mobile: 'meta', cell: (m) => (
      <Select aria-label={`Role for ${m.email}`} className="h-9 min-w-[10rem]" value={m.role_id ?? ''} onChange={(e) => changeRole(m, e.target.value)}>
        <option value="">No role</option>
        {roles.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </Select>
    ) },
    { key: 'status', header: 'Access', mobile: 'end', cell: (m) => (
      <div className="flex items-center justify-end gap-2 md:justify-start">
        {m.is_active ? <Badge tone="success">Active</Badge> : <Badge tone={m.role_id ? 'warning' : 'neutral'}>{m.role_id ? 'Paused' : 'Pending'}</Badge>}
        <Button size="sm" variant="ghost" onClick={() => setConfirm({ member: m, active: !m.is_active })}>{m.is_active ? 'Pause' : 'Activate'}</Button>
      </div>
    ) },
    { key: 'joined', header: 'Joined', mobile: 'hidden', cell: (m) => formatDate(m.created_at.slice(0, 10)) },
  ];

  return (
    <Card>
      <CardHeader title="Staff" description="Everyone with a GUMADO account. Public sign-up is disabled; add staff by invitation."
        actions={<Button variant="primary" size="sm" icon={<UserPlus className="h-4 w-4" />} onClick={() => setInviting(true)}>Invite staff</Button>} />
      <DataTable columns={columns} rows={staff.data} rowKey={(m) => m.id} loading={staff.loading} error={staff.error} onRetry={staff.reload} />
      <InviteDialog open={inviting} onClose={() => setInviting(false)} roles={roles.data ?? []} onDone={staff.reload} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)}
        title={confirm?.active ? 'Activate access?' : 'Pause access?'} confirmLabel={confirm?.active ? 'Activate' : 'Pause access'} tone={confirm?.active ? 'primary' : 'danger'}
        message={confirm?.active
          ? <>{confirm.member.full_name || confirm.member.email} will be able to sign in with the <strong>{roleName(confirm.member.role_id)}</strong> role.</>
          : <>{confirm?.member.full_name || confirm?.member.email} will lose access immediately. Their records and history are kept.</>}
        onConfirm={async () => {
          if (confirm!.active && !confirm!.member.role_id) throw Object.assign(new Error('Assign a role before activating.'), { hint: 'FORBIDDEN', message: 'Assign a role before activating.' });
          await updateStaff(confirm!.member.id, { is_active: confirm!.active });
          toast.success(confirm!.active ? 'Access activated.' : 'Access paused.');
          staff.reload();
        }} />
    </Card>
  );
}

function RolesTab() {
  const toast = useToast();
  const roles = useQuery(listRoles, []);
  const perms = useQuery(listPermissions, []);
  const grants = useQuery(listRolePermissions, []);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [pending, setPending] = useState<string | null>(null);

  const categories = useMemo(() => {
    const m = new Map<string, { key: string; description: string }[]>();
    for (const p of perms.data ?? []) m.set(p.category, [...(m.get(p.category) ?? []), p]);
    return [...m.entries()];
  }, [perms.data]);

  const toggle = async (role: Role, key: string, on: boolean) => {
    const id = `${role.id}:${key}`;
    setPending(id);
    try {
      await setRolePermission(role.id, key, on);
      grants.reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setPending(null);
    }
  };

  if (roles.error || perms.error || grants.error) return <Card><ErrorState error={roles.error || perms.error || grants.error} onRetry={() => { roles.reload(); perms.reload(); grants.reload(); }} /></Card>;
  if (!roles.data || !perms.data || !grants.data) return <Card><LoadingRows /></Card>;

  return (
    <Card>
      <CardHeader title="Roles & permissions" description="Permissions are enforced by the database. Changes apply immediately."
        actions={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => { setName(''); setDesc(''); setCreating(true); }}>New role</Button>} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="sticky left-0 z-10 bg-surface px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted sm:px-5">Permission</th>
              {roles.data.map((r) => (
                <th key={r.id} scope="col" className="px-3 py-3 text-center align-bottom">
                  <span className="block text-xs font-bold text-ink">{r.name}</span>
                  {!r.is_system && (
                    <span className="mt-1 inline-flex gap-0.5">
                      <button type="button" className="text-[0.68rem] font-semibold text-accent hover:underline" onClick={() => { setName(r.name); setDesc(r.description ?? ''); setEditing(r); }}>Edit</button>
                      <IconButton label={`Delete ${r.name}`} className="h-5 w-5" onClick={() => setDeleting(r)}><Trash2 className="h-3 w-3" /></IconButton>
                    </span>
                  )}
                  {r.is_system && <Lock className="mx-auto mt-1 h-3 w-3 text-muted" aria-label="Always has every permission" />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map(([cat, items]) => (
              <Fragment key={cat}>
                <tr><th colSpan={roles.data!.length + 1} scope="colgroup" className="bg-surface-2 px-4 py-2 text-left text-[0.7rem] font-bold uppercase tracking-wider text-muted sm:px-5">{cat}</th></tr>
                {items.map((p) => (
                  <tr key={p.key} className="border-b border-line">
                    <th scope="row" className="sticky left-0 z-10 bg-surface px-4 py-2.5 text-left font-normal sm:px-5">
                      <span className="block text-sm text-ink">{p.description}</span>
                      <span className="block font-mono text-[0.68rem] text-muted">{p.key}</span>
                    </th>
                    {roles.data!.map((r) => {
                      const on = grants.data![r.id]?.has(p.key) ?? false;
                      return (
                        <td key={r.id} className="px-3 py-2.5 text-center">
                          <input type="checkbox" aria-label={`${r.name}: ${p.description}`} className={cx('h-4 w-4 accent-[var(--accent)]', r.is_system && 'opacity-50')}
                            checked={on} disabled={r.is_system || pending === `${r.id}:${p.key}`} onChange={(e) => toggle(r, p.key, e.target.checked)} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? `Edit ${editing.name}` : 'New role'}
        footer={<>
          <Button onClick={() => { setCreating(false); setEditing(null); }}>Cancel</Button>
          <Button variant="primary" disabled={name.trim().length < 2} onClick={async () => {
            try {
              if (editing) await updateRole(editing.id, { name: name.trim(), description: desc.trim() || null });
              else await createRole(name, desc.trim() || null);
              toast.success(editing ? 'Role updated.' : 'Role created. Tick the permissions it should have.');
              setCreating(false); setEditing(null); roles.reload();
            } catch (e) { toast.error(e); }
          }}>{editing ? 'Save' : 'Create role'}</Button>
        </>}>
        <div className="space-y-4">
          <Field label="Role name" required>{(id) => <Input id={id} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Site Manager" />}</Field>
          <Field label="Description">{(id) => <Textarea id={id} maxLength={300} value={desc} onChange={(e) => setDesc(e.target.value)} />}</Field>
        </div>
      </Dialog>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} title={`Delete role “${deleting?.name}”?`} tone="danger" confirmLabel="Delete role"
        message="Roles that are still assigned to staff can't be deleted. Reassign those staff first."
        onConfirm={async () => { await deleteRole(deleting!.id); toast.success('Role deleted.'); roles.reload(); grants.reload(); }} />
    </Card>
  );
}

export default function StaffPage() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') === 'roles' ? 'roles' : 'staff';
  return (
    <>
      <PageHeader title="Staff & roles" description="Who can use GUMADO and what each role is allowed to do." />
      <div className="mb-3"><Tabs label="Section" value={tab} onChange={(v) => setSp({ tab: v === 'staff' ? null : v })} tabs={[{ value: 'staff', label: 'Staff' }, { value: 'roles', label: 'Roles & permissions' }]} /></div>
      {tab === 'staff' ? <StaffTab /> : <RolesTab />}
    </>
  );
}

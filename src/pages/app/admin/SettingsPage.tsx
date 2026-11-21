import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '../../../auth/AuthProvider';
import { getSettings, updateSettings } from '../../../data/admin';
import { listMethods, saveMethod } from '../../../data/payments';
import type { BusinessSettings, PaymentMethod } from '../../../data/types';
import { useQuery } from '../../../lib/useQuery';
import { Badge, Button, Card, CardHeader, Checkbox, Field, Input, Select } from '../../../ui/core';
import { PageHeader } from '../../../ui/data';
import { Dialog, ErrorState, LoadingRows, useToast } from '../../../ui/feedback';

function BusinessForm() {
  const { refresh } = useAuth();
  const toast = useToast();
  const s = useQuery(getSettings, []);
  const [v, setV] = useState<BusinessSettings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (s.data) setV(s.data); }, [s.data]);
  if (s.error) return <ErrorState error={s.error} onRetry={s.reload} />;
  if (!v) return <LoadingRows rows={4} />;
  const set = <K extends keyof BusinessSettings>(k: K, val: BusinessSettings[K]) => setV({ ...v, [k]: val });

  const save = async () => {
    setBusy(true);
    try {
      await updateSettings({
        business_name: v.business_name.trim(), contact_email: v.contact_email?.trim() || null, contact_phone: v.contact_phone?.trim() || null,
        postal_address: v.postal_address?.trim() || null, currency_code: v.currency_code, currency_minor_units: v.currency_minor_units, timezone: v.timezone.trim(),
        plot_sold_on: v.plot_sold_on, require_separate_verifier: v.require_separate_verifier, due_soon_days: v.due_soon_days, max_upload_mb: v.max_upload_mb,
      });
      toast.success('Settings saved.');
      s.reload();
      await refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name" required hint="Shown on statements, receipts and reports.">{(id, d) => <Input id={id} aria-describedby={d} maxLength={120} value={v.business_name} onChange={(e) => set('business_name', e.target.value)} />}</Field>
        <Field label="Contact email">{(id) => <Input id={id} type="email" value={v.contact_email ?? ''} onChange={(e) => set('contact_email', e.target.value)} />}</Field>
        <Field label="Contact phone">{(id) => <Input id={id} type="tel" value={v.contact_phone ?? ''} onChange={(e) => set('contact_phone', e.target.value)} />}</Field>
        <Field label="Postal address">{(id) => <Input id={id} maxLength={300} value={v.postal_address ?? ''} onChange={(e) => set('postal_address', e.target.value)} />}</Field>
      </div>
      <div className="grid gap-4 border-t border-line pt-5 sm:grid-cols-3">
        <Field label="Currency code" hint="Locked once sales exist.">{(id, d) => <Input id={id} aria-describedby={d} maxLength={3} value={v.currency_code} onChange={(e) => set('currency_code', e.target.value.toUpperCase())} />}</Field>
        <Field label="Decimal places">{(id) => (
          <Select id={id} value={v.currency_minor_units} onChange={(e) => set('currency_minor_units', Number(e.target.value))}>
            {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        )}</Field>
        <Field label="Business timezone" hint="Used for “today”, due dates and reports.">{(id, d) => <Input id={id} aria-describedby={d} value={v.timezone} onChange={(e) => set('timezone', e.target.value)} />}</Field>
      </div>
      <div className="space-y-4 border-t border-line pt-5">
        <Field label="When does a plot become “Sold”?" hint="Your business rule. Applies to sales recorded or paid from now on.">
          {(id, d) => (
            <Select id={id} aria-describedby={d} value={v.plot_sold_on} onChange={(e) => set('plot_sold_on', e.target.value as BusinessSettings['plot_sold_on'])}>
              <option value="sale_created">As soon as the sale is recorded</option>
              <option value="fully_paid">Only when fully paid (Reserved for the buyer until then)</option>
            </Select>
          )}
        </Field>
        <Checkbox checked={v.require_separate_verifier} onChange={(c) => set('require_separate_verifier', c)}
          label="Require a second person to confirm payments" description="The staff member who records a payment cannot also confirm it." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reminder window (days before due date)">{(id) => <Input id={id} type="number" min={1} max={90} value={v.due_soon_days} onChange={(e) => set('due_soon_days', Number(e.target.value))} />}</Field>
          <Field label="Maximum upload size (MB)">{(id) => <Input id={id} type="number" min={1} max={50} value={v.max_upload_mb} onChange={(e) => set('max_upload_mb', Number(e.target.value))} />}</Field>
        </div>
      </div>
      <div className="flex justify-end"><Button variant="primary" loading={busy} onClick={save}>Save settings</Button></div>
    </div>
  );
}

function MethodsCard() {
  const toast = useToast();
  const methods = useQuery(() => listMethods(true), []);
  const [editing, setEditing] = useState<Partial<PaymentMethod> | null>(null);
  return (
    <Card>
      <CardHeader title="Payment methods" description="Manual recording only. No live M-Pesa or bank integration is connected."
        actions={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ name: '', requires_reference: false, is_active: true, sort_order: 100 })}>Add method</Button>} />
      {methods.error ? <ErrorState compact error={methods.error} /> : !methods.data ? <LoadingRows rows={3} /> : (
        <ul className="divide-y divide-line">
          {methods.data.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{m.name} {!m.is_active && <Badge>Inactive</Badge>}</p>
                <p className="text-xs text-muted">{m.requires_reference ? 'Transaction reference required' : 'Reference optional'}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditing(m)}>Edit</Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? `Edit ${editing.name}` : 'Add payment method'}
        footer={<><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" disabled={(editing?.name ?? '').trim().length < 2}
          onClick={async () => { try { await saveMethod(editing as PaymentMethod); toast.success('Payment method saved.'); setEditing(null); methods.reload(); } catch (e) { toast.error(e); } }}>Save</Button></>}>
        {editing && (
          <div className="space-y-4">
            <Field label="Name" required>{(id) => <Input id={id} maxLength={40} value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />}</Field>
            <Checkbox checked={!!editing.requires_reference} onChange={(c) => setEditing({ ...editing, requires_reference: c })} label="Require a transaction reference" description="Recommended for M-Pesa, bank transfers and cheques. Duplicate references are blocked." />
            <Checkbox checked={editing.is_active ?? true} onChange={(c) => setEditing({ ...editing, is_active: c })} label="Active" description="Inactive methods stay on old payments but can't be chosen for new ones." />
            <Field label="Display order">{(id) => <Input id={id} type="number" value={editing.sort_order ?? 100} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} />}</Field>
          </div>
        )}
      </Dialog>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Business settings" description="Every change is recorded in the audit log." />
      <div className="grid gap-4 lg:grid-cols-3 sm:gap-5">
        <Card className="lg:col-span-2"><CardHeader title="Business profile & rules" /><BusinessForm /></Card>
        <MethodsCard />
      </div>
    </>
  );
}

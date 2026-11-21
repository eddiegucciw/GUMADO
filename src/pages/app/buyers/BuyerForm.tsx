import { useEffect, useState } from 'react';
import { useAuth } from '../../../auth/AuthProvider';
import { createBuyer, getIdentity, ID_TYPES, updateBuyer, upsertIdentity, type BuyerInput } from '../../../data/buyers';
import type { Buyer, BuyerIdentity } from '../../../data/types';
import { isValidDate } from '../../../lib/dates';
import { Button, Field, Input, Select, Textarea } from '../../../ui/core';
import { Dialog, useToast } from '../../../ui/feedback';
import { useBusinessToday } from '../../../ui/inputs';

type Errors = Partial<Record<'full_name' | 'phone' | 'email' | 'registered_on' | 'id_number', string>>;

export function validateBuyer(v: BuyerInput, today: string): Errors {
  const e: Errors = {};
  if (v.full_name.trim().length < 2) e.full_name = 'Enter the buyer\'s full name.';
  if (!/^\+?[0-9 ()-]{7,20}$/.test(v.phone.trim())) e.phone = 'Enter a valid phone number, e.g. +254 712 345 678.';
  if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) e.email = 'Enter a valid email address.';
  if (!isValidDate(v.registered_on) || v.registered_on > today) e.registered_on = 'Enter a valid date, not in the future.';
  return e;
}

export function BuyerFormDialog({ open, onClose, buyer, onSaved }: {
  open: boolean; onClose: () => void; buyer?: Buyer | null; onSaved: (b: Pick<Buyer, 'id' | 'full_name' | 'phone'>) => void;
}) {
  const { can } = useAuth();
  const toast = useToast();
  const today = useBusinessToday();
  const sensitive = can('buyers.view_sensitive');
  const [v, setV] = useState<BuyerInput>({ full_name: '', phone: '', email: null, address: null, registered_on: today, notes: null });
  const [idType, setIdType] = useState<BuyerIdentity['id_type']>('national_id');
  const [idNumber, setIdNumber] = useState('');
  const [hadIdentity, setHadIdentity] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (buyer) {
      setV({ full_name: buyer.full_name, phone: buyer.phone, email: buyer.email, address: buyer.address, registered_on: buyer.registered_on, notes: buyer.notes });
      if (sensitive) {
        getIdentity(buyer.id).then((i) => {
          setHadIdentity(!!i);
          setIdType(i?.id_type ?? 'national_id');
          setIdNumber(i?.id_number ?? '');
        }, () => {});
      }
    } else {
      setV({ full_name: '', phone: '', email: null, address: null, registered_on: today, notes: null });
      setIdNumber('');
      setHadIdentity(false);
    }
  }, [open, buyer, sensitive, today]);

  const set = <K extends keyof BuyerInput>(k: K, val: BuyerInput[K]) => setV((x) => ({ ...x, [k]: val }));
  const opt = (s: string) => (s.trim() ? s.trim() : null);

  const submit = async () => {
    const input = { ...v, full_name: v.full_name.trim(), phone: v.phone.trim(), email: v.email?.trim().toLowerCase() || null };
    const e = validateBuyer(input, today);
    if (sensitive && idNumber.trim() && idNumber.trim().length < 3) e.id_number = 'Enter a valid identification number.';
    if (sensitive && hadIdentity && !idNumber.trim()) e.id_number = 'Identification can be corrected but not removed.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const identity = sensitive && idNumber.trim() ? { id_type: idType, id_number: idNumber.trim() } : null;
      let id = buyer?.id;
      if (buyer) {
        await updateBuyer(buyer.id, input);
        if (identity) await upsertIdentity({ ...identity, buyer_id: buyer.id });
      } else {
        id = await createBuyer(input, identity);
      }
      toast.success(buyer ? 'Buyer updated.' : `${input.full_name} registered.`);
      onSaved({ id: id!, full_name: input.full_name, phone: input.phone });
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? () => {} : onClose} title={buyer ? `Edit ${buyer.full_name}` : 'Register a buyer'} size="lg"
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>{buyer ? 'Save changes' : 'Register buyer'}</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Full name" required error={errors.full_name} className="sm:col-span-2">
          {(id, d, inv) => <Input id={id} autoComplete="off" aria-describedby={d} aria-invalid={inv} maxLength={160} value={v.full_name} onChange={(e) => set('full_name', e.target.value)} />}
        </Field>
        <Field label="Phone number" required error={errors.phone}>
          {(id, d, inv) => <Input id={id} type="tel" inputMode="tel" aria-describedby={d} aria-invalid={inv} maxLength={20} placeholder="+254 7…" value={v.phone} onChange={(e) => set('phone', e.target.value)} />}
        </Field>
        <Field label="Email address" error={errors.email}>
          {(id, d, inv) => <Input id={id} type="email" inputMode="email" aria-describedby={d} aria-invalid={inv} maxLength={254} value={v.email ?? ''} onChange={(e) => set('email', opt(e.target.value))} />}
        </Field>
        <Field label="Physical or postal address" className="sm:col-span-2" hint="Only if needed for agreements or correspondence.">
          {(id, d) => <Input id={id} aria-describedby={d} maxLength={500} value={v.address ?? ''} onChange={(e) => set('address', opt(e.target.value))} />}
        </Field>
        <Field label="Registration date" required error={errors.registered_on}>
          {(id, d, inv) => <Input id={id} type="date" max={today} aria-describedby={d} aria-invalid={inv} value={v.registered_on} onChange={(e) => set('registered_on', e.target.value)} />}
        </Field>
        {sensitive && (
          <div className="rounded-2xl border border-line bg-surface-2/60 p-4 sm:col-span-2">
            <p className="text-sm font-semibold text-ink">Identification</p>
            <p className="mb-3 mt-0.5 text-xs text-muted">Record only when needed for the sale agreement. Visible only to staff with permission to view sensitive buyer details.</p>
            <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
              <Select aria-label="ID type" value={idType} onChange={(e) => setIdType(e.target.value as BuyerIdentity['id_type'])}>
                {ID_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
              <Field label="ID number" error={errors.id_number}>
                {(id, d, inv) => <Input id={id} autoComplete="off" aria-describedby={d} aria-invalid={inv} maxLength={40} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />}
              </Field>
            </div>
          </div>
        )}
        <Field label="Notes" className="sm:col-span-2">
          {(id) => <Textarea id={id} maxLength={4000} value={v.notes ?? ''} onChange={(e) => set('notes', opt(e.target.value))} />}
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

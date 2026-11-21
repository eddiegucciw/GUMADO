import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { updateStaff } from '../../data/admin';
import { supabase } from '../../lib/supabase';
import { Badge, Button, Card, CardHeader, Field, Input } from '../../ui/core';
import { PageHeader } from '../../ui/data';
import { useToast } from '../../ui/feedback';
import { MIN_PASSWORD } from '../auth/AuthPages';

export default function ProfilePage() {
  const { access, refresh, signOut } = useAuth();
  const toast = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState<'profile' | 'password' | null>(null);

  useEffect(() => {
    setName(access?.full_name ?? '');
    setPhone(access?.phone ?? '');
  }, [access]);

  const saveProfile = async () => {
    if (name.trim().length < 2) return toast.error('Enter your name.');
    if (phone.trim() && !/^\+?[0-9 ()-]{7,20}$/.test(phone.trim())) return toast.error('Enter a valid phone number.');
    setBusy('profile');
    try {
      await updateStaff(access!.id, { full_name: name.trim(), phone: phone.trim() || null });
      await refresh();
      toast.success('Profile saved.');
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };

  const savePassword = async () => {
    if (pw.length < MIN_PASSWORD) return toast.error(`Use at least ${MIN_PASSWORD} characters.`);
    if (pw !== pw2) return toast.error('Passwords do not match.');
    setBusy('password');
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(null);
    if (error) toast.error(error);
    else {
      setPw('');
      setPw2('');
      toast.success('Password changed.');
    }
  };

  return (
    <>
      <PageHeader title="Your profile" description={<span className="inline-flex items-center gap-2">{access?.email} <Badge tone="accent">{access?.role?.name}</Badge></span>} />
      <div className="grid gap-4 lg:grid-cols-2 sm:gap-5">
        <Card>
          <CardHeader title="Details" />
          <div className="space-y-4 p-4 sm:p-5">
            <Field label="Full name" required>{(id) => <Input id={id} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
            <Field label="Phone">{(id) => <Input id={id} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}</Field>
            <Button variant="primary" loading={busy === 'profile'} onClick={saveProfile}>Save</Button>
          </div>
        </Card>
        <Card>
          <CardHeader title="Change password" />
          <div className="space-y-4 p-4 sm:p-5">
            <Field label="New password" hint={`At least ${MIN_PASSWORD} characters.`}>{(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
            <Field label="Confirm new password">{(id) => <Input id={id} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />}</Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" loading={busy === 'password'} onClick={savePassword}>Change password</Button>
              <Button variant="ghost" onClick={signOut}>Sign out</Button>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

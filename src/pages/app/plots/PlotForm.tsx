import { useEffect, useState } from 'react';
import { createPlot, SIZE_UNITS, updatePlot, type PlotInput } from '../../../data/plots';
import type { Plot, SizeUnit } from '../../../data/types';
import { isValidDate } from '../../../lib/dates';
import { Button, Field, Input, Select, Textarea } from '../../../ui/core';
import { Dialog, useToast } from '../../../ui/feedback';
import { MoneyInput, useBusinessToday } from '../../../ui/inputs';

type Errors = Partial<Record<keyof PlotInput | 'coordinates', string>>;

const KENYA_COUNTIES = ['Baringo','Bomet','Bungoma','Busia','Elgeyo-Marakwet','Embu','Garissa','Homa Bay','Isiolo','Kajiado','Kakamega','Kericho','Kiambu','Kilifi','Kirinyaga','Kisii','Kisumu','Kitui','Kwale','Laikipia','Lamu','Machakos','Makueni','Mandera','Marsabit','Meru','Migori','Mombasa',"Murang'a",'Nairobi','Nakuru','Nandi','Narok','Nyamira','Nyandarua','Nyeri','Samburu','Siaya','Taita-Taveta','Tana River','Tharaka-Nithi','Trans Nzoia','Turkana','Uasin Gishu','Vihiga','Wajir','West Pokot'];

export function validatePlot(v: PlotInput, latText: string, lngText: string, today: string): Errors {
  const e: Errors = {};
  if (!/^[A-Za-z0-9][A-Za-z0-9/_.-]{0,39}$/.test(v.reference)) e.reference = 'Use letters, numbers and / . _ - only (max 40), e.g. KJD/014.';
  if (!v.name.trim()) e.name = 'Enter a name or short description.';
  if (v.county.trim().length < 2) e.county = 'Enter the county.';
  if (!(v.size > 0)) e.size = 'Enter a size greater than zero.';
  if (v.asking_price == null || v.asking_price < 0) e.asking_price = 'Enter the asking price.';
  if (!isValidDate(v.registered_on) || v.registered_on > today) e.registered_on = 'Enter a valid date, not in the future.';
  const hasLat = latText.trim() !== '', hasLng = lngText.trim() !== '';
  if (hasLat !== hasLng) e.coordinates = 'Enter both latitude and longitude, or leave both empty.';
  else if (hasLat) {
    const la = Number(latText), lo = Number(lngText);
    if (!Number.isFinite(la) || la < -90 || la > 90 || !Number.isFinite(lo) || lo < -180 || lo > 180) e.coordinates = 'Latitude must be −90…90 and longitude −180…180 (decimal degrees).';
  }
  return e;
}

export function PlotFormDialog({ open, onClose, plot, onSaved }: { open: boolean; onClose: () => void; plot?: Plot | null; onSaved: (id: string) => void }) {
  const today = useBusinessToday();
  const toast = useToast();
  const blank = (): PlotInput => ({
    reference: '', name: '', description: null, county: '', town: null, estate: null, location: null, size: 0, size_unit: 'acres',
    asking_price: 0, status: 'available', registered_on: today, latitude: null, longitude: null, notes: null,
  });
  const [v, setV] = useState<PlotInput>(blank);
  const [sizeText, setSizeText] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (plot) {
      setV({
        reference: plot.reference, name: plot.name, description: plot.description, county: plot.county, town: plot.town, estate: plot.estate,
        location: plot.location, size: plot.size, size_unit: plot.size_unit, asking_price: plot.asking_price,
        status: plot.status === 'unavailable' ? 'unavailable' : 'available', registered_on: plot.registered_on,
        latitude: plot.latitude, longitude: plot.longitude, notes: plot.notes,
      });
      setSizeText(String(plot.size));
      setLat(plot.latitude?.toString() ?? '');
      setLng(plot.longitude?.toString() ?? '');
    } else {
      setV(blank());
      setSizeText('');
      setLat('');
      setLng('');
    }
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plot]);

  const set = <K extends keyof PlotInput>(k: K, val: PlotInput[K]) => setV((x) => ({ ...x, [k]: val }));
  const opt = (s: string) => (s.trim() ? s.trim() : null);

  const submit = async () => {
    const input: PlotInput = {
      ...v, reference: v.reference.trim(), name: v.name.trim(), county: v.county.trim(), size: Number(sizeText),
      latitude: lat.trim() ? Number(lat) : null, longitude: lng.trim() ? Number(lng) : null,
    };
    const e = validatePlot(input, lat, lng, today);
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      let id = plot?.id;
      if (plot) {
        const { status, ...rest } = input;
        // Only send the status when it's a manual Available/Unavailable plot.
        await updatePlot(plot.id, plot.status === 'available' || plot.status === 'unavailable' ? input : rest);
        void status;
      } else id = await createPlot(input);
      toast.success(plot ? 'Plot updated.' : `Plot ${input.reference} registered.`);
      onSaved(id!);
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const editableStatus = !plot || plot.status === 'available' || plot.status === 'unavailable';

  return (
    <Dialog open={open} onClose={busy ? () => {} : onClose} size="lg" title={plot ? `Edit plot ${plot.reference}` : 'Register a plot'}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>{plot ? 'Save changes' : 'Register plot'}</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Plot reference number" required error={errors.reference} hint="Unique, e.g. the parcel or internal number.">
          {(id, d, inv) => <Input id={id} aria-describedby={d} aria-invalid={inv} value={v.reference} maxLength={40} onChange={(e) => set('reference', e.target.value)} />}
        </Field>
        <Field label="Name or description" required error={errors.name}>
          {(id, d, inv) => <Input id={id} aria-describedby={d} aria-invalid={inv} value={v.name} maxLength={160} placeholder="e.g. Corner plot, Phase II" onChange={(e) => set('name', e.target.value)} />}
        </Field>
        <Field label="County" required error={errors.county}>
          {(id, d, inv) => (
            <>
              <Input id={id} list="kenya-counties" aria-describedby={d} aria-invalid={inv} value={v.county} maxLength={80} onChange={(e) => set('county', e.target.value)} />
              <datalist id="kenya-counties">{KENYA_COUNTIES.map((c) => <option key={c} value={c} />)}</datalist>
            </>
          )}
        </Field>
        <Field label="Town or area">
          {(id) => <Input id={id} value={v.town ?? ''} maxLength={120} onChange={(e) => set('town', opt(e.target.value))} />}
        </Field>
        <Field label="Estate or project">
          {(id) => <Input id={id} value={v.estate ?? ''} maxLength={160} onChange={(e) => set('estate', opt(e.target.value))} />}
        </Field>
        <Field label="Location details" hint="Road, landmark or directions.">
          {(id, d) => <Input id={id} aria-describedby={d} value={v.location ?? ''} maxLength={300} onChange={(e) => set('location', opt(e.target.value))} />}
        </Field>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label="Plot size" required error={errors.size}>
            {(id, d, inv) => <Input id={id} inputMode="decimal" aria-describedby={d} aria-invalid={inv} value={sizeText} onChange={(e) => setSizeText(e.target.value.replace(/[^\d.]/g, ''))} />}
          </Field>
          <Field label="Unit" required>
            {(id) => (
              <Select id={id} value={v.size_unit} onChange={(e) => set('size_unit', e.target.value as SizeUnit)}>
                {SIZE_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Asking price" required error={errors.asking_price}>
          {(id, d, inv) => <MoneyInput id={id} describedBy={d} invalid={inv} value={v.asking_price} onChange={(m) => set('asking_price', m ?? -1)} />}
        </Field>
        <Field label="Status" hint={editableStatus ? 'Reserved and Sold are set automatically by reservations and sales.' : 'Set automatically by its reservation or sale.'}>
          {(id, d) => (
            <Select id={id} aria-describedby={d} disabled={!editableStatus} value={editableStatus ? v.status : plot!.status} onChange={(e) => set('status', e.target.value as 'available' | 'unavailable')}>
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
              {!editableStatus && <option value={plot!.status}>{plot!.status === 'sold' ? 'Sold' : 'Reserved'}</option>}
            </Select>
          )}
        </Field>
        <Field label="Registration date" required error={errors.registered_on}>
          {(id, d, inv) => <Input id={id} type="date" max={today} aria-describedby={d} aria-invalid={inv} value={v.registered_on} onChange={(e) => set('registered_on', e.target.value)} />}
        </Field>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-[0.8rem] font-semibold text-ink-2">GPS coordinates <span className="font-normal text-muted">(optional, decimal degrees)</span></p>
          <div className="grid grid-cols-2 gap-2">
            <Input aria-label="Latitude" inputMode="decimal" placeholder="Latitude, e.g. -1.2921" value={lat} aria-invalid={!!errors.coordinates || undefined} onChange={(e) => setLat(e.target.value.replace(/[^\d.-]/g, ''))} />
            <Input aria-label="Longitude" inputMode="decimal" placeholder="Longitude, e.g. 36.8219" value={lng} aria-invalid={!!errors.coordinates || undefined} onChange={(e) => setLng(e.target.value.replace(/[^\d.-]/g, ''))} />
          </div>
          {errors.coordinates && <p role="alert" className="mt-1.5 text-xs font-medium text-danger">{errors.coordinates}</p>}
        </div>
        <Field label="Description" className="sm:col-span-2">
          {(id) => <Textarea id={id} maxLength={4000} value={v.description ?? ''} onChange={(e) => set('description', opt(e.target.value))} />}
        </Field>
        <Field label="Internal notes" className="sm:col-span-2" hint="Visible to staff only.">
          {(id, d) => <Textarea id={id} aria-describedby={d} maxLength={4000} value={v.notes ?? ''} onChange={(e) => set('notes', opt(e.target.value))} />}
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

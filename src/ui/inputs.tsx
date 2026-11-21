import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { RANGE_PRESETS, rangeFor, todayIn, type RangePreset } from '../lib/dates';
import { formatMoney, parseMoney, toInputValue } from '../lib/money';
import { Input, Select, cx } from './core';

/**
 * Money input that keeps an INTEGER minor-unit value. Shows grouped digits as
 * the user types and reports null for invalid input.
 */
export function MoneyInput({ value, onChange, id, invalid, describedBy, placeholder = '0', disabled }: {
  value: number | null; onChange: (v: number | null) => void; id?: string; invalid?: boolean; describedBy?: string; placeholder?: string; disabled?: boolean;
}) {
  const { business } = useAuth();
  const mu = business.currency.minorUnits;
  const [text, setText] = useState(() => toInputValue(value, mu));

  useEffect(() => {
    // Sync when the value is changed from outside.
    if (parseMoney(text, mu) !== value) setText(value == null ? '' : formatMoney(value, business.currency, { withCode: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">{business.currency.code}</span>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={invalid || (text !== '' && parseMoney(text, mu) == null) || undefined}
        aria-describedby={describedBy}
        placeholder={placeholder}
        disabled={disabled}
        value={text}
        className="pl-14 tabular"
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.,\s]/g, '');
          setText(t);
          onChange(parseMoney(t, mu));
        }}
        onBlur={() => {
          const v = parseMoney(text, mu);
          if (v != null) setText(formatMoney(v, business.currency, { withCode: false }));
        }}
      />
    </div>
  );
}

export function useBusinessToday() {
  const { business } = useAuth();
  return todayIn(business.timezone);
}

export interface DateRange { preset: RangePreset; from: string; to: string }

export function DateRangePicker({ value, onChange, className }: { value: DateRange; onChange: (r: DateRange) => void; className?: string }) {
  const today = useBusinessToday();
  return (
    <div className={cx('flex flex-wrap items-center gap-2', className)}>
      <Select aria-label="Period" className="w-auto min-w-[10.5rem]" value={value.preset}
        onChange={(e) => {
          const preset = e.target.value as RangePreset;
          onChange(preset === 'custom' ? { ...value, preset } : { preset, ...rangeFor(preset, today) });
        }}>
        {RANGE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </Select>
      {value.preset === 'custom' && (
        <div className="flex items-center gap-2">
          <Input type="date" aria-label="From" className="w-auto" value={value.from} max={value.to}
            onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} />
          <span className="text-muted">–</span>
          <Input type="date" aria-label="To" className="w-auto" value={value.to} min={value.from} max={today}
            onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} />
        </div>
      )}
    </div>
  );
}

export function useDateRange(initial: RangePreset = '30d'): [DateRange, (r: DateRange) => void] {
  const today = useBusinessToday();
  const [r, setR] = useState<DateRange>(() => ({ preset: initial, ...rangeFor(initial, today) }));
  return [r, setR];
}

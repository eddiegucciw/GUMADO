/** Dates are business dates (YYYY-MM-DD) in the business timezone (default Africa/Nairobi). */

export const DEFAULT_TIMEZONE = 'Africa/Nairobi';

/** Today's date as YYYY-MM-DD in the given timezone. */
export function todayIn(timeZone = DEFAULT_TIMEZONE, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Add days to a YYYY-MM-DD date (calendar arithmetic, timezone-free). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function toUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function startOfMonth(date: string): string {
  return date.slice(0, 8) + '01';
}

export function startOfYear(date: string): string {
  return date.slice(0, 4) + '-01-01';
}

/** "2026-11-19" → "19 Nov 2026" */
export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** Timestamp → "19 Nov 2026, 14:05" in the business timezone. */
export function formatDateTime(ts: string | null | undefined, timeZone = DEFAULT_TIMEZONE): string {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone,
  }).format(new Date(ts));
}

export function formatRelative(ts: string, now = Date.now()): string {
  const diff = Math.round((now - new Date(ts).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 7 * 86_400) return `${Math.floor(diff / 86_400)} d ago`;
  return formatDateTime(ts);
}

export type RangePreset = '7d' | '30d' | '90d' | 'mtd' | 'ytd' | '12m' | 'custom';

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'mtd', label: 'This month' },
  { value: 'ytd', label: 'This year' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'custom', label: 'Custom range' },
];

export function rangeFor(preset: RangePreset, today: string): { from: string; to: string } {
  switch (preset) {
    case '7d': return { from: addDays(today, -6), to: today };
    case '90d': return { from: addDays(today, -89), to: today };
    case 'mtd': return { from: startOfMonth(today), to: today };
    case 'ytd': return { from: startOfYear(today), to: today };
    case '12m': return { from: addDays(today, -364), to: today };
    case '30d':
    default: return { from: addDays(today, -29), to: today };
  }
}

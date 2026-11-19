/**
 * Money is always handled as an INTEGER number of minor units (e.g. cents).
 * Parsing and formatting work on strings and integers only. No floating-point
 * arithmetic touches stored amounts.
 */

export interface CurrencyConfig {
  code: string; // ISO 4217, e.g. "KES"
  minorUnits: number; // decimals, e.g. 2
}

export const DEFAULT_CURRENCY: CurrencyConfig = { code: 'KES', minorUnits: 2 };

/** Parse user input such as "1,500,000" or "1 500 000.50" into minor units. Returns null if invalid. */
export function parseMoney(input: string, minorUnits = 2): number | null {
  const cleaned = input.replace(/[\s,]/g, '').replace(/^(KES|KSH|KSHS)\.?/i, '');
  if (cleaned === '') return null;
  const re = minorUnits > 0 ? new RegExp(`^(\\d+)(?:\\.(\\d{0,${minorUnits}}))?$`) : /^(\d+)$/;
  const m = re.exec(cleaned);
  if (!m) return null;
  const whole = BigInt(m[1]);
  const frac = BigInt((m[2] ?? '').padEnd(minorUnits, '0') || '0');
  const total = whole * BigInt(10) ** BigInt(minorUnits) + frac;
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(total);
}

/** Minor units → plain decimal string for inputs, e.g. 150000050 → "1500000.50". */
export function toInputValue(minor: number | null | undefined, minorUnits = 2): string {
  if (minor == null) return '';
  const { whole, frac } = split(minor, minorUnits);
  return frac ? `${whole}.${frac}` : String(whole);
}

function split(minor: number, minorUnits: number) {
  if (!Number.isSafeInteger(minor)) throw new Error('Amount must be a safe integer of minor units');
  const negative = minor < 0;
  const abs = BigInt(Math.abs(minor));
  const base = BigInt(10) ** BigInt(minorUnits);
  const wholeBig = abs / base;
  const fracBig = abs % base;
  const frac = minorUnits > 0 && fracBig > BigInt(0) ? fracBig.toString().padStart(minorUnits, '0') : '';
  return { negative, whole: wholeBig, frac };
}

const groupers = new Map<string, Intl.NumberFormat>();
function group(n: bigint) {
  let f = groupers.get('g');
  if (!f) groupers.set('g', (f = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 })));
  return f.format(n);
}

/** 150000050 → "KES 1,500,000.50" (decimals shown only when needed unless `fixed`). */
export function formatMoney(
  minor: number | null | undefined,
  currency: CurrencyConfig = DEFAULT_CURRENCY,
  opts: { fixed?: boolean; withCode?: boolean } = {},
): string {
  if (minor == null) return '—';
  const { negative, whole, frac } = split(minor, currency.minorUnits);
  const decimals = opts.fixed && currency.minorUnits > 0 ? '.' + (frac || '0'.repeat(currency.minorUnits)) : frac ? '.' + frac : '';
  const body = `${group(whole)}${decimals}`;
  const code = opts.withCode === false ? '' : `${currency.code} `;
  return `${negative ? '−' : ''}${code}${body}`;
}

/** Compact for dashboards: 186400000 (KES cents) → "KES 1.86M". Display only. */
export function formatMoneyCompact(minor: number | null | undefined, currency: CurrencyConfig = DEFAULT_CURRENCY): string {
  if (minor == null) return '—';
  const major = minor / 10 ** currency.minorUnits; // display-only conversion
  const s = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: major >= 1e6 ? 2 : 1 }).format(major);
  return `${currency.code} ${s}`;
}

/** Minor units → major units as a number, for spreadsheet cells and charts only. */
export function toMajorNumber(minor: number, minorUnits = 2): number {
  const { negative, whole, frac } = split(minor, minorUnits);
  return Number(`${negative ? '-' : ''}${whole}${frac ? '.' + frac : ''}`);
}

/** Sum integer amounts safely. */
export function sumMinor(values: Array<number | null | undefined>): number {
  let total = BigInt(0);
  for (const v of values) if (v != null) total += BigInt(v);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Total exceeds safe range');
  return Number(total);
}

/** Percent change between periods, null when there's no baseline. */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

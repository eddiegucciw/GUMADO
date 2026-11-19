import { supabase } from '../lib/supabase';

export { supabase };

export const PAGE_SIZE = 25;
/** Supabase caps a single response (default 1000 rows); exports page through. */
const CHUNK = 1000;
const EXPORT_LIMIT = 20_000;

interface Result<T> {
  data: T | null;
  error: unknown;
  count?: number | null;
}

/** Throw on error, otherwise return data. */
export async function unwrap<T>(p: PromiseLike<Result<T>>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

export async function unwrapPage<T>(p: PromiseLike<Result<T[]>>): Promise<{ rows: T[]; count: number }> {
  const { data, error, count } = await p;
  if (error) throw error;
  return { rows: (data ?? []) as T[], count: count ?? 0 };
}

export function rangeFor(page: number, pageSize = PAGE_SIZE): [number, number] {
  const from = Math.max(0, (page - 1) * pageSize);
  return [from, from + pageSize - 1];
}

/**
 * Make free text safe for PostgREST `or=(…ilike…)` filters: strip characters
 * that have meaning in the filter syntax.
 */
export function searchTerm(q: string | undefined | null): string | null {
  const t = (q ?? '').replace(/[,()*%\\:"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return t.length >= 1 ? t : null;
}

/** Fetch every row of a query in chunks (for exports). `build` must return a fresh query each call. */
export async function fetchAll<T>(build: () => { range: (a: number, b: number) => PromiseLike<Result<T[]>> }): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < EXPORT_LIMIT; from += CHUNK) {
    const { data, error } = await build().range(from, from + CHUNK - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < CHUNK) break;
  }
  return out;
}

export function newRequestId(): string {
  return crypto.randomUUID();
}

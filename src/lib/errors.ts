/**
 * Turns Supabase/PostgREST/network errors into safe, human messages.
 * GUMADO's database functions raise errors with a `hint` code and a message
 * written for end users; anything else gets a generic message, so internal
 * details never reach the screen.
 */

export interface AppError {
  code: string;
  message: string;
}

const CONSTRAINT_MESSAGES: Record<string, string> = {
  plots_reference_unique: 'A plot with this reference number already exists.',
  plots_reference_check: 'Plot references may only use letters, numbers and / . _ - (max 40 characters).',
  plots_size_check: 'Plot size must be greater than zero.',
  plots_asking_price_check: 'Asking price cannot be negative.',
  plots_coordinates_pair: 'Enter both latitude and longitude, or neither.',
  plots_latitude_check: 'Latitude must be between −90 and 90.',
  plots_longitude_check: 'Longitude must be between −180 and 180.',
  plots_county_check: 'Enter the county.',
  plots_name_check: 'Enter a plot name or description.',
  buyers_full_name_check: 'Enter the buyer\'s full name.',
  buyers_phone_check: 'Enter a valid phone number, e.g. +254 712 345 678.',
  buyers_email_check: 'Enter a valid email address.',
  buyer_identities_unique: 'This identification number already belongs to another buyer.',
  buyer_identities_id_number_check: 'Enter a valid identification number.',
  payment_methods_name_unique: 'A payment method with this name already exists.',
  roles_key_key: 'A role with this name already exists.',
  profiles_phone_check: 'Enter a valid phone number.',
  sales_one_active_per_plot: 'This plot already has an active sale.',
  payments_unique_live_reference: 'This transaction reference has already been recorded.',
};

const TRUSTED_HINTS = new Set([
  'FORBIDDEN', 'NOT_FOUND', 'PLOT_NOT_AVAILABLE', 'PLOT_RESERVED_FOR_OTHER', 'PLOT_ALREADY_SOLD', 'INVALID_AMOUNT',
  'INVALID_DEPOSIT', 'INVALID_DATE', 'INVALID_AGENT', 'SALE_NOT_ACTIVE', 'INVALID_METHOD', 'REFERENCE_REQUIRED',
  'EXCEEDS_BALANCE', 'POSSIBLE_DUPLICATE', 'DUPLICATE_REFERENCE', 'INVALID_TRANSITION', 'SEPARATE_VERIFIER',
  'REASON_REQUIRED', 'LINK_REQUIRED', 'FILE_TYPE', 'FILE_SIZE', 'UPLOAD_MISSING', 'PLOT_IN_USE', 'BUYER_IN_USE',
  'HAS_ACTIVE_SALE', 'NOT_RESERVED', 'ARCHIVED', 'USE_ARCHIVE_ACTION', 'USE_RESERVATION_ACTION', 'STATUS_CONTROLLED',
  'INVALID_STATUS', 'IMMUTABLE', 'CANCELLED', 'DELETE_FORBIDDEN', 'LAST_ADMIN', 'ADMIN_ROLE_LOCKED', 'SYSTEM_ROLE',
  'ROLE_IN_USE', 'CURRENCY_LOCKED', 'INVALID_TIMEZONE',
]);

interface MaybePgError {
  message?: string;
  code?: string;
  hint?: string | null;
  details?: string | null;
  name?: string;
  status?: number;
}

export function toAppError(err: unknown): AppError {
  const e = (err ?? {}) as MaybePgError;
  const msg = typeof e.message === 'string' ? e.message : '';

  if (e.hint && TRUSTED_HINTS.has(e.hint)) return { code: e.hint, message: msg };

  if (/Failed to fetch|NetworkError|Load failed|fetch failed|network/i.test(msg)) {
    return { code: 'NETWORK', message: 'Can\'t reach GUMADO right now. Check your internet connection and try again.' };
  }
  if (e.code === '23505' || e.code === '23514' || e.code === '23503') {
    for (const [name, text] of Object.entries(CONSTRAINT_MESSAGES)) {
      if (msg.includes(name) || (e.details ?? '').includes(name)) return { code: e.code, message: text };
    }
    if (e.code === '23505') return { code: e.code, message: 'This record already exists.' };
    if (e.code === '23503') return { code: e.code, message: 'This record is linked to other records and cannot be changed this way.' };
    return { code: e.code, message: 'Some details are not valid. Please check the form.' };
  }
  if (e.code === '42501' || e.code === 'PGRST301' || e.status === 403) {
    return { code: 'FORBIDDEN', message: 'You don\'t have permission to do this.' };
  }
  if (e.code === 'PGRST116') return { code: 'NOT_FOUND', message: 'This record was not found or you can\'t access it.' };
  if (e.name === 'AuthApiError' || e.name === 'AuthError') {
    if (/Invalid login credentials/i.test(msg)) return { code: 'AUTH', message: 'Incorrect email or password.' };
    if (/Email not confirmed/i.test(msg)) return { code: 'AUTH', message: 'Please confirm your email address first.' };
    if (/rate limit|too many/i.test(msg)) return { code: 'AUTH', message: 'Too many attempts. Please wait a few minutes and try again.' };
    if (/should be different/i.test(msg)) return { code: 'AUTH', message: 'Choose a password you haven\'t used before.' };
    if (/weak|at least/i.test(msg)) return { code: 'AUTH', message: 'Choose a stronger password (at least 10 characters).' };
    return { code: 'AUTH', message: 'We couldn\'t complete that sign-in step. Please try again.' };
  }
  return { code: 'UNKNOWN', message: 'Something went wrong. Please try again.' };
}

export function errorMessage(err: unknown): string {
  return toAppError(err).message;
}

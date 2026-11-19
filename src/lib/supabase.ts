import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * The only Supabase client in the app. It uses the PUBLIC anon key; every
 * request is authorised by Row Level Security using the signed-in user's JWT.
 */
export const supabase = createClient(env.supabaseUrl || 'https://not-configured.invalid', env.supabaseAnonKey || 'not-configured', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // completes invite and password-recovery links
    storageKey: 'gumado-auth',
  },
});

export const DOCUMENTS_BUCKET = 'documents';

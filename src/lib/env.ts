const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const env = {
  supabaseUrl: url ?? '',
  supabaseAnonKey: anonKey ?? '',
  configured: Boolean(url && anonKey && /^https:\/\//.test(url)),
  contact: {
    email: (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) || '',
    phone: (import.meta.env.VITE_CONTACT_PHONE as string | undefined) || '',
    whatsapp: (import.meta.env.VITE_CONTACT_WHATSAPP as string | undefined) || '',
  },
};

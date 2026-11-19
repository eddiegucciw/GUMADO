// GUMADO · invite-user Edge Function (Deno)
//
// Lets an administrator invite a staff member by email and assign their role.
// The service-role key never leaves Supabase: it is injected into this function
// as SUPABASE_SERVICE_ROLE_KEY by the platform.
//
// Deploy:  supabase functions deploy invite-user
// Secrets: supabase secrets set SITE_URL=https://your-domain.example
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL = (Deno.env.get('SITE_URL') ?? '').replace(/\/+$/, '');
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? SITE_URL).split(',').map((s) => s.trim()).filter(Boolean);

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] ?? '';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function reply(status: number, body: Record<string, unknown>, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed.' }, origin);

  // 1. Identify the caller from their JWT and check users.manage *in the database*.
  const authHeader = req.headers.get('Authorization') ?? '';
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: allowed, error: permError } = await asCaller.rpc('has_permission', { p_key: 'users.manage' });
  if (permError || allowed !== true) return reply(403, { error: 'Only administrators can invite staff.' }, origin);

  // 2. Validate input.
  let body: { email?: string; full_name?: string; role_id?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Invalid request.' }, origin);
  }
  const email = String(body.email ?? '').trim().toLowerCase();
  const fullName = String(body.full_name ?? '').trim().slice(0, 120);
  const roleId = String(body.role_id ?? '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return reply(400, { error: 'Enter a valid email address.' }, origin);
  if (fullName.length < 2) return reply(400, { error: 'Enter the staff member\'s name.' }, origin);
  if (!/^[0-9a-f-]{36}$/i.test(roleId)) return reply(400, { error: 'Choose a role.' }, origin);
  if (!SITE_URL) return reply(500, { error: 'SITE_URL is not configured for invitations.' }, origin);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: role } = await admin.from('roles').select('id').eq('id', roleId).maybeSingle();
  if (!role) return reply(400, { error: 'That role no longer exists.' }, origin);

  const { data: existing } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle();
  if (existing) return reply(409, { error: 'A staff account with this email already exists. Change their role on the Staff screen.' }, origin);

  // 3. Send the invitation. The new profile starts inactive with no role (database trigger) …
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${SITE_URL}/reset-password?invite=1`,
  });
  if (inviteError || !invited?.user) {
    console.error('invite failed', inviteError?.message);
    return reply(400, { error: 'The invitation could not be sent. Check the email address and try again.' }, origin);
  }

  // 4. … and is activated with the chosen role here (service role, audited by trigger).
  const { error: updateError } = await admin
    .from('profiles')
    .update({ role_id: roleId, is_active: true, full_name: fullName })
    .eq('id', invited.user.id);
  if (updateError) {
    console.error('role assignment failed', updateError.message);
    return reply(500, { error: 'The invitation was sent but the role could not be assigned. Assign it on the Staff screen.' }, origin);
  }

  return reply(200, { ok: true }, origin);
});

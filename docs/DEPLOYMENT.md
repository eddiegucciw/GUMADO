# Deploying GUMADO

You need: a Supabase project, a Vercel account (or any static host), Node 20+, and the
[Supabase CLI](https://supabase.com/docs/guides/cli). Use **two** Supabase projects:
one for testing and one for production. Never test against production data.

---

## 1. Create the Supabase project

1. Create a project at supabase.com. Choose the region closest to your users.
2. Note the **Project URL** and **anon public key** (Project Settings → API).
3. Never copy the **service_role** key, database password or JWT secret into this repository or the frontend.

## 2. Apply the database

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push            # applies supabase/migrations/* in order
```

This creates every table, constraint, index, trigger, view, function, the Row Level Security
policies, the audit trail and the **private** `documents` storage bucket.

Check it: Dashboard → Storage → `documents` must show **Private**.

## 3. Configure authentication (Dashboard → Authentication)

| Setting | Value |
|---|---|
| Providers → Email | Enabled |
| **Allow new users to sign up** | **Off** (staff join by invitation) |
| Confirm email | On |
| Minimum password length | 10 |
| Leaked password protection | On (if your plan offers it) |
| URL Configuration → Site URL | `https://your-domain.example` |
| URL Configuration → Redirect URLs | `https://your-domain.example/reset-password`, `https://your-domain.example/reset-password?invite=1` |
| SMTP settings | Configure your own SMTP sender. Supabase's built-in sender is heavily rate-limited and not meant for production. |

Edit the email templates (Invite, Reset password) to use your business name.

## 4. Deploy the invitation function

```bash
supabase secrets set SITE_URL=https://your-domain.example
supabase secrets set ALLOWED_ORIGINS=https://your-domain.example
supabase functions deploy invite-user
```

The function receives the service-role key from Supabase automatically. It checks that the caller
holds `users.manage` before it does anything.

## 5. Create the first administrator

1. Dashboard → Authentication → Users → **Add user** → *Send invitation* (or *Create new user*) with the owner's email.
2. Dashboard → SQL Editor, run once:
   ```sql
   select public.bootstrap_admin('owner@example.com');
   ```
   This only works while no active administrator exists, and it can't be called through the API.
3. The owner signs in, opens **Staff & roles**, and invites everyone else.

## 6. Configure the business

Sign in as the administrator → **Business settings**:
- Business name, contact details (they appear on statements and receipts)
- Currency (default KES, 2 decimals). It is locked once the first sale is recorded.
- Timezone (default Africa/Nairobi)
- **When a plot becomes Sold** and **separate payment verification**. See `docs/DECISIONS.md`.
- Payment methods (M-Pesa, Bank transfer, Cash, Cheque, Other are pre-created)

## 7. Payment reminders (daily)

Dashboard → Database → Extensions → enable **pg_cron**, then in the SQL Editor:

```sql
select cron.schedule('gumado-payment-reminders', '0 6 * * *', $$select public.generate_payment_reminders()$$);
```

That runs at 06:00 UTC (09:00 in Nairobi). It creates in-app notifications for balances due within the
reminder window or overdue, with no duplicates. No email or SMS is sent. Those need a provider (see below).

## 8. Deploy the frontend (Vercel)

1. Import the GitHub repository in Vercel. Framework: **Vite** (settings come from `vercel.json`).
2. Environment variables (Production and Preview):
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon public key
   - Optional: `VITE_CONTACT_EMAIL`, `VITE_CONTACT_PHONE`, `VITE_CONTACT_WHATSAPP`
3. Deploy, then add your custom domain.
4. `vercel.json` sets security headers including a Content-Security-Policy. If you add analytics or
   other third-party scripts, extend the CSP deliberately.

Add the landing-page photographs to `public/images/` (see `public/images/README.md`) before launch.

## 9. Verify before going live

```bash
npm install
npm run typecheck
npm run test:unit
PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres npm run test:db   # needs any PostgreSQL 15+/16
npm run build
```

Then, against the **test** project, run the end-to-end tests:

```bash
E2E_BASE_URL=https://your-preview-url \
E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... E2E_AGENT_EMAIL=... E2E_AGENT_PASSWORD=... \
npx playwright install chromium && npm run test:e2e
```

Finally, walk through the go-live checklist:
- [ ] Sign-up disabled; invite flow works end to end (email arrives, password set, correct role)
- [ ] Password reset email arrives and works
- [ ] An agent cannot see another agent's sales or any admin pages
- [ ] Uploaded document opens via the app; its raw storage URL without a signature returns an error
- [ ] Dashboard totals match a manual check of two or three sales
- [ ] Backups confirmed (below)

---

## Backup and recovery

- **Daily backups** are included on Supabase paid plans. Enable **Point-in-Time Recovery** for a
  business that records money daily. It lets you restore to any second within the retention window.
- **Storage files are not in database backups.** Schedule a periodic copy of the `documents` bucket
  (e.g. `supabase storage cp -r ss:///documents ./backup/documents` or an S3-compatible sync) to a
  separate, access-restricted location.
- **Off-platform copy (recommended weekly):**
  `supabase db dump --data-only -f gumado-$(date +%F).sql` and store it encrypted.
- **Test a restore** every quarter into the test project. A backup that has never been restored is not a backup.
- Financial records are never deleted by the application. Corrections are rejections, reversals and
  cancellations with reasons, all in the audit log, so mistakes don't need a restore.

## Error monitoring

- **Frontend:** add Sentry (or similar) for JavaScript errors and failed requests. Add its domain to
  `connect-src` in the CSP, and scrub personal data (buyer names, phone numbers, ID numbers) in `beforeSend`.
- **Database / API:** Supabase Dashboard → Logs (API, Postgres, Auth, Edge Functions). Set up a
  log drain or alerts on 5xx rates and repeated `42501` (permission) errors.
- **Uptime:** an external monitor on the landing page and on `https://<project>.supabase.co/rest/v1/` (expect 401 without a key).

## Optional integrations (need credentials; not enabled)

| Feature | What's needed |
|---|---|
| Email/SMS payment reminders | A provider account (e.g. an SMTP or SMS gateway such as Africa's Talking) and an Edge Function that reads `notifications`. No code sends messages today. |
| M-Pesa (Daraja) automatic payments | A Safaricom Daraja app, shortcode, passkey and callback URL, plus a reviewed integration. Payments are recorded manually today. |
| Bank feeds | Your bank's API agreement. Not implemented. |

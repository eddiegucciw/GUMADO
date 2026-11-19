# GUMADO security model

## Principles
1. **The database is the authority.** Every permission is checked in PostgreSQL (Row Level Security
   and `SECURITY DEFINER` functions). The interface only hides actions you can't take anyway.
2. **Default deny.** `anon` has no access to any table or function. `authenticated` gets only the
   column-level privileges listed in `20261119000600_security.sql`.
3. **Financial writes only through audited functions.** Nobody, administrators included, can insert or
   update `sales` or `payments` directly through the API. `create_sale`, `record_payment`,
   `verify_payment`, `reject_payment`, `reverse_payment` and `cancel_sale` validate input, check
   permissions and lock rows.
4. **Nothing financial is deleted.** Triggers block `DELETE` on sales, payments, plots, buyers,
   documents and the audit log, even for the database owner. Payment amounts and facts are immutable.
   Only the verification status moves, along allowed transitions.

## Authentication
- Supabase Auth (email + password, min 10 characters, sessions persisted with refresh-token rotation).
- Public sign-up is **disabled**. Even if it were enabled by mistake, a new account gets an inactive
  profile with **no role** and sees nothing. A role can only be granted by a user with `users.manage`
  (tested: *users cannot assign themselves a role*).
- The last active administrator can't be removed or demoted.

## Authorisation
- Configurable roles → permissions (`public.permissions`, `public.roles`, `public.role_permissions`).
  The *Administrator* role always holds every permission.
- Sales visibility: `sales.view_all` or `sales.view_own` (agent sees only sales where they are the agent).
  Payments, documents, balances, search and dashboard figures all follow the same rule.
- Buyer identification numbers live in `buyer_identities`, readable only with `buyers.view_sensitive`,
  and are **redacted in the audit log**. ID-document uploads (`buyer_document`) require the same permission.

## Data integrity
- One active sale per plot: a partial unique index `sales_one_active_per_plot` **plus** a row lock in
  `create_sale`. Tested with two simultaneous database sessions.
- Over-collection is impossible: `record_payment` locks the sale row and checks the remaining balance
  (confirmed + pending). Tested with simultaneous sessions.
- Duplicate payments: idempotency key per submission, unique live transaction references per method,
  and a 15-minute "possible duplicate" guard.
- Money is `bigint` minor units (cents). No floating point anywhere in storage or arithmetic.

## Documents
- Private bucket. Upload is a three-step flow: the database validates type and size and registers a
  server-generated path, storage RLS only accepts that exact path from that user within one hour, and
  the upload is confirmed. Downloads use 60-second signed URLs, which storage RLS only grants if the
  user can read the matching `documents` row.
- GUMADO does not verify the legal validity of land documents, and the UI says so.

## Secrets
- Only the anon key and project URL are in the frontend (they are public by design).
- The service-role key is used only inside the `invite-user` Edge Function, injected by Supabase.
- `.gitignore` excludes all `.env*` files except `.env.example`.

## HTTP hardening (`vercel.json`)
HSTS, CSP (`script-src 'self'`, no inline scripts), `X-Frame-Options: DENY`, `nosniff`,
strict referrer policy, and a restrictive Permissions-Policy.

## Error handling
Users see messages written for them (database business errors carry a `hint` code). Unknown errors
show a generic message. SQL and internal details are never displayed.

## Reporting a vulnerability
Contact the system administrator privately. Don't open a public issue.

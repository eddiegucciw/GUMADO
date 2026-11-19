# GUMADO

**Every Plot. Every Transaction. Every Detail.**

Land sales and property management for a land-selling business: plot inventory, buyers, sales,
a payment ledger, private documents, reports, roles and permissions, and a full audit trail.
It works on phones, tablets and desktops.

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS v4, Lucide, Framer Motion (landing page only) |
| Backend | Supabase: PostgreSQL 16, Auth, private Storage, one Edge Function |
| Security | Row Level Security + audited `SECURITY DEFINER` functions (see `docs/SECURITY.md`) |
| Charts / exports | Built-in SVG charts; built-in PDF and Excel (.xlsx) writers. No heavy dependencies. |
| Hosting | Vercel (`vercel.json`) or any static host |

## Quick start (local)

```bash
cp .env.example .env.local        # fill in your TEST Supabase URL + anon key
npm install
supabase db push                  # or: supabase start && supabase db reset (local stack)
npm run dev                       # http://localhost:5173
```

Create the first administrator: see `docs/DEPLOYMENT.md` §5.

## Tests

```bash
npm run test:unit   # money maths, dates/timezone, error mapping, routing, PDF + Excel output
npm run test:db     # 242 assertions + concurrency against real PostgreSQL (needs PG 15+)
npm run typecheck
npm run build
npm run test:e2e    # Playwright against a TEST deployment (desktop + Android viewport)
```

`test:db` builds a fresh database, loads a small stand-in for Supabase's `auth` and `storage`
schemas (`db/harness/`), applies every migration, and runs the suites in `db/tests/`:

1. Registration, activation, self-escalation, last-administrator protection
2. Role permissions for each role, configurable roles, direct-API bypass attempts
3. Plot registration, duplicate references, validation, archiving, history; buyers and ID protection
4. Sale creation, one-active-sale-per-plot, reservations, cancellation, immutability, "fully paid" rule
5. Multiple payments, exact balances, status transitions, verification, rejection, reversal, duplicates, idempotency
6. Document upload authorisation and download permissions
7. Dashboard and report figures against the ledger, search scoping, reminders, notifications
8. **Concurrency:** two simultaneous sales of one plot; simultaneous payments exceeding a balance

## Project layout

```
supabase/migrations/   schema, business logic, views/reports, audit, RLS, storage (apply in order)
supabase/functions/    invite-user Edge Function
db/                    database test harness and suites
src/lib/               money, dates, errors, router, PDF/XLSX writers, exports, statements
src/data/              all database operations (one module per area)
src/auth/              session, profile, permissions
src/ui/                design system: controls, dialogs, toasts, tables, charts
src/app/               authenticated shell: sidebar, mobile navigation, search, notifications
src/pages/             landing, auth, and every app screen
tests/unit, tests/e2e  unit and end-to-end tests
docs/                  DEPLOYMENT, SECURITY, DECISIONS (business rules to confirm)
```

## Important

- No demo data ships with the app. Use a separate test project for trials.
- Payments are recorded manually. There is no live M-Pesa or bank integration.
- GUMADO stores documents; it does not verify their legal validity.

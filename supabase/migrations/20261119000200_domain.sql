-- ============================================================================
-- GUMADO · 0200 · Domain tables
-- Money is stored as BIGINT in minor units (e.g. cents). Never floating point.
-- ============================================================================

create type public.plot_status    as enum ('available', 'reserved', 'sold', 'unavailable');
create type public.sale_status    as enum ('active', 'cancelled');
create type public.payment_status as enum ('pending', 'confirmed', 'rejected', 'reversed');
create type public.document_category as enum (
  'sale_agreement', 'title_document', 'payment_receipt', 'buyer_document', 'plot_record', 'plot_photo', 'other'
);

-- ---------------------------------------------------------------------------
-- Buyers
-- ---------------------------------------------------------------------------
create table public.buyers (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null check (length(btrim(full_name)) between 2 and 160),
  phone         text not null check (phone ~ '^\+?[0-9 ()-]{7,20}$'),
  email         text check (email is null or (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254)),
  address       text check (address is null or length(address) <= 500),
  registered_on date not null default public.business_today(),
  notes         text check (notes is null or length(notes) <= 4000),
  archived_at   timestamptz,
  archived_by   uuid references public.profiles(id),
  created_by    uuid references public.profiles(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index buyers_name_trgm  on public.buyers using gin (full_name extensions.gin_trgm_ops);
create index buyers_phone_trgm on public.buyers using gin (phone extensions.gin_trgm_ops);
create index buyers_active_idx on public.buyers (created_at desc) where archived_at is null;

-- Sensitive identification is kept apart so it can be restricted separately.
create table public.buyer_identities (
  buyer_id   uuid primary key references public.buyers(id) on delete cascade,
  id_type    text not null check (id_type in ('national_id', 'passport', 'alien_id', 'company_registration', 'other')),
  id_number  text not null check (length(btrim(id_number)) between 3 and 40),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create unique index buyer_identities_unique on public.buyer_identities (id_type, upper(btrim(id_number)));

-- ---------------------------------------------------------------------------
-- Plots
-- ---------------------------------------------------------------------------
create table public.plots (
  id                    uuid primary key default gen_random_uuid(),
  reference             text not null check (reference ~ '^[A-Za-z0-9][A-Za-z0-9/_.-]{0,39}$'),
  name                  text not null check (length(btrim(name)) between 1 and 160),
  description           text check (description is null or length(description) <= 4000),
  county                text not null check (length(btrim(county)) between 2 and 80),
  town                  text check (town is null or length(town) <= 120),
  estate                text check (estate is null or length(estate) <= 160),
  location              text check (location is null or length(location) <= 300),
  size                  numeric(14,4) not null check (size > 0),
  size_unit             text not null check (size_unit in ('acres', 'hectares', 'square_metres', 'square_feet')),
  asking_price          bigint not null check (asking_price >= 0),
  status                public.plot_status not null default 'available',
  reserved_for_buyer_id uuid references public.buyers(id),
  reserved_until        date,
  registered_on         date not null default public.business_today(),
  latitude              numeric(9,6) check (latitude between -90 and 90),
  longitude             numeric(9,6) check (longitude between -180 and 180),
  notes                 text check (notes is null or length(notes) <= 4000),
  archived_at           timestamptz,
  archived_by           uuid references public.profiles(id),
  created_by            uuid references public.profiles(id) default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint plots_coordinates_pair check ((latitude is null) = (longitude is null)),
  constraint plots_reservation_consistent check (
    (status = 'reserved') = (reserved_for_buyer_id is not null)
  ),
  constraint plots_archive_status check (archived_at is null or status in ('available', 'unavailable'))
);
-- Plot references are unique regardless of case or archive state.
create unique index plots_reference_unique on public.plots (upper(reference));
create index plots_status_idx  on public.plots (status) where archived_at is null;
create index plots_county_idx  on public.plots (county);
create index plots_ref_trgm    on public.plots using gin (reference extensions.gin_trgm_ops);
create index plots_text_trgm   on public.plots using gin ((coalesce(name,'') || ' ' || county || ' ' || coalesce(town,'') || ' ' || coalesce(estate,'') || ' ' || coalesce(location,'')) extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Payment methods (configurable)
-- ---------------------------------------------------------------------------
create table public.payment_methods (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (length(btrim(name)) between 2 and 40),
  requires_reference boolean not null default false,
  is_active          boolean not null default true,
  sort_order         integer not null default 100,
  created_at         timestamptz not null default now()
);
create unique index payment_methods_name_unique on public.payment_methods (lower(name));

insert into public.payment_methods (name, requires_reference, sort_order) values
  ('M-Pesa', true, 10), ('Bank transfer', true, 20), ('Cash', false, 30), ('Cheque', true, 40), ('Other', false, 90);

-- ---------------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------------
create sequence public.sale_reference_seq;
create sequence public.receipt_number_seq;

create table public.sales (
  id                  uuid primary key default gen_random_uuid(),
  reference           text not null unique
                      default ('SAL-' || to_char(public.business_today(), 'YYYY') || '-' || lpad(nextval('public.sale_reference_seq')::text, 6, '0')),
  plot_id             uuid not null references public.plots(id),
  buyer_id            uuid not null references public.buyers(id),
  agent_id            uuid not null references public.profiles(id),
  sale_price          bigint not null check (sale_price > 0),
  deposit_amount      bigint not null default 0,
  sale_date           date not null,
  balance_due_date    date,
  payment_terms       text check (payment_terms is null or length(payment_terms) <= 2000),
  notes               text check (notes is null or length(notes) <= 4000),
  status              public.sale_status not null default 'active',
  cancelled_at        timestamptz,
  cancelled_by        uuid references public.profiles(id),
  cancellation_reason text,
  created_by          uuid not null references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint sales_deposit_range check (deposit_amount >= 0 and deposit_amount <= sale_price),
  constraint sales_due_after_sale check (balance_due_date is null or balance_due_date >= sale_date),
  constraint sales_cancellation_consistent check (
    (status = 'cancelled') = (cancelled_at is not null)
    and (status <> 'cancelled' or length(btrim(coalesce(cancellation_reason, ''))) >= 5)
  )
);
-- THE core integrity rule: at most one active sale per plot, enforced by the database.
create unique index sales_one_active_per_plot on public.sales (plot_id) where status = 'active';
create index sales_buyer_idx on public.sales (buyer_id);
create index sales_agent_idx on public.sales (agent_id);
create index sales_date_idx  on public.sales (sale_date desc);
create index sales_ref_trgm  on public.sales using gin (reference extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Payments ledger (append-only; corrections are rejections or reversals)
-- ---------------------------------------------------------------------------
create table public.payments (
  id                    uuid primary key default gen_random_uuid(),
  receipt_number        text not null unique
                        default ('RCT-' || to_char(public.business_today(), 'YYYY') || '-' || lpad(nextval('public.receipt_number_seq')::text, 6, '0')),
  sale_id               uuid not null references public.sales(id),
  buyer_id              uuid not null references public.buyers(id),
  amount                bigint not null check (amount > 0),
  paid_on               date not null,
  method_id             uuid not null references public.payment_methods(id),
  transaction_reference text check (transaction_reference is null or length(btrim(transaction_reference)) between 3 and 60),
  status                public.payment_status not null default 'pending',
  notes                 text check (notes is null or length(notes) <= 2000),
  recorded_by           uuid not null references public.profiles(id),
  recorded_at           timestamptz not null default now(),
  verified_by           uuid references public.profiles(id),
  verified_at           timestamptz,
  reversed_by           uuid references public.profiles(id),
  reversed_at           timestamptz,
  status_reason         text check (status_reason is null or length(status_reason) <= 500),
  client_request_id     uuid unique,
  constraint payments_verification_consistent check (
    (status = 'pending') = (verified_at is null)
    and (status <> 'reversed' or reversed_at is not null)
    and (status not in ('rejected', 'reversed') or length(btrim(coalesce(status_reason, ''))) >= 5)
  )
);
-- The same transaction code (e.g. an M-Pesa code) cannot be used twice for live payments.
create unique index payments_unique_live_reference
  on public.payments (method_id, upper(btrim(transaction_reference)))
  where transaction_reference is not null and status in ('pending', 'confirmed');
create index payments_sale_idx    on public.payments (sale_id);
create index payments_buyer_idx   on public.payments (buyer_id);
create index payments_paid_on_idx on public.payments (paid_on desc);
create index payments_pending_idx on public.payments (recorded_at) where status = 'pending';
create index payments_ref_trgm    on public.payments using gin ((coalesce(transaction_reference,'') || ' ' || receipt_number) extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Documents (files live in the PRIVATE storage bucket "documents")
-- ---------------------------------------------------------------------------
create table public.documents (
  id                  uuid primary key default gen_random_uuid(),
  storage_path        text not null unique,
  file_name           text not null check (length(file_name) between 1 and 200),
  mime_type           text not null,
  size_bytes          bigint not null check (size_bytes > 0),
  category            public.document_category not null,
  description         text check (description is null or length(description) <= 500),
  plot_id             uuid references public.plots(id),
  buyer_id            uuid references public.buyers(id),
  sale_id             uuid references public.sales(id),
  uploaded_by         uuid not null references public.profiles(id),
  created_at          timestamptz not null default now(),
  upload_confirmed_at timestamptz,
  archived_at         timestamptz,
  archived_by         uuid references public.profiles(id),
  constraint documents_linked check (num_nonnulls(plot_id, buyer_id, sale_id) >= 1)
);
create index documents_plot_idx  on public.documents (plot_id)  where plot_id is not null;
create index documents_buyer_idx on public.documents (buyer_id) where buyer_id is not null;
create index documents_sale_idx  on public.documents (sale_id)  where sale_id is not null;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind         text not null check (kind in ('sale_created','payment_recorded','payment_confirmed','payment_rejected',
                                              'payment_reversed','sale_cancelled','plot_reserved','plot_status_changed',
                                              'payment_due_soon','payment_overdue')),
  title        text not null,
  body         text,
  entity_type  text check (entity_type in ('plot','buyer','sale','payment')),
  entity_id    uuid,
  dedupe_key   text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create unique index notifications_dedupe on public.notifications (recipient_id, kind, entity_id, dedupe_key)
  where dedupe_key is not null;

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id             bigint generated always as identity primary key,
  occurred_at    timestamptz not null default now(),
  actor_id       uuid,
  action         text not null,
  table_name     text not null,
  record_id      uuid,
  old_data       jsonb,
  new_data       jsonb,
  changed_fields text[]
);
create index audit_log_record_idx on public.audit_log (table_name, record_id, occurred_at desc);
create index audit_log_time_idx   on public.audit_log (occurred_at desc);
create index audit_log_actor_idx  on public.audit_log (actor_id, occurred_at desc);

-- Now that sales exist, attach the settings guard.
create trigger business_settings_guard before update on public.business_settings
  for each row execute function public.tg_business_settings_guard();

-- updated_at maintenance
create function public.tg_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger buyers_touch before update on public.buyers for each row execute function public.tg_touch_updated_at();
create trigger plots_touch  before update on public.plots  for each row execute function public.tg_touch_updated_at();
create trigger sales_touch  before update on public.sales  for each row execute function public.tg_touch_updated_at();
create trigger identities_touch before update on public.buyer_identities for each row execute function public.tg_touch_updated_at();

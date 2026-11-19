-- ============================================================================
-- GUMADO · 0100 · Foundation
-- Business settings, roles & permissions, staff profiles, authorization helpers
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Business settings (single row: this deployment serves one business)
-- ---------------------------------------------------------------------------
create table public.business_settings (
  id                    boolean primary key default true check (id),
  business_name         text not null default 'GUMADO' check (length(btrim(business_name)) between 1 and 120),
  contact_email         text check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone         text check (contact_phone is null or contact_phone ~ '^\+?[0-9 ()-]{7,20}$'),
  postal_address        text check (postal_address is null or length(postal_address) <= 300),
  currency_code         char(3) not null default 'KES' check (currency_code ~ '^[A-Z]{3}$'),
  currency_minor_units  smallint not null default 2 check (currency_minor_units between 0 and 3),
  timezone              text not null default 'Africa/Nairobi',
  -- When does a plot become "sold"?  'sale_created' (on signing) or 'fully_paid'
  -- (plot stays "reserved" for the buyer until confirmed payments cover the price).
  plot_sold_on          text not null default 'sale_created' check (plot_sold_on in ('sale_created', 'fully_paid')),
  -- If true, the person who records a payment cannot also confirm it.
  require_separate_verifier boolean not null default false,
  due_soon_days         integer not null default 7 check (due_soon_days between 1 and 90),
  max_upload_mb         integer not null default 20 check (max_upload_mb between 1 and 50),
  updated_at            timestamptz not null default now(),
  updated_by            uuid
);

insert into public.business_settings (id) values (true);

-- Validate timezone and block currency changes once money has been recorded.
create function public.tg_business_settings_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown timezone "%".', new.timezone using errcode = '22023', hint = 'INVALID_TIMEZONE';
  end if;
  if (new.currency_code, new.currency_minor_units) is distinct from (old.currency_code, old.currency_minor_units)
     and exists (select 1 from public.sales) then
    raise exception 'Currency cannot be changed after sales have been recorded.'
      using errcode = 'P0001', hint = 'CURRENCY_LOCKED';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- (trigger attached in 0200 once public.sales exists)

-- Today's date in the business timezone. All "today" logic uses this.
create function public.business_today()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone coalesce((select timezone from public.business_settings limit 1), 'Africa/Nairobi'))::date;
$$;

-- ---------------------------------------------------------------------------
-- Roles & permissions (configurable)
-- ---------------------------------------------------------------------------
create table public.permissions (
  key         text primary key check (key ~ '^[a-z]+\.[a-z_]+$'),
  category    text not null,
  description text not null
);

create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name        text not null check (length(btrim(name)) between 2 and 60),
  description text check (description is null or length(description) <= 300),
  is_system   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.role_permissions (
  role_id        uuid not null references public.roles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);

insert into public.permissions (key, category, description) values
  ('plots.view',            'Plots',      'View plot inventory'),
  ('plots.manage',          'Plots',      'Register and edit plots'),
  ('plots.archive',         'Plots',      'Archive and restore plots'),
  ('buyers.view',           'Buyers',     'View buyer profiles and contact details'),
  ('buyers.manage',         'Buyers',     'Register and edit buyers'),
  ('buyers.view_sensitive', 'Buyers',     'View and edit buyer identification details and ID documents'),
  ('buyers.export',         'Buyers',     'Export buyer records'),
  ('buyers.archive',        'Buyers',     'Archive and restore buyers'),
  ('sales.view_all',        'Sales',      'View all sales'),
  ('sales.view_own',        'Sales',      'View sales where they are the agent'),
  ('sales.create',          'Sales',      'Record sales and reserve plots'),
  ('sales.edit',            'Sales',      'Edit sale terms, notes, due dates and agent'),
  ('sales.cancel',          'Sales',      'Cancel sales (kept on record with a reason)'),
  ('payments.view',         'Payments',   'View payment records'),
  ('payments.record',       'Payments',   'Record payments'),
  ('payments.verify',       'Payments',   'Confirm or reject recorded payments'),
  ('payments.reverse',      'Payments',   'Reverse confirmed payments (with a reason)'),
  ('documents.view',        'Documents',  'View and download documents'),
  ('documents.upload',      'Documents',  'Upload documents'),
  ('documents.archive',     'Documents',  'Archive documents'),
  ('reports.view',          'Reports',    'View dashboard analytics and reports'),
  ('reports.export',        'Reports',    'Export and print reports'),
  ('audit.view',            'Administration', 'Review the audit log'),
  ('users.manage',          'Administration', 'Invite staff, assign roles, manage permissions'),
  ('settings.manage',       'Administration', 'Configure business settings and payment methods');

insert into public.roles (key, name, description, is_system) values
  ('administrator',   'Administrator',   'Full business access. Always holds every permission.', true),
  ('sales_agent',     'Sales Agent',     'Plot inventory, buyer registration and own sales.',    false),
  ('finance_officer', 'Finance Officer', 'Payments, balances and payment reports.',              false),
  ('read_only',       'Read-only Staff', 'View records only.',                                   false);

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r cross join public.permissions p where r.key = 'administrator';

insert into public.role_permissions (role_id, permission_key)
select r.id, k from public.roles r, unnest(array[
  'plots.view','buyers.view','buyers.manage','sales.view_own','sales.create',
  'payments.view','payments.record','documents.view','documents.upload'
]) k where r.key = 'sales_agent';

insert into public.role_permissions (role_id, permission_key)
select r.id, k from public.roles r, unnest(array[
  'plots.view','buyers.view','sales.view_all','payments.view','payments.record','payments.verify',
  'documents.view','documents.upload','reports.view','reports.export'
]) k where r.key = 'finance_officer';

insert into public.role_permissions (role_id, permission_key)
select r.id, k from public.roles r, unnest(array[
  'plots.view','buyers.view','sales.view_all','payments.view','documents.view','reports.view'
]) k where r.key = 'read_only';

-- ---------------------------------------------------------------------------
-- Staff profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null check (length(email) <= 254),
  full_name   text not null default '' check (length(full_name) <= 120),
  phone       text check (phone is null or phone ~ '^\+?[0-9 ()-]{7,20}$'),
  role_id     uuid references public.roles(id) on delete restrict,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_role_idx on public.profiles(role_id);
create unique index profiles_email_unique on public.profiles (lower(email));

-- New auth users get an INACTIVE profile with NO role. Access is granted only by
-- an administrator (or the invite Edge Function). Self-registration therefore
-- cannot grant itself any access, even if sign-ups are accidentally enabled.
create function public.tg_handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Authorization helpers (used by RLS policies and functions)
-- ---------------------------------------------------------------------------
create function public.has_permission(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.profiles pr
    join public.role_permissions rp on rp.role_id = pr.role_id
    where pr.id = auth.uid() and pr.is_active and rp.permission_key = p_key
  );
$$;

create function public.is_active_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active and role_id is not null);
$$;

-- Raises unless the caller holds the permission.
create function public.require_permission(p_key text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission(p_key) then
    raise exception 'You do not have permission to do this.' using errcode = '42501', hint = 'FORBIDDEN';
  end if;
end $$;

-- The current user's profile + permissions (for the app shell).
create function public.my_access()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', pr.id,
    'email', pr.email,
    'full_name', pr.full_name,
    'phone', pr.phone,
    'is_active', pr.is_active,
    'role', case when r.id is null then null else jsonb_build_object('id', r.id, 'key', r.key, 'name', r.name) end,
    'permissions', coalesce((
      select jsonb_agg(rp.permission_key order by rp.permission_key)
      from public.role_permissions rp where rp.role_id = pr.role_id and pr.is_active
    ), '[]'::jsonb)
  )
  from public.profiles pr left join public.roles r on r.id = pr.role_id
  where pr.id = auth.uid();
$$;

-- Was this statement issued directly by an API user (vs. from inside a trusted
-- SECURITY DEFINER function, which runs as the function owner)?
create function public.is_direct_api_call()
returns boolean language sql stable set search_path = '' as $$
  select current_user in ('authenticated', 'anon');
$$;

-- ---------------------------------------------------------------------------
-- Guards: profiles (no self-escalation, never lose the last administrator)
-- ---------------------------------------------------------------------------
-- Elevated lookups used by the (non-elevated) profile guard.
create function public.administrator_role_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.roles where key = 'administrator';
$$;

create function public.other_active_admin_exists(p_excluding uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                 where role_id = public.administrator_role_id() and is_active and id <> p_excluding);
$$;

-- NOTE: deliberately NOT security definer, so is_direct_api_call() sees the real caller.
create function public.tg_profiles_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  admin_role uuid := public.administrator_role_id();
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.email <> old.email then
      raise exception 'Profile identity cannot be changed.' using errcode = '42501', hint = 'FORBIDDEN';
    end if;
    if (new.role_id, new.is_active) is distinct from (old.role_id, old.is_active) then
      if public.is_direct_api_call() and not public.has_permission('users.manage') then
        raise exception 'Only administrators can change roles or access.' using errcode = '42501', hint = 'FORBIDDEN';
      end if;
      if old.role_id = admin_role and old.is_active
         and (new.role_id is distinct from admin_role or not new.is_active)
         and not public.other_active_admin_exists(old.id) then
        raise exception 'GUMADO must always have at least one active administrator.'
          using errcode = 'P0001', hint = 'LAST_ADMIN';
      end if;
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.tg_profiles_guard();

-- The administrator role always holds every permission.
create function public.tg_role_permissions_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' and exists (select 1 from public.roles where id = old.role_id and key = 'administrator')
     and exists (select 1 from public.permissions where key = old.permission_key) then
    raise exception 'The Administrator role always has every permission.' using errcode = 'P0001', hint = 'ADMIN_ROLE_LOCKED';
  end if;
  return coalesce(new, old);
end $$;

create trigger role_permissions_guard before delete on public.role_permissions
  for each row execute function public.tg_role_permissions_guard();

create function public.tg_roles_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and old.is_system then
    raise exception 'System roles cannot be deleted.' using errcode = 'P0001', hint = 'SYSTEM_ROLE';
  end if;
  if tg_op = 'UPDATE' and old.is_system and (new.key <> old.key or not new.is_system) then
    raise exception 'System roles cannot be renamed.' using errcode = 'P0001', hint = 'SYSTEM_ROLE';
  end if;
  if tg_op = 'DELETE' and exists (select 1 from public.profiles where role_id = old.id) then
    raise exception 'Reassign staff members before deleting this role.' using errcode = 'P0001', hint = 'ROLE_IN_USE';
  end if;
  return coalesce(new, old);
end $$;

create trigger roles_guard before update or delete on public.roles
  for each row execute function public.tg_roles_guard();

create function public.tg_permissions_grant_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.role_permissions (role_id, permission_key)
  select id, new.key from public.roles where key = 'administrator'
  on conflict do nothing;
  return new;
end $$;

create trigger permissions_grant_admin after insert on public.permissions
  for each row execute function public.tg_permissions_grant_admin();

-- ---------------------------------------------------------------------------
-- First administrator. Run ONCE from the Supabase SQL editor (not callable from
-- the API):   select public.bootstrap_admin('owner@example.com');
-- ---------------------------------------------------------------------------
create function public.bootstrap_admin(p_email text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if exists (select 1 from public.profiles p join public.roles r on r.id = p.role_id
             where r.key = 'administrator' and p.is_active) then
    raise exception 'An active administrator already exists. Use the Users screen to add more.';
  end if;
  select id into v_id from public.profiles where lower(email) = lower(btrim(p_email));
  if v_id is null then
    raise exception 'No user with email %. Create the user in Authentication → Users first.', p_email;
  end if;
  update public.profiles
     set role_id = (select id from public.roles where key = 'administrator'), is_active = true
   where id = v_id;
  return 'Administrator access granted to ' || p_email;
end $$;

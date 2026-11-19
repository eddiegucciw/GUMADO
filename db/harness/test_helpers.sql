-- Test helpers (loaded only in test databases).
create schema tests;
grant usage on schema tests to authenticated, anon;

-- Create a staff member with a role (role_key null = no role / inactive).
create function tests.create_user(p_email text, p_role_key text, p_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into auth.users (email, raw_user_meta_data)
  values (p_email, jsonb_build_object('full_name', coalesce(p_name, split_part(p_email, '@', 1))))
  returning id into v_id;
  if p_role_key is not null then
    update public.profiles set role_id = (select id from public.roles where key = p_role_key), is_active = true
     where id = v_id;
  end if;
  return v_id;
end $$;

-- Act as an API user (role "authenticated" + JWT subject), exactly like PostgREST.
create function tests.login(p_user uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  execute 'set local role authenticated';
end $$;

create function tests.login_anon() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end $$;

-- Back to the database owner (for test setup).
create function tests.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

create function tests.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'not ok - %', p_msg;
  end if;
  raise notice 'ok - %', p_msg;
end $$;

create function tests.eq(p_actual anyelement, p_expected anyelement, p_msg text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'not ok - % (expected %, got %)', p_msg, p_expected, p_actual;
  end if;
  raise notice 'ok - %', p_msg;
end $$;

-- Assert that a statement fails. p_expect matches the error hint, SQLSTATE, or part of the message.
create function tests.throws(p_sql text, p_expect text, p_msg text) returns void language plpgsql as $$
declare
  v_hint text; v_text text; v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint, v_text = message_text, v_state = returned_sqlstate;
    if p_expect is null or v_hint = p_expect or v_state = p_expect or v_text ilike '%' || p_expect || '%' then
      raise notice 'ok - %', p_msg;
      return;
    end if;
    raise exception 'not ok - % (expected "%", got [%] % / hint %)', p_msg, p_expect, v_state, v_text, v_hint;
  end;
  raise exception 'not ok - % (statement succeeded but should have failed)', p_msg;
end $$;

create function tests.lives(p_sql text, p_msg text) returns void language plpgsql as $$
declare v_text text; v_hint text;
begin
  execute p_sql;
  raise notice 'ok - %', p_msg;
exception when others then
  get stacked diagnostics v_text = message_text, v_hint = pg_exception_hint;
  raise exception 'not ok - % (failed: % / hint %)', p_msg, v_text, v_hint;
end $$;


-- Common fixture: a sale-ready world. Returns ids as jsonb.
create function tests.fixture() returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := tests.create_user('admin@gumado.test', 'administrator', 'Ada Admin');
  v_agent uuid := tests.create_user('agent@gumado.test', 'sales_agent', 'Sam Agent');
  v_agent2 uuid := tests.create_user('agent2@gumado.test', 'sales_agent', 'Tia Agent');
  v_fin   uuid := tests.create_user('finance@gumado.test', 'finance_officer', 'Fay Finance');
  v_ro    uuid := tests.create_user('viewer@gumado.test', 'read_only', 'Vic Viewer');
  v_none  uuid := tests.create_user('nobody@gumado.test', null, 'No Role');
  v_plot1 uuid; v_plot2 uuid; v_plot3 uuid; v_buyer1 uuid; v_buyer2 uuid;
begin
  insert into public.plots (reference, name, county, town, estate, size, size_unit, asking_price, created_by)
  values ('KJD/001', 'Plot 1, Phase I', 'Kajiado', 'Kitengela', 'Acacia Gardens', 0.125, 'acres', 150000000, v_admin)
  returning id into v_plot1;
  insert into public.plots (reference, name, county, town, estate, size, size_unit, asking_price, created_by)
  values ('KJD/002', 'Plot 2, Phase I', 'Kajiado', 'Kitengela', 'Acacia Gardens', 0.125, 'acres', 160000000, v_admin)
  returning id into v_plot2;
  insert into public.plots (reference, name, county, town, size, size_unit, asking_price, created_by)
  values ('MKS/101', 'Malaa corner plot', 'Machakos', 'Malaa', 0.25, 'acres', 90000000, v_admin)
  returning id into v_plot3;
  insert into public.buyers (full_name, phone, email, created_by) values ('Wanjiru Kamau', '+254700000001', 'wanjiru@example.com', v_admin)
  returning id into v_buyer1;
  insert into public.buyers (full_name, phone, created_by) values ('Otieno Ouma', '+254700000002', v_admin)
  returning id into v_buyer2;
  perform set_config('tests.ctx', jsonb_build_object('admin', v_admin, 'agent', v_agent, 'agent2', v_agent2,
    'finance', v_fin, 'viewer', v_ro, 'nobody', v_none, 'plot1', v_plot1, 'plot2', v_plot2, 'plot3', v_plot3,
    'buyer1', v_buyer1, 'buyer2', v_buyer2,
    'mpesa', (select id from public.payment_methods where name = 'M-Pesa'),
    'cash',  (select id from public.payment_methods where name = 'Cash'))::text, false);
  return jsonb_build_object('admin', v_admin, 'agent', v_agent, 'agent2', v_agent2, 'finance', v_fin, 'viewer', v_ro,
    'nobody', v_none, 'plot1', v_plot1, 'plot2', v_plot2, 'plot3', v_plot3, 'buyer1', v_buyer1, 'buyer2', v_buyer2,
    'mpesa', (select id from public.payment_methods where name = 'M-Pesa'),
    'cash',  (select id from public.payment_methods where name = 'Cash'));
end $$;

-- Look up a fixture id by name: tests.id('agent')
create function tests.id(p_key text) returns uuid language sql stable as $$
  select (current_setting('tests.ctx')::jsonb ->> p_key)::uuid;
$$;

grant execute on all functions in schema tests to authenticated, anon;

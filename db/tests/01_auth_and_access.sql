-- Registration, profiles, activation, self-escalation, last-admin protection.
begin;
select tests.fixture();

-- A newly registered auth user gets an inactive profile with no role.
select tests.logout();
insert into auth.users (email) values ('walkin@example.com');
select tests.eq((select is_active from public.profiles where email = 'walkin@example.com'), false,
  'new sign-up gets an inactive profile');
select tests.ok((select role_id is null from public.profiles where email = 'walkin@example.com'),
  'new sign-up gets no role');

-- That user cannot see any business data.
select tests.login((select id from public.profiles where email = 'walkin@example.com'));
select tests.eq((select count(*) from public.plots), 0::bigint, 'unapproved user sees no plots');
select tests.eq((select count(*) from public.buyers), 0::bigint, 'unapproved user sees no buyers');
select tests.eq((select count(*) from public.v_sales), 0::bigint, 'unapproved user sees no sales');
select tests.eq((select count(*) from public.profiles), 1::bigint, 'unapproved user sees only their own profile');
select tests.eq(jsonb_array_length(public.my_access() -> 'permissions'), 0, 'unapproved user has no permissions');
select tests.throws($$ select public.dashboard_summary(current_date - 30, current_date) $$, 'FORBIDDEN',
  'unapproved user cannot load the dashboard');

-- ...and cannot grant themselves a role.
select tests.throws($$ update public.profiles set role_id = (select id from public.roles where key = 'administrator'),
                         is_active = true where id = auth.uid() $$, 'FORBIDDEN',
  'users cannot assign themselves a role');

-- They can edit their own name.
select tests.lives($$ update public.profiles set full_name = 'Walk In' where id = auth.uid() $$, 'users can edit their own name');

-- Anonymous visitors get nothing at all.
select tests.login_anon();
select tests.throws($$ select count(*) from public.plots $$, '42501', 'anon cannot read plots');
select tests.throws($$ select count(*) from public.v_sales $$, '42501', 'anon cannot read sales');
select tests.throws($$ select public.my_access() $$, '42501', 'anon cannot call the API functions');

-- bootstrap_admin is not exposed to API users.
select tests.login(tests.id('agent'));
select tests.throws($$ select public.bootstrap_admin('agent@gumado.test') $$, '42501',
  'bootstrap_admin cannot be called through the API');

-- An administrator can approve and assign roles.
select tests.login(tests.id('admin'));
select tests.lives($$ update public.profiles set role_id = (select id from public.roles where key = 'sales_agent'), is_active = true
                      where email = 'walkin@example.com' $$, 'administrator can activate a user and assign a role');
select tests.login((select id from public.profiles where email = 'walkin@example.com'));
select tests.ok((public.my_access() -> 'permissions') ? 'sales.create', 'activated agent receives role permissions');
select tests.ok(not ((public.my_access() -> 'permissions') ? 'users.manage'), 'agent does not receive admin permissions');

-- Deactivation removes access immediately.
select tests.login(tests.id('admin'));
update public.profiles set is_active = false where email = 'walkin@example.com';
select tests.login((select id from public.profiles where email = 'walkin@example.com'));
select tests.eq((select count(*) from public.plots), 0::bigint, 'deactivated user loses access immediately');

-- The last active administrator cannot be removed.
select tests.login(tests.id('admin'));
select tests.throws($$ update public.profiles set is_active = false where id = auth.uid() $$, 'LAST_ADMIN',
  'the last administrator cannot deactivate themselves');
select tests.throws($$ update public.profiles set role_id = (select id from public.roles where key = 'read_only') where id = auth.uid() $$,
  'LAST_ADMIN', 'the last administrator cannot demote themselves');

-- Administrator role always holds every permission.
select tests.throws($$ delete from public.role_permissions where permission_key = 'plots.view'
                         and role_id = (select id from public.roles where key = 'administrator') $$, 'ADMIN_ROLE_LOCKED',
  'permissions cannot be removed from the Administrator role');
select tests.throws($$ delete from public.roles where key = 'administrator' $$, 'SYSTEM_ROLE', 'system roles cannot be deleted');

-- Profile identity is immutable.
select tests.throws($$ update public.profiles set id = gen_random_uuid() where id = auth.uid() $$, '42501',
  'profile ids cannot be changed');

-- bootstrap_admin refuses once an admin exists.
select tests.logout();
select tests.throws($$ select public.bootstrap_admin('agent@gumado.test') $$, 'already exists',
  'bootstrap_admin refuses when an administrator already exists');

rollback;

-- bootstrap_admin works on a fresh system.
begin;
select tests.logout();
insert into auth.users (email) values ('Owner@Example.com');
select tests.eq(public.bootstrap_admin('owner@example.com'), 'Administrator access granted to owner@example.com',
  'bootstrap_admin grants the first administrator (case-insensitive email)');
select tests.login((select id from public.profiles where email = 'Owner@Example.com'));
select tests.ok((public.my_access() -> 'permissions') ? 'settings.manage', 'bootstrapped admin has full permissions');
rollback;

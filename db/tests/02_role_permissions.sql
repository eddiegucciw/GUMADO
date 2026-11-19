-- Role permissions are enforced by the database, not the UI.
begin;
select tests.fixture();

-- Admin records a sale for agent2 so we can test visibility.
select tests.login(tests.id('admin'));
select public.create_sale(tests.id('plot2'), tests.id('buyer2'), 160000000, public.business_today(), p_agent_id => tests.id('agent2'));

-- Sales agent ------------------------------------------------------------------
select tests.login(tests.id('agent'));
select tests.eq((select count(*) from public.plots), 3::bigint, 'agent can view plot inventory');
select tests.throws($$ insert into public.plots (reference, name, county, size, size_unit, asking_price)
                       values ('X/1', 'x', 'Nairobi', 1, 'acres', 1) $$, '42501', 'agent cannot register plots');
select tests.lives($$ insert into public.buyers (full_name, phone) values ('Agent Buyer', '+254711111111') $$,
  'agent can register buyers');
select tests.eq((select count(*) from public.v_sales), 0::bigint, 'agent cannot see another agent''s sales');
select tests.eq((select count(*) from public.sales), 0::bigint, 'agent cannot read other sales from the base table either');
select tests.lives($$ select public.create_sale(tests.id('plot1'), tests.id('buyer1'), 150000000, public.business_today()) $$,
  'agent can record a sale under their own name');
select tests.eq((select count(*) from public.v_sales), 1::bigint, 'agent sees their own sale');
select tests.throws($$ select public.create_sale(tests.id('plot3'), tests.id('buyer1'), 1000, public.business_today(),
                                                p_agent_id => tests.id('agent2')) $$, 'FORBIDDEN',
  'agent cannot record a sale under another agent');
select tests.throws($$ select public.verify_payment(gen_random_uuid()) $$, 'FORBIDDEN', 'agent cannot confirm payments');
select tests.throws($$ select public.cancel_sale((select id from public.v_sales limit 1), 'Buyer withdrew') $$, 'FORBIDDEN',
  'agent cannot cancel sales');
select tests.throws($$ select * from public.report_sales_by_location(current_date - 30, current_date) $$, 'FORBIDDEN',
  'agent cannot run reports');
select tests.eq((select count(*) from public.audit_log), 0::bigint, 'agent cannot read the audit log');
update public.business_settings set business_name = 'Hacked';
select tests.eq((select business_name from public.business_settings), 'GUMADO', 'agent cannot change business settings');

-- Direct API writes to financial tables are impossible for everyone.
select tests.throws($$ insert into public.sales (plot_id, buyer_id, agent_id, sale_price, sale_date, created_by)
                       values (tests.id('plot3'), tests.id('buyer1'), auth.uid(), 1, current_date, auth.uid()) $$, '42501',
  'sales cannot be inserted directly through the API');
select tests.login(tests.id('admin'));
select tests.throws($$ insert into public.payments (sale_id, buyer_id, amount, paid_on, method_id, recorded_by)
                       select id, buyer_id, 100, current_date, tests.id('cash'), auth.uid() from public.sales limit 1 $$, '42501',
  'even administrators cannot insert payments directly');
select tests.throws($$ update public.sales set sale_price = 1 $$, '42501', 'sales cannot be updated directly');
select tests.throws($$ delete from public.plots where id = tests.id('plot3') $$, '42501', 'plots cannot be deleted through the API');
select tests.throws($$ update public.plots set status = 'sold' where id = tests.id('plot3') $$, 'STATUS_CONTROLLED',
  'plot status cannot be set to Sold by hand');

-- Finance officer ----------------------------------------------------------------
select tests.login(tests.id('finance'));
select tests.eq((select count(*) from public.v_sales), 2::bigint, 'finance sees all sales');
select tests.throws($$ select public.create_sale(tests.id('plot3'), tests.id('buyer1'), 1000, public.business_today()) $$, 'FORBIDDEN',
  'finance cannot create sales');
select tests.throws($$ insert into public.buyers (full_name, phone) values ('Nope', '+254722222222') $$, '42501',
  'finance cannot register buyers');
select tests.lives($$ select * from public.report_collections(current_date - 30, current_date) $$, 'finance can run payment reports');

-- Read-only staff ----------------------------------------------------------------
select tests.login(tests.id('viewer'));
select tests.eq((select count(*) from public.v_sales), 2::bigint, 'read-only staff can view sales');
update public.plots set name = 'x' where id = tests.id('plot3');
select tests.eq((select name from public.plots where id = tests.id('plot3')), 'Malaa corner plot', 'read-only staff cannot edit plots');
select tests.throws($$ select public.record_payment((select id from public.v_sales limit 1), 100, current_date, tests.id('cash')) $$,
  'FORBIDDEN', 'read-only staff cannot record payments');
select tests.eq((select count(*) from public.buyer_identities), 0::bigint, 'read-only staff cannot see identification numbers');

-- Configurable roles -------------------------------------------------------------
select tests.login(tests.id('admin'));
insert into public.roles (key, name) values ('site_manager', 'Site Manager');
insert into public.role_permissions (role_id, permission_key)
select id, k from public.roles, unnest(array['plots.view', 'plots.manage']) k where key = 'site_manager';
update public.profiles set role_id = (select id from public.roles where key = 'site_manager') where id = tests.id('viewer');
select tests.login(tests.id('viewer'));
select tests.lives($$ update public.plots set notes = 'Beacon checked' where id = tests.id('plot3') $$,
  'a custom role with plots.manage can edit plots');
select tests.eq((select count(*) from public.v_sales), 0::bigint, 'the custom role sees no sales without a sales permission');

select tests.login(tests.id('agent'));
select tests.throws($$ insert into public.role_permissions (role_id, permission_key)
                       select role_id, 'users.manage' from public.profiles where id = auth.uid() $$, '42501',
  'non-admins cannot grant themselves permissions');
rollback;

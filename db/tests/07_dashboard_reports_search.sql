-- Dashboard and report figures come from real records and agree with each other.
begin;
select tests.fixture();
select tests.login(tests.id('admin'));

-- Two sales: one this period, one in the previous period.
select public.create_sale(tests.id('plot1'), tests.id('buyer1'), 150000000, public.business_today() - 5,
                          p_agent_id => tests.id('agent'));
select public.create_sale(tests.id('plot2'), tests.id('buyer2'), 160000000, public.business_today() - 40,
                          p_agent_id => tests.id('agent2'), p_balance_due_date => public.business_today() - 1);
select public.reserve_plot(tests.id('plot3'), tests.id('buyer1'));

select public.record_payment((select id from public.sales where plot_id = tests.id('plot1')), 50000000, public.business_today() - 3,
                             tests.id('mpesa'), 'MPX001', p_confirm => true);
select public.record_payment((select id from public.sales where plot_id = tests.id('plot1')), 10000000, public.business_today() - 1,
                             tests.id('cash'));  -- pending: never counted as collected
select public.record_payment((select id from public.sales where plot_id = tests.id('plot2')), 40000000, public.business_today() - 35,
                             tests.id('cash'), p_confirm => true);

select set_config('t.d', public.dashboard_summary(public.business_today() - 29, public.business_today())::text, true);
create function pg_temp.d(p text) returns jsonb language sql as $$ select current_setting('t.d')::jsonb #> string_to_array(p, '.') $$;

select tests.eq(pg_temp.d('plots.total')::int, 3, 'dashboard: total plots');
select tests.eq(pg_temp.d('plots.sold')::int, 2, 'dashboard: sold plots');
select tests.eq(pg_temp.d('plots.reserved')::int, 1, 'dashboard: reserved plots');
select tests.eq(pg_temp.d('plots.available')::int, 0, 'dashboard: available plots');
select tests.eq(pg_temp.d('current.sales_value')::bigint, 150000000::bigint, 'dashboard: sales value in the selected period');
select tests.eq(pg_temp.d('current.collected')::bigint, 50000000::bigint, 'dashboard: collected in period counts confirmed payments only');
select tests.eq(pg_temp.d('previous.sales_value')::bigint, 160000000::bigint, 'dashboard: previous period comparison');
select tests.eq(pg_temp.d('previous.collected')::bigint, 40000000::bigint, 'dashboard: previous period collections');
select tests.eq(pg_temp.d('balances.outstanding')::bigint, (150000000 - 50000000 + 160000000 - 40000000)::bigint,
  'dashboard: outstanding = sale prices − confirmed payments');
select tests.eq(pg_temp.d('balances.outstanding')::bigint, (select sum(outstanding) from public.v_sales)::bigint,
  'dashboard outstanding matches the sales ledger exactly');
select tests.eq(pg_temp.d('balances.overdue_count')::int, 1, 'dashboard: overdue sales');
select tests.eq(pg_temp.d('balances.overdue_amount')::bigint, 120000000::bigint, 'dashboard: overdue amount');
select tests.eq(pg_temp.d('balances.awaiting_confirmation')::bigint, 10000000::bigint, 'dashboard: money awaiting confirmation');
select tests.eq(jsonb_array_length(pg_temp.d('series')), 30, 'dashboard: one point per day for a 30-day range');
select tests.eq((select sum((e ->> 'collected')::bigint) from jsonb_array_elements(pg_temp.d('series')) e)::bigint, 50000000::bigint,
  'dashboard: chart series adds up to the period total');

-- Reports use the same numbers.
select tests.eq((select sum(sales_value) from public.report_sales_by_location(public.business_today() - 60, public.business_today()))::bigint,
                310000000::bigint, 'report: sales by location totals all sales in range');
select tests.eq((select outstanding from public.report_sales_by_location(public.business_today() - 60, public.business_today()) where estate = 'Acacia Gardens'),
                (select sum(outstanding) from public.v_sales where estate = 'Acacia Gardens')::bigint,
  'report: location outstanding matches the ledger');
select tests.eq((select sum(amount) from public.report_collections(public.business_today() - 60, public.business_today()))::bigint,
                90000000::bigint, 'report: collections = confirmed payments in range');
select tests.eq((select collected_in_period from public.report_agent_performance(public.business_today() - 29, public.business_today())
                 where agent_id = tests.id('agent')), 50000000::bigint, 'report: agent collections');
select tests.eq((select collected_in_period from public.report_agent_performance(public.business_today() - 29, public.business_today())
                 where agent_id = tests.id('agent2')), 0::bigint, 'report: agent collections are period-bound');

-- An agent's dashboard only counts their own sales.
select tests.login(tests.id('agent'));
select set_config('t.d', public.dashboard_summary(public.business_today() - 29, public.business_today())::text, true);
select tests.eq(pg_temp.d('balances.outstanding')::bigint, 100000000::bigint, 'agent dashboard counts only their own sales');
select tests.eq(pg_temp.d('previous.sales_value')::bigint, 0::bigint, 'agent dashboard excludes other agents'' sales');

-- Search ------------------------------------------------------------------------------------
select tests.login(tests.id('admin'));
select tests.ok(exists (select 1 from public.global_search('KJD/00') where kind = 'plot'), 'search finds plots by reference');
select tests.ok(exists (select 1 from public.global_search('wanjiru') where kind = 'buyer'), 'search finds buyers by name');
select tests.ok(exists (select 1 from public.global_search('SAL-') where kind = 'sale'), 'search finds sales by reference');
select tests.ok(exists (select 1 from public.global_search('mpx001') where kind = 'payment'), 'search finds payments by transaction code');
select tests.ok(exists (select 1 from public.global_search('kitengela') where kind = 'plot'), 'search finds plots by location');
select tests.eq((select count(*) from public.global_search('%')), 0::bigint, 'search treats wildcards literally');
select tests.login(tests.id('agent2'));
select tests.ok(not exists (select 1 from public.global_search('MPX001')), 'search never returns records the user cannot see');

-- Reminders ----------------------------------------------------------------------------------
select tests.logout();
select tests.eq(public.generate_payment_reminders(), 1, 'reminders are generated for overdue balances');
select public.generate_payment_reminders();
select tests.eq((select count(*) from public.notifications where kind = 'payment_overdue' and recipient_id = tests.id('finance')), 1::bigint,
  'running reminders twice does not duplicate notifications');
select tests.login(tests.id('finance'));
select tests.ok((select count(*) from public.notifications) > 0, 'users can read their own notifications');
update public.notifications set read_at = now();
select tests.eq((select count(*) from public.notifications where read_at is null), 0::bigint, 'users can mark notifications read');
select tests.throws($$ update public.notifications set title = 'x' $$, '42501', 'notification content cannot be edited');
select tests.login(tests.id('agent'));
select tests.ok(not exists (select 1 from public.notifications where recipient_id <> auth.uid()), 'users only see their own notifications');
rollback;

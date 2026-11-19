-- Sale creation, one-active-sale-per-plot, reservations, cancellation, immutability.
begin;
select tests.fixture();
select tests.login(tests.id('agent'));

select tests.lives($$ select public.create_sale(tests.id('plot1'), tests.id('buyer1'), 148000000, public.business_today(),
                       p_deposit_amount => 30000000, p_balance_due_date => public.business_today() + 90,
                       p_payment_terms => 'Deposit then 3 monthly instalments') $$, 'agent can create a sale');

select tests.ok((select reference ~ '^SAL-\d{4}-\d{6}$' from public.sales limit 1), 'sales get a SAL-YYYY-NNNNNN reference');
select tests.eq((select status::text from public.plots where id = tests.id('plot1')), 'sold', 'the plot becomes Sold when the sale is created');
select tests.eq((select agent_id from public.sales limit 1), tests.id('agent'), 'the recording agent is attached to the sale');
select tests.eq((select payment_status from public.v_sales limit 1), 'pending', 'a new sale with no payments is Pending');
select tests.eq((select outstanding from public.v_sales limit 1), 148000000::bigint, 'outstanding equals the sale price');

-- One plot, one active sale -------------------------------------------------------
select tests.throws($$ select public.create_sale(tests.id('plot1'), tests.id('buyer2'), 150000000, public.business_today()) $$,
  'PLOT_NOT_AVAILABLE', 'a sold plot cannot be sold to another buyer');
select tests.throws($$ select public.create_sale(tests.id('plot1'), tests.id('buyer1'), 150000000, public.business_today()) $$,
  'PLOT_NOT_AVAILABLE', 'a sold plot cannot be sold twice to the same buyer');

-- Even if the plot's status were wrong, the unique index stops a second active sale.
select tests.logout();
select tests.throws($$ insert into public.sales (plot_id, buyer_id, agent_id, sale_price, sale_date, created_by)
                       values (tests.id('plot1'), tests.id('buyer2'), tests.id('agent'), 1000, current_date, tests.id('agent')) $$,
  'sales_one_active_per_plot', 'the database index prevents two active sales for one plot');
select tests.login(tests.id('agent'));

-- Validation ---------------------------------------------------------------------
select tests.throws($$ select public.create_sale(tests.id('plot2'), tests.id('buyer2'), 0, public.business_today()) $$,
  'INVALID_AMOUNT', 'sale price must be positive');
select tests.throws($$ select public.create_sale(tests.id('plot2'), tests.id('buyer2'), 1000, public.business_today(), p_deposit_amount => 2000) $$,
  'INVALID_DEPOSIT', 'deposit cannot exceed the sale price');
select tests.throws($$ select public.create_sale(tests.id('plot2'), tests.id('buyer2'), 1000, public.business_today() + 1) $$,
  'INVALID_DATE', 'sale date cannot be in the future');
select tests.throws($$ select public.create_sale(tests.id('plot2'), tests.id('buyer2'), 1000, public.business_today(),
                                                p_balance_due_date => public.business_today() - 1) $$,
  'INVALID_DATE', 'balance due date cannot be before the sale date');
select tests.throws($$ select public.create_sale(gen_random_uuid(), tests.id('buyer2'), 1000, public.business_today()) $$,
  'NOT_FOUND', 'unknown plots are rejected');

-- Reservations --------------------------------------------------------------------
select public.reserve_plot(tests.id('plot2'), tests.id('buyer2'));
select tests.throws($$ select public.create_sale(tests.id('plot2'), tests.id('buyer1'), 1000, public.business_today()) $$,
  'PLOT_RESERVED_FOR_OTHER', 'a plot reserved for one buyer cannot be sold to another');
select tests.lives($$ select public.create_sale(tests.id('plot2'), tests.id('buyer2'), 160000000, public.business_today()) $$,
  'a reserved plot can be sold to the buyer it is reserved for');
select tests.eq((select status::text from public.plots where id = tests.id('plot2')), 'sold', 'and it becomes Sold');
select tests.ok((select reserved_for_buyer_id is null from public.plots where id = tests.id('plot2')), 'and the reservation is cleared');

-- Editing --------------------------------------------------------------------------
select tests.login(tests.id('admin'));
select tests.lives($$ select public.update_sale((select id from public.sales where plot_id = tests.id('plot1')),
                       public.business_today() + 120, 'Deposit then 4 instalments', 'Extended by agreement', tests.id('agent2')) $$,
  'sale terms, due date and agent can be edited by permitted staff');
select tests.eq((select agent_id from public.sales where plot_id = tests.id('plot1')), tests.id('agent2'), 'agent reassignment is saved');
select tests.ok((select count(*) from public.audit_log where action = 'sale.edit') = 1, 'sale edits are audited');

-- Cancellation ----------------------------------------------------------------------
select public.record_payment((select id from public.sales where plot_id = tests.id('plot1')), 10000000, public.business_today(),
                             tests.id('cash'), p_confirm => true);
select public.record_payment((select id from public.sales where plot_id = tests.id('plot1')), 5000000, public.business_today(),
                             tests.id('mpesa'), 'QWE123RTY');
select tests.throws($$ select public.cancel_sale((select id from public.sales where plot_id = tests.id('plot1')), 'no') $$,
  'REASON_REQUIRED', 'cancellation requires a reason');
select tests.lives($$ select public.cancel_sale((select id from public.sales where plot_id = tests.id('plot1')), 'Buyer withdrew from the purchase') $$,
  'a sale can be cancelled with a reason');
select tests.eq((select status::text from public.plots where id = tests.id('plot1')), 'available', 'the plot returns to Available');
select tests.eq((select status::text from public.payments where transaction_reference = 'QWE123RTY'), 'rejected',
  'pending payments on a cancelled sale are rejected');
select tests.eq((select count(*) from public.payments where status = 'confirmed'), 1::bigint,
  'confirmed payments stay on record after cancellation');
select tests.eq((select outstanding from public.v_sales where plot_id = tests.id('plot1') and status = 'cancelled'), 0::bigint,
  'cancelled sales have no outstanding balance');
select tests.eq((select payment_status from public.v_sales where plot_id = tests.id('plot1') and status = 'cancelled'), 'cancelled',
  'cancelled sales show a Cancelled payment status');
select tests.throws($$ select public.cancel_sale((select id from public.sales where plot_id = tests.id('plot1')), 'Again please') $$,
  'SALE_NOT_ACTIVE', 'a sale cannot be cancelled twice');
select tests.throws($$ select public.record_payment((select id from public.sales where plot_id = tests.id('plot1')), 100, public.business_today(), tests.id('cash')) $$,
  'SALE_NOT_ACTIVE', 'payments cannot be added to a cancelled sale');
select tests.lives($$ select public.create_sale(tests.id('plot1'), tests.id('buyer2'), 150000000, public.business_today()) $$,
  'after cancellation the plot can be sold again');
select tests.eq((select count(*) from public.sales where plot_id = tests.id('plot1')), 2::bigint,
  'the cancelled sale is kept in history');

-- Immutability -----------------------------------------------------------------------
select tests.logout();
select tests.throws($$ update public.sales set sale_price = 1 where plot_id = tests.id('plot2') $$, 'IMMUTABLE',
  'sale price cannot be changed even by the database owner');
select tests.throws($$ delete from public.sales where plot_id = tests.id('plot2') $$, 'DELETE_FORBIDDEN', 'sales are never deleted');

-- "Fully paid" rule -------------------------------------------------------------------
update public.business_settings set plot_sold_on = 'fully_paid';
select tests.login(tests.id('admin'));
select public.create_sale(tests.id('plot3'), tests.id('buyer1'), 1000000, public.business_today());
select tests.eq((select status::text from public.plots where id = tests.id('plot3')), 'reserved',
  'with the fully-paid rule, a sold-but-unpaid plot is Reserved for the buyer');
select tests.eq((select reserved_for_buyer_id from public.plots where id = tests.id('plot3')), tests.id('buyer1'),
  'and reserved for that buyer');
select public.record_payment((select id from public.sales where plot_id = tests.id('plot3')), 1000000, public.business_today(),
                             tests.id('cash'), p_confirm => true);
select tests.eq((select status::text from public.plots where id = tests.id('plot3')), 'sold', 'it becomes Sold once fully paid');
select public.reverse_payment((select id from public.payments where sale_id = (select id from public.sales where plot_id = tests.id('plot3'))),
                              'Cheque bounced at the bank');
select tests.eq((select status::text from public.plots where id = tests.id('plot3')), 'reserved',
  'reversing the payment returns it to Reserved');

-- Notifications ------------------------------------------------------------------------
select tests.logout();
select tests.ok((select count(*) from public.notifications where kind = 'sale_created' and recipient_id = tests.id('finance')) >= 1,
  'finance staff are notified of new sales');
select tests.ok(not exists (select 1 from public.notifications n join public.sales s on s.id = n.entity_id
                            where n.kind = 'sale_created' and n.recipient_id = s.created_by),
  'the person who recorded a sale is not notified about their own action');
rollback;

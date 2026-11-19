-- Payment ledger: multiple payments, balances, statuses, verification, duplicates, immutability.
begin;
select tests.fixture();
select tests.login(tests.id('agent'));
select public.create_sale(tests.id('plot1'), tests.id('buyer1'), 100000001, public.business_today() - 60,
                          p_balance_due_date => public.business_today() + 30);
select set_config('t.sale', (select id::text from public.sales limit 1), true);
create function pg_temp.sale() returns uuid language sql as $$ select current_setting('t.sale')::uuid $$;

-- Agent records; finance confirms --------------------------------------------------
select tests.lives($$ select public.record_payment(pg_temp.sale(), 30000000, public.business_today() - 50, tests.id('mpesa'), 'RKA1B2C3D4') $$,
  'agent can record a payment');
select tests.eq((select status::text from public.payments limit 1), 'pending', 'agent-recorded payments start as Pending');
select tests.eq((select total_paid from public.v_sales), 0::bigint, 'pending payments are not counted as paid');
select tests.eq((select pending_amount from public.v_sales), 30000000::bigint, 'pending payments are shown separately');
select tests.eq((select payment_status from public.v_sales), 'pending', 'status stays Pending until money is confirmed');

select tests.lives($$ select public.record_payment(pg_temp.sale(), 30000000, public.business_today() - 20, tests.id('cash'), p_confirm => true) $$,
  'agents asking to auto-confirm still create a pending payment');
select tests.eq((select count(*) from public.payments where status = 'pending'), 2::bigint, 'agents cannot self-confirm');

select tests.login(tests.id('finance'));
select tests.lives($$ select public.verify_payment((select id from public.payments where transaction_reference = 'RKA1B2C3D4')) $$,
  'finance can confirm a payment');
select tests.eq((select total_paid from public.v_sales), 30000000::bigint, 'total paid = sum of confirmed payments');
select tests.eq((select outstanding from public.v_sales), 70000001::bigint, 'outstanding = sale price − confirmed payments');
select tests.eq((select payment_status from public.v_sales), 'partially_paid', 'status becomes Partially Paid');
select tests.throws($$ select public.verify_payment((select id from public.payments where transaction_reference = 'RKA1B2C3D4')) $$,
  'INVALID_TRANSITION', 'a confirmed payment cannot be confirmed again');

select tests.throws($$ select public.reject_payment((select id from public.payments where status = 'pending'), 'bad') $$,
  'REASON_REQUIRED', 'rejection requires a reason');
select tests.lives($$ select public.reject_payment((select id from public.payments where status = 'pending'), 'Not received in till') $$,
  'finance can reject a pending payment');
select tests.eq((select total_paid from public.v_sales), 30000000::bigint, 'rejected payments are not counted');

-- Overpayment & duplicates -------------------------------------------------------------
select tests.throws($$ select public.record_payment(pg_temp.sale(), 70000002, public.business_today(), tests.id('cash')) $$,
  'EXCEEDS_BALANCE', 'a payment larger than the balance is refused');
select tests.throws($$ select public.record_payment(pg_temp.sale(), 1000, public.business_today(), tests.id('mpesa'), 'rka1b2c3d4') $$,
  'DUPLICATE_REFERENCE', 'a transaction code cannot be recorded twice (case-insensitive)');
select tests.throws($$ select public.record_payment(pg_temp.sale(), 1000, public.business_today(), tests.id('mpesa')) $$,
  'REFERENCE_REQUIRED', 'M-Pesa payments need a transaction code');
select tests.throws($$ select public.record_payment(pg_temp.sale(), 1000, public.business_today() + 1, tests.id('cash')) $$,
  'INVALID_DATE', 'payment dates cannot be in the future');
select tests.throws($$ select public.record_payment(pg_temp.sale(), 0, public.business_today(), tests.id('cash')) $$,
  'INVALID_AMOUNT', 'payment amounts must be positive');

select set_config('t.req', gen_random_uuid()::text, true);
select tests.lives($$ select public.record_payment(pg_temp.sale(), 20000000, public.business_today() - 10, tests.id('cash'),
                       p_client_request_id => current_setting('t.req')::uuid, p_confirm => true) $$,
  'finance can record and confirm in one step');
select tests.eq(public.record_payment(pg_temp.sale(), 20000000, public.business_today() - 10, tests.id('cash'),
                                      p_client_request_id => current_setting('t.req')::uuid),
                (select id from public.payments where client_request_id = current_setting('t.req')::uuid),
  'a retried submission returns the original payment (idempotent)');
select tests.eq((select count(*) from public.payments where amount = 20000000), 1::bigint, 'and does not create a duplicate');
select tests.throws($$ select public.record_payment(pg_temp.sale(), 20000000, public.business_today() - 10, tests.id('cash')) $$,
  'POSSIBLE_DUPLICATE', 'an identical payment within 15 minutes is flagged as a possible duplicate');
select tests.lives($$ select public.record_payment(pg_temp.sale(), 20000000, public.business_today() - 10, tests.id('cash'),
                       p_confirm => true, p_allow_possible_duplicate => true) $$,
  'staff can deliberately record a genuine repeat payment');

-- Balance and completion (exact integer arithmetic, one-cent precision) ----------------
select tests.eq((select total_paid from public.v_sales), 70000000::bigint, 'three confirmed payments sum exactly');
select tests.eq((select outstanding from public.v_sales), 30000001::bigint, 'outstanding is exact to the cent');
select tests.lives($$ select public.record_payment(pg_temp.sale(), 30000001, public.business_today(), tests.id('cash'), p_confirm => true) $$,
  'the final payment settles the balance');
select tests.eq((select payment_status from public.v_sales), 'completed', 'status becomes Completed');
select tests.eq((select outstanding from public.v_sales), 0::bigint, 'outstanding is zero');
select tests.throws($$ select public.record_payment(pg_temp.sale(), 1, public.business_today(), tests.id('cash')) $$,
  'EXCEEDS_BALANCE', 'no further payments are accepted on a fully paid sale');

-- Reversal -------------------------------------------------------------------------------
select tests.throws($$ select public.reverse_payment((select id from public.payments where amount = 30000001), 'Bounced cheque') $$,
  'FORBIDDEN', 'finance officers cannot reverse payments by default');
select tests.login(tests.id('admin'));
select tests.lives($$ select public.reverse_payment((select id from public.payments where amount = 30000001), 'Bounced cheque returned by bank') $$,
  'administrators can reverse a confirmed payment with a reason');
select tests.eq((select payment_status from public.v_sales), 'partially_paid', 'reversal reopens the balance');
select tests.eq((select outstanding from public.v_sales), 30000001::bigint, 'reversed amounts are no longer counted');
select tests.throws($$ select public.reverse_payment((select id from public.payments where amount = 30000001), 'Twice please') $$,
  'INVALID_TRANSITION', 'a reversed payment cannot be reversed again');

-- Overdue ---------------------------------------------------------------------------------
select tests.logout();
select tests.eq(public.compute_payment_status('active', 1000, 400, date '2026-01-01', date '2026-02-01'), 'overdue',
  'unpaid balance past its due date is Overdue');
select tests.eq(public.compute_payment_status('active', 1000, 0, date '2026-03-01', date '2026-02-01'), 'pending',
  'nothing paid before the due date is Pending');
select tests.eq(public.compute_payment_status('active', 1000, 1000, date '2026-01-01', date '2026-02-01'), 'completed',
  'fully paid is Completed even after the due date');
select tests.eq(public.compute_payment_status('active', 1000, 1, null, date '2026-02-01'), 'partially_paid',
  'partial payment with no due date is Partially Paid');

-- Ledger immutability ------------------------------------------------------------------------
select tests.throws($$ update public.payments set amount = 1 $$, 'IMMUTABLE', 'payment amounts cannot be edited, even by the owner');
select tests.throws($$ update public.payments set status = 'pending' where status = 'rejected' $$, 'INVALID_TRANSITION',
  'rejected payments cannot be re-opened');
select tests.throws($$ delete from public.payments $$, 'DELETE_FORBIDDEN', 'payments are never deleted');
select tests.ok((select count(*) from public.audit_log where table_name = 'payments' and action in ('payment.record','payment.confirm','payment.reject','payment.reverse')) >= 7,
  'every payment action is in the audit log');

-- Separate verifier rule ------------------------------------------------------------------------
update public.business_settings set require_separate_verifier = true;
select tests.login(tests.id('finance'));
select public.record_payment(pg_temp.sale(), 1000, public.business_today(), tests.id('cash'), p_confirm => true);
select tests.eq((select status::text from public.payments where amount = 1000), 'pending',
  'with separate verification, the recorder''s own payment stays pending');
select tests.throws($$ select public.verify_payment((select id from public.payments where amount = 1000)) $$, 'SEPARATE_VERIFIER',
  'and they cannot confirm it themselves');
select tests.login(tests.id('admin'));
select tests.lives($$ select public.verify_payment((select id from public.payments where amount = 1000)) $$,
  'a different staff member can confirm it');

-- Agents only see payments for their own sales ------------------------------------------------------
select tests.login(tests.id('agent2'));
select tests.eq((select count(*) from public.v_payments), 0::bigint, 'agents cannot see payments on other agents'' sales');
select tests.throws($$ select public.record_payment(pg_temp.sale(), 100, public.business_today(), tests.id('cash')) $$, 'NOT_FOUND',
  'agents cannot record payments on other agents'' sales');
rollback;

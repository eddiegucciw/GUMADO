-- Plot registration, duplicate prevention, validation, archiving, history; buyers & identities.
begin;
select tests.fixture();
select tests.login(tests.id('admin'));

-- Plot registration ------------------------------------------------------------
select tests.lives($$ insert into public.plots (reference, name, county, town, estate, location, size, size_unit, asking_price,
                                                latitude, longitude, notes)
                      values ('NRB/77', 'Ruiru half acre', 'Kiambu', 'Ruiru', 'Membley', 'Off Eastern Bypass', 0.5, 'acres',
                              450000000, -1.1458, 36.9603, 'Corner plot') $$,
  'administrator can register a plot with full details');
select tests.eq((select status::text from public.plots where reference = 'NRB/77'), 'available', 'new plots default to Available');
select tests.eq((select created_by from public.plots where reference = 'NRB/77'), tests.id('admin'), 'creator is recorded from the session');

select tests.throws($$ insert into public.plots (reference, name, county, size, size_unit, asking_price)
                       values ('nrb/77', 'Duplicate', 'Kiambu', 1, 'acres', 1) $$, 'plots_reference_unique',
  'duplicate plot references are rejected (case-insensitive)');
select tests.throws($$ insert into public.plots (reference, name, county, size, size_unit, asking_price)
                       values ('BAD REF!', 'x', 'Kiambu', 1, 'acres', 1) $$, 'plots_reference_check',
  'plot references must use letters, digits and / . _ -');
select tests.throws($$ insert into public.plots (reference, name, county, size, size_unit, asking_price)
                       values ('Z/1', 'x', 'Kiambu', 0, 'acres', 1) $$, 'plots_size_check', 'plot size must be positive');
select tests.throws($$ insert into public.plots (reference, name, county, size, size_unit, asking_price)
                       values ('Z/2', 'x', 'Kiambu', 1, 'acres', -5) $$, 'plots_asking_price_check', 'asking price cannot be negative');
select tests.throws($$ insert into public.plots (reference, name, county, size, size_unit, asking_price, latitude)
                       values ('Z/3', 'x', 'Kiambu', 1, 'acres', 1, -1.2) $$, 'plots_coordinates_pair',
  'latitude and longitude must be given together');
select tests.throws($$ insert into public.plots (reference, name, county, size, size_unit, asking_price)
                       values ('Z/4', 'x', 'Kiambu', 1, 'furlongs', 1) $$, 'plots_size_unit_check', 'size unit must be a known unit');
select tests.throws($$ insert into public.plots (reference, name, county, size, size_unit, asking_price, status)
                       values ('Z/5', 'x', 'Kiambu', 1, 'acres', 1, 'sold') $$, 'INVALID_STATUS',
  'new plots cannot be created as Sold');

-- Editing & manual status --------------------------------------------------------
select tests.lives($$ update public.plots set asking_price = 455000000, notes = 'Price revised' where reference = 'NRB/77' $$,
  'plot details can be edited');
select tests.lives($$ update public.plots set status = 'unavailable' where reference = 'NRB/77' $$,
  'plots can be marked Unavailable by hand');
select tests.lives($$ update public.plots set status = 'available' where reference = 'NRB/77' $$, 'and back to Available');
select tests.throws($$ update public.plots set reserved_for_buyer_id = tests.id('buyer1') where reference = 'NRB/77' $$,
  '42501', 'reservations cannot be edited directly');

-- History ---------------------------------------------------------------------
select tests.ok((select count(*) from public.plot_history((select id from public.plots where reference = 'NRB/77'))) >= 4,
  'plot history records registration and every change');
select tests.ok((select bool_or('asking_price' = any(changed_fields)) from public.plot_history((select id from public.plots where reference = 'NRB/77'))),
  'plot history shows which fields changed');

-- Archiving ---------------------------------------------------------------------
select tests.lives($$ select public.set_plot_archived((select id from public.plots where reference = 'NRB/77'), true) $$,
  'an available plot can be archived');
select tests.throws($$ update public.plots set name = 'edit' where reference = 'NRB/77' $$, 'ARCHIVED', 'archived plots are read-only');
select tests.throws($$ select public.create_sale((select id from public.plots where reference = 'NRB/77'), tests.id('buyer1'), 100, public.business_today()) $$,
  'NOT_FOUND', 'archived plots cannot be sold');
select tests.lives($$ select public.set_plot_archived((select id from public.plots where reference = 'NRB/77'), false) $$,
  'archived plots can be restored');
select tests.throws($$ update public.plots set archived_at = now() where reference = 'NRB/77' $$, '42501',
  'archive flags cannot be set directly');

select public.create_sale(tests.id('plot1'), tests.id('buyer1'), 150000000, public.business_today());
select tests.throws($$ select public.set_plot_archived(tests.id('plot1'), true) $$, 'PLOT_IN_USE', 'sold plots cannot be archived');

-- Reservations -----------------------------------------------------------------
select tests.lives($$ select public.reserve_plot(tests.id('plot2'), tests.id('buyer2'), public.business_today() + 14) $$,
  'an available plot can be reserved for a buyer');
select tests.eq((select status::text from public.plots where id = tests.id('plot2')), 'reserved', 'reserved plots show Reserved');
select tests.throws($$ select public.reserve_plot(tests.id('plot2'), tests.id('buyer1')) $$, 'PLOT_NOT_AVAILABLE',
  'a reserved plot cannot be reserved again');
select tests.lives($$ select public.release_plot_reservation(tests.id('plot2')) $$, 'reservations can be released');
select tests.eq((select status::text from public.plots where id = tests.id('plot2')), 'available', 'released plots are Available');

-- Buyers --------------------------------------------------------------------------
select tests.throws($$ insert into public.buyers (full_name, phone) values ('A', '+254700000009') $$, 'buyers_full_name_check',
  'buyer names must be at least 2 characters');
select tests.throws($$ insert into public.buyers (full_name, phone) values ('Valid Name', 'call me') $$, 'buyers_phone_check',
  'buyer phone numbers are validated');
select tests.throws($$ insert into public.buyers (full_name, phone, email) values ('Valid Name', '+254700000010', 'not-an-email') $$,
  'buyers_email_check', 'buyer email addresses are validated');

select tests.lives($$ insert into public.buyer_identities (buyer_id, id_type, id_number) values (tests.id('buyer1'), 'national_id', '12345678') $$,
  'admin can store a buyer''s ID number');
select tests.throws($$ insert into public.buyer_identities (buyer_id, id_type, id_number) values (tests.id('buyer2'), 'national_id', ' 12345678 ') $$,
  'buyer_identities_unique', 'the same ID number cannot belong to two buyers');
select tests.ok((select not (new_data::text like '%12345678%') from public.audit_log where table_name = 'buyer_identities' limit 1),
  'ID numbers are redacted in the audit log');

select tests.login(tests.id('agent'));
select tests.eq((select count(*) from public.buyer_identities), 0::bigint, 'agents cannot read ID numbers');
select tests.eq((select count(*) from public.v_buyers), 2::bigint, 'agents can read buyer contact profiles');
select tests.throws($$ insert into public.buyer_identities (buyer_id, id_type, id_number) values (tests.id('buyer2'), 'passport', 'A1234567') $$,
  '42501', 'agents cannot store ID numbers');

select tests.login(tests.id('admin'));
select tests.throws($$ select public.set_buyer_archived(tests.id('buyer1'), true) $$, 'BUYER_IN_USE',
  'buyers with active sales cannot be archived');
select tests.lives($$ select public.set_buyer_archived(tests.id('buyer2'), true) $$, 'other buyers can be archived');
select tests.throws($$ update public.buyers set notes = 'x' where id = tests.id('buyer2') $$, 'ARCHIVED', 'archived buyers are read-only');
rollback;

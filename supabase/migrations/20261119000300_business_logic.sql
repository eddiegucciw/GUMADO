-- ============================================================================
-- GUMADO · 0300 · Integrity guards and business operations
--
-- Rule of thumb:
--   * Plots and buyers are edited directly through the API (protected by RLS +
--     the guards below).
--   * Sales, payments, reservations, archiving and documents change ONLY through
--     the SECURITY DEFINER functions in this file. Each one checks permissions,
--     validates input and locks the rows it depends on, so concurrent users
--     cannot double-sell a plot or over-collect on a sale.
-- ============================================================================

-- Raise a business error the app can recognise via `hint`.
create function public.fail(p_code text, p_message text)
returns void language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = p_message, hint = p_code;
end $$;

create function public.set_audit_action(p_action text)
returns void language sql set search_path = '' as $$
  select pg_catalog.set_config('gumado.audit_action', p_action, true);
$$;

-- Sale visibility: all sales, or only the caller's own.
create function public.can_view_sale(p_agent_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_permission('sales.view_all')
      or (public.has_permission('sales.view_own') and p_agent_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
create function public.tg_plots_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not public.is_direct_api_call() then
    return new;  -- trusted business function
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('available', 'unavailable') or new.reserved_for_buyer_id is not null
       or new.archived_at is not null then
      perform public.fail('INVALID_STATUS', 'New plots must be Available or Unavailable.');
    end if;
    new.created_by := auth.uid();
    return new;
  end if;

  if old.archived_at is not null then
    perform public.fail('ARCHIVED', 'Archived plots are read-only. Restore the plot to edit it.');
  end if;
  if new.archived_at is distinct from old.archived_at or new.archived_by is distinct from old.archived_by then
    perform public.fail('USE_ARCHIVE_ACTION', 'Use the archive action to archive plots.');
  end if;
  if (new.reserved_for_buyer_id, new.reserved_until) is distinct from (old.reserved_for_buyer_id, old.reserved_until) then
    perform public.fail('USE_RESERVATION_ACTION', 'Use the reserve / release actions to change reservations.');
  end if;
  if new.status <> old.status and not (old.status in ('available', 'unavailable') and new.status in ('available', 'unavailable')) then
    perform public.fail('STATUS_CONTROLLED',
      'Reserved and Sold statuses are set automatically by reservations and sales.');
  end if;
  if new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
    perform public.fail('FORBIDDEN', 'Record metadata cannot be changed.');
  end if;
  return new;
end $$;

create trigger plots_guard before insert or update on public.plots
  for each row execute function public.tg_plots_guard();

create function public.tg_buyers_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not public.is_direct_api_call() then return new; end if;
  if tg_op = 'INSERT' then
    if new.archived_at is not null then perform public.fail('INVALID', 'New buyers cannot be archived.'); end if;
    new.created_by := auth.uid();
    return new;
  end if;
  if old.archived_at is not null then
    perform public.fail('ARCHIVED', 'Archived buyers are read-only. Restore the buyer to edit them.');
  end if;
  if new.archived_at is distinct from old.archived_at or new.archived_by is distinct from old.archived_by then
    perform public.fail('USE_ARCHIVE_ACTION', 'Use the archive action to archive buyers.');
  end if;
  if new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
    perform public.fail('FORBIDDEN', 'Record metadata cannot be changed.');
  end if;
  return new;
end $$;

create trigger buyers_guard before insert or update on public.buyers
  for each row execute function public.tg_buyers_guard();

-- Financial history is never erased.
create function public.tg_forbid_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform public.fail('DELETE_FORBIDDEN', 'Records of this type are never deleted. Cancel, reverse or archive instead.');
  return null;
end $$;

create trigger sales_no_delete     before delete on public.sales     for each row execute function public.tg_forbid_delete();
create trigger payments_no_delete  before delete on public.payments  for each row execute function public.tg_forbid_delete();
create trigger documents_no_delete before delete on public.documents for each row execute function public.tg_forbid_delete();
create trigger audit_no_delete     before delete on public.audit_log for each row execute function public.tg_forbid_delete();
create trigger plots_no_delete     before delete on public.plots     for each row execute function public.tg_forbid_delete();
create trigger buyers_no_delete    before delete on public.buyers    for each row execute function public.tg_forbid_delete();

create function public.tg_audit_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform public.fail('IMMUTABLE', 'Audit entries cannot be changed.');
  return null;
end $$;
create trigger audit_immutable before update on public.audit_log for each row execute function public.tg_audit_immutable();

-- Payments: amounts and facts are immutable; only the verification lifecycle moves.
create function public.tg_payments_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.is_direct_api_call() then
    perform public.fail('FORBIDDEN', 'Payments can only be changed through GUMADO payment actions.');
  end if;
  if tg_op = 'INSERT' then
    return new;
  end if;
  if (new.sale_id, new.buyer_id, new.amount, new.paid_on, new.method_id, new.transaction_reference,
      new.recorded_by, new.recorded_at, new.receipt_number, new.client_request_id, new.notes)
     is distinct from
     (old.sale_id, old.buyer_id, old.amount, old.paid_on, old.method_id, old.transaction_reference,
      old.recorded_by, old.recorded_at, old.receipt_number, old.client_request_id, old.notes) then
    perform public.fail('IMMUTABLE', 'Recorded payment details cannot be edited. Reject or reverse it instead.');
  end if;
  if not ((old.status = 'pending'   and new.status in ('confirmed', 'rejected'))
       or (old.status = 'confirmed' and new.status = 'reversed')) then
    perform public.fail('INVALID_TRANSITION',
      format('A %s payment cannot become %s.', old.status, new.status));
  end if;
  return new;
end $$;

create trigger payments_guard before insert or update on public.payments
  for each row execute function public.tg_payments_guard();

create function public.tg_sales_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.is_direct_api_call() then
    perform public.fail('FORBIDDEN', 'Sales can only be changed through GUMADO sale actions.');
  end if;
  if tg_op = 'UPDATE' then
    if (new.plot_id, new.buyer_id, new.sale_price, new.deposit_amount, new.sale_date, new.reference, new.created_by, new.created_at)
       is distinct from
       (old.plot_id, old.buyer_id, old.sale_price, old.deposit_amount, old.sale_date, old.reference, old.created_by, old.created_at) then
      perform public.fail('IMMUTABLE', 'The plot, buyer, price and date of a sale cannot be changed. Cancel and re-record it instead.');
    end if;
    if old.status = 'cancelled' then
      perform public.fail('CANCELLED', 'Cancelled sales are read-only.');
    end if;
  end if;
  return new;
end $$;

create trigger sales_guard before insert or update on public.sales
  for each row execute function public.tg_sales_guard();

create function public.tg_documents_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.is_direct_api_call() then
    perform public.fail('FORBIDDEN', 'Documents can only be changed through GUMADO document actions.');
  end if;
  if tg_op = 'UPDATE' and (new.storage_path, new.file_name, new.mime_type, new.size_bytes, new.uploaded_by,
                           new.plot_id, new.buyer_id, new.sale_id, new.created_at)
                         is distinct from
                         (old.storage_path, old.file_name, old.mime_type, old.size_bytes, old.uploaded_by,
                          old.plot_id, old.buyer_id, old.sale_id, old.created_at) then
    perform public.fail('IMMUTABLE', 'Document files and links cannot be changed. Upload a new document instead.');
  end if;
  return new;
end $$;

create trigger documents_guard before insert or update on public.documents
  for each row execute function public.tg_documents_guard();

-- Identity rows are only touched by holders of buyers.view_sensitive (RLS); stamp the editor.
create function public.tg_identities_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_by := auth.uid(); return new; end $$;
create trigger identities_stamp before insert or update on public.buyer_identities
  for each row execute function public.tg_identities_stamp();

-- ---------------------------------------------------------------------------
-- Notifications helper
-- ---------------------------------------------------------------------------
create function public.notify_holders(
  p_permission text, p_kind text, p_title text, p_body text,
  p_entity_type text, p_entity_id uuid, p_extra_recipient uuid default null, p_dedupe text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (recipient_id, kind, title, body, entity_type, entity_id, dedupe_key)
  select distinct r.id, p_kind, p_title, p_body, p_entity_type, p_entity_id, p_dedupe
  from (
    select pr.id from public.profiles pr
    join public.role_permissions rp on rp.role_id = pr.role_id and rp.permission_key = p_permission
    where pr.is_active
    union
    select pr.id from public.profiles pr where pr.id = p_extra_recipient and pr.is_active
  ) r
  where r.id is distinct from auth.uid()   -- don't notify the person who did it
  on conflict do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- Money helpers (single source of truth for balances & statuses)
-- ---------------------------------------------------------------------------
create function public.sale_confirmed_total(p_sale_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount), 0)::bigint from public.payments where sale_id = p_sale_id and status = 'confirmed';
$$;

create function public.sale_pending_total(p_sale_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount), 0)::bigint from public.payments where sale_id = p_sale_id and status = 'pending';
$$;

-- Payment status: cancelled | completed | overdue | partially_paid | pending
create function public.compute_payment_status(
  p_sale_status public.sale_status, p_price bigint, p_paid bigint, p_due date, p_today date
) returns text language sql immutable set search_path = '' as $$
  select case
    when p_sale_status = 'cancelled'                      then 'cancelled'
    when p_paid >= p_price                                then 'completed'
    when p_due is not null and p_due < p_today            then 'overdue'
    when p_paid > 0                                       then 'partially_paid'
    else 'pending'
  end;
$$;

-- Keep the plot's status in step with its sale and the business rule in settings.
create function public.sync_plot_for_sale(p_sale_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.sales;
  v_rule text := (select plot_sold_on from public.business_settings limit 1);
begin
  select * into s from public.sales where id = p_sale_id;
  if s.status = 'cancelled' then
    if not exists (select 1 from public.sales where plot_id = s.plot_id and status = 'active') then
      update public.plots set status = 'available', reserved_for_buyer_id = null, reserved_until = null
       where id = s.plot_id and status in ('sold', 'reserved');
    end if;
  elsif v_rule = 'sale_created' or public.sale_confirmed_total(s.id) >= s.sale_price then
    update public.plots set status = 'sold', reserved_for_buyer_id = null, reserved_until = null
     where id = s.plot_id and status <> 'sold';
  else
    update public.plots set status = 'reserved', reserved_for_buyer_id = s.buyer_id, reserved_until = null
     where id = s.plot_id and (status <> 'reserved' or reserved_for_buyer_id is distinct from s.buyer_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Reservations
-- ---------------------------------------------------------------------------
create function public.reserve_plot(p_plot_id uuid, p_buyer_id uuid, p_until date default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  p public.plots;
begin
  perform public.require_permission('sales.create');
  select * into p from public.plots where id = p_plot_id for update;
  if not found or p.archived_at is not null then perform public.fail('NOT_FOUND', 'Plot not found.'); end if;
  if p.status <> 'available' then
    perform public.fail('PLOT_NOT_AVAILABLE', format('Plot %s is %s and cannot be reserved.', p.reference, p.status));
  end if;
  if not exists (select 1 from public.buyers where id = p_buyer_id and archived_at is null) then
    perform public.fail('NOT_FOUND', 'Buyer not found.');
  end if;
  if p_until is not null and p_until < public.business_today() then
    perform public.fail('INVALID_DATE', 'The reservation end date cannot be in the past.');
  end if;
  perform public.set_audit_action('plot.reserve');
  update public.plots set status = 'reserved', reserved_for_buyer_id = p_buyer_id, reserved_until = p_until
   where id = p_plot_id;
  perform public.notify_holders('plots.manage', 'plot_reserved', 'Plot ' || p.reference || ' reserved',
    (select 'Reserved for ' || full_name from public.buyers where id = p_buyer_id), 'plot', p_plot_id);
end $$;

create function public.release_plot_reservation(p_plot_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  p public.plots;
begin
  perform public.require_permission('sales.create');
  select * into p from public.plots where id = p_plot_id for update;
  if not found then perform public.fail('NOT_FOUND', 'Plot not found.'); end if;
  if p.status <> 'reserved' then perform public.fail('NOT_RESERVED', 'This plot is not reserved.'); end if;
  if exists (select 1 from public.sales where plot_id = p_plot_id and status = 'active') then
    perform public.fail('HAS_ACTIVE_SALE', 'This plot is held by an active sale. Cancel the sale instead.');
  end if;
  perform public.set_audit_action('plot.release');
  update public.plots set status = 'available', reserved_for_buyer_id = null, reserved_until = null where id = p_plot_id;
end $$;

-- ---------------------------------------------------------------------------
-- Archiving
-- ---------------------------------------------------------------------------
create function public.set_plot_archived(p_plot_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.plots;
begin
  perform public.require_permission('plots.archive');
  select * into p from public.plots where id = p_plot_id for update;
  if not found then perform public.fail('NOT_FOUND', 'Plot not found.'); end if;
  if p_archived and p.status not in ('available', 'unavailable') then
    perform public.fail('PLOT_IN_USE', 'Reserved or sold plots cannot be archived.');
  end if;
  perform public.set_audit_action(case when p_archived then 'plot.archive' else 'plot.restore' end);
  update public.plots
     set archived_at = case when p_archived then now() end,
         archived_by = case when p_archived then auth.uid() end
   where id = p_plot_id;
end $$;

create function public.set_buyer_archived(p_buyer_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_permission('buyers.archive');
  if not exists (select 1 from public.buyers where id = p_buyer_id) then perform public.fail('NOT_FOUND', 'Buyer not found.'); end if;
  if p_archived and exists (select 1 from public.sales where buyer_id = p_buyer_id and status = 'active') then
    perform public.fail('BUYER_IN_USE', 'Buyers with active sales cannot be archived.');
  end if;
  perform public.set_audit_action(case when p_archived then 'buyer.archive' else 'buyer.restore' end);
  update public.buyers
     set archived_at = case when p_archived then now() end,
         archived_by = case when p_archived then auth.uid() end
   where id = p_buyer_id;
end $$;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create function public.record_payment(
  p_sale_id uuid,
  p_amount bigint,
  p_paid_on date,
  p_method_id uuid,
  p_transaction_reference text default null,
  p_notes text default null,
  p_client_request_id uuid default null,
  p_confirm boolean default false,
  p_allow_possible_duplicate boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  s public.sales;
  m public.payment_methods;
  v_id uuid;
  v_ref text := nullif(btrim(coalesce(p_transaction_reference, '')), '');
  v_confirm boolean;
  v_settings public.business_settings;
begin
  perform public.require_permission('payments.record');

  -- Idempotency: a retried submission returns the original payment.
  if p_client_request_id is not null then
    select id into v_id from public.payments where client_request_id = p_client_request_id;
    if found then return v_id; end if;
  end if;

  -- Lock the sale: concurrent payments on the same sale are serialised here.
  select * into s from public.sales where id = p_sale_id for update;
  if not found or not public.can_view_sale(s.agent_id) then perform public.fail('NOT_FOUND', 'Sale not found.'); end if;
  if s.status <> 'active' then perform public.fail('SALE_NOT_ACTIVE', 'Payments can only be recorded on active sales.'); end if;

  if p_amount is null or p_amount <= 0 then perform public.fail('INVALID_AMOUNT', 'Enter an amount greater than zero.'); end if;
  if p_paid_on is null or p_paid_on > public.business_today() then
    perform public.fail('INVALID_DATE', 'The payment date cannot be in the future.');
  end if;

  select * into m from public.payment_methods where id = p_method_id;
  if not found or not m.is_active then perform public.fail('INVALID_METHOD', 'Choose an active payment method.'); end if;
  if m.requires_reference and v_ref is null then
    perform public.fail('REFERENCE_REQUIRED', m.name || ' payments need a transaction reference.');
  end if;

  if p_amount > s.sale_price - public.sale_confirmed_total(s.id) - public.sale_pending_total(s.id) then
    perform public.fail('EXCEEDS_BALANCE',
      'This amount is more than the outstanding balance (including payments awaiting confirmation).');
  end if;

  if not p_allow_possible_duplicate and exists (
      select 1 from public.payments
      where sale_id = s.id and amount = p_amount and paid_on = p_paid_on and method_id = p_method_id
        and status in ('pending', 'confirmed') and recorded_at > now() - interval '15 minutes') then
    perform public.fail('POSSIBLE_DUPLICATE',
      'An identical payment was recorded on this sale in the last 15 minutes.');
  end if;

  select * into v_settings from public.business_settings limit 1;
  v_confirm := p_confirm and public.has_permission('payments.verify') and not v_settings.require_separate_verifier;

  perform public.set_audit_action('payment.record');
  begin
    insert into public.payments (sale_id, buyer_id, amount, paid_on, method_id, transaction_reference, notes,
                                 recorded_by, client_request_id, status, verified_by, verified_at)
    values (s.id, s.buyer_id, p_amount, p_paid_on, p_method_id, v_ref, nullif(btrim(coalesce(p_notes, '')), ''),
            auth.uid(), p_client_request_id,
            case when v_confirm then 'confirmed'::public.payment_status else 'pending' end,
            case when v_confirm then auth.uid() end,
            case when v_confirm then now() end)
    returning id into v_id;
  exception when unique_violation then
    if p_client_request_id is not null then
      select id into v_id from public.payments where client_request_id = p_client_request_id;
      if found then return v_id; end if;
    end if;
    perform public.fail('DUPLICATE_REFERENCE', 'This transaction reference has already been recorded.');
  end;

  if v_confirm then
    perform public.sync_plot_for_sale(s.id);
  else
    perform public.notify_holders('payments.verify', 'payment_recorded', 'Payment awaiting confirmation',
      (select 'Sale ' || s.reference || ' · ' || b.full_name from public.buyers b where b.id = s.buyer_id),
      'payment', v_id);
  end if;
  return v_id;
end $$;

create function public.verify_payment(p_payment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  s public.sales;
begin
  perform public.require_permission('payments.verify');
  select * into p from public.payments where id = p_payment_id;
  if not found then perform public.fail('NOT_FOUND', 'Payment not found.'); end if;
  select * into s from public.sales where id = p.sale_id for update;      -- serialise per sale
  select * into p from public.payments where id = p_payment_id for update;
  if p.status <> 'pending' then perform public.fail('INVALID_TRANSITION', 'Only pending payments can be confirmed.'); end if;
  if s.status <> 'active' then perform public.fail('SALE_NOT_ACTIVE', 'This sale is cancelled.'); end if;
  if (select require_separate_verifier from public.business_settings limit 1) and p.recorded_by = auth.uid() then
    perform public.fail('SEPARATE_VERIFIER', 'A different staff member must confirm a payment you recorded.');
  end if;
  if public.sale_confirmed_total(s.id) + p.amount > s.sale_price then
    perform public.fail('EXCEEDS_BALANCE', 'Confirming this payment would exceed the sale price.');
  end if;
  perform public.set_audit_action('payment.confirm');
  update public.payments set status = 'confirmed', verified_by = auth.uid(), verified_at = now() where id = p.id;
  perform public.sync_plot_for_sale(s.id);
  perform public.notify_holders('sales.view_all', 'payment_confirmed', 'Payment confirmed',
    'Receipt ' || p.receipt_number || ' on sale ' || s.reference, 'payment', p.id, s.agent_id);
end $$;

create function public.reject_payment(p_payment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.payments;
begin
  perform public.require_permission('payments.verify');
  if length(btrim(coalesce(p_reason, ''))) < 5 then perform public.fail('REASON_REQUIRED', 'Give a reason (at least 5 characters).'); end if;
  select * into p from public.payments where id = p_payment_id for update;
  if not found then perform public.fail('NOT_FOUND', 'Payment not found.'); end if;
  if p.status <> 'pending' then perform public.fail('INVALID_TRANSITION', 'Only pending payments can be rejected.'); end if;
  perform public.set_audit_action('payment.reject');
  update public.payments set status = 'rejected', verified_by = auth.uid(), verified_at = now(), status_reason = btrim(p_reason)
   where id = p.id;
  perform public.notify_holders('payments.verify', 'payment_rejected', 'Payment rejected',
    'Receipt ' || p.receipt_number || ': ' || btrim(p_reason), 'payment', p.id, p.recorded_by);
end $$;

create function public.reverse_payment(p_payment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  s public.sales;
begin
  perform public.require_permission('payments.reverse');
  if length(btrim(coalesce(p_reason, ''))) < 5 then perform public.fail('REASON_REQUIRED', 'Give a reason (at least 5 characters).'); end if;
  select * into p from public.payments where id = p_payment_id;
  if not found then perform public.fail('NOT_FOUND', 'Payment not found.'); end if;
  select * into s from public.sales where id = p.sale_id for update;
  select * into p from public.payments where id = p_payment_id for update;
  if p.status <> 'confirmed' then perform public.fail('INVALID_TRANSITION', 'Only confirmed payments can be reversed.'); end if;
  perform public.set_audit_action('payment.reverse');
  update public.payments set status = 'reversed', reversed_by = auth.uid(), reversed_at = now(), status_reason = btrim(p_reason)
   where id = p.id;
  if s.status = 'active' then perform public.sync_plot_for_sale(s.id); end if;
  perform public.notify_holders('payments.verify', 'payment_reversed', 'Payment reversed',
    'Receipt ' || p.receipt_number || ': ' || btrim(p_reason), 'payment', p.id, s.agent_id);
end $$;

-- ---------------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------------
create function public.create_sale(
  p_plot_id uuid,
  p_buyer_id uuid,
  p_sale_price bigint,
  p_sale_date date,
  p_deposit_amount bigint default 0,
  p_balance_due_date date default null,
  p_payment_terms text default null,
  p_notes text default null,
  p_agent_id uuid default null,
  p_initial_payment jsonb default null   -- {amount, paid_on, method_id, transaction_reference, notes, client_request_id, confirm}
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  p public.plots;
  v_sale_id uuid;
  v_agent uuid := coalesce(p_agent_id, auth.uid());
  v_buyer_name text;
begin
  perform public.require_permission('sales.create');

  if v_agent <> auth.uid() and not public.has_permission('sales.view_all') then
    perform public.fail('FORBIDDEN', 'You can only record sales under your own name.');
  end if;
  if not exists (select 1 from public.profiles where id = v_agent and is_active) then
    perform public.fail('INVALID_AGENT', 'The selected agent is not an active staff member.');
  end if;

  -- Lock the plot. A second sale attempt waits here, then sees the new status.
  select * into p from public.plots where id = p_plot_id for update;
  if not found or p.archived_at is not null then perform public.fail('NOT_FOUND', 'Plot not found.'); end if;

  select full_name into v_buyer_name from public.buyers where id = p_buyer_id and archived_at is null;
  if not found then perform public.fail('NOT_FOUND', 'Buyer not found.'); end if;

  if p.status = 'reserved' and p.reserved_for_buyer_id <> p_buyer_id then
    perform public.fail('PLOT_RESERVED_FOR_OTHER', format('Plot %s is reserved for another buyer.', p.reference));
  elsif p.status not in ('available', 'reserved') then
    perform public.fail('PLOT_NOT_AVAILABLE', format('Plot %s is %s and cannot be sold.', p.reference, p.status));
  end if;

  if p_sale_price is null or p_sale_price <= 0 then perform public.fail('INVALID_AMOUNT', 'Enter a sale price greater than zero.'); end if;
  if coalesce(p_deposit_amount, 0) < 0 or coalesce(p_deposit_amount, 0) > p_sale_price then
    perform public.fail('INVALID_DEPOSIT', 'The deposit must be between zero and the sale price.');
  end if;
  if p_sale_date is null or p_sale_date > public.business_today() then
    perform public.fail('INVALID_DATE', 'The sale date cannot be in the future.');
  end if;
  if p_balance_due_date is not null and p_balance_due_date < p_sale_date then
    perform public.fail('INVALID_DATE', 'The balance due date must be on or after the sale date.');
  end if;

  perform public.set_audit_action('sale.create');
  begin
    insert into public.sales (plot_id, buyer_id, agent_id, sale_price, deposit_amount, sale_date, balance_due_date,
                              payment_terms, notes, created_by)
    values (p_plot_id, p_buyer_id, v_agent, p_sale_price, coalesce(p_deposit_amount, 0), p_sale_date, p_balance_due_date,
            nullif(btrim(coalesce(p_payment_terms, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''), auth.uid())
    returning id into v_sale_id;
  exception when unique_violation then
    perform public.fail('PLOT_ALREADY_SOLD', format('Plot %s already has an active sale.', p.reference));
  end;

  perform public.sync_plot_for_sale(v_sale_id);

  if p_initial_payment is not null then
    perform public.record_payment(
      v_sale_id,
      (p_initial_payment ->> 'amount')::bigint,
      (p_initial_payment ->> 'paid_on')::date,
      (p_initial_payment ->> 'method_id')::uuid,
      p_initial_payment ->> 'transaction_reference',
      p_initial_payment ->> 'notes',
      (p_initial_payment ->> 'client_request_id')::uuid,
      coalesce((p_initial_payment ->> 'confirm')::boolean, false)
    );
  end if;

  perform public.notify_holders('sales.view_all', 'sale_created', 'New sale: plot ' || p.reference,
    v_buyer_name, 'sale', v_sale_id, v_agent);
  return v_sale_id;
end $$;

create function public.update_sale(
  p_sale_id uuid,
  p_balance_due_date date,
  p_payment_terms text,
  p_notes text,
  p_agent_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare s public.sales;
begin
  perform public.require_permission('sales.edit');
  select * into s from public.sales where id = p_sale_id for update;
  if not found or not public.can_view_sale(s.agent_id) then perform public.fail('NOT_FOUND', 'Sale not found.'); end if;
  if s.status <> 'active' then perform public.fail('SALE_NOT_ACTIVE', 'Cancelled sales are read-only.'); end if;
  if p_balance_due_date is not null and p_balance_due_date < s.sale_date then
    perform public.fail('INVALID_DATE', 'The balance due date must be on or after the sale date.');
  end if;
  if p_agent_id is distinct from s.agent_id then
    if not public.has_permission('sales.view_all') then
      perform public.fail('FORBIDDEN', 'You cannot reassign this sale.');
    end if;
    if not exists (select 1 from public.profiles where id = p_agent_id and is_active) then
      perform public.fail('INVALID_AGENT', 'The selected agent is not an active staff member.');
    end if;
  end if;
  perform public.set_audit_action('sale.edit');
  update public.sales
     set balance_due_date = p_balance_due_date,
         payment_terms = nullif(btrim(coalesce(p_payment_terms, '')), ''),
         notes = nullif(btrim(coalesce(p_notes, '')), ''),
         agent_id = coalesce(p_agent_id, s.agent_id)
   where id = s.id;
end $$;

create function public.cancel_sale(p_sale_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.sales;
  v_ref text;
begin
  perform public.require_permission('sales.cancel');
  if length(btrim(coalesce(p_reason, ''))) < 5 then perform public.fail('REASON_REQUIRED', 'Give a reason (at least 5 characters).'); end if;
  select * into s from public.sales where id = p_sale_id;
  if not found or not public.can_view_sale(s.agent_id) then perform public.fail('NOT_FOUND', 'Sale not found.'); end if;
  perform 1 from public.plots where id = s.plot_id for update;          -- lock order: plot, then sale
  select * into s from public.sales where id = p_sale_id for update;
  if s.status <> 'active' then perform public.fail('SALE_NOT_ACTIVE', 'This sale is already cancelled.'); end if;

  perform public.set_audit_action('sale.cancel');
  -- Payments still awaiting confirmation can no longer be confirmed.
  update public.payments
     set status = 'rejected', verified_by = auth.uid(), verified_at = now(),
         status_reason = 'Sale cancelled: ' || btrim(p_reason)
   where sale_id = s.id and status = 'pending';
  update public.sales
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancellation_reason = btrim(p_reason)
   where id = s.id;
  perform public.sync_plot_for_sale(s.id);

  select reference into v_ref from public.plots where id = s.plot_id;
  perform public.notify_holders('sales.view_all', 'sale_cancelled', 'Sale ' || s.reference || ' cancelled',
    'Plot ' || v_ref || ' is available again. Reason: ' || btrim(p_reason), 'sale', s.id, s.agent_id);
end $$;

-- ---------------------------------------------------------------------------
-- Documents (two-step upload: register → upload file → confirm)
-- ---------------------------------------------------------------------------
create function public.allowed_document_mime_types()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
$$;

create function public.begin_document_upload(
  p_file_name text, p_mime_type text, p_size_bytes bigint, p_category public.document_category,
  p_description text default null, p_plot_id uuid default null, p_buyer_id uuid default null, p_sale_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_name text;
  v_path text;
  v_max bigint := (select max_upload_mb from public.business_settings limit 1)::bigint * 1024 * 1024;
  v_agent uuid;
begin
  perform public.require_permission('documents.upload');
  if num_nonnulls(p_plot_id, p_buyer_id, p_sale_id) = 0 then
    perform public.fail('LINK_REQUIRED', 'Attach the document to a plot, buyer or sale.');
  end if;
  if not (p_mime_type = any (public.allowed_document_mime_types())) then
    perform public.fail('FILE_TYPE', 'Upload a PDF, JPEG, PNG, WebP, Word (.docx) or Excel (.xlsx) file.');
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > v_max then
    perform public.fail('FILE_SIZE', format('Files must be smaller than %s MB.', v_max / 1024 / 1024));
  end if;
  if p_category = 'buyer_document' and not public.has_permission('buyers.view_sensitive') then
    perform public.fail('FORBIDDEN', 'You do not have permission to upload buyer identification documents.');
  end if;
  if p_plot_id is not null and not exists (select 1 from public.plots where id = p_plot_id) then
    perform public.fail('NOT_FOUND', 'Plot not found.');
  end if;
  if p_buyer_id is not null and not exists (select 1 from public.buyers where id = p_buyer_id) then
    perform public.fail('NOT_FOUND', 'Buyer not found.');
  end if;
  if p_sale_id is not null then
    select agent_id into v_agent from public.sales where id = p_sale_id;
    if not found or not public.can_view_sale(v_agent) then perform public.fail('NOT_FOUND', 'Sale not found.'); end if;
  end if;

  -- Safe file name: letters, digits, dot, dash, underscore.
  v_name := left(regexp_replace(btrim(coalesce(p_file_name, 'file')), '[^A-Za-z0-9._-]+', '_', 'g'), 120);
  if v_name = '' or v_name ~ '^\.+$' then v_name := 'file'; end if;
  v_path := v_id::text || '/' || v_name;

  perform public.set_audit_action('document.register');
  insert into public.documents (id, storage_path, file_name, mime_type, size_bytes, category, description,
                                plot_id, buyer_id, sale_id, uploaded_by)
  values (v_id, v_path, left(btrim(p_file_name), 200), p_mime_type, p_size_bytes, p_category,
          nullif(btrim(coalesce(p_description, '')), ''), p_plot_id, p_buyer_id, p_sale_id, auth.uid());
  return jsonb_build_object('id', v_id, 'storage_path', v_path, 'bucket', 'documents');
end $$;

create function public.confirm_document_upload(p_document_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.documents;
begin
  select * into d from public.documents where id = p_document_id for update;
  if not found or d.uploaded_by <> auth.uid() then perform public.fail('NOT_FOUND', 'Document not found.'); end if;
  if d.upload_confirmed_at is not null then return; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'documents' and name = d.storage_path) then
    perform public.fail('UPLOAD_MISSING', 'The file has not finished uploading.');
  end if;
  perform public.set_audit_action('document.upload');
  update public.documents set upload_confirmed_at = now() where id = d.id;
end $$;

create function public.set_document_archived(p_document_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_permission('documents.archive');
  if not exists (select 1 from public.documents where id = p_document_id) then perform public.fail('NOT_FOUND', 'Document not found.'); end if;
  perform public.set_audit_action(case when p_archived then 'document.archive' else 'document.restore' end);
  update public.documents
     set archived_at = case when p_archived then now() end,
         archived_by = case when p_archived then auth.uid() end
   where id = p_document_id;
end $$;

-- ---------------------------------------------------------------------------
-- Payment reminders. Schedule daily with pg_cron (see docs/DEPLOYMENT.md).
-- ---------------------------------------------------------------------------
create function public.generate_payment_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_today date := public.business_today();
  v_days integer := (select due_soon_days from public.business_settings limit 1);
  r record;
  v_count integer := 0;
begin
  for r in
    select s.id, s.reference, s.agent_id, s.balance_due_date, s.sale_price - public.sale_confirmed_total(s.id) as outstanding
    from public.sales s
    where s.status = 'active' and s.balance_due_date is not null
      and s.balance_due_date <= v_today + v_days
      and public.sale_confirmed_total(s.id) < s.sale_price
  loop
    if r.balance_due_date < v_today then
      perform public.notify_holders('payments.verify', 'payment_overdue', 'Payment overdue: ' || r.reference,
        'The balance was due on ' || to_char(r.balance_due_date, 'DD Mon YYYY') || '.', 'sale', r.id, r.agent_id,
        'overdue:' || r.balance_due_date::text);
    else
      perform public.notify_holders('payments.verify', 'payment_due_soon', 'Payment due soon: ' || r.reference,
        'The balance is due on ' || to_char(r.balance_due_date, 'DD Mon YYYY') || '.', 'sale', r.id, r.agent_id,
        'due:' || r.balance_due_date::text);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Manual status changes (available <-> unavailable) notify plot managers.
create function public.tg_plots_notify_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> old.status and old.status in ('available','unavailable') and new.status in ('available','unavailable') then
    perform public.notify_holders('plots.manage', 'plot_status_changed', 'Plot ' || new.reference || ' is now ' || new.status,
      null, 'plot', new.id);
  end if;
  return null;
end $$;
create trigger plots_notify_status after update of status on public.plots
  for each row execute function public.tg_plots_notify_status();

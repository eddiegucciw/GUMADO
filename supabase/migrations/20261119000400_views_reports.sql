-- ============================================================================
-- GUMADO · 0400 · Read models, dashboard, reports, search
--
-- These views run with the view owner's rights and apply GUMADO's visibility
-- rules EXPLICITLY in their WHERE clauses (security_barrier prevents leaks).
-- This keeps every figure consistent: balances are computed in exactly one
-- place (v_sales), and dashboard/report functions aggregate those views.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Sales with balances  (THE source of truth for paid / outstanding / status)
-- outstanding = sale price − confirmed payments   (0 for cancelled sales)
-- ---------------------------------------------------------------------------
create view public.v_sales with (security_barrier = true) as
select
  s.id, s.reference, s.status, s.sale_date, s.balance_due_date, s.sale_price, s.deposit_amount,
  s.payment_terms, s.notes, s.created_at, s.cancelled_at, s.cancellation_reason,
  s.plot_id, pl.reference as plot_reference, pl.name as plot_name, pl.county, pl.town, pl.estate,
  s.buyer_id,
  case when public.has_permission('buyers.view') then b.full_name end as buyer_name,
  case when public.has_permission('buyers.view') then b.phone end     as buyer_phone,
  s.agent_id, ag.full_name as agent_name,
  t.total_paid,
  t.pending_amount,
  case when s.status = 'cancelled' then 0 else s.sale_price - t.total_paid end::bigint as outstanding,
  public.compute_payment_status(s.status, s.sale_price, t.total_paid, s.balance_due_date, public.business_today()) as payment_status
from public.sales s
join public.plots pl    on pl.id = s.plot_id
join public.buyers b    on b.id = s.buyer_id
join public.profiles ag on ag.id = s.agent_id
cross join lateral (
  select coalesce(sum(p.amount) filter (where p.status = 'confirmed'), 0)::bigint as total_paid,
         coalesce(sum(p.amount) filter (where p.status = 'pending'), 0)::bigint   as pending_amount
  from public.payments p where p.sale_id = s.id
) t
where public.can_view_sale(s.agent_id);

-- ---------------------------------------------------------------------------
-- Payments with context
-- ---------------------------------------------------------------------------
create view public.v_payments with (security_barrier = true) as
select
  p.id, p.receipt_number, p.sale_id, s.reference as sale_reference, s.status as sale_status,
  pl.reference as plot_reference, p.buyer_id,
  case when public.has_permission('buyers.view') then b.full_name end as buyer_name,
  p.amount, p.paid_on, p.method_id, pm.name as method_name, p.transaction_reference, p.status, p.notes,
  p.recorded_by, rec.full_name as recorded_by_name, p.recorded_at,
  p.verified_by, ver.full_name as verified_by_name, p.verified_at,
  p.reversed_by, p.reversed_at, p.status_reason, s.agent_id
from public.payments p
join public.sales s            on s.id = p.sale_id
join public.plots pl           on pl.id = s.plot_id
join public.buyers b           on b.id = p.buyer_id
join public.payment_methods pm on pm.id = p.method_id
join public.profiles rec       on rec.id = p.recorded_by
left join public.profiles ver  on ver.id = p.verified_by
where public.has_permission('payments.view') and public.can_view_sale(s.agent_id);

-- Confirmed money facts (no personal data) for collection totals.
create view public.v_collections with (security_barrier = true) as
select p.id, p.sale_id, p.amount, p.paid_on, p.method_id, pm.name as method_name, s.agent_id
from public.payments p
join public.sales s on s.id = p.sale_id
join public.payment_methods pm on pm.id = p.method_id
where p.status = 'confirmed' and public.can_view_sale(s.agent_id);

-- ---------------------------------------------------------------------------
-- Plots with their active sale / reservation
-- ---------------------------------------------------------------------------
create view public.v_plots with (security_barrier = true) as
select
  pl.*,
  -- Normalised size so plots in different units can be filtered and compared.
  round(pl.size * case pl.size_unit when 'acres' then 4046.8564224 when 'hectares' then 10000
                                    when 'square_feet' then 0.09290304 else 1 end, 2) as size_sq_m,
  case when public.has_permission('buyers.view') then rb.full_name end as reserved_for_name,
  sa.id         as active_sale_id,
  case when sa.id is not null and public.can_view_sale(sa.agent_id) then sa.sale_price end as sale_price,
  case when sa.id is not null and public.can_view_sale(sa.agent_id) then sa.reference end  as active_sale_reference,
  (pl.status = 'reserved' and pl.reserved_until is not null and pl.reserved_until < public.business_today()
     and sa.id is null) as reservation_expired
from public.plots pl
left join public.buyers rb on rb.id = pl.reserved_for_buyer_id
left join public.sales sa  on sa.plot_id = pl.id and sa.status = 'active'
where public.has_permission('plots.view');

-- ---------------------------------------------------------------------------
-- Buyers with purchase totals (over the sales the caller may see)
-- ---------------------------------------------------------------------------
create view public.v_buyers with (security_barrier = true) as
select
  b.*,
  coalesce(x.active_sales, 0)::integer as active_sales,
  coalesce(x.total_purchased, 0)::bigint as total_purchased,
  coalesce(x.total_paid, 0)::bigint as total_paid,
  coalesce(x.outstanding, 0)::bigint as outstanding
from public.buyers b
left join lateral (
  select count(*) filter (where vs.status = 'active') as active_sales,
         sum(vs.sale_price) filter (where vs.status = 'active') as total_purchased,
         sum(vs.total_paid) as total_paid,
         sum(vs.outstanding) as outstanding
  from public.v_sales vs where vs.buyer_id = b.id
) x on true
where public.has_permission('buyers.view');

-- ---------------------------------------------------------------------------
-- Dashboard
-- ---------------------------------------------------------------------------
create function public.period_metrics(p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'sales_count', (select count(*) from public.v_sales where status = 'active' and sale_date between p_from and p_to),
    'sales_value', (select coalesce(sum(sale_price), 0) from public.v_sales where status = 'active' and sale_date between p_from and p_to),
    'collected',   (select coalesce(sum(amount), 0) from public.v_collections where paid_on between p_from and p_to),
    'payments_count', (select count(*) from public.v_collections where paid_on between p_from and p_to),
    'new_buyers',  case when public.has_permission('buyers.view')
                     then (select count(*) from public.buyers where registered_on between p_from and p_to and archived_at is null) end
  );
$$;

create function public.dashboard_summary(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_len integer;
  v_series jsonb;
  v_bucket text;
begin
  if not public.is_active_staff() then perform public.fail('FORBIDDEN', 'You do not have access.'); end if;
  if p_from is null or p_to is null or p_from > p_to then perform public.fail('INVALID_DATE', 'Choose a valid date range.'); end if;
  if p_to - p_from > 3660 then perform public.fail('INVALID_DATE', 'Choose a range of ten years or less.'); end if;
  v_len := p_to - p_from + 1;
  v_bucket := case when v_len <= 62 then 'day' else 'month' end;

  select coalesce(jsonb_agg(jsonb_build_object('bucket', g.b, 'sales_value', g.sv, 'collected', g.c) order by g.b), '[]'::jsonb)
    into v_series
  from (
    select b::date as b,
      (select coalesce(sum(sale_price), 0) from public.v_sales
        where status = 'active' and sale_date >= b::date and sale_date < (b + ('1 ' || v_bucket)::interval)::date
          and sale_date between p_from and p_to) as sv,
      (select coalesce(sum(amount), 0) from public.v_collections
        where paid_on >= b::date and paid_on < (b + ('1 ' || v_bucket)::interval)::date
          and paid_on between p_from and p_to) as c
    from generate_series(date_trunc(v_bucket, p_from::timestamp), p_to::timestamp, ('1 ' || v_bucket)::interval) b
  ) g;

  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'bucket', v_bucket,
    'currency', (select currency_code from public.business_settings limit 1),
    'minor_units', (select currency_minor_units from public.business_settings limit 1),
    'plots', case when public.has_permission('plots.view') then (
       select jsonb_build_object(
         'total',       count(*),
         'available',   count(*) filter (where status = 'available'),
         'reserved',    count(*) filter (where status = 'reserved'),
         'sold',        count(*) filter (where status = 'sold'),
         'unavailable', count(*) filter (where status = 'unavailable'))
       from public.plots where archived_at is null) end,
    'current', public.period_metrics(p_from, p_to),
    'previous', public.period_metrics(p_from - v_len, p_from - 1),
    'balances', (select jsonb_build_object(
         'total_sales_value', coalesce(sum(sale_price) filter (where status = 'active'), 0),
         'total_collected',   coalesce(sum(total_paid) filter (where status = 'active'), 0),
         'outstanding',       coalesce(sum(outstanding), 0),
         'overdue_amount',    coalesce(sum(outstanding) filter (where payment_status = 'overdue'), 0),
         'overdue_count',     count(*) filter (where payment_status = 'overdue'),
         'awaiting_confirmation', coalesce(sum(pending_amount) filter (where status = 'active'), 0),
         'active_sales',      count(*) filter (where status = 'active'))
       from public.v_sales),
    'series', v_series
  );
end $$;

-- ---------------------------------------------------------------------------
-- Reports (aggregations over the same views)
-- ---------------------------------------------------------------------------
create function public.report_sales_by_location(p_from date, p_to date)
returns table (county text, estate text, sales_count bigint, sales_value bigint, collected bigint, outstanding bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_permission('reports.view');
  return query
    select vs.county, coalesce(vs.estate, '—'), count(*), sum(vs.sale_price)::bigint, sum(vs.total_paid)::bigint, sum(vs.outstanding)::bigint
    from public.v_sales vs
    where vs.status = 'active' and vs.sale_date between p_from and p_to
    group by vs.county, coalesce(vs.estate, '—')
    order by sum(vs.sale_price) desc;
end $$;

create function public.report_collections(p_from date, p_to date)
returns table (month date, method_name text, payments_count bigint, amount bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_permission('reports.view');
  return query
    select date_trunc('month', c.paid_on)::date, c.method_name, count(*), sum(c.amount)::bigint
    from public.v_collections c
    where c.paid_on between p_from and p_to
    group by 1, 2 order by 1, 2;
end $$;

create function public.report_agent_performance(p_from date, p_to date)
returns table (agent_id uuid, agent_name text, sales_count bigint, sales_value bigint, collected_in_period bigint, outstanding bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_permission('reports.view');
  perform public.require_permission('sales.view_all');
  return query
    select pr.id, pr.full_name,
      (select count(*) from public.v_sales vs where vs.agent_id = pr.id and vs.status = 'active' and vs.sale_date between p_from and p_to),
      (select coalesce(sum(vs.sale_price), 0)::bigint from public.v_sales vs where vs.agent_id = pr.id and vs.status = 'active' and vs.sale_date between p_from and p_to),
      (select coalesce(sum(c.amount), 0)::bigint from public.v_collections c where c.agent_id = pr.id and c.paid_on between p_from and p_to),
      (select coalesce(sum(vs.outstanding), 0)::bigint from public.v_sales vs where vs.agent_id = pr.id)
    from public.profiles pr
    where exists (select 1 from public.sales s where s.agent_id = pr.id)
    order by 4 desc;
end $$;

-- ---------------------------------------------------------------------------
-- Global search across permitted records
-- ---------------------------------------------------------------------------
create function public.global_search(p_query text)
returns table (kind text, id uuid, title text, subtitle text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
  v_like text;
begin
  if length(v_q) < 2 or not public.is_active_staff() then return; end if;
  v_q := left(v_q, 80);
  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
  (select 'plot'::text, p.id, p.reference || ' · ' || p.name,
          concat_ws(', ', p.estate, p.town, p.county) || ' · ' || p.status::text
     from public.v_plots p
    where p.reference ilike v_like or p.name ilike v_like or p.county ilike v_like
       or p.town ilike v_like or p.estate ilike v_like or p.location ilike v_like
    order by p.reference limit 8)
  union all
  (select 'buyer'::text, b.id, b.full_name, b.phone
     from public.v_buyers b
    where b.full_name ilike v_like or b.phone ilike v_like or b.email ilike v_like
    order by b.full_name limit 8)
  union all
  (select 'sale'::text, s.id, s.reference || ' · Plot ' || s.plot_reference, coalesce(s.buyer_name, '') || ' · ' || s.payment_status
     from public.v_sales s
    where s.reference ilike v_like or s.plot_reference ilike v_like or s.buyer_name ilike v_like
    order by s.sale_date desc limit 8)
  union all
  (select 'payment'::text, p.id, p.receipt_number || ' · ' || coalesce(p.transaction_reference, p.method_name),
          p.sale_reference || ' · ' || p.status::text
     from public.v_payments p
    where p.receipt_number ilike v_like or p.transaction_reference ilike v_like
    order by p.recorded_at desc limit 8);
end $$;

-- ---------------------------------------------------------------------------
-- Plot history (audit entries for the plot and its sales)
-- ---------------------------------------------------------------------------
create function public.plot_history(p_plot_id uuid)
returns table (occurred_at timestamptz, actor_name text, action text, table_name text, changed_fields text[], old_data jsonb, new_data jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_permission('plots.view');
  return query
    select a.occurred_at, coalesce(pr.full_name, pr.email, 'System'), a.action, a.table_name, a.changed_fields,
           a.old_data, a.new_data
    from public.audit_log a
    left join public.profiles pr on pr.id = a.actor_id
    where (a.table_name = 'plots' and a.record_id = p_plot_id)
       or (a.table_name = 'sales' and a.record_id in (select vs.id from public.v_sales vs where vs.plot_id = p_plot_id))
    order by a.occurred_at desc
    limit 200;
end $$;

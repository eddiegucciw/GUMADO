-- ============================================================================
-- GUMADO · 0600 · Row Level Security and grants
-- Default deny: anon gets nothing; authenticated gets only what is listed here,
-- and RLS narrows it to what the user's role permits.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['business_settings','permissions','roles','role_permissions','profiles','buyers',
                           'buyer_identities','plots','payment_methods','sales','payments','documents',
                           'notifications','audit_log']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Policies  (helpers wrapped in SELECT so they are evaluated once per query)
-- ---------------------------------------------------------------------------
create policy settings_read  on public.business_settings for select to authenticated using ((select public.is_active_staff()));
create policy settings_write on public.business_settings for update to authenticated
  using ((select public.has_permission('settings.manage'))) with check ((select public.has_permission('settings.manage')));

create policy permissions_read on public.permissions for select to authenticated using ((select public.is_active_staff()));

create policy roles_read   on public.roles for select to authenticated using ((select public.is_active_staff()));
create policy roles_insert on public.roles for insert to authenticated with check ((select public.has_permission('users.manage')) and not is_system);
create policy roles_update on public.roles for update to authenticated
  using ((select public.has_permission('users.manage'))) with check ((select public.has_permission('users.manage')));
create policy roles_delete on public.roles for delete to authenticated using ((select public.has_permission('users.manage')));

create policy role_perms_read   on public.role_permissions for select to authenticated using ((select public.is_active_staff()));
create policy role_perms_insert on public.role_permissions for insert to authenticated with check ((select public.has_permission('users.manage')));
create policy role_perms_delete on public.role_permissions for delete to authenticated using ((select public.has_permission('users.manage')));

-- Staff can see colleagues (names appear on sales and payments); everyone sees themselves.
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_active_staff()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.has_permission('users.manage')))
  with check (id = (select auth.uid()) or (select public.has_permission('users.manage')));

create policy plots_read   on public.plots for select to authenticated using ((select public.has_permission('plots.view')));
create policy plots_insert on public.plots for insert to authenticated with check ((select public.has_permission('plots.manage')));
create policy plots_update on public.plots for update to authenticated
  using ((select public.has_permission('plots.manage'))) with check ((select public.has_permission('plots.manage')));

create policy buyers_read   on public.buyers for select to authenticated using ((select public.has_permission('buyers.view')));
create policy buyers_insert on public.buyers for insert to authenticated with check ((select public.has_permission('buyers.manage')));
create policy buyers_update on public.buyers for update to authenticated
  using ((select public.has_permission('buyers.manage'))) with check ((select public.has_permission('buyers.manage')));

create policy identities_read on public.buyer_identities for select to authenticated
  using ((select public.has_permission('buyers.view_sensitive')));
create policy identities_insert on public.buyer_identities for insert to authenticated
  with check ((select public.has_permission('buyers.view_sensitive')) and (select public.has_permission('buyers.manage')));
create policy identities_update on public.buyer_identities for update to authenticated
  using ((select public.has_permission('buyers.view_sensitive')) and (select public.has_permission('buyers.manage')))
  with check ((select public.has_permission('buyers.view_sensitive')) and (select public.has_permission('buyers.manage')));

create policy methods_read   on public.payment_methods for select to authenticated using ((select public.is_active_staff()));
create policy methods_insert on public.payment_methods for insert to authenticated with check ((select public.has_permission('settings.manage')));
create policy methods_update on public.payment_methods for update to authenticated
  using ((select public.has_permission('settings.manage'))) with check ((select public.has_permission('settings.manage')));

-- Sales & payments: read-only through the API. Writes go through functions.
create policy sales_read on public.sales for select to authenticated using (public.can_view_sale(agent_id));

create policy payments_read on public.payments for select to authenticated
  using ((select public.has_permission('payments.view'))
         and exists (select 1 from public.sales s where s.id = sale_id and public.can_view_sale(s.agent_id)));

create policy documents_read on public.documents for select to authenticated
  using (
    (select public.has_permission('documents.view'))
    and (upload_confirmed_at is not null or uploaded_by = (select auth.uid()))
    and (category <> 'buyer_document' or (select public.has_permission('buyers.view_sensitive')))
    and (plot_id  is null or (select public.has_permission('plots.view')))
    and (buyer_id is null or (select public.has_permission('buyers.view')))
    and (sale_id  is null or exists (select 1 from public.sales s where s.id = sale_id and public.can_view_sale(s.agent_id)))
  );

create policy notifications_read on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy notifications_mark_read on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

create policy audit_read on public.audit_log for select to authenticated using ((select public.has_permission('audit.view')));

-- ---------------------------------------------------------------------------
-- Table privileges
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.business_settings, public.permissions, public.roles, public.role_permissions, public.profiles,
                public.buyers, public.buyer_identities, public.plots, public.payment_methods, public.sales,
                public.payments, public.documents, public.notifications, public.audit_log
  to authenticated;

grant select on public.v_sales, public.v_payments, public.v_collections, public.v_plots, public.v_buyers to authenticated;

grant update (business_name, contact_email, contact_phone, postal_address, currency_code, currency_minor_units,
              timezone, plot_sold_on, require_separate_verifier, due_soon_days, max_upload_mb)
  on public.business_settings to authenticated;
grant insert, update, delete on public.roles, public.role_permissions to authenticated;
grant update (full_name, phone, role_id, is_active) on public.profiles to authenticated;
grant insert (reference, name, description, county, town, estate, location, size, size_unit, asking_price, status,
              registered_on, latitude, longitude, notes)
  on public.plots to authenticated;
grant update (reference, name, description, county, town, estate, location, size, size_unit, asking_price, status,
              registered_on, latitude, longitude, notes)
  on public.plots to authenticated;
grant insert (full_name, phone, email, address, registered_on, notes) on public.buyers to authenticated;
grant update (full_name, phone, email, address, registered_on, notes) on public.buyers to authenticated;
grant insert (buyer_id, id_type, id_number), update (id_type, id_number) on public.buyer_identities to authenticated;
grant insert (name, requires_reference, is_active, sort_order), update (name, requires_reference, is_active, sort_order)
  on public.payment_methods to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Function privileges: revoke everything, then expose only the API surface.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

-- Helpers used inside RLS policies, views and guard triggers.
grant execute on function
  public.has_permission(text), public.is_active_staff(), public.can_view_sale(uuid), public.business_today(),
  public.compute_payment_status(public.sale_status, bigint, bigint, date, date), public.is_direct_api_call(),
  public.fail(text, text), public.require_permission(text), public.allowed_document_mime_types(),
  public.administrator_role_id(), public.other_active_admin_exists(uuid)
  to authenticated;

-- Application API (each function checks its own permission).
grant execute on function
  public.my_access(),
  public.reserve_plot(uuid, uuid, date),
  public.release_plot_reservation(uuid),
  public.set_plot_archived(uuid, boolean),
  public.set_buyer_archived(uuid, boolean),
  public.create_sale(uuid, uuid, bigint, date, bigint, date, text, text, uuid, jsonb),
  public.update_sale(uuid, date, text, text, uuid),
  public.cancel_sale(uuid, text),
  public.record_payment(uuid, bigint, date, uuid, text, text, uuid, boolean, boolean),
  public.verify_payment(uuid),
  public.reject_payment(uuid, text),
  public.reverse_payment(uuid, text),
  public.begin_document_upload(text, text, bigint, public.document_category, text, uuid, uuid, uuid),
  public.confirm_document_upload(uuid),
  public.set_document_archived(uuid, boolean),
  public.period_metrics(date, date),
  public.dashboard_summary(date, date),
  public.report_sales_by_location(date, date),
  public.report_collections(date, date),
  public.report_agent_performance(date, date),
  public.global_search(text),
  public.plot_history(uuid)
  to authenticated;

-- bootstrap_admin, generate_payment_reminders, notify_holders, sync_plot_for_sale,
-- sale_*_total and set_audit_action are deliberately NOT exposed to the API.
grant execute on function public.generate_payment_reminders() to service_role;

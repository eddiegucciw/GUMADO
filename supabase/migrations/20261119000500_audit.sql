-- ============================================================================
-- GUMADO · 0500 · Audit trail
-- Every insert/update on important tables is written to public.audit_log with
-- the acting user, a readable action name and only the fields that changed.
-- ============================================================================

create function public.tg_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
  v_action text := nullif(current_setting('gumado.audit_action', true), '');
  v_record uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;

  -- Never copy identification numbers into the log.
  if tg_table_name = 'buyer_identities' then
    if v_old is not null then v_old := v_old || '{"id_number": "[redacted]"}'; end if;
    if v_new is not null then v_new := v_new || '{"id_number": "[redacted]"}'; end if;
  end if;

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_changed
    from jsonb_each(to_jsonb(new)) n
    where n.value is distinct from (to_jsonb(old) -> n.key) and n.key not in ('updated_at', 'updated_by');
    if v_changed is null then return null; end if;            -- no-op update
    select jsonb_object_agg(k, v_old -> k) into v_old from unnest(v_changed) k;
    select jsonb_object_agg(k, v_new -> k) into v_new from unnest(v_changed) k;
  end if;

  v_record := case
    when tg_table_name = 'business_settings' then null
    else coalesce(to_jsonb(coalesce(new, old)) ->> 'id', to_jsonb(coalesce(new, old)) ->> 'buyer_id',
                  to_jsonb(coalesce(new, old)) ->> 'role_id')::uuid
  end;

  insert into public.audit_log (actor_id, action, table_name, record_id, old_data, new_data, changed_fields)
  values (auth.uid(),
          coalesce(v_action, tg_table_name || '.' || lower(tg_op)),
          tg_table_name, v_record, v_old, v_new, v_changed);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['business_settings','roles','role_permissions','profiles','plots','buyers',
                           'buyer_identities','payment_methods','sales','payments','documents']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.tg_audit()', t || '_audit', t);
  end loop;
end $$;

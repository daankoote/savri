begin;

-- CUSTOMER04C3C9E follow-up: preserve the v2 event resolver while presenting
-- absent candidate fields as absent JSON keys to the existing fail-closed v4
-- handoff validator. JSON null is otherwise a present jsonb value in SQL.

create function public.app_customer_correction_replacement_resolution_v3(
  p_auth_user_id uuid,
  p_case_ref text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_resolution jsonb;
  v_targets jsonb;
begin
  v_resolution := public.app_customer_correction_replacement_resolution_v2(
    p_auth_user_id,
    p_case_ref
  );
  if v_resolution->>'ok' <> 'true' then return v_resolution; end if;
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_strip_nulls(target.value)
    order by target.value->>'replacement_target_ref'
  ), '[]'::jsonb) into v_targets
  from pg_catalog.jsonb_array_elements(v_resolution->'targets') target(value);
  return pg_catalog.jsonb_set(v_resolution, '{targets}', v_targets, false);
end;
$$;

create or replace function public.app_customer_correction_replacement_resolution_v1(
  p_auth_user_id uuid,
  p_case_ref text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  return public.app_customer_correction_replacement_resolution_v3(
    p_auth_user_id,
    p_case_ref
  );
end;
$$;

revoke all on function
  public.app_customer_correction_replacement_resolution_v3(uuid, text)
  from public, anon, authenticated;
grant execute on function
  public.app_customer_correction_replacement_resolution_v3(uuid, text)
  to service_role;

comment on function public.app_customer_correction_replacement_resolution_v3(
  uuid, text
) is
  'Backward-compatible event-derived candidate resolution with absent current-candidate fields projected as absent JSON keys for fail-closed handoff validation.';

commit;

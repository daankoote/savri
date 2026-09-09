create function public.app_bootstrap_customer_auth_v7(
  p_auth_user_id uuid,
  p_email_normalized text,
  p_actor_ref text,
  p_request_id text,
  p_idempotency_scope text,
  p_idempotency_key text,
  p_payload_hash text,
  p_ip_hash text,
  p_user_agent_hash text,
  p_environment text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_response jsonb;
  v_dossiers jsonb;
  v_portal_contexts jsonb;
begin
  v_response := public.app_bootstrap_customer_auth_v6(
    p_auth_user_id,
    p_email_normalized,
    p_actor_ref,
    p_request_id,
    p_idempotency_scope,
    p_idempotency_key,
    p_payload_hash,
    p_ip_hash,
    p_user_agent_hash,
    p_environment
  );

  if coalesce((v_response ->> 'ok')::boolean, false) is not true then
    if v_response ->> 'code' in (
      'customer_identity_not_found',
      'customer_dossier_not_found'
    ) then
      return v_response || jsonb_build_object(
        'status', 403,
        'code', 'portal_context_not_authorized',
        'error', 'Portaltoegang niet toegestaan.'
      );
    end if;
    return v_response;
  end if;

  if jsonb_typeof(v_response -> 'dossiers') is distinct from 'array'
     or jsonb_array_length(v_response -> 'dossiers') = 0
     or exists (
       select 1
       from jsonb_array_elements(v_response -> 'dossiers') dossier
       where dossier ->> 'account_type' not in ('particulier', 'zakelijk', 'vve')
          or dossier ->> 'case_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     ) then
    raise exception 'invalid customer portal context response';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_response -> 'dossiers') dossier
    left join public.app_cases app_case
      on app_case.id = (dossier ->> 'case_id')::uuid
    left join public.app_customers customer_row
      on customer_row.id = app_case.customer_id
     and customer_row.status = 'active'
    where customer_row.id is null
       or customer_row.customer_type is distinct from dossier ->> 'account_type'
       or not exists (
         select 1
         from public.app_customer_access_grants access_grant
         where access_grant.auth_user_id = p_auth_user_id
           and access_grant.customer_id = app_case.customer_id
       )
  ) then
    return jsonb_build_object(
      'ok', false,
      'status', 403,
      'code', 'portal_context_not_authorized',
      'error', 'Portaltoegang niet toegestaan.'
    );
  end if;

  select jsonb_agg(
    dossier || jsonb_build_object(
      'portal_context',
      case
        when dossier ->> 'account_type' = 'particulier' then 'customer'
        else 'business'
      end
    ) order by dossier_ordinality
  )
  into v_dossiers
  from jsonb_array_elements(v_response -> 'dossiers')
    with ordinality as source(dossier, dossier_ordinality);

  select jsonb_agg(context_name order by context_order)
  into v_portal_contexts
  from (
    select distinct
      case
        when dossier ->> 'account_type' = 'particulier' then 'customer'
        else 'business'
      end as context_name,
      case
        when dossier ->> 'account_type' = 'particulier' then 1
        else 2
      end as context_order
    from jsonb_array_elements(v_response -> 'dossiers') dossier
  ) contexts;

  return v_response || jsonb_build_object(
    'mode', 'auth_bootstrap_v4',
    'portal_contexts', v_portal_contexts,
    'dossiers', v_dossiers
  );
end;
$$;

revoke all on function public.app_bootstrap_customer_auth_v7(
  uuid, text, text, text, text, text, text, text, text, text
) from public;
revoke all on function public.app_bootstrap_customer_auth_v7(
  uuid, text, text, text, text, text, text, text, text, text
) from anon;
revoke all on function public.app_bootstrap_customer_auth_v7(
  uuid, text, text, text, text, text, text, text, text, text
) from authenticated;
grant execute on function public.app_bootstrap_customer_auth_v7(
  uuid, text, text, text, text, text, text, text, text, text
) to service_role;

comment on function public.app_bootstrap_customer_auth_v7(
  uuid, text, text, text, text, text, text, text, text, text
) is 'Authorizes customer and business portal contexts from explicit customer access grants and database-owned account type; verified Auth alone is denied.';

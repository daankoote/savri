begin;

create function public.app_customer_application_index_read_v1(
  p_auth_user_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with valid_actor as (
    select auth_user.id as auth_user_id
    from auth.users auth_user
    where p_auth_user_id is not null
      and auth_user.id = p_auth_user_id
      and auth_user.deleted_at is null
      and coalesce(
        auth_user.email_confirmed_at,
        auth_user.confirmed_at
      ) is not null
      and 1 = (
        select pg_catalog.count(*)
        from public.app_customer_identities identity_row
        where identity_row.auth_user_id = p_auth_user_id
          and identity_row.status = 'active'
      )
      and not exists (
        select 1
        from public.app_customer_access_grants granted_context
        left join public.app_customers granted_customer
          on granted_customer.id = granted_context.customer_id
         and granted_customer.status = 'active'
        where granted_context.auth_user_id = p_auth_user_id
          and granted_customer.id is null
      )
      and exists (
        select 1
        from public.app_customer_identities identity_row
        join public.app_customer_access_grants identity_grant
          on identity_grant.auth_user_id = p_auth_user_id
         and identity_grant.customer_id = identity_row.customer_id
        join public.app_customers identity_customer
          on identity_customer.id = identity_row.customer_id
         and identity_customer.status = 'active'
        where identity_row.auth_user_id = p_auth_user_id
          and identity_row.status = 'active'
      )
  ), authorized_cases as (
    select distinct
      case_row.id as case_id,
      case_row.customer_id,
      case_row.case_reference,
      case_row.source_class,
      case_row.source_ref,
      case_row.created_at,
      customer_row.customer_type
    from valid_actor
    join public.app_customer_access_grants access_grant
      on access_grant.auth_user_id = valid_actor.auth_user_id
    join public.app_customers customer_row
      on customer_row.id = access_grant.customer_id
     and customer_row.status = 'active'
    join public.app_cases case_row
      on case_row.customer_id = access_grant.customer_id
     and (
       access_grant.granted_case_id is null
       or access_grant.granted_case_id = case_row.id
     )
  ), legacy_cases as (
    select
      dossier.id as dossier_id,
      nullif(pg_catalog.btrim(dossier.dossier_number), '') as dossier_number,
      dossier.account_type,
      dossier.status,
      (
        dossier.locked_at is null
        and dossier.status in ('draft', 'submitted', 'needs_customer_action')
      ) as document_changes_allowed,
      authorized_case.case_id,
      authorized_case.case_reference,
      coalesce(dossier.submitted_at, authorized_case.created_at) as received_at,
      location_projection.application_location
    from authorized_cases authorized_case
    join public.app_customer_dossiers dossier
      on authorized_case.source_class = 'app_customer_dossier'
     and dossier.id::text = authorized_case.source_ref
     and dossier.customer_id = authorized_case.customer_id
     and dossier.account_type = authorized_case.customer_type
     and dossier.minimized_at is null
     and dossier.status <> 'expired_minimized'
    left join lateral (
      select case
        when pg_catalog.count(*) = 1
          and pg_catalog.count(*) filter (
            where pg_catalog.btrim(location_row.postcode_normalized) <> ''
              and pg_catalog.btrim(location_row.house_number) <> ''
          ) = 1
        then pg_catalog.max(
          case
            when pg_catalog.btrim(location_row.postcode_normalized) <> ''
              and pg_catalog.btrim(location_row.house_number) <> ''
            then pg_catalog.left(
            pg_catalog.concat_ws(
              ', ',
              pg_catalog.concat_ws(
                ' ',
                nullif(pg_catalog.btrim(location_row.street), ''),
                pg_catalog.btrim(location_row.house_number) ||
                  coalesce(nullif(pg_catalog.btrim(location_row.suffix_normalized), ''), '')
              ),
              pg_catalog.concat_ws(
                ' ',
                pg_catalog.btrim(location_row.postcode_normalized),
                nullif(pg_catalog.btrim(location_row.city), '')
              )
            ),
            120
          )
            else null
          end
        )
        else null
      end as application_location
      from public.app_dossier_locations location_row
      where location_row.dossier_id = dossier.id
    ) location_projection on true
  ), signed_cases as (
    select
      authorized_case.case_id as dossier_id,
      null::text as dossier_number,
      promotion.account_type,
      current_lifecycle.lifecycle_state as status,
      false as document_changes_allowed,
      authorized_case.case_id,
      authorized_case.case_reference,
      coalesce(received_lifecycle.event_at, authorized_case.created_at) as received_at,
      location_projection.application_location
    from authorized_cases authorized_case
    join public.app_signup_promotions promotion
      on authorized_case.source_class = 'signed_signup_intake'
     and promotion.case_id = authorized_case.case_id
     and promotion.customer_id = authorized_case.customer_id
     and promotion.intake_id::text = authorized_case.source_ref
     and promotion.account_type = authorized_case.customer_type
    join lateral (
      select lifecycle.lifecycle_state
      from public.app_case_lifecycle_events lifecycle
      where lifecycle.case_id = authorized_case.case_id
      order by lifecycle.event_at desc, lifecycle.id desc
      limit 1
    ) current_lifecycle on true
    left join lateral (
      select lifecycle.event_at
      from public.app_case_lifecycle_events lifecycle
      where lifecycle.case_id = authorized_case.case_id
        and lifecycle.promotion_id = promotion.id
        and lifecycle.lifecycle_state = 'submitted_for_review'
        and lifecycle.source_class = 'signed_signup_intake'
        and lifecycle.source_ref = promotion.intake_id::text
      order by lifecycle.event_at, lifecycle.id
      limit 1
    ) received_lifecycle on true
    left join lateral (
      with current_relations as (
        select distinct on (relation.relation_id)
          relation.location_id,
          relation.event_type
        from public.app_case_location_relations relation
        where relation.case_id = authorized_case.case_id
        order by relation.relation_id, relation.recorded_at desc, relation.id desc
      ), current_locations as (
        select distinct current_relation.location_id
        from current_relations current_relation
        where current_relation.event_type = 'linked'
      ), projected_locations as (
        select
          current_location.location_id,
          (
            select pg_catalog.left(
              pg_catalog.regexp_replace(
                pg_catalog.btrim(observation.declared_address_text),
                '[[:space:]]+',
                ' ',
                'g'
              ),
              120
            )
            from public.app_location_address_observations observation
            where observation.location_id = current_location.location_id
              and observation.observation_kind = 'customer_declared'
              and pg_catalog.btrim(observation.declared_address_text) <> ''
            order by observation.recorded_at desc, observation.id desc
            limit 1
          ) as location_label
        from current_locations current_location
      )
      select case
        when pg_catalog.count(*) = 1
          and pg_catalog.count(location_label) = 1
          then pg_catalog.max(location_label)
        else null
      end as application_location
      from projected_locations
    ) location_projection on true
  ), normalized_cases as (
    select * from legacy_cases
    union all
    select * from signed_cases
  ), projected_cases as (
    select
      normalized.dossier_id,
      normalized.dossier_number,
      normalized.account_type,
      case
        when normalized.account_type = 'particulier' then 'customer'
        else 'business'
      end as portal_context,
      normalized.status,
      normalized.document_changes_allowed,
      normalized.case_id,
      normalized.case_reference,
      coalesce(
        normalized.application_location,
        normalized.dossier_number,
        'Aanvraag ' ||
          pg_catalog.to_char(
            normalized.received_at at time zone 'UTC',
            'YYYY-MM-DD'
          ) ||
          ' - ' || pg_catalog.right(normalized.case_reference, 6)
      ) as application_label,
      normalized.received_at
    from normalized_cases normalized
  )
  select case
    when p_auth_user_id is null then
      pg_catalog.jsonb_build_object(
        'ok', false,
        'status', 400,
        'code', 'invalid_input'
      )
    when not exists (select 1 from valid_actor) then
      pg_catalog.jsonb_build_object(
        'ok', false,
        'status', 404,
        'code', 'customer_applications_not_found_or_forbidden'
      )
    else
      pg_catalog.jsonb_build_object(
        'ok', true,
        'status', 200,
        'code', 'ok',
        'applications', coalesce(
          (
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'dossier_id', projected.dossier_id,
                'dossier_number', projected.dossier_number,
                'account_type', projected.account_type,
                'portal_context', projected.portal_context,
                'status', projected.status,
                'document_changes_allowed', projected.document_changes_allowed,
                'case_id', projected.case_id,
                'case_reference', projected.case_reference,
                'application_label', projected.application_label
              ) order by
                projected.received_at desc,
                projected.case_reference,
                projected.case_id
            )
            from projected_cases projected
          ),
          '[]'::jsonb
        )
      )
  end;
$$;

revoke execute on function public.app_customer_application_index_read_v1(
  uuid
) from public;
revoke execute on function public.app_customer_application_index_read_v1(
  uuid
) from anon;
revoke execute on function public.app_customer_application_index_read_v1(
  uuid
) from authenticated;
grant execute on function public.app_customer_application_index_read_v1(
  uuid
) to service_role;

comment on function public.app_customer_application_index_read_v1(uuid) is
  'Service-role-only customer application index. Revalidates verified Auth, active identity/customer lineage and exact customer-wide or case-scoped R7 grants; returns one bounded customer-safe label per accessible case and writes no state.';

commit;

begin;

create or replace function public.app_customer_case_timeline_read_v1(
  p_auth_user_id uuid,
  p_case_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with authority as (
    select case_row.id as case_id, case_row.customer_id
    from public.app_cases case_row
    join public.app_customers customer_row
      on customer_row.id = case_row.customer_id
     and customer_row.status = 'active'
    where p_auth_user_id is not null
      and p_case_id is not null
      and case_row.id = p_case_id
      and exists (
        select 1
        from auth.users auth_user
        where auth_user.id = p_auth_user_id
          and auth_user.deleted_at is null
          and coalesce(
            auth_user.email_confirmed_at,
            auth_user.confirmed_at
          ) is not null
      )
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
      and exists (
        select 1
        from public.app_customer_access_grants access_grant
        where access_grant.auth_user_id = p_auth_user_id
          and access_grant.customer_id = case_row.customer_id
          and (
            access_grant.granted_case_id is null
            or access_grant.granted_case_id = case_row.id
          )
      )
      and (
        (
          case_row.source_class = 'signed_signup_intake'
          and exists (
            select 1
            from public.app_signup_promotions promotion
            where promotion.case_id = case_row.id
              and promotion.customer_id = case_row.customer_id
              and promotion.intake_id::text = case_row.source_ref
              and promotion.account_type = customer_row.customer_type
          )
        )
        or (
          case_row.source_class = 'app_customer_dossier'
          and exists (
            select 1
            from public.app_customer_dossiers dossier
            where dossier.id::text = case_row.source_ref
              and dossier.customer_id = case_row.customer_id
              and dossier.account_type = customer_row.customer_type
              and dossier.minimized_at is null
              and dossier.status <> 'expired_minimized'
          )
        )
      )
  ), raw_events as (
    select
      'dossier_submitted'::text as event_type,
      lifecycle.event_at as occurred_at,
      20 as phase_priority,
      lifecycle.id as source_id
    from authority
    join public.app_signup_promotions promotion
      on promotion.case_id = authority.case_id
     and promotion.customer_id = authority.customer_id
    join public.app_case_lifecycle_events lifecycle
      on lifecycle.case_id = authority.case_id
     and lifecycle.promotion_id = promotion.id
     and lifecycle.lifecycle_state = 'submitted_for_review'
     and lifecycle.source_class = 'signed_signup_intake'
     and lifecycle.source_ref = promotion.intake_id::text

    union all

    select
      'correction_requested'::text,
      handoff.published_at,
      30,
      handoff.id
    from authority
    join public.app_evidence_review_rounds review_round
      on review_round.case_id = authority.case_id
     and review_round.outcome = 'CORRECTIONS_REQUIRED'
    join public.app_evidence_review_correction_handoffs handoff
      on handoff.case_id = authority.case_id
     and handoff.round_id = review_round.id
     and handoff.target_customer_id = authority.customer_id
     and handoff.manifest_version = review_round.manifest_version
     and handoff.manifest_hash = review_round.manifest_hash
    where not exists (
      select 1
      from public.app_evidence_review_correction_handoffs successor
      where successor.supersedes_handoff_id = handoff.id
    )

    union all

    select
      'correction_submitted'::text,
      submission.finalized_at,
      40,
      submission.id
    from authority
    join public.app_evidence_review_correction_handoffs handoff
      on handoff.case_id = authority.case_id
     and handoff.target_customer_id = authority.customer_id
    join public.app_evidence_review_customer_submissions submission
      on submission.handoff_id = handoff.id
     and submission.case_id = authority.case_id
     and submission.customer_id = authority.customer_id
    where not exists (
      select 1
      from public.app_evidence_review_correction_handoffs successor
      where successor.supersedes_handoff_id = handoff.id
    )

    union all

    select
      'review_completed'::text,
      review_round.finalized_at,
      50,
      review_round.id
    from authority
    join public.app_evidence_review_rounds review_round
      on review_round.case_id = authority.case_id
     and review_round.outcome = 'ALL_FACTS_ACCEPTED'
  ), projected_events_unbounded as (
    select
      'tle_' || pg_catalog.md5(
        'customer_timeline_v1|' || raw_events.event_type || '|' ||
        raw_events.source_id::text
      ) as event_id,
      raw_events.event_type,
      pg_catalog.date_trunc('milliseconds', raw_events.occurred_at) as occurred_at,
      raw_events.phase_priority
    from raw_events
    where raw_events.occurred_at <= pg_catalog.statement_timestamp()
  ), projected_events as (
    select *
    from projected_events_unbounded
    order by
      projected_events_unbounded.occurred_at desc,
      projected_events_unbounded.phase_priority desc,
      projected_events_unbounded.event_id
    limit 50
  )
  select case
    when p_auth_user_id is null or p_case_id is null then
      pg_catalog.jsonb_build_object(
        'ok', false,
        'status', 400,
        'code', 'invalid_input'
      )
    when not exists (select 1 from authority) then
      pg_catalog.jsonb_build_object(
        'ok', false,
        'status', 404,
        'code', 'customer_case_timeline_not_found_or_forbidden'
      )
    else
      pg_catalog.jsonb_build_object(
        'ok', true,
        'status', 200,
        'code', 'ok',
        'timeline', coalesce(
          (
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'event_id', projected_events.event_id,
                'event_type', projected_events.event_type,
                'occurred_at', pg_catalog.to_char(
                  projected_events.occurred_at at time zone 'UTC',
                  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                )
              ) order by
                projected_events.occurred_at desc,
                projected_events.phase_priority desc,
                projected_events.event_id
            )
            from projected_events
          ),
          '[]'::jsonb
        )
      )
  end;
$$;

revoke execute on function public.app_customer_case_timeline_read_v1(
  uuid, uuid
) from public;
revoke execute on function public.app_customer_case_timeline_read_v1(
  uuid, uuid
) from anon;
revoke execute on function public.app_customer_case_timeline_read_v1(
  uuid, uuid
) from authenticated;
grant execute on function public.app_customer_case_timeline_read_v1(
  uuid, uuid
) to service_role;

comment on function public.app_customer_case_timeline_read_v1(uuid, uuid) is
  'Service-role-only customer-safe case timeline projection. It revalidates verified Auth, active identity/customer lineage and exact customer-wide or case-scoped access grants, then returns at most 50 allowlisted submission, correction and completed-review event references without source identifiers or payloads.';

commit;

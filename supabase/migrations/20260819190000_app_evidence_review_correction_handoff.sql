begin;

-- REVIEW19 adds one immutable customer correction publication boundary. Review
-- truth remains owned by the finalized FACT round; WAITING_CUSTOMER is derived
-- only when that exact current round has an immutable published handoff.

alter table public.app_workforce_capability_catalog
  drop constraint app_workforce_capability_shape_chk;
alter table public.app_workforce_capability_catalog
  add constraint app_workforce_capability_shape_chk check (
    (
      capability_code in (
        'location.root.create',
        'evidence.review.view',
        'evidence.review.decide'
      )
      and scope_kind = 'case'
      and (
        capability_code not in (
          'evidence.review.view', 'evidence.review.decide'
        )
        or (
          floor_seniority = 'member'
          and default_seniority = case capability_code
            when 'evidence.review.view' then 'member'
            else 'reviewer'
          end
        )
      )
    )
    or (
      capability_code = 'evidence.review.correction.publish'
      and scope_kind = 'case'
      and floor_seniority = 'reviewer'
      and default_seniority = 'reviewer'
    )
    or (
      capability_code in (
        'location.observation.record',
        'location.version.accept.prepare',
        'location.version.accept.approve',
        'location.version.correct.prepare',
        'location.version.correct.approve'
      )
      and scope_kind = 'case_location'
    )
    or (
      capability_code in (
        'workforce.member.manage',
        'workforce.policy.manage',
        'case.assignment.manage'
      )
      and scope_kind = 'global'
      and floor_seniority = 'admin'
      and default_seniority = 'admin'
    )
    or (
      capability_code in (
        'compliance.delivery_year.view',
        'compliance.delivery_year.record'
      )
      and scope_kind = 'tenant_wide'
      and floor_seniority = 'member'
      and default_seniority = 'reviewer'
    )
  );

insert into public.app_workforce_capability_catalog (
  capability_code, catalogue_version, floor_seniority,
  default_seniority, scope_kind
) values (
  'evidence.review.correction.publish', 'pilot_v1',
  'reviewer', 'reviewer', 'case'
);

alter table public.app_workforce_capability_assignments
  drop constraint app_workforce_capability_assignments_capability_chk;
alter table public.app_workforce_capability_assignments
  add constraint app_workforce_capability_assignments_capability_chk check (
    capability_code in (
      'location.root.create',
      'location.observation.record',
      'location.version.accept.prepare',
      'location.version.accept.approve',
      'location.version.correct.prepare',
      'location.version.correct.approve',
      'workforce.member.manage',
      'workforce.policy.manage',
      'case.assignment.manage',
      'compliance.delivery_year.view',
      'compliance.delivery_year.record',
      'evidence.review.view',
      'evidence.review.decide',
      'evidence.review.correction.publish'
    )
  );

alter table public.app_workforce_scope_assignments
  drop constraint app_workforce_scope_assignments_capability_chk;
alter table public.app_workforce_scope_assignments
  add constraint app_workforce_scope_assignments_capability_chk check (
    capability_code in (
      'location.root.create',
      'location.observation.record',
      'location.version.accept.prepare',
      'location.version.accept.approve',
      'location.version.correct.prepare',
      'location.version.correct.approve',
      'evidence.review.view',
      'evidence.review.decide',
      'evidence.review.correction.publish'
    )
  );
alter table public.app_workforce_scope_assignments
  drop constraint app_workforce_scope_assignments_shape_chk;
alter table public.app_workforce_scope_assignments
  add constraint app_workforce_scope_assignments_shape_chk check (
    (
      capability_code in (
        'location.root.create',
        'evidence.review.view',
        'evidence.review.decide',
        'evidence.review.correction.publish'
      )
      and location_id is null
      and case_location_relation_id is null
    )
    or (
      capability_code in (
        'location.observation.record',
        'location.version.accept.prepare',
        'location.version.accept.approve',
        'location.version.correct.prepare',
        'location.version.correct.approve'
      )
      and location_id is not null
      and case_location_relation_id is not null
    )
  );

create or replace function public.app_workforce_scope_assignments_insert_guard()
returns trigger
language plpgsql
set search_path = 'pg_catalog', 'public'
as $$
declare
  predecessor public.app_workforce_scope_assignments%rowtype;
  capability_grant public.app_workforce_capability_assignments%rowtype;
  relation_link public.app_case_location_relations%rowtype;
  identity_state text;
  v_scope_kind text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'workforce_scope:v1:' || new.workforce_identity_id::text || ':' ||
    new.capability_code || ':' || new.case_id::text || ':' ||
    coalesce(new.location_id::text, 'case'), 0
  ));
  select catalog.scope_kind into v_scope_kind
  from public.app_workforce_capability_catalog catalog
  where catalog.capability_code = new.capability_code;
  if not found or v_scope_kind not in ('case', 'case_location') then
    raise exception 'workforce scope capability invalid' using errcode = '23514';
  end if;

  if new.supersedes_scope_event_id is null then
    if new.event_type <> 'granted' then
      raise exception 'workforce scope root must be granted'
        using errcode = '23514';
    end if;
    select state_event.state into identity_state
    from public.app_workforce_identity_states state_event
    where state_event.workforce_identity_id = new.workforce_identity_id
      and state_event.effective_at <= new.effective_at
    order by state_event.effective_at desc, state_event.recorded_at desc
    limit 1;
    select * into capability_grant
    from public.app_workforce_capability_assignments
    where id = new.capability_assignment_id;
    if identity_state is distinct from 'active'
       or not found
       or capability_grant.workforce_identity_id <> new.workforce_identity_id
       or capability_grant.capability_code <> new.capability_code
       or capability_grant.supersedes_assignment_event_id is not null
       or capability_grant.event_type <> 'granted'
       or capability_grant.effective_at > new.effective_at
       or (
         capability_grant.valid_until is not null and (
           new.effective_at >= capability_grant.valid_until
           or new.valid_until is null
           or new.valid_until > capability_grant.valid_until
         )
       )
       or exists (
         select 1
         from public.app_workforce_capability_assignments capability_revoke
         where capability_revoke.assignment_id = capability_grant.assignment_id
           and capability_revoke.event_type = 'revoked'
           and capability_revoke.effective_at <= new.effective_at
       ) then
      raise exception 'scope grant requires active identity and capability'
        using errcode = '23514';
    end if;
    if v_scope_kind = 'case_location' then
      select * into relation_link
      from public.app_case_location_relations
      where id = new.case_location_relation_id;
      if not found
         or relation_link.case_id <> new.case_id
         or relation_link.location_id <> new.location_id
         or relation_link.supersedes_relation_event_id is not null
         or relation_link.event_type <> 'linked'
         or relation_link.effective_at > new.effective_at
         or (
           relation_link.valid_until is not null and (
             new.effective_at >= relation_link.valid_until
             or new.valid_until is null
             or new.valid_until > relation_link.valid_until
           )
         )
         or exists (
           select 1 from public.app_case_location_relations relation_unlink
           where relation_unlink.relation_id = relation_link.relation_id
             and relation_unlink.event_type = 'unlinked'
             and relation_unlink.effective_at <= new.effective_at
         ) then
        raise exception 'location scope requires an active case location relation'
          using errcode = '23514';
      end if;
    end if;
    if exists (
      select 1
      from public.app_workforce_scope_assignments scope_grant
      where scope_grant.workforce_identity_id = new.workforce_identity_id
        and scope_grant.capability_code = new.capability_code
        and scope_grant.case_id = new.case_id
        and scope_grant.location_id is not distinct from new.location_id
        and scope_grant.event_type = 'granted'
        and scope_grant.effective_at
          < coalesce(new.valid_until, 'infinity'::timestamptz)
        and new.effective_at < least(
          coalesce(scope_grant.valid_until, 'infinity'::timestamptz),
          coalesce((
            select scope_revoke.effective_at
            from public.app_workforce_scope_assignments scope_revoke
            where scope_revoke.scope_assignment_id =
                  scope_grant.scope_assignment_id
              and scope_revoke.event_type = 'revoked'
            order by scope_revoke.effective_at limit 1
          ), 'infinity'::timestamptz)
        )
    ) then
      raise exception 'overlapping workforce scope grants are not allowed'
        using errcode = '23514';
    end if;
  else
    select * into predecessor
    from public.app_workforce_scope_assignments
    where id = new.supersedes_scope_event_id
    for update;
    if not found
       or predecessor.event_type <> 'granted'
       or new.event_type <> 'revoked'
       or new.scope_assignment_id <> predecessor.scope_assignment_id
       or new.workforce_identity_id <> predecessor.workforce_identity_id
       or new.capability_assignment_id <> predecessor.capability_assignment_id
       or new.capability_code <> predecessor.capability_code
       or new.case_id <> predecessor.case_id
       or new.location_id is distinct from predecessor.location_id
       or new.case_location_relation_id is distinct from
            predecessor.case_location_relation_id
       or new.effective_at <= predecessor.effective_at
       or new.recorded_at <= predecessor.recorded_at
       or (
         predecessor.valid_until is not null
         and new.effective_at > predecessor.valid_until
       )
       or exists (
         select 1 from public.app_workforce_scope_assignments successor
         where successor.supersedes_scope_event_id = predecessor.id
       ) then
      raise exception 'invalid workforce scope revocation'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.app_workforce_scope_is_authorized_v1(
  p_workforce_identity_id uuid,
  p_scope_assignment_id uuid,
  p_capability_code text,
  p_case_id uuid,
  p_location_id uuid,
  p_at timestamptz
)
returns boolean
language sql
stable
set search_path = 'pg_catalog', 'public'
as $$
  select
    coalesce((
      select state_event.state = 'active'
      from public.app_workforce_identity_states state_event
      where state_event.workforce_identity_id = p_workforce_identity_id
        and state_event.effective_at <= p_at
      order by state_event.effective_at desc, state_event.recorded_at desc
      limit 1
    ), false)
    and exists (
      select 1
      from public.app_workforce_scope_assignments scope_grant
      join public.app_workforce_capability_assignments capability_grant
        on capability_grant.id = scope_grant.capability_assignment_id
       and capability_grant.workforce_identity_id = scope_grant.workforce_identity_id
       and capability_grant.capability_code = scope_grant.capability_code
      join public.app_workforce_capability_catalog catalog
        on catalog.capability_code = scope_grant.capability_code
      where scope_grant.id = p_scope_assignment_id
        and scope_grant.supersedes_scope_event_id is null
        and scope_grant.event_type = 'granted'
        and scope_grant.workforce_identity_id = p_workforce_identity_id
        and scope_grant.capability_code = p_capability_code
        and scope_grant.case_id = p_case_id
        and scope_grant.location_id is not distinct from p_location_id
        and scope_grant.effective_at <= p_at
        and (scope_grant.valid_until is null or p_at < scope_grant.valid_until)
        and capability_grant.supersedes_assignment_event_id is null
        and capability_grant.event_type = 'granted'
        and capability_grant.effective_at <= p_at
        and (
          capability_grant.valid_until is null
          or p_at < capability_grant.valid_until
        )
        and not exists (
          select 1 from public.app_workforce_scope_assignments scope_revoke
          where scope_revoke.scope_assignment_id = scope_grant.scope_assignment_id
            and scope_revoke.event_type = 'revoked'
            and scope_revoke.effective_at <= p_at
        )
        and not exists (
          select 1
          from public.app_workforce_capability_assignments capability_revoke
          where capability_revoke.assignment_id = capability_grant.assignment_id
            and capability_revoke.event_type = 'revoked'
            and capability_revoke.effective_at <= p_at
        )
        and (
          catalog.scope_kind = 'case'
          or (
            catalog.scope_kind = 'case_location'
            and exists (
              select 1
              from public.app_case_location_relations relation_link
              where relation_link.id = scope_grant.case_location_relation_id
                and relation_link.supersedes_relation_event_id is null
                and relation_link.event_type = 'linked'
                and relation_link.case_id = p_case_id
                and relation_link.location_id = p_location_id
                and relation_link.effective_at <= p_at
                and (
                  relation_link.valid_until is null
                  or p_at < relation_link.valid_until
                )
                and not exists (
                  select 1
                  from public.app_case_location_relations relation_unlink
                  where relation_unlink.relation_id = relation_link.relation_id
                    and relation_unlink.event_type = 'unlinked'
                    and relation_unlink.effective_at <= p_at
                )
            )
          )
        )
    );
$$;

create or replace function public.app_workforce_case_assignment_manage_v1(
  p_auth_user_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_payload_sha256 text,
  p_idempotency_expires_at timestamptz,
  p_action text,
  p_target_workforce_identity_id uuid,
  p_capability_code text,
  p_case_id uuid,
  p_location_id uuid,
  p_case_location_relation_id uuid,
  p_scope_assignment_id uuid,
  p_effective_at timestamptz,
  p_valid_until timestamptz,
  p_decision_ref text,
  p_reason_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_auth jsonb;
  v_scope text;
  v_begin jsonb;
  v_capability public.app_workforce_capability_assignments%rowtype;
  v_existing public.app_workforce_scope_assignments%rowtype;
  v_new_scope_id uuid;
  v_chain_id uuid;
  v_response jsonb;
  v_scope_kind text;
begin
  v_auth := public.app_workforce_authorize_v1(
    p_auth_user_id, 'case.assignment.manage', null, null, v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;
  select catalog.scope_kind into v_scope_kind
  from public.app_workforce_capability_catalog catalog
  where catalog.capability_code = p_capability_code;
  if p_action not in ('grant', 'end')
     or p_target_workforce_identity_id is null
     or p_effective_at is null
     or p_effective_at < v_now - interval '5 minutes'
     or coalesce(pg_catalog.btrim(p_decision_ref), '') = ''
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or v_scope_kind not in ('case', 'case_location')
     or (p_action = 'end' and coalesce(pg_catalog.btrim(p_reason_ref), '') = '') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  v_scope := 'workforce_case_assignment:v1:' ||
    p_target_workforce_identity_id::text || ':' || p_capability_code || ':' ||
    coalesce(p_scope_assignment_id::text, p_case_id::text, 'missing');
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_sha256,
    p_idempotency_expires_at, 'admin', v_auth->>'actor_ref', p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;
  if p_action = 'grant' then
    if p_case_id is null or p_scope_assignment_id is not null
       or (v_scope_kind = 'case' and (
         p_location_id is not null or p_case_location_relation_id is not null
       ))
       or (v_scope_kind = 'case_location' and (
         p_location_id is null or p_case_location_relation_id is null
       )) then
      raise exception 'assignment scope shape invalid' using errcode = '23514';
    end if;
    select grant_event.* into v_capability
    from public.app_workforce_capability_assignments grant_event
    where grant_event.workforce_identity_id = p_target_workforce_identity_id
      and grant_event.capability_code = p_capability_code
      and grant_event.supersedes_assignment_event_id is null
      and grant_event.event_type = 'granted'
      and grant_event.effective_at <= p_effective_at
      and (
        grant_event.valid_until is null
        or p_effective_at < grant_event.valid_until
      )
      and not exists (
        select 1
        from public.app_workforce_capability_assignments revoke_event
        where revoke_event.assignment_id = grant_event.assignment_id
          and revoke_event.event_type = 'revoked'
          and revoke_event.effective_at <= p_effective_at
      )
    order by grant_event.effective_at desc limit 1;
    if not found then
      raise exception 'target capability missing' using errcode = '42501';
    end if;
    if v_scope_kind = 'case_location' and not exists (
      select 1 from public.app_case_location_relations relation
      where relation.id = p_case_location_relation_id
        and relation.case_id = p_case_id
        and relation.location_id = p_location_id
        and relation.event_type = 'linked'
        and relation.supersedes_relation_event_id is null
    ) then
      raise exception 'case location relation missing' using errcode = '42501';
    end if;
    v_chain_id := gen_random_uuid();
    insert into public.app_workforce_scope_assignments (
      scope_assignment_id, workforce_identity_id,
      capability_assignment_id, capability_code, case_id, location_id,
      case_location_relation_id, event_type, effective_at, valid_until,
      decision_ref, reason_ref, recorded_by_actor_ref, request_id,
      supersedes_scope_event_id
    ) values (
      v_chain_id, p_target_workforce_identity_id, v_capability.id,
      p_capability_code, p_case_id, p_location_id,
      p_case_location_relation_id, 'granted', p_effective_at, p_valid_until,
      p_decision_ref, null, v_auth->>'actor_ref', p_request_id || ':scope', null
    ) returning id into v_new_scope_id;
  else
    select * into v_existing
    from public.app_workforce_scope_assignments scope_event
    where scope_event.id = p_scope_assignment_id
      and scope_event.workforce_identity_id = p_target_workforce_identity_id
      and scope_event.capability_code = p_capability_code
      and scope_event.event_type = 'granted'
      and scope_event.supersedes_scope_event_id is null
    for update;
    if not found then
      raise exception 'assignment missing' using errcode = '42501';
    end if;
    insert into public.app_workforce_scope_assignments (
      scope_assignment_id, workforce_identity_id,
      capability_assignment_id, capability_code, case_id, location_id,
      case_location_relation_id, event_type, effective_at, valid_until,
      decision_ref, reason_ref, recorded_by_actor_ref, request_id,
      supersedes_scope_event_id
    ) values (
      v_existing.scope_assignment_id, v_existing.workforce_identity_id,
      v_existing.capability_assignment_id, v_existing.capability_code,
      v_existing.case_id, v_existing.location_id,
      v_existing.case_location_relation_id, 'revoked', p_effective_at, null,
      p_decision_ref, p_reason_ref, v_auth->>'actor_ref',
      p_request_id || ':scope', v_existing.id
    ) returning id into v_new_scope_id;
  end if;
  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'ok',
    'action', p_action, 'scope_assignment_event_id', v_new_scope_id
  );
  return public.app_workforce_admin_complete_v1(
    v_scope, p_idempotency_key,
    case p_action when 'grant' then 'workforce_assignment_granted'
      else 'workforce_assignment_ended' end,
    'workforce_assignment', v_new_scope_id, p_request_id,
    v_auth->>'actor_ref',
    pg_catalog.jsonb_build_object(
      'capability', 'case.assignment.manage',
      'assigned_capability', p_capability_code,
      'action', p_action, 'case_id', p_case_id,
      'location_id', p_location_id, 'decision', 'allowed'
    ), (v_auth->>'policy_version_id')::uuid, v_response
  );
exception when unique_violation or check_violation or foreign_key_violation then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'assignment_change_rejected'
  );
end;
$$;

create or replace function public.app_workforce_policy_complete_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select pg_catalog.count(*)
    from public.app_workforce_policy_requirements requirement
    where requirement.policy_version_id = new.id
  ) <> (
    select pg_catalog.count(*)
    from public.app_workforce_capability_catalog catalog
  ) then
    raise exception 'workforce policy capability set is incomplete'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create or replace function public.app_workforce_policy_activation_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('workforce_policy_active:v1', 0)
  );
  if (
    select pg_catalog.count(*)
    from public.app_workforce_policy_requirements requirement
    where requirement.policy_version_id = new.policy_version_id
  ) <> (
    select pg_catalog.count(*)
    from public.app_workforce_capability_catalog catalog
  ) then
    raise exception 'incomplete workforce policy cannot activate'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.app_workforce_policy_manage_v1(
  p_auth_user_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_payload_sha256 text,
  p_idempotency_expires_at timestamptz,
  p_action text,
  p_policy_version_id uuid,
  p_policy_ref text,
  p_require_distinct_maker_checker boolean,
  p_requirements jsonb,
  p_effective_at timestamptz,
  p_decision_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_auth jsonb;
  v_scope text;
  v_begin jsonb;
  v_policy_id uuid;
  v_count integer;
  requirement record;
  identity_row record;
  v_response jsonb;
begin
  v_auth := public.app_workforce_authorize_v1(
    p_auth_user_id, 'workforce.policy.manage', null, null, v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;
  if p_action not in ('create', 'activate')
     or coalesce(pg_catalog.btrim(p_decision_ref), '') = ''
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or (p_action = 'activate' and (
       p_effective_at is null or p_effective_at < v_now - interval '5 minutes'
     )) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  v_scope := 'workforce_policy_manage:v1:' ||
    coalesce(p_policy_version_id::text, p_policy_ref, 'missing');
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_sha256,
    p_idempotency_expires_at, 'admin', v_auth->>'actor_ref', p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('workforce_policy_active:v1', 0)
  );
  if p_action = 'create' then
    if p_policy_version_id is not null
       or coalesce(pg_catalog.btrim(p_policy_ref), '') = ''
       or p_require_distinct_maker_checker is null
       or p_requirements is null
       or pg_catalog.jsonb_typeof(p_requirements) <> 'object' then
      raise exception 'policy create input invalid' using errcode = '23514';
    end if;
    select pg_catalog.count(*) into v_count
    from pg_catalog.jsonb_object_keys(p_requirements);
    if v_count <> (
      select pg_catalog.count(*)
      from public.app_workforce_capability_catalog catalog
    ) then
      raise exception 'policy capability count invalid' using errcode = '23514';
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_requirements)
        as supplied(capability_code)
      where not exists (
        select 1
        from public.app_workforce_capability_catalog catalog
        where catalog.capability_code = supplied.capability_code
      )
    ) then
      raise exception 'custom capability rejected' using errcode = '23514';
    end if;
    insert into public.app_workforce_policy_versions (
      policy_ref, catalogue_version, require_distinct_maker_checker,
      canonical_sha256, created_by_workforce_identity_id,
      created_by_actor_ref, decision_ref, request_id
    ) values (
      p_policy_ref, 'pilot_v1', p_require_distinct_maker_checker,
      p_payload_sha256, (v_auth->>'workforce_identity_id')::uuid,
      v_auth->>'actor_ref', p_decision_ref, p_request_id || ':policy'
    ) returning id into v_policy_id;
    for requirement in
      select catalog.capability_code, catalog.floor_seniority,
        p_requirements->>catalog.capability_code as minimum_seniority
      from public.app_workforce_capability_catalog catalog
    loop
      if requirement.minimum_seniority not in ('member', 'reviewer', 'admin')
         or public.app_workforce_seniority_rank_v1(
              requirement.minimum_seniority
            ) < public.app_workforce_seniority_rank_v1(
              requirement.floor_seniority
            ) then
        raise exception 'policy weakens software floor' using errcode = '42501';
      end if;
      insert into public.app_workforce_policy_requirements (
        policy_version_id, capability_code, minimum_seniority
      ) values (
        v_policy_id, requirement.capability_code,
        requirement.minimum_seniority
      );
    end loop;
  else
    if p_policy_version_id is null or p_effective_at is null
       or not exists (
         select 1
         from public.app_workforce_policy_versions policy_version
         where policy_version.id = p_policy_version_id
       ) then
      raise exception 'policy activation input invalid' using errcode = '23514';
    end if;
    v_policy_id := p_policy_version_id;
    insert into public.app_workforce_policy_activations (
      policy_version_id, effective_at, activated_by_workforce_identity_id,
      activated_by_actor_ref, decision_ref, request_id
    ) values (
      v_policy_id, p_effective_at,
      (v_auth->>'workforce_identity_id')::uuid, v_auth->>'actor_ref',
      p_decision_ref, p_request_id || ':activation'
    );
    for identity_row in select id from public.app_workforce_identities loop
      perform public.app_workforce_reconcile_capabilities_v1(
        identity_row.id, p_effective_at, v_auth->>'actor_ref',
        p_decision_ref,
        p_request_id || ':' || pg_catalog.md5(identity_row.id::text)
      );
    end loop;
  end if;
  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'ok',
    'action', p_action, 'policy_version_id', v_policy_id
  );
  return public.app_workforce_admin_complete_v1(
    v_scope, p_idempotency_key,
    case p_action when 'create' then 'workforce_policy_version_created'
      else 'workforce_policy_activated' end,
    'workforce_policy', v_policy_id, p_request_id, v_auth->>'actor_ref',
    pg_catalog.jsonb_build_object(
      'capability', 'workforce.policy.manage', 'action', p_action,
      'decision', 'allowed'
    ), case when p_action = 'activate' then v_policy_id
      else (v_auth->>'policy_version_id')::uuid end, v_response
  );
exception when unique_violation or check_violation or foreign_key_violation then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'policy_change_rejected'
  );
end;
$$;

insert into public.app_workforce_policy_versions (
  id, policy_ref, catalogue_version, require_distinct_maker_checker,
  canonical_sha256, created_by_workforce_identity_id,
  created_by_actor_ref, decision_ref, request_id
) values (
  '00000000-0000-4000-8000-000000003401',
  'enval_default_v5', 'pilot_v1', true,
  pg_catalog.encode(extensions.digest(
    'review19|enval_default_v5|evidence.review.correction.publish=reviewer',
    'sha256'
  ), 'hex'),
  null, 'system:review19_migration',
  'review19_default_policy', 'review19-default-policy-v5'
);

insert into public.app_workforce_policy_requirements (
  policy_version_id, capability_code, minimum_seniority
)
select
  '00000000-0000-4000-8000-000000003401'::uuid,
  catalog.capability_code,
  catalog.default_seniority
from public.app_workforce_capability_catalog catalog;

do $$
declare
  v_effective_at timestamptz := pg_catalog.clock_timestamp();
  identity_row record;
begin
  insert into public.app_workforce_policy_activations (
    id, policy_version_id, effective_at, recorded_at,
    activated_by_workforce_identity_id, activated_by_actor_ref,
    decision_ref, request_id
  ) values (
    '00000000-0000-4000-8000-000000003402',
    '00000000-0000-4000-8000-000000003401',
    v_effective_at, v_effective_at, null,
    'system:review19_migration', 'review19_default_policy',
    'review19-default-policy-activation-v5'
  );
  insert into public.app_audit_events (
    event_type, scope_type, scope_id, request_id, actor_type, actor_ref,
    event_data, authorization_policy_version_id, created_at
  ) values
    (
      'workforce_policy_version_created', 'workforce_policy',
      '00000000-0000-4000-8000-000000003401',
      'review19-default-policy-v5', 'system', 'system:review19_migration',
      '{"catalogue_version":"pilot_v1","policy_ref":"enval_default_v5"}',
      '00000000-0000-4000-8000-000000003401', v_effective_at
    ),
    (
      'workforce_policy_activated', 'workforce_policy',
      '00000000-0000-4000-8000-000000003401',
      'review19-default-policy-activation-v5', 'system',
      'system:review19_migration',
      '{"catalogue_version":"pilot_v1","policy_ref":"enval_default_v5"}',
      '00000000-0000-4000-8000-000000003401', v_effective_at
    );
  for identity_row in
    select id from public.app_workforce_identities order by id
  loop
    perform public.app_workforce_reconcile_capabilities_v1(
      identity_row.id, v_effective_at, 'system:review19_migration',
      'review19_default_policy',
      'review19-reconcile-' || pg_catalog.md5(identity_row.id::text)
    );
  end loop;
end;
$$;

create table public.app_evidence_review_correction_handoffs (
  id uuid primary key default gen_random_uuid(),
  handoff_reference text not null unique,
  case_id uuid not null references public.app_cases(id) on delete restrict,
  round_id uuid not null unique
    references public.app_evidence_review_rounds(id) on delete restrict,
  manifest_version text not null,
  manifest_hash text not null,
  target_customer_id uuid not null
    references public.app_customers(id) on delete restrict,
  correction_bundle jsonb not null,
  bundle_sha256 text not null,
  publisher_workforce_identity_id uuid not null
    references public.app_workforce_identities(id) on delete restrict,
  publisher_scope_assignment_id uuid not null
    references public.app_workforce_scope_assignments(id) on delete restrict,
  capability_code text not null,
  authorization_policy_version_id uuid not null
    references public.app_workforce_policy_versions(id) on delete restrict,
  payload_sha256 text not null,
  request_id text not null unique,
  idempotency_key text not null,
  published_at timestamptz not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),

  constraint app_evidence_review_correction_handoffs_ref_chk check (
    handoff_reference ~ '^CRH-[0-9A-F]{16}$'
    and request_id = pg_catalog.btrim(request_id)
    and pg_catalog.char_length(request_id) between 1 and 128
    and idempotency_key = pg_catalog.btrim(idempotency_key)
    and pg_catalog.char_length(idempotency_key) between 1 and 200
  ),
  constraint app_evidence_review_correction_handoffs_manifest_chk check (
    manifest_version = 'fact-review-manifest-v1'
    and manifest_hash ~ '^[0-9a-f]{64}$'
    and bundle_sha256 ~ '^[0-9a-f]{64}$'
    and payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint app_evidence_review_correction_handoffs_capability_chk check (
    capability_code = 'evidence.review.correction.publish'
  ),
  constraint app_evidence_review_correction_handoffs_bundle_chk check (
    pg_catalog.jsonb_typeof(correction_bundle) = 'object'
    and correction_bundle->>'schema_version' =
      'evidence-review-correction-handoff-bundle-v1'
    and pg_catalog.jsonb_typeof(correction_bundle->'items') = 'array'
    and pg_catalog.jsonb_array_length(correction_bundle->'items') > 0
  ),
  constraint app_evidence_review_correction_handoffs_time_chk check (
    published_at <= recorded_at
  )
);

comment on table public.app_evidence_review_correction_handoffs is
  'Immutable causal anchor from one exact finalized CORRECTIONS_REQUIRED FACT-review round to one server-resolved customer context. It is not mutable task state and has no customer submission completion flag.';

create index app_evidence_review_correction_handoffs_case_time_idx
  on public.app_evidence_review_correction_handoffs(
    case_id, published_at desc, id desc
  );
create index app_evidence_review_correction_handoffs_customer_case_idx
  on public.app_evidence_review_correction_handoffs(
    target_customer_id, case_id, published_at desc
  );

create function public.app_evidence_review_correction_handoff_immutable_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'evidence review correction handoff is immutable';
end;
$$;

create trigger trg_app_evidence_review_correction_handoffs_immutable
before update or delete on public.app_evidence_review_correction_handoffs
for each row execute function
  public.app_evidence_review_correction_handoff_immutable_guard_v1();

create function public.app_evidence_review_correction_publish_v1(
  p_auth_user_id uuid,
  p_case_ref text,
  p_round_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_payload_sha256 text,
  p_idempotency_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_case public.app_cases%rowtype;
  v_round public.app_evidence_review_rounds%rowtype;
  v_existing public.app_evidence_review_correction_handoffs%rowtype;
  v_auth jsonb;
  v_manifest jsonb;
  v_scope text;
  v_begin jsonb;
  v_bundle jsonb;
  v_bundle_sha256 text;
  v_handoff_id uuid;
  v_handoff_reference text;
  v_response jsonb;
begin
  if p_auth_user_id is null
     or p_case_ref is null
     or p_case_ref <> pg_catalog.btrim(p_case_ref)
     or pg_catalog.char_length(p_case_ref) not between 8 and 64
     or p_round_id is null
     or p_request_id is null
     or p_request_id <> pg_catalog.btrim(p_request_id)
     or pg_catalog.char_length(p_request_id) not between 1 and 128
     or p_idempotency_key is null
     or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
     or pg_catalog.char_length(p_idempotency_key) not between 1 and 200
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or p_idempotency_expires_at is null
     or p_idempotency_expires_at <= v_now then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;

  select case_row.* into v_case
  from public.app_cases case_row
  where case_row.case_reference = p_case_ref;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'case_missing'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'evidence_review_correction_handoff:v1:' || v_case.id::text || ':' ||
    p_round_id::text, 0
  ));

  v_auth := public.app_workforce_authorize_v1(
    p_auth_user_id, 'evidence.review.correction.publish',
    v_case.id, null, v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;

  select round_row.* into v_round
  from public.app_evidence_review_rounds round_row
  where round_row.id = p_round_id
    and round_row.case_id = v_case.id;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'review_round_missing'
    );
  end if;

  v_manifest := public.app_evidence_fact_review_manifest_v1(v_case.id);
  if v_manifest->>'ok' <> 'true' then return v_manifest; end if;
  if v_round.manifest_version <> v_manifest->>'manifest_version'
     or v_round.manifest_hash <> v_manifest->>'manifest_hash' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'stale_review_round'
    );
  end if;
  if v_round.outcome <> 'CORRECTIONS_REQUIRED' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'correction_handoff_not_eligible'
    );
  end if;

  if not exists (
    select 1 from public.app_customers customer_row
    where customer_row.id = v_case.customer_id
      and customer_row.status = 'active'
  )
     or exists (
       select 1 from public.app_customer_access_grants access_grant
       where access_grant.granted_case_id = v_case.id
         and access_grant.customer_id <> v_case.customer_id
     )
     or not exists (
       select 1 from public.app_customer_access_grants access_grant
       where access_grant.customer_id = v_case.customer_id
         and (
           access_grant.granted_case_id is null
           or access_grant.granted_case_id = v_case.id
         )
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'customer_context_unavailable'
    );
  end if;

  select pg_catalog.jsonb_build_object(
    'schema_version', 'evidence-review-correction-handoff-bundle-v1',
    'case_ref', v_case.case_reference,
    'source_round_ref', v_round.id,
    'manifest_version', v_round.manifest_version,
    'manifest_hash', v_round.manifest_hash,
    'target_customer_ref', v_case.customer_id,
    'items', coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'subject_ref', decision.subject_ref,
        'evidence_file_ref', decision.evidence_file_id,
        'evidence_version_ref', decision.evidence_version_id,
        'evidence_kind', decision.evidence_kind,
        'fact_key', decision.fact_key,
        'scope_ref', decision.scope_ref,
        'source_round_ref', v_round.id,
        'customer_safe', pg_catalog.jsonb_strip_nulls(
          pg_catalog.jsonb_build_object(
            'document_label', case decision.evidence_kind
              when 'energy_bill_or_contract' then 'Energiedocument'
              when 'installation_invoice' then 'Installatiefactuur'
              else null
            end,
            'fact_label', decision.fact_label,
            'current_value', subject.item->'value',
            'correction_reason', decision.correction_reason,
            'correction_reason_label', case decision.correction_reason
              when 'MISSING_INFORMATION' then 'Gegeven ontbreekt'
              when 'INCORRECT_INFORMATION' then 'Gegeven onjuist'
              when 'INCONSISTENT_INFORMATION' then 'Gegevens inconsistent'
              when 'OTHER' then 'Aanpassing nodig'
              else null
            end,
            'correction_instruction', decision.correction_instruction
          )
        )
      ) order by decision.subject_ref
    ), '[]'::jsonb)
  ) into v_bundle
  from public.app_evidence_review_round_subject_decisions decision
  join pg_catalog.jsonb_array_elements(v_manifest->'subjects') subject(item)
    on subject.item->>'subject_ref' = decision.subject_ref
  where decision.round_id = v_round.id
    and decision.disposition = 'CORRECTION_REQUIRED'
    and decision.correction_reason in (
      'MISSING_INFORMATION', 'INCORRECT_INFORMATION',
      'INCONSISTENT_INFORMATION', 'OTHER'
    )
    and decision.correction_instruction is not null
    and decision.evidence_kind in (
      'energy_bill_or_contract', 'installation_invoice'
    );

  if pg_catalog.jsonb_array_length(v_bundle->'items') < 1
     or pg_catalog.jsonb_array_length(v_bundle->'items') <> (
       select pg_catalog.count(*)
       from public.app_evidence_review_round_subject_decisions decision
       where decision.round_id = v_round.id
         and decision.disposition = 'CORRECTION_REQUIRED'
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'correction_bundle_unavailable'
    );
  end if;

  select pg_catalog.encode(extensions.digest(v_bundle::text, 'sha256'), 'hex')
    into v_bundle_sha256;
  v_scope := 'evidence_review_correction_publish:v1:case:' ||
    v_case.id::text || ':round:' || v_round.id::text;
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_sha256,
    p_idempotency_expires_at, 'worker', v_auth->>'actor_ref', p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;

  select * into v_existing
  from public.app_evidence_review_correction_handoffs handoff
  where handoff.round_id = v_round.id;
  if found then
    v_response := case when
      v_existing.case_id = v_case.id
      and v_existing.target_customer_id = v_case.customer_id
      and v_existing.manifest_version = v_round.manifest_version
      and v_existing.manifest_hash = v_round.manifest_hash
      and v_existing.bundle_sha256 = v_bundle_sha256
      and v_existing.correction_bundle = v_bundle
    then pg_catalog.jsonb_build_object(
      'ok', true, 'status', 200, 'code', 'already_published',
      'handoff_id', v_existing.id,
      'handoff_ref', v_existing.handoff_reference,
      'round_id', v_existing.round_id,
      'bundle_sha256', v_existing.bundle_sha256,
      'published_at', v_existing.published_at
    ) else pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'correction_handoff_conflict'
    ) end;
    return public.app_evidence_review_idempotency_complete_v1(
      v_scope, p_idempotency_key, v_response
    );
  end if;

  v_handoff_id := gen_random_uuid();
  select 'CRH-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.encode(
    extensions.digest(
      'correction-handoff-v1|' || v_round.id::text || '|' ||
      v_case.customer_id::text || '|' || v_bundle_sha256,
      'sha256'
    ), 'hex'
  ), 1, 16)) into v_handoff_reference;

  insert into public.app_evidence_review_correction_handoffs (
    id, handoff_reference, case_id, round_id,
    manifest_version, manifest_hash, target_customer_id,
    correction_bundle, bundle_sha256,
    publisher_workforce_identity_id, publisher_scope_assignment_id,
    capability_code, authorization_policy_version_id,
    payload_sha256, request_id, idempotency_key, published_at
  ) values (
    v_handoff_id, v_handoff_reference, v_case.id, v_round.id,
    v_round.manifest_version, v_round.manifest_hash, v_case.customer_id,
    v_bundle, v_bundle_sha256,
    (v_auth->>'workforce_identity_id')::uuid,
    (v_auth->>'scope_assignment_id')::uuid,
    'evidence.review.correction.publish',
    (v_auth->>'policy_version_id')::uuid,
    p_payload_sha256, p_request_id, p_idempotency_key, v_now
  );

  insert into public.app_audit_events (
    event_type, scope_type, scope_id, request_id, idempotency_key,
    actor_type, actor_ref, event_data,
    authorization_policy_version_id, created_at
  ) values (
    'evidence_review_correction_handoff_published',
    'case', v_case.id, p_request_id, p_idempotency_key,
    'worker', v_auth->>'actor_ref',
    pg_catalog.jsonb_build_object(
      'handoff_ref', v_handoff_reference,
      'round_ref', v_round.id,
      'manifest_version', v_round.manifest_version,
      'manifest_hash', v_round.manifest_hash,
      'bundle_sha256', v_bundle_sha256,
      'correction_count', pg_catalog.jsonb_array_length(v_bundle->'items')
    ),
    (v_auth->>'policy_version_id')::uuid, v_now
  );

  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'published',
    'handoff_id', v_handoff_id,
    'handoff_ref', v_handoff_reference,
    'round_id', v_round.id,
    'bundle_sha256', v_bundle_sha256,
    'published_at', v_now
  );
  return public.app_evidence_review_idempotency_complete_v1(
    v_scope, p_idempotency_key, v_response
  );
exception when unique_violation then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'concurrent_write_conflict'
  );
when others then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 500, 'code', 'internal_error'
  );
end;
$$;

create function public.app_customer_correction_handoff_read_v1(
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
  v_case public.app_cases%rowtype;
  v_manifest jsonb;
  v_handoff public.app_evidence_review_correction_handoffs%rowtype;
  v_items jsonb;
begin
  if p_auth_user_id is null
     or p_case_ref is null
     or p_case_ref <> pg_catalog.btrim(p_case_ref)
     or pg_catalog.char_length(p_case_ref) not between 8 and 64 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  if not exists (
    select 1 from auth.users auth_user
    where auth_user.id = p_auth_user_id
      and auth_user.deleted_at is null
      and coalesce(auth_user.email_confirmed_at, auth_user.confirmed_at)
        is not null
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 401, 'code', 'authentication_required'
    );
  end if;
  select case_row.* into v_case
  from public.app_cases case_row
  join public.app_customers customer_row
    on customer_row.id = case_row.customer_id
   and customer_row.status = 'active'
  where case_row.case_reference = p_case_ref;
  if not found or not exists (
    select 1 from public.app_customer_access_grants access_grant
    where access_grant.auth_user_id = p_auth_user_id
      and access_grant.customer_id = v_case.customer_id
      and (
        access_grant.granted_case_id is null
        or access_grant.granted_case_id = v_case.id
      )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'customer_case_access_denied'
    );
  end if;

  v_manifest := public.app_evidence_fact_review_manifest_v1(v_case.id);
  if v_manifest->>'ok' <> 'true' then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'status', 200, 'code', 'not_available',
      'case_ref', v_case.case_reference, 'handoff', null
    );
  end if;
  select handoff.* into v_handoff
  from public.app_evidence_review_correction_handoffs handoff
  join public.app_evidence_review_rounds round_row
    on round_row.id = handoff.round_id
   and round_row.case_id = handoff.case_id
   and round_row.manifest_version = handoff.manifest_version
   and round_row.manifest_hash = handoff.manifest_hash
  where handoff.case_id = v_case.id
    and handoff.target_customer_id = v_case.customer_id
    and handoff.manifest_version = v_manifest->>'manifest_version'
    and handoff.manifest_hash = v_manifest->>'manifest_hash';
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'status', 200, 'code', 'not_available',
      'case_ref', v_case.case_reference, 'handoff', null
    );
  end if;
  if v_handoff.bundle_sha256 <> pg_catalog.encode(
    extensions.digest(v_handoff.correction_bundle::text, 'sha256'), 'hex'
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500, 'code', 'internal_error'
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'document_label', item.value->'customer_safe'->>'document_label',
      'fact_label', item.value->'customer_safe'->>'fact_label',
      'current_value', item.value->'customer_safe'->'current_value',
      'correction_reason', item.value->'customer_safe'->>'correction_reason',
      'correction_reason_label',
        item.value->'customer_safe'->>'correction_reason_label',
      'correction_instruction',
        item.value->'customer_safe'->>'correction_instruction'
    )) order by item.ordinality
  ), '[]'::jsonb) into v_items
  from pg_catalog.jsonb_array_elements(v_handoff.correction_bundle->'items')
    with ordinality as item(value, ordinality);

  if pg_catalog.jsonb_array_length(v_items) < 1
     or exists (
       select 1 from pg_catalog.jsonb_array_elements(v_items) item(value)
       where item.value->>'document_label' is null
          or item.value->>'fact_label' is null
          or item.value->>'correction_reason' not in (
            'MISSING_INFORMATION', 'INCORRECT_INFORMATION',
            'INCONSISTENT_INFORMATION', 'OTHER'
          )
          or item.value->>'correction_reason_label' is null
          or item.value->>'correction_instruction' is null
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500, 'code', 'internal_error'
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 200, 'code', 'ok',
    'case_ref', v_case.case_reference,
    'handoff', pg_catalog.jsonb_build_object(
      'handoff_ref', v_handoff.handoff_reference,
      'published_at', v_handoff.published_at,
      'items', v_items
    )
  );
end;
$$;

create or replace function public.app_evidence_review_overall_status_v1(
  p_case_id uuid,
  p_manifest_version text,
  p_manifest_hash text
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_round public.app_evidence_review_rounds%rowtype;
begin
  if p_case_id is null
     or p_manifest_version <> 'fact-review-manifest-v1'
     or p_manifest_hash is null
     or p_manifest_hash !~ '^[0-9a-f]{64}$' then
    return 'REVIEW_MODEL_UNAVAILABLE';
  end if;
  select round_row.* into v_round
  from public.app_evidence_review_rounds round_row
  where round_row.case_id = p_case_id
    and round_row.manifest_version = p_manifest_version
    and round_row.manifest_hash = p_manifest_hash;
  if not found then return 'TO_REVIEW'; end if;
  if v_round.outcome = 'CORRECTIONS_REQUIRED' then
    if exists (
      select 1
      from public.app_evidence_review_correction_handoffs handoff
      join public.app_cases case_row on case_row.id = handoff.case_id
      where handoff.round_id = v_round.id
        and handoff.case_id = p_case_id
        and handoff.manifest_version = p_manifest_version
        and handoff.manifest_hash = p_manifest_hash
        and handoff.target_customer_id = case_row.customer_id
    ) then return 'WAITING_CUSTOMER'; end if;
    return 'CORRECTION_REQUIRED';
  end if;
  if v_round.outcome = 'ALL_FACTS_ACCEPTED' then return 'REVIEW_COMPLETE'; end if;
  return 'REVIEW_MODEL_UNAVAILABLE';
end;
$$;

comment on function public.app_evidence_review_overall_status_v1(
  uuid, text, text
) is
  'Private REVIEW19 projection: a current CORRECTIONS_REQUIRED round remains CORRECTION_REQUIRED until its exact immutable customer-context handoff exists, then becomes WAITING_CUSTOMER. ALL_FACTS_ACCEPTED remains REVIEW_COMPLETE and absence remains TO_REVIEW.';

alter table public.app_evidence_review_correction_handoffs
  enable row level security;
create policy deny_all on public.app_evidence_review_correction_handoffs
  for all using (false) with check (false);

revoke all on table public.app_evidence_review_correction_handoffs
  from public, anon, authenticated, service_role;
revoke all on function
  public.app_evidence_review_correction_handoff_immutable_guard_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.app_evidence_review_correction_publish_v1(
  uuid, text, uuid, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.app_evidence_review_correction_publish_v1(
  uuid, text, uuid, text, text, text, timestamptz
) to service_role;
revoke all on function public.app_customer_correction_handoff_read_v1(
  uuid, text
) from public, anon, authenticated;
grant execute on function public.app_customer_correction_handoff_read_v1(
  uuid, text
) to service_role;

comment on function public.app_evidence_review_correction_publish_v1(
  uuid, text, uuid, text, text, text, timestamptz
) is
  'Service-role-only REVIEW19 publish boundary. It reuses the central exact-case workforce evaluator, recomputes the current manifest and server-derived corrections, resolves one authorized customer context, freezes and hashes one immutable bundle, and is concurrency/idempotency safe.';
comment on function public.app_customer_correction_handoff_read_v1(
  uuid, text
) is
  'Service-role-only REVIEW19 customer read boundary. Verified Auth plus immutable exact customer/case access returns only the current published customer-safe correction projection; workforce scope and e-mail matching grant no access.';

commit;

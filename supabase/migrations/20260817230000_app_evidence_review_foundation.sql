begin;

-- REVIEW02 adds one exact-version evidence review decision to the existing
-- workforce policy and explicit case-scope model. PENDING remains derived from
-- absence; no task, workflow, check execution or downstream truth mutation is
-- introduced.

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
) values
  ('evidence.review.view', 'pilot_v1', 'member', 'member', 'case'),
  ('evidence.review.decide', 'pilot_v1', 'member', 'reviewer', 'case');

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
      'evidence.review.decide'
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
      'evidence.review.decide'
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
        'evidence.review.decide'
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

comment on table public.app_workforce_scope_assignments is
  'Immutable explicit workforce capability scope. Case-only scope is allowed only for location.root.create and evidence review; location operations otherwise require an exact case/location relation. Missing scope never implies authority.';

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
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'workforce_scope:v1:' || new.workforce_identity_id::text || ':' ||
      new.capability_code || ':' || new.case_id::text || ':' ||
      coalesce(new.location_id::text, 'case'), 0
    )
  );
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
    if new.capability_code not in (
      'location.root.create', 'evidence.review.view', 'evidence.review.decide'
    ) then
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
       and capability_grant.workforce_identity_id =
             scope_grant.workforce_identity_id
       and capability_grant.capability_code = scope_grant.capability_code
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
          select 1
          from public.app_workforce_scope_assignments scope_revoke
          where scope_revoke.scope_assignment_id =
                scope_grant.scope_assignment_id
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
          p_capability_code in (
            'location.root.create',
            'evidence.review.view',
            'evidence.review.decide'
          )
          or exists (
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
  v_case_only boolean;
begin
  v_auth := public.app_workforce_authorize_v1(
    p_auth_user_id, 'case.assignment.manage', null, null, v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;
  v_case_only := p_capability_code in (
    'location.root.create', 'evidence.review.view', 'evidence.review.decide'
  );
  if p_action not in ('grant', 'end')
     or p_target_workforce_identity_id is null
     or p_effective_at is null
     or p_effective_at < v_now - interval '5 minutes'
     or coalesce(btrim(p_decision_ref), '') = ''
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or p_capability_code not in (
       'location.root.create', 'location.observation.record',
       'location.version.accept.prepare', 'location.version.accept.approve',
       'location.version.correct.prepare', 'location.version.correct.approve',
       'evidence.review.view', 'evidence.review.decide'
     )
     or (p_action = 'end' and coalesce(btrim(p_reason_ref), '') = '') then
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
       or (v_case_only and (
         p_location_id is not null or p_case_location_relation_id is not null
       ))
       or (not v_case_only and (
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
    if not v_case_only and not exists (
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
    select count(*)
    from public.app_workforce_policy_requirements requirement
    where requirement.policy_version_id = new.id
  ) <> 13 then
    raise exception 'workforce policy must contain exactly thirteen capabilities'
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
    select count(*)
    from public.app_workforce_policy_requirements requirement
    where requirement.policy_version_id = new.policy_version_id
  ) <> 13 then
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
     or coalesce(btrim(p_decision_ref), '') = ''
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
       or coalesce(btrim(p_policy_ref), '') = ''
       or p_require_distinct_maker_checker is null
       or p_requirements is null
       or pg_catalog.jsonb_typeof(p_requirements) <> 'object' then
      raise exception 'policy create input invalid' using errcode = '23514';
    end if;
    select count(*) into v_count
    from pg_catalog.jsonb_object_keys(p_requirements);
    if v_count <> 13 then
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
    for identity_row in
      select id from public.app_workforce_identities
    loop
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
  '00000000-0000-4000-8000-000000003301',
  'enval_default_v4', 'pilot_v1', true,
  'bd65be945852f7289e4fdfc6c07dcc8a9525e088013b1027d4b32c498a38a1bd',
  null, 'system:review02_migration',
  'review02_default_policy', 'review02-default-policy-v4'
);

insert into public.app_workforce_policy_requirements (
  policy_version_id, capability_code, minimum_seniority
)
select
  '00000000-0000-4000-8000-000000003301'::uuid,
  capability_code,
  default_seniority
from public.app_workforce_capability_catalog;

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
    '00000000-0000-4000-8000-000000003302',
    '00000000-0000-4000-8000-000000003301',
    v_effective_at, v_effective_at, null,
    'system:review02_migration', 'review02_default_policy',
    'review02-default-policy-activation-v4'
  );
  insert into public.app_audit_events (
    event_type, scope_type, scope_id, request_id, actor_type, actor_ref,
    event_data, authorization_policy_version_id, created_at
  ) values
    (
      'workforce_policy_version_created', 'workforce_policy',
      '00000000-0000-4000-8000-000000003301',
      'review02-default-policy-v4', 'system', 'system:review02_migration',
      '{"catalogue_version":"pilot_v1","policy_ref":"enval_default_v4"}',
      '00000000-0000-4000-8000-000000003301', v_effective_at
    ),
    (
      'workforce_policy_activated', 'workforce_policy',
      '00000000-0000-4000-8000-000000003301',
      'review02-default-policy-activation-v4', 'system',
      'system:review02_migration',
      '{"catalogue_version":"pilot_v1","policy_ref":"enval_default_v4"}',
      '00000000-0000-4000-8000-000000003301', v_effective_at
    );
  for identity_row in
    select id from public.app_workforce_identities order by id
  loop
    perform public.app_workforce_reconcile_capabilities_v1(
      identity_row.id, v_effective_at, 'system:review02_migration',
      'review02_default_policy',
      'review02-reconcile-' || pg_catalog.md5(identity_row.id::text)
    );
  end loop;
end;
$$;

create table public.app_evidence_review_decisions (
  id uuid primary key default gen_random_uuid(),
  evidence_version_id uuid not null unique
    references public.app_evidence_versions(id) on delete restrict,
  case_id uuid not null
    references public.app_cases(id) on delete restrict,
  decision text not null,
  reviewer_workforce_identity_id uuid not null
    references public.app_workforce_identities(id) on delete restrict,
  reviewer_scope_assignment_id uuid not null
    references public.app_workforce_scope_assignments(id) on delete restrict,
  capability_code text not null,
  authorization_policy_version_id uuid not null
    references public.app_workforce_policy_versions(id) on delete restrict,
  payload_sha256 text not null,
  request_id text not null unique,
  idempotency_key text not null,
  decided_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),

  constraint app_evidence_review_decisions_value_chk check (
    decision in ('ACCEPTED', 'CORRECTION_REQUIRED')
  ),
  constraint app_evidence_review_decisions_capability_chk check (
    capability_code = 'evidence.review.decide'
  ),
  constraint app_evidence_review_decisions_hash_chk check (
    payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint app_evidence_review_decisions_time_chk check (
    decided_at <= recorded_at
  ),
  constraint app_evidence_review_decisions_refs_chk check (
    request_id = btrim(request_id)
    and char_length(request_id) between 1 and 128
    and idempotency_key = btrim(idempotency_key)
    and char_length(idempotency_key) between 1 and 200
  )
);

comment on table public.app_evidence_review_decisions is
  'One immutable internal workforce ACCEPTED or CORRECTION_REQUIRED decision for one exact immutable evidence version. Absence means PENDING. The decision is not regulator, verifier, NEa, representation, location, charger or compliance acceptance.';
comment on column public.app_evidence_review_decisions.evidence_version_id is
  'Exact immutable evidence version reviewed. A later version has independent PENDING state by absence.';
comment on column public.app_evidence_review_decisions.decision is
  'Internal evidence-purpose outcome only; it never promotes another core truth domain.';

create index app_evidence_review_decisions_case_idx
  on public.app_evidence_review_decisions(case_id, decided_at desc);

create function public.app_evidence_review_decision_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case_id uuid;
  v_auth_user_id uuid;
  v_auth jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'evidence_review:v1:' || new.evidence_version_id::text, 0
    )
  );
  select evidence_file.case_id into v_case_id
  from public.app_evidence_versions evidence_version
  join public.app_evidence_files evidence_file
    on evidence_file.id = evidence_version.evidence_file_id
  where evidence_version.id = new.evidence_version_id
    and evidence_version.status = 'confirmed_awaiting_review';
  select identity.auth_user_id into v_auth_user_id
  from public.app_workforce_identities identity
  where identity.id = new.reviewer_workforce_identity_id;
  if v_case_id is distinct from new.case_id or v_auth_user_id is null then
    raise exception 'evidence review subject or reviewer invalid'
      using errcode = '42501';
  end if;
  v_auth := public.app_workforce_authorize_v1(
    v_auth_user_id, 'evidence.review.decide', new.case_id, null,
    new.decided_at
  );
  if v_auth->>'ok' <> 'true'
     or (v_auth->>'workforce_identity_id')::uuid <>
          new.reviewer_workforce_identity_id
     or (v_auth->>'scope_assignment_id')::uuid <>
          new.reviewer_scope_assignment_id
     or (v_auth->>'policy_version_id')::uuid <>
          new.authorization_policy_version_id
     or new.capability_code <> 'evidence.review.decide' then
    raise exception 'evidence review authorization invalid'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger app_evidence_review_decisions_insert_guard
before insert on public.app_evidence_review_decisions
for each row execute function public.app_evidence_review_decision_insert_guard();
create trigger app_evidence_review_decisions_immutable
before update or delete on public.app_evidence_review_decisions
for each row execute function public.app_wp2b_i_immutable_guard();

create function public.app_evidence_review_idempotency_complete_v1(
  p_scope text,
  p_key text,
  p_response jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_status integer;
begin
  if p_response is null
     or pg_catalog.jsonb_typeof(p_response) <> 'object'
     or (p_response->>'status') !~ '^[0-9]{3}$' then
    raise exception 'evidence review completion response invalid';
  end if;
  v_status := (p_response->>'status')::integer;
  update public.app_idempotency_keys
  set response_status = v_status,
      response_body = p_response,
      completed_at = pg_catalog.clock_timestamp()
  where scope = p_scope and key = p_key
    and response_status is null and response_body is null;
  if not found then
    raise exception 'evidence review idempotency completion failed';
  end if;
  return p_response;
end;
$$;

create function public.app_evidence_review_decide_v1(
  p_auth_user_id uuid,
  p_evidence_version_id uuid,
  p_decision text,
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
  v_case_id uuid;
  v_auth jsonb;
  v_scope text;
  v_begin jsonb;
  v_existing public.app_evidence_review_decisions%rowtype;
  v_decision_id uuid;
  v_response jsonb;
begin
  if p_evidence_version_id is null
     or p_decision not in ('ACCEPTED', 'CORRECTION_REQUIRED')
     or coalesce(btrim(p_request_id), '') = ''
     or char_length(p_request_id) > 128
     or coalesce(btrim(p_idempotency_key), '') = ''
     or char_length(p_idempotency_key) > 200
     or p_payload_sha256 !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'evidence_review:v1:' || p_evidence_version_id::text, 0
    )
  );
  select evidence_file.case_id into v_case_id
  from public.app_evidence_versions evidence_version
  join public.app_evidence_files evidence_file
    on evidence_file.id = evidence_version.evidence_file_id
  where evidence_version.id = p_evidence_version_id
    and evidence_version.status = 'confirmed_awaiting_review';
  if v_case_id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'evidence_version_missing'
    );
  end if;
  v_auth := public.app_workforce_authorize_v1(
    p_auth_user_id, 'evidence.review.decide', v_case_id, null, v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;
  v_scope := 'evidence_review_decide:v1:workforce:' ||
    (v_auth->>'workforce_identity_id') || ':evidence_version:' ||
    p_evidence_version_id::text;
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_sha256,
    p_idempotency_expires_at, 'worker', v_auth->>'actor_ref', p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;
  select * into v_existing
  from public.app_evidence_review_decisions
  where evidence_version_id = p_evidence_version_id;
  if found then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'evidence_already_decided',
      'evidence_version_id', p_evidence_version_id,
      'review_state', v_existing.decision
    );
    return public.app_evidence_review_idempotency_complete_v1(
      v_scope, p_idempotency_key, v_response
    );
  end if;
  insert into public.app_evidence_review_decisions (
    evidence_version_id, case_id, decision,
    reviewer_workforce_identity_id, reviewer_scope_assignment_id,
    capability_code, authorization_policy_version_id, payload_sha256,
    request_id, idempotency_key, decided_at
  ) values (
    p_evidence_version_id, v_case_id, p_decision,
    (v_auth->>'workforce_identity_id')::uuid,
    (v_auth->>'scope_assignment_id')::uuid,
    'evidence.review.decide', (v_auth->>'policy_version_id')::uuid,
    p_payload_sha256, p_request_id, p_idempotency_key, v_now
  ) returning id into v_decision_id;
  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'ok',
    'evidence_version_id', p_evidence_version_id,
    'review_decision_id', v_decision_id,
    'review_state', p_decision
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

create function public.app_evidence_review_state_v1(
  p_auth_user_id uuid,
  p_evidence_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_case_id uuid;
  v_auth jsonb;
  v_decision public.app_evidence_review_decisions%rowtype;
begin
  select evidence_file.case_id into v_case_id
  from public.app_evidence_versions evidence_version
  join public.app_evidence_files evidence_file
    on evidence_file.id = evidence_version.evidence_file_id
  where evidence_version.id = p_evidence_version_id
    and evidence_version.status = 'confirmed_awaiting_review';
  if v_case_id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'evidence_version_missing'
    );
  end if;
  v_auth := public.app_workforce_authorize_v1(
    p_auth_user_id, 'evidence.review.view', v_case_id, null, v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;
  select * into v_decision
  from public.app_evidence_review_decisions
  where evidence_version_id = p_evidence_version_id;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 200, 'code', 'ok',
    'evidence_version_id', p_evidence_version_id,
    'review_state', case when found then v_decision.decision else 'PENDING' end,
    'review_decision_id', case when found then v_decision.id else null end,
    'decided_at', case when found then v_decision.decided_at else null end
  );
end;
$$;

alter table public.app_evidence_review_decisions enable row level security;
create policy deny_all on public.app_evidence_review_decisions
for all to anon, authenticated using (false) with check (false);

revoke all on table public.app_evidence_review_decisions
  from public, anon, authenticated, service_role;
grant select on table public.app_evidence_review_decisions to service_role;

revoke all on function public.app_evidence_review_decision_insert_guard()
  from public, anon, authenticated, service_role;
revoke all on function public.app_evidence_review_idempotency_complete_v1(
  text, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.app_evidence_review_decide_v1(
  uuid, uuid, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.app_evidence_review_decide_v1(
  uuid, uuid, text, text, text, text, timestamptz
) to service_role;
revoke all on function public.app_evidence_review_state_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.app_evidence_review_state_v1(uuid, uuid)
  to service_role;

commit;

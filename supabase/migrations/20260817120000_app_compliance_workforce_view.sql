begin;

-- REG03E adds one read-only compliance visibility capability to the existing
-- database-authoritative workforce policy. The tenant scope is an explicit
-- immutable grant for the current tenant data plane; NULL/global/case/location
-- scope never implies tenant-wide authority.

alter table public.app_workforce_capability_catalog
  drop constraint app_workforce_capability_scope_chk;
alter table public.app_workforce_capability_catalog
  add constraint app_workforce_capability_scope_chk check (
    scope_kind in ('case', 'case_location', 'global', 'tenant_wide')
  );
alter table public.app_workforce_capability_catalog
  drop constraint app_workforce_capability_shape_chk;
alter table public.app_workforce_capability_catalog
  add constraint app_workforce_capability_shape_chk check (
    (capability_code = 'location.root.create' and scope_kind = 'case')
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
      capability_code = 'compliance.delivery_year.view'
      and scope_kind = 'tenant_wide'
      and floor_seniority = 'member'
      and default_seniority = 'reviewer'
    )
  );

insert into public.app_workforce_capability_catalog (
  capability_code, catalogue_version, floor_seniority,
  default_seniority, scope_kind
) values (
  'compliance.delivery_year.view', 'pilot_v1', 'member',
  'reviewer', 'tenant_wide'
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
      'compliance.delivery_year.view'
    )
  );

create table public.app_workforce_tenant_scope_assignments (
  id uuid primary key default gen_random_uuid(),
  scope_assignment_id uuid not null,
  workforce_identity_id uuid not null
    references public.app_workforce_identities(id) on delete restrict,
  capability_assignment_id uuid not null
    references public.app_workforce_capability_assignments(id)
    on delete restrict,
  capability_code text not null,
  scope_kind text not null,
  tenant_scope_ref text not null,
  event_type text not null,
  effective_at timestamptz not null,
  valid_until timestamptz,
  recorded_at timestamptz not null default clock_timestamp(),
  decision_ref text not null,
  reason_ref text,
  recorded_by_actor_ref text not null,
  request_id text not null unique,
  supersedes_scope_event_id uuid
    references public.app_workforce_tenant_scope_assignments(id)
    on delete restrict,

  constraint app_workforce_tenant_scope_capability_chk check (
    capability_code = 'compliance.delivery_year.view'
  ),
  constraint app_workforce_tenant_scope_kind_chk check (
    scope_kind = 'TENANT_WIDE'
  ),
  constraint app_workforce_tenant_scope_ref_chk check (
    tenant_scope_ref = 'CURRENT_TENANT_DATA_PLANE'
  ),
  constraint app_workforce_tenant_scope_event_chk check (
    event_type in ('granted', 'revoked')
  ),
  constraint app_workforce_tenant_scope_not_self_chk check (
    supersedes_scope_event_id is null or supersedes_scope_event_id <> id
  ),
  constraint app_workforce_tenant_scope_period_chk check (
    (event_type = 'granted' and (
      valid_until is null or valid_until > effective_at
    ))
    or (event_type = 'revoked' and valid_until is null)
  ),
  constraint app_workforce_tenant_scope_reason_chk check (
    (event_type = 'granted' and reason_ref is null)
    or (
      event_type = 'revoked'
      and reason_ref = btrim(reason_ref)
      and char_length(reason_ref) between 1 and 200
    )
  ),
  constraint app_workforce_tenant_scope_refs_chk check (
    decision_ref = btrim(decision_ref)
    and char_length(decision_ref) between 1 and 200
    and recorded_by_actor_ref = btrim(recorded_by_actor_ref)
    and char_length(recorded_by_actor_ref) between 1 and 200
    and request_id = btrim(request_id)
    and char_length(request_id) between 1 and 128
  )
);

create unique index app_workforce_tenant_scope_root_uidx
  on public.app_workforce_tenant_scope_assignments(scope_assignment_id)
  where supersedes_scope_event_id is null;
create unique index app_workforce_tenant_scope_successor_uidx
  on public.app_workforce_tenant_scope_assignments(
    supersedes_scope_event_id
  ) where supersedes_scope_event_id is not null;
create index app_workforce_tenant_scope_lookup_idx
  on public.app_workforce_tenant_scope_assignments(
    workforce_identity_id, capability_code, tenant_scope_ref,
    effective_at desc, recorded_at desc
  );

create function public.app_workforce_tenant_scope_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  predecessor public.app_workforce_tenant_scope_assignments%rowtype;
  capability_grant public.app_workforce_capability_assignments%rowtype;
  identity_state text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'workforce_tenant_scope:v1:' || new.workforce_identity_id::text || ':' ||
      new.capability_code || ':' || new.tenant_scope_ref,
      0
    )
  );

  if new.supersedes_scope_event_id is null then
    if new.event_type <> 'granted' then
      raise exception 'tenant scope root must be granted'
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
      raise exception 'tenant scope requires active identity and capability'
        using errcode = '23514';
    end if;
    if exists (
      select 1
      from public.app_workforce_tenant_scope_assignments scope_grant
      where scope_grant.workforce_identity_id = new.workforce_identity_id
        and scope_grant.capability_code = new.capability_code
        and scope_grant.tenant_scope_ref = new.tenant_scope_ref
        and scope_grant.event_type = 'granted'
        and scope_grant.effective_at
          < coalesce(new.valid_until, 'infinity'::timestamptz)
        and new.effective_at < least(
          coalesce(scope_grant.valid_until, 'infinity'::timestamptz),
          coalesce((
            select scope_revoke.effective_at
            from public.app_workforce_tenant_scope_assignments scope_revoke
            where scope_revoke.scope_assignment_id =
                  scope_grant.scope_assignment_id
              and scope_revoke.event_type = 'revoked'
            order by scope_revoke.effective_at
            limit 1
          ), 'infinity'::timestamptz)
        )
    ) then
      raise exception 'overlapping tenant scope grants are not allowed'
        using errcode = '23514';
    end if;
  else
    select * into predecessor
    from public.app_workforce_tenant_scope_assignments
    where id = new.supersedes_scope_event_id
    for update;
    if not found
       or predecessor.event_type <> 'granted'
       or new.event_type <> 'revoked'
       or new.scope_assignment_id <> predecessor.scope_assignment_id
       or new.workforce_identity_id <> predecessor.workforce_identity_id
       or new.capability_assignment_id <> predecessor.capability_assignment_id
       or new.capability_code <> predecessor.capability_code
       or new.scope_kind <> predecessor.scope_kind
       or new.tenant_scope_ref <> predecessor.tenant_scope_ref
       or new.effective_at <= predecessor.effective_at
       or new.recorded_at <= predecessor.recorded_at
       or (
         predecessor.valid_until is not null
         and new.effective_at > predecessor.valid_until
       )
       or exists (
         select 1
         from public.app_workforce_tenant_scope_assignments successor
         where successor.supersedes_scope_event_id = predecessor.id
       ) then
      raise exception 'invalid tenant scope revocation'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger app_workforce_tenant_scope_insert_guard
before insert on public.app_workforce_tenant_scope_assignments
for each row execute function public.app_workforce_tenant_scope_insert_guard();
create trigger app_workforce_tenant_scope_immutable
before update or delete on public.app_workforce_tenant_scope_assignments
for each row execute function public.app_wp2b_i_immutable_guard();

create function public.app_workforce_tenant_scope_sync_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  scope_grant public.app_workforce_tenant_scope_assignments%rowtype;
begin
  if new.capability_code <> 'compliance.delivery_year.view' then
    return new;
  end if;
  if new.event_type = 'granted' then
    insert into public.app_workforce_tenant_scope_assignments (
      scope_assignment_id, workforce_identity_id, capability_assignment_id,
      capability_code, scope_kind, tenant_scope_ref, event_type,
      effective_at, valid_until, decision_ref, reason_ref,
      recorded_by_actor_ref, request_id, supersedes_scope_event_id
    ) values (
      gen_random_uuid(), new.workforce_identity_id, new.id,
      new.capability_code, 'TENANT_WIDE', 'CURRENT_TENANT_DATA_PLANE',
      'granted', new.effective_at, new.valid_until, new.decision_ref, null,
      new.recorded_by_actor_ref,
      pg_catalog.left(new.request_id, 115) || ':tenant', null
    );
  else
    select * into scope_grant
    from public.app_workforce_tenant_scope_assignments scope_event
    where scope_event.workforce_identity_id = new.workforce_identity_id
      and scope_event.capability_assignment_id =
          new.supersedes_assignment_event_id
      and scope_event.capability_code = new.capability_code
      and scope_event.event_type = 'granted'
      and scope_event.supersedes_scope_event_id is null
    for update;
    if not found then
      raise exception 'tenant scope grant missing for capability revocation'
        using errcode = '23514';
    end if;
    if exists (
      select 1
      from public.app_workforce_tenant_scope_assignments scope_revoke
      where scope_revoke.supersedes_scope_event_id = scope_grant.id
    ) then
      return new;
    end if;
    insert into public.app_workforce_tenant_scope_assignments (
      scope_assignment_id, workforce_identity_id, capability_assignment_id,
      capability_code, scope_kind, tenant_scope_ref, event_type,
      effective_at, valid_until, decision_ref, reason_ref,
      recorded_by_actor_ref, request_id, supersedes_scope_event_id
    ) values (
      scope_grant.scope_assignment_id, scope_grant.workforce_identity_id,
      scope_grant.capability_assignment_id, scope_grant.capability_code,
      scope_grant.scope_kind, scope_grant.tenant_scope_ref, 'revoked',
      new.effective_at, null, new.decision_ref,
      coalesce(new.reason_ref, 'capability_revoked'),
      new.recorded_by_actor_ref,
      pg_catalog.left(new.request_id, 115) || ':tenant', scope_grant.id
    );
  end if;
  return new;
end;
$$;

create trigger app_workforce_capability_tenant_scope_sync
after insert on public.app_workforce_capability_assignments
for each row execute function public.app_workforce_tenant_scope_sync_v1();

create function public.app_workforce_authorize_v1(
  p_auth_user_id uuid,
  p_capability_code text,
  p_tenant_scope_ref text,
  p_case_id uuid,
  p_location_id uuid,
  p_at timestamptz
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_catalog public.app_workforce_capability_catalog%rowtype;
  v_policy public.app_workforce_policy_versions%rowtype;
  v_policy_requirement text;
  v_identity public.app_workforce_identities%rowtype;
  v_state text;
  v_seniority public.app_workforce_seniority_assignments%rowtype;
  v_required_rank integer;
  v_capability public.app_workforce_capability_assignments%rowtype;
  v_scope public.app_workforce_scope_assignments%rowtype;
  v_tenant_scope public.app_workforce_tenant_scope_assignments%rowtype;
  v_relation public.app_case_location_relations%rowtype;
begin
  if p_auth_user_id is null or p_capability_code is null or p_at is null then
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
      'ok', false, 'status', 403, 'code', 'authenticated_actor_not_verified'
    );
  end if;

  select * into v_catalog
  from public.app_workforce_capability_catalog
  where capability_code = p_capability_code;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'capability_not_allowed'
    );
  end if;
  if (
    v_catalog.scope_kind = 'global'
    and (
      p_tenant_scope_ref is not null
      or p_case_id is not null
      or p_location_id is not null
    )
  ) or (
    v_catalog.scope_kind = 'tenant_wide'
    and (p_case_id is not null or p_location_id is not null)
  ) or (
    v_catalog.scope_kind = 'case'
    and (
      p_tenant_scope_ref is not null
      or p_case_id is null
      or p_location_id is not null
    )
  ) or (
    v_catalog.scope_kind = 'case_location'
    and (
      p_tenant_scope_ref is not null
      or p_case_id is null
      or p_location_id is null
    )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  if v_catalog.scope_kind = 'tenant_wide' and
     p_tenant_scope_ref is distinct from 'CURRENT_TENANT_DATA_PLANE' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 403, 'code', 'tenant_scope_denied'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('workforce_policy_active:v1', 0)
  );
  select policy_version.* into v_policy
  from public.app_workforce_policy_activations activation
  join public.app_workforce_policy_versions policy_version
    on policy_version.id = activation.policy_version_id
  where activation.effective_at <= p_at
  order by activation.effective_at desc, activation.recorded_at desc
  limit 1;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 503, 'code', 'authorization_policy_missing'
    );
  end if;
  select requirement.minimum_seniority into v_policy_requirement
  from public.app_workforce_policy_requirements requirement
  where requirement.policy_version_id = v_policy.id
    and requirement.capability_code = p_capability_code;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 503, 'code', 'authorization_policy_invalid'
    );
  end if;
  v_required_rank := greatest(
    public.app_workforce_seniority_rank_v1(v_catalog.floor_seniority),
    public.app_workforce_seniority_rank_v1(v_policy_requirement)
  );

  select * into v_identity
  from public.app_workforce_identities
  where auth_user_id = p_auth_user_id;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 403, 'code', 'workforce_identity_missing'
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('workforce_state:v1:' || v_identity.id::text, 0)
  );
  select state_event.state into v_state
  from public.app_workforce_identity_states state_event
  where state_event.workforce_identity_id = v_identity.id
    and state_event.effective_at <= p_at
  order by state_event.effective_at desc, state_event.recorded_at desc
  limit 1;
  if v_state is distinct from 'active' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 403, 'code', 'workforce_identity_inactive'
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'workforce_seniority:v1:' || v_identity.id::text, 0
    )
  );
  select * into v_seniority
  from public.app_workforce_seniority_assignments seniority_event
  where seniority_event.workforce_identity_id = v_identity.id
    and seniority_event.effective_at <= p_at
  order by seniority_event.effective_at desc, seniority_event.recorded_at desc
  limit 1;
  if not found or public.app_workforce_seniority_rank_v1(
    v_seniority.seniority
  ) < v_required_rank then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 403, 'code', 'seniority_not_authorized'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'workforce_capability:v1:' || v_identity.id::text || ':' ||
      p_capability_code, 0
    )
  );
  select capability_grant.* into v_capability
  from public.app_workforce_capability_assignments capability_grant
  where capability_grant.workforce_identity_id = v_identity.id
    and capability_grant.capability_code = p_capability_code
    and capability_grant.supersedes_assignment_event_id is null
    and capability_grant.event_type = 'granted'
    and capability_grant.effective_at <= p_at
    and (
      capability_grant.valid_until is null
      or p_at < capability_grant.valid_until
    )
    and not exists (
      select 1
      from public.app_workforce_capability_assignments capability_revoke
      where capability_revoke.assignment_id = capability_grant.assignment_id
        and capability_revoke.event_type = 'revoked'
        and capability_revoke.effective_at <= p_at
    )
  order by capability_grant.effective_at desc
  limit 1;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 403, 'code', 'capability_not_authorized'
    );
  end if;

  if v_catalog.scope_kind = 'tenant_wide' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'workforce_tenant_scope:v1:' || v_identity.id::text || ':' ||
        p_capability_code || ':' || p_tenant_scope_ref, 0
      )
    );
    select scope_grant.* into v_tenant_scope
    from public.app_workforce_tenant_scope_assignments scope_grant
    where scope_grant.workforce_identity_id = v_identity.id
      and scope_grant.capability_assignment_id = v_capability.id
      and scope_grant.capability_code = p_capability_code
      and scope_grant.scope_kind = 'TENANT_WIDE'
      and scope_grant.tenant_scope_ref = p_tenant_scope_ref
      and scope_grant.supersedes_scope_event_id is null
      and scope_grant.event_type = 'granted'
      and scope_grant.effective_at <= p_at
      and (scope_grant.valid_until is null or p_at < scope_grant.valid_until)
      and not exists (
        select 1
        from public.app_workforce_tenant_scope_assignments scope_revoke
        where scope_revoke.scope_assignment_id =
              scope_grant.scope_assignment_id
          and scope_revoke.event_type = 'revoked'
          and scope_revoke.effective_at <= p_at
      )
    order by scope_grant.effective_at desc
    limit 1;
    if not found then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 403, 'code', 'tenant_scope_denied'
      );
    end if;
  elsif v_catalog.scope_kind <> 'global' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'workforce_scope:v1:' || v_identity.id::text || ':' ||
        p_capability_code || ':' || p_case_id::text || ':' ||
        coalesce(p_location_id::text, 'case'), 0
      )
    );
    select scope_grant.* into v_scope
    from public.app_workforce_scope_assignments scope_grant
    where scope_grant.workforce_identity_id = v_identity.id
      and scope_grant.capability_assignment_id = v_capability.id
      and scope_grant.capability_code = p_capability_code
      and scope_grant.case_id = p_case_id
      and scope_grant.location_id is not distinct from p_location_id
      and scope_grant.supersedes_scope_event_id is null
      and scope_grant.event_type = 'granted'
      and scope_grant.effective_at <= p_at
      and (scope_grant.valid_until is null or p_at < scope_grant.valid_until)
      and not exists (
        select 1
        from public.app_workforce_scope_assignments scope_revoke
        where scope_revoke.scope_assignment_id = scope_grant.scope_assignment_id
          and scope_revoke.event_type = 'revoked'
          and scope_revoke.effective_at <= p_at
      )
    order by scope_grant.effective_at desc
    limit 1;
    if not found then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 403,
        'code', case when p_location_id is null
          then 'case_scope_denied' else 'location_scope_denied' end
      );
    end if;
    if p_location_id is not null then
      select relation_link.* into v_relation
      from public.app_case_location_relations relation_link
      where relation_link.id = v_scope.case_location_relation_id
        and relation_link.case_id = p_case_id
        and relation_link.location_id = p_location_id
        and relation_link.supersedes_relation_event_id is null
        and relation_link.event_type = 'linked'
        and relation_link.effective_at <= p_at
        and (relation_link.valid_until is null or p_at < relation_link.valid_until)
        and not exists (
          select 1
          from public.app_case_location_relations relation_unlink
          where relation_unlink.relation_id = relation_link.relation_id
            and relation_unlink.event_type = 'unlinked'
            and relation_unlink.effective_at <= p_at
        );
      if not found then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'status', 403,
          'code', 'case_location_relation_missing'
        );
      end if;
    end if;
    if not public.app_workforce_scope_is_authorized_v1(
      v_identity.id, v_scope.id, p_capability_code,
      p_case_id, p_location_id, p_at
    ) then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 403, 'code', 'authorization_changed'
      );
    end if;
  end if;

  perform pg_catalog.set_config(
    'app.authorization_policy_version_id', v_policy.id::text, true
  );
  perform pg_catalog.set_config(
    'app.authorization_capability', p_capability_code, true
  );
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'workforce_identity_id', v_identity.id,
    'actor_ref', v_identity.workforce_ref,
    'seniority', v_seniority.seniority,
    'capability_assignment_id', v_capability.id,
    'scope_assignment_id', case
      when v_catalog.scope_kind = 'tenant_wide' then v_tenant_scope.id
      else v_scope.id
    end,
    'case_location_relation_id', v_scope.case_location_relation_id,
    'policy_version_id', v_policy.id,
    'require_distinct_maker_checker', v_policy.require_distinct_maker_checker
  );
end;
$$;

create or replace function public.app_workforce_authorize_v1(
  p_auth_user_id uuid,
  p_capability_code text,
  p_case_id uuid,
  p_location_id uuid,
  p_at timestamptz
)
returns jsonb
language sql
set search_path = ''
as $$
  select public.app_workforce_authorize_v1(
    p_auth_user_id, p_capability_code, null,
    p_case_id, p_location_id, p_at
  );
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
  ) <> 10 then
    raise exception 'workforce policy must contain exactly ten capabilities'
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
  ) <> 10 then
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
    if v_count <> 10 then
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
  canonical_sha256, created_at, created_by_workforce_identity_id,
  created_by_actor_ref, decision_ref, request_id
) values (
  '00000000-0000-4000-8000-000000003101',
  'enval_default_v2', 'pilot_v1', true,
  '5bd21618d05b45fa959bde1f2a530629bce380923952057c95bcb3153d1fa7eb',
  '2026-08-17T00:00:00Z', null, 'system:reg03e_migration',
  'reg03e_default_policy', 'reg03e-default-policy-v2'
);

insert into public.app_workforce_policy_requirements (
  policy_version_id, capability_code, minimum_seniority
)
select
  '00000000-0000-4000-8000-000000003101'::uuid,
  capability_code,
  default_seniority
from public.app_workforce_capability_catalog;

insert into public.app_workforce_policy_activations (
  id, policy_version_id, effective_at, recorded_at,
  activated_by_workforce_identity_id, activated_by_actor_ref,
  decision_ref, request_id
) values (
  '00000000-0000-4000-8000-000000003102',
  '00000000-0000-4000-8000-000000003101',
  '2026-08-17T00:00:00Z', '2026-08-17T00:00:00Z', null,
  'system:reg03e_migration', 'reg03e_default_policy',
  'reg03e-default-policy-activation-v2'
);

insert into public.app_audit_events (
  event_type, scope_type, scope_id, request_id, actor_type, actor_ref,
  event_data, authorization_policy_version_id, created_at
) values
  (
    'workforce_policy_version_created', 'workforce_policy',
    '00000000-0000-4000-8000-000000003101',
    'reg03e-default-policy-v2', 'system', 'system:reg03e_migration',
    '{"catalogue_version":"pilot_v1","policy_ref":"enval_default_v2"}',
    '00000000-0000-4000-8000-000000003101',
    '2026-08-17T00:00:00Z'
  ),
  (
    'workforce_policy_activated', 'workforce_policy',
    '00000000-0000-4000-8000-000000003101',
    'reg03e-default-policy-activation-v2', 'system',
    'system:reg03e_migration',
    '{"catalogue_version":"pilot_v1","policy_ref":"enval_default_v2"}',
    '00000000-0000-4000-8000-000000003101',
    '2026-08-17T00:00:00Z'
  );

do $$
declare
  identity_row record;
begin
  for identity_row in
    select id from public.app_workforce_identities order by id
  loop
    perform public.app_workforce_reconcile_capabilities_v1(
      identity_row.id,
      '2026-08-17T00:00:00Z'::timestamptz,
      'system:reg03e_migration',
      'reg03e_default_policy',
      'reg03e-reconcile-' || pg_catalog.md5(identity_row.id::text)
    );
  end loop;
end;
$$;

alter table public.app_workforce_tenant_scope_assignments
  enable row level security;
create policy deny_all on public.app_workforce_tenant_scope_assignments
for all to anon, authenticated using (false) with check (false);

revoke all on table public.app_workforce_tenant_scope_assignments
  from public, anon, authenticated, service_role;
grant select on table public.app_workforce_tenant_scope_assignments
  to service_role;
revoke all on function public.app_workforce_tenant_scope_insert_guard()
  from public, anon, authenticated, service_role;
revoke all on function public.app_workforce_tenant_scope_sync_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.app_workforce_authorize_v1(
  uuid, text, text, uuid, uuid, timestamptz
) from public, anon, authenticated, service_role;

comment on table public.app_workforce_tenant_scope_assignments is
  'Immutable explicit TENANT_WIDE scope for compliance.delivery_year.view in the current tenant data plane. It is never a wildcard case/location/customer scope.';
comment on function public.app_workforce_authorize_v1(
  uuid, text, text, uuid, uuid, timestamptz
) is
  'Central evaluator overload requiring active Auth, workforce, exact capability, policy seniority and explicit tenant scope for tenant-wide capabilities.';
comment on function public.app_workforce_authorize_v1(
  uuid, text, uuid, uuid, timestamptz
) is
  'Compatibility entry for the existing nine global/case/case-location capabilities. Tenant-wide capabilities fail closed without the explicit tenant-scope overload.';

commit;

-- ENVAL WP3P minimum workforce authorization-policy foundation.
--
-- Capability identifiers and hard floors remain core-software owned. The
-- organization policy is fixed-schema and may only raise minimum seniority or
-- configure the internal maker/checker separation control. Browser roles have
-- no access; service_role remains transport, never human authority.

create table public.app_workforce_capability_catalog (
  capability_code text primary key,
  catalogue_version text not null,
  floor_seniority text not null,
  default_seniority text not null,
  scope_kind text not null,
  created_at timestamptz not null default clock_timestamp(),

  constraint app_workforce_capability_catalogue_version_chk
    check (catalogue_version = 'pilot_v1'),
  constraint app_workforce_capability_floor_chk
    check (floor_seniority in ('member', 'reviewer', 'admin')),
  constraint app_workforce_capability_default_chk
    check (default_seniority in ('member', 'reviewer', 'admin')),
  constraint app_workforce_capability_scope_chk
    check (scope_kind in ('case', 'case_location', 'global')),
  constraint app_workforce_capability_shape_chk
    check (
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
    )
);

insert into public.app_workforce_capability_catalog (
  capability_code, catalogue_version, floor_seniority,
  default_seniority, scope_kind
) values
  ('location.root.create', 'pilot_v1', 'member', 'member', 'case'),
  ('location.observation.record', 'pilot_v1', 'member', 'member', 'case_location'),
  ('location.version.accept.prepare', 'pilot_v1', 'member', 'member', 'case_location'),
  ('location.version.accept.approve', 'pilot_v1', 'member', 'reviewer', 'case_location'),
  ('location.version.correct.prepare', 'pilot_v1', 'member', 'member', 'case_location'),
  ('location.version.correct.approve', 'pilot_v1', 'member', 'reviewer', 'case_location'),
  ('workforce.member.manage', 'pilot_v1', 'admin', 'admin', 'global'),
  ('workforce.policy.manage', 'pilot_v1', 'admin', 'admin', 'global'),
  ('case.assignment.manage', 'pilot_v1', 'admin', 'admin', 'global');

create table public.app_workforce_policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_ref text not null unique,
  catalogue_version text not null,
  require_distinct_maker_checker boolean not null,
  canonical_sha256 text not null,
  created_at timestamptz not null default clock_timestamp(),
  created_by_workforce_identity_id uuid
    references public.app_workforce_identities(id) on delete restrict,
  created_by_actor_ref text not null,
  decision_ref text not null,
  request_id text not null unique,

  constraint app_workforce_policy_version_catalogue_chk
    check (catalogue_version = 'pilot_v1'),
  constraint app_workforce_policy_version_hash_chk
    check (canonical_sha256 ~ '^[0-9a-f]{64}$'),
  constraint app_workforce_policy_version_refs_chk
    check (
      policy_ref = btrim(policy_ref)
      and char_length(policy_ref) between 1 and 100
      and created_by_actor_ref = btrim(created_by_actor_ref)
      and char_length(created_by_actor_ref) between 1 and 200
      and decision_ref = btrim(decision_ref)
      and char_length(decision_ref) between 1 and 200
      and request_id = btrim(request_id)
      and char_length(request_id) between 1 and 128
    )
);

create table public.app_workforce_policy_requirements (
  policy_version_id uuid not null
    references public.app_workforce_policy_versions(id) on delete restrict,
  capability_code text not null
    references public.app_workforce_capability_catalog(capability_code)
    on delete restrict,
  minimum_seniority text not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (policy_version_id, capability_code),
  constraint app_workforce_policy_requirement_seniority_chk
    check (minimum_seniority in ('member', 'reviewer', 'admin'))
);

create table public.app_workforce_policy_activations (
  id uuid primary key default gen_random_uuid(),
  policy_version_id uuid not null
    references public.app_workforce_policy_versions(id) on delete restrict,
  effective_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  activated_by_workforce_identity_id uuid
    references public.app_workforce_identities(id) on delete restrict,
  activated_by_actor_ref text not null,
  decision_ref text not null,
  request_id text not null unique,
  constraint app_workforce_policy_activation_effective_key
    unique (effective_at),
  constraint app_workforce_policy_activation_refs_chk
    check (
      activated_by_actor_ref = btrim(activated_by_actor_ref)
      and char_length(activated_by_actor_ref) between 1 and 200
      and decision_ref = btrim(decision_ref)
      and char_length(decision_ref) between 1 and 200
      and request_id = btrim(request_id)
      and char_length(request_id) between 1 and 128
    )
);

create table public.app_workforce_seniority_assignments (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null,
  workforce_identity_id uuid not null
    references public.app_workforce_identities(id) on delete restrict,
  seniority text not null,
  effective_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  decision_ref text not null,
  reason_ref text,
  recorded_by_actor_ref text not null,
  request_id text not null unique,
  supersedes_seniority_assignment_id uuid
    references public.app_workforce_seniority_assignments(id)
    on delete restrict,

  constraint app_workforce_seniority_value_chk
    check (seniority in ('member', 'reviewer', 'admin')),
  constraint app_workforce_seniority_not_self_chk
    check (
      supersedes_seniority_assignment_id is null
      or supersedes_seniority_assignment_id <> id
    ),
  constraint app_workforce_seniority_refs_chk
    check (
      decision_ref = btrim(decision_ref)
      and char_length(decision_ref) between 1 and 200
      and (reason_ref is null or (
        reason_ref = btrim(reason_ref)
        and char_length(reason_ref) between 1 and 200
      ))
      and recorded_by_actor_ref = btrim(recorded_by_actor_ref)
      and char_length(recorded_by_actor_ref) between 1 and 200
      and request_id = btrim(request_id)
      and char_length(request_id) between 1 and 128
    )
);

create unique index app_workforce_seniority_root_uidx
  on public.app_workforce_seniority_assignments(assignment_id)
  where supersedes_seniority_assignment_id is null;
create unique index app_workforce_seniority_successor_uidx
  on public.app_workforce_seniority_assignments(
    supersedes_seniority_assignment_id
  ) where supersedes_seniority_assignment_id is not null;
create index app_workforce_seniority_lookup_idx
  on public.app_workforce_seniority_assignments(
    workforce_identity_id, effective_at desc, recorded_at desc
  );
create index app_workforce_policy_activation_lookup_idx
  on public.app_workforce_policy_activations(effective_at desc, recorded_at desc);

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
      'case.assignment.manage'
    )
  );

alter table public.app_workforce_operation_requests
  add column authorization_policy_version_id uuid
    references public.app_workforce_policy_versions(id) on delete restrict;
alter table public.app_workforce_operation_reviews
  add column authorization_policy_version_id uuid
    references public.app_workforce_policy_versions(id) on delete restrict;
alter table public.app_audit_events
  add column authorization_policy_version_id uuid
    references public.app_workforce_policy_versions(id) on delete restrict;

alter table public.app_audit_events
  drop constraint app_audit_events_scope_type_chk;
alter table public.app_audit_events
  add constraint app_audit_events_scope_type_chk check (
    scope_type in (
      'intake', 'auth', 'customer', 'dossier', 'case', 'promotion',
      'location', 'charger', 'document', 'evidence', 'request', 'support',
      'consent', 'kwh', 'result', 'fee', 'retention',
      'workforce_identity', 'workforce_authorization',
      'workforce_policy', 'workforce_assignment',
      'location_operation_request'
    )
  );

create function public.app_workforce_seniority_rank_v1(p_seniority text)
returns integer
language sql
immutable
strict
set search_path = ''
as $$
  select case p_seniority
    when 'member' then 10
    when 'reviewer' then 20
    when 'admin' then 30
    else 0
  end;
$$;

create function public.app_workforce_policy_complete_guard()
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
  ) <> 9 then
    raise exception 'workforce policy must contain exactly nine capabilities'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create function public.app_workforce_seniority_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  predecessor public.app_workforce_seniority_assignments%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'workforce_seniority:v1:' || new.workforce_identity_id::text, 0
    )
  );
  if new.supersedes_seniority_assignment_id is null then
    if exists (
      select 1 from public.app_workforce_seniority_assignments existing
      where existing.workforce_identity_id = new.workforce_identity_id
    ) then
      raise exception 'workforce seniority root already exists'
        using errcode = '23514';
    end if;
  else
    select * into predecessor
    from public.app_workforce_seniority_assignments
    where id = new.supersedes_seniority_assignment_id
    for update;
    if not found
       or predecessor.workforce_identity_id <> new.workforce_identity_id
       or predecessor.assignment_id <> new.assignment_id
       or new.effective_at <= predecessor.effective_at
       or exists (
         select 1 from public.app_workforce_seniority_assignments successor
         where successor.supersedes_seniority_assignment_id = predecessor.id
       ) then
      raise exception 'invalid workforce seniority successor'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger app_workforce_seniority_insert_guard
before insert on public.app_workforce_seniority_assignments
for each row execute function public.app_workforce_seniority_insert_guard();
create trigger app_workforce_capability_catalog_immutable
before update or delete on public.app_workforce_capability_catalog
for each row execute function public.app_wp2b_i_immutable_guard();
create trigger app_workforce_policy_versions_immutable
before update or delete on public.app_workforce_policy_versions
for each row execute function public.app_wp2b_i_immutable_guard();
create trigger app_workforce_policy_requirements_immutable
before update or delete on public.app_workforce_policy_requirements
for each row execute function public.app_wp2b_i_immutable_guard();
create trigger app_workforce_policy_activations_immutable
before update or delete on public.app_workforce_policy_activations
for each row execute function public.app_wp2b_i_immutable_guard();
create trigger app_workforce_seniority_immutable
before update or delete on public.app_workforce_seniority_assignments
for each row execute function public.app_wp2b_i_immutable_guard();

create function public.app_workforce_policy_context_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_policy_text text := pg_catalog.current_setting(
    'app.authorization_policy_version_id', true
  );
begin
  if new.authorization_policy_version_id is null
     and coalesce(v_policy_text, '') <> '' then
    new.authorization_policy_version_id := v_policy_text::uuid;
  end if;
  if tg_table_name in (
       'app_workforce_operation_requests',
       'app_workforce_operation_reviews'
     ) and new.authorization_policy_version_id is null then
    raise exception 'authorization policy context missing'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger app_workforce_operation_requests_00_policy_context
before insert on public.app_workforce_operation_requests
for each row execute function public.app_workforce_policy_context_before_insert();
create trigger app_workforce_operation_reviews_00_policy_context
before insert on public.app_workforce_operation_reviews
for each row execute function public.app_workforce_policy_context_before_insert();
create trigger app_audit_events_policy_context
before insert on public.app_audit_events
for each row execute function public.app_workforce_policy_context_before_insert();

create function public.app_workforce_audit_immutable_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.authorization_policy_version_id is not null
     or old.scope_type in (
       'workforce_identity', 'workforce_authorization',
       'workforce_policy', 'workforce_assignment',
       'location_operation_request'
     ) then
    raise exception 'workforce authorization audit evidence is immutable'
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger app_workforce_audit_immutable_guard
before update or delete on public.app_audit_events
for each row execute function public.app_workforce_audit_immutable_guard();

insert into public.app_workforce_policy_versions (
  id, policy_ref, catalogue_version, require_distinct_maker_checker,
  canonical_sha256, created_at, created_by_workforce_identity_id,
  created_by_actor_ref, decision_ref, request_id
) values (
  '00000000-0000-4000-8000-000000003001',
  'enval_default_v1', 'pilot_v1', true,
  '3f5a5ff0f429d57a1f3ae1a10af3f43cc8b7bf8d1234f58ee48e87e2686ca963',
  '2026-08-16T00:00:00Z', null, 'system:wp3p_migration',
  'wp3p_default_policy', 'wp3p-default-policy-v1'
);

insert into public.app_workforce_policy_requirements (
  policy_version_id, capability_code, minimum_seniority
)
select
  '00000000-0000-4000-8000-000000003001'::uuid,
  capability_code,
  default_seniority
from public.app_workforce_capability_catalog;

insert into public.app_workforce_policy_activations (
  id, policy_version_id, effective_at, recorded_at,
  activated_by_workforce_identity_id, activated_by_actor_ref,
  decision_ref, request_id
) values (
  '00000000-0000-4000-8000-000000003002',
  '00000000-0000-4000-8000-000000003001',
  '2026-08-16T00:00:00Z', '2026-08-16T00:00:00Z', null,
  'system:wp3p_migration', 'wp3p_default_policy',
  'wp3p-default-policy-activation-v1'
);

insert into public.app_audit_events (
  event_type, scope_type, scope_id, request_id, actor_type, actor_ref,
  event_data, authorization_policy_version_id, created_at
) values
  (
    'workforce_policy_version_created', 'workforce_policy',
    '00000000-0000-4000-8000-000000003001',
    'wp3p-default-policy-v1', 'system', 'system:wp3p_migration',
    '{"catalogue_version":"pilot_v1","policy_ref":"enval_default_v1"}',
    '00000000-0000-4000-8000-000000003001', '2026-08-16T00:00:00Z'
  ),
  (
    'workforce_policy_activated', 'workforce_policy',
    '00000000-0000-4000-8000-000000003001',
    'wp3p-default-policy-activation-v1', 'system',
    'system:wp3p_migration',
    '{"catalogue_version":"pilot_v1","policy_ref":"enval_default_v1"}',
    '00000000-0000-4000-8000-000000003001', '2026-08-16T00:00:00Z'
  );

create constraint trigger app_workforce_policy_complete_guard
after insert on public.app_workforce_policy_versions
deferrable initially deferred
for each row execute function public.app_workforce_policy_complete_guard();

create function public.app_workforce_authorize_v1(
  p_auth_user_id uuid,
  p_capability_code text,
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
  v_relation public.app_case_location_relations%rowtype;
begin
  if p_auth_user_id is null or p_capability_code is null or p_at is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  if not exists (
    select 1
    from auth.users auth_user
    where auth_user.id = p_auth_user_id
      and auth_user.deleted_at is null
      and coalesce(auth_user.email_confirmed_at, auth_user.confirmed_at) is not null
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
  if (v_catalog.scope_kind = 'global' and (p_case_id is not null or p_location_id is not null))
     or (v_catalog.scope_kind = 'case' and (p_case_id is null or p_location_id is not null))
     or (v_catalog.scope_kind = 'case_location' and (p_case_id is null or p_location_id is null)) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
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
    pg_catalog.hashtextextended('workforce_seniority:v1:' || v_identity.id::text, 0)
  );
  select * into v_seniority
  from public.app_workforce_seniority_assignments seniority_event
  where seniority_event.workforce_identity_id = v_identity.id
    and seniority_event.effective_at <= p_at
  order by seniority_event.effective_at desc, seniority_event.recorded_at desc
  limit 1;
  if not found
     or public.app_workforce_seniority_rank_v1(v_seniority.seniority) < v_required_rank then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 403, 'code', 'seniority_not_authorized'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'workforce_capability:v1:' || v_identity.id::text || ':' || p_capability_code,
      0
    )
  );
  select capability_grant.* into v_capability
  from public.app_workforce_capability_assignments capability_grant
  where capability_grant.workforce_identity_id = v_identity.id
    and capability_grant.capability_code = p_capability_code
    and capability_grant.supersedes_assignment_event_id is null
    and capability_grant.event_type = 'granted'
    and capability_grant.effective_at <= p_at
    and (capability_grant.valid_until is null or p_at < capability_grant.valid_until)
    and not exists (
      select 1 from public.app_workforce_capability_assignments capability_revoke
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

  if v_catalog.scope_kind <> 'global' then
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
        select 1 from public.app_workforce_scope_assignments scope_revoke
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
          select 1 from public.app_case_location_relations relation_unlink
          where relation_unlink.relation_id = relation_link.relation_id
            and relation_unlink.event_type = 'unlinked'
            and relation_unlink.effective_at <= p_at
        );
      if not found then
        return pg_catalog.jsonb_build_object(
          'ok', false, 'status', 403, 'code', 'case_location_relation_missing'
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
    'scope_assignment_id', v_scope.id,
    'case_location_relation_id', v_scope.case_location_relation_id,
    'policy_version_id', v_policy.id,
    'require_distinct_maker_checker', v_policy.require_distinct_maker_checker
  );
end;
$$;

create or replace function public.app_ops_location_authorization_resolve_v1(
  p_auth_user_id uuid,
  p_capability_code text,
  p_case_id uuid,
  p_location_id uuid,
  p_at timestamptz
)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if p_capability_code not in (
       'location.root.create',
       'location.observation.record',
       'location.version.accept.prepare',
       'location.version.accept.approve',
       'location.version.correct.prepare',
       'location.version.correct.approve'
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  return public.app_workforce_authorize_v1(
    p_auth_user_id, p_capability_code, p_case_id, p_location_id, p_at
  );
end;
$$;

create function public.app_workforce_admin_complete_v1(
  p_scope text,
  p_key text,
  p_event_type text,
  p_scope_type text,
  p_scope_id uuid,
  p_request_id text,
  p_actor_ref text,
  p_event_data jsonb,
  p_policy_version_id uuid,
  p_response jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_status integer;
begin
  if p_response is null or pg_catalog.jsonb_typeof(p_response) <> 'object'
     or (p_response->>'status') !~ '^[0-9]{3}$'
     or p_scope_type not in (
       'workforce_identity', 'workforce_policy', 'workforce_assignment'
     ) then
    raise exception 'workforce administration completion invalid';
  end if;
  v_status := (p_response->>'status')::integer;
  insert into public.app_audit_events (
    event_type, scope_type, scope_id, request_id, idempotency_key,
    actor_type, actor_ref, event_data, authorization_policy_version_id
  ) values (
    p_event_type, p_scope_type, p_scope_id, p_request_id, p_key,
    'admin', p_actor_ref, pg_catalog.jsonb_strip_nulls(p_event_data),
    p_policy_version_id
  );
  update public.app_idempotency_keys
  set response_status = v_status,
      response_body = p_response,
      completed_at = pg_catalog.clock_timestamp()
  where scope = p_scope and key = p_key
    and response_status is null and response_body is null;
  if not found then
    raise exception 'workforce administration idempotency completion failed';
  end if;
  return p_response;
end;
$$;

create function public.app_workforce_reconcile_capabilities_v1(
  p_workforce_identity_id uuid,
  p_at timestamptz,
  p_actor_ref text,
  p_decision_ref text,
  p_request_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seniority text;
  v_policy_id uuid;
  capability record;
  current_grant public.app_workforce_capability_assignments%rowtype;
  v_should_have boolean;
  v_request text;
begin
  select seniority_event.seniority into v_seniority
  from public.app_workforce_seniority_assignments seniority_event
  where seniority_event.workforce_identity_id = p_workforce_identity_id
    and seniority_event.effective_at <= p_at
  order by seniority_event.effective_at desc, seniority_event.recorded_at desc
  limit 1;
  select activation.policy_version_id into v_policy_id
  from public.app_workforce_policy_activations activation
  where activation.effective_at <= p_at
  order by activation.effective_at desc, activation.recorded_at desc
  limit 1;
  if v_seniority is null or v_policy_id is null then
    raise exception 'workforce capability reconciliation context missing';
  end if;

  for capability in
    select catalog.capability_code,
      greatest(
        public.app_workforce_seniority_rank_v1(catalog.floor_seniority),
        public.app_workforce_seniority_rank_v1(requirement.minimum_seniority)
      ) as required_rank
    from public.app_workforce_capability_catalog catalog
    join public.app_workforce_policy_requirements requirement
      on requirement.policy_version_id = v_policy_id
     and requirement.capability_code = catalog.capability_code
    order by catalog.capability_code
  loop
    v_should_have :=
      public.app_workforce_seniority_rank_v1(v_seniority) >= capability.required_rank;
    select grant_event.* into current_grant
    from public.app_workforce_capability_assignments grant_event
    where grant_event.workforce_identity_id = p_workforce_identity_id
      and grant_event.capability_code = capability.capability_code
      and grant_event.supersedes_assignment_event_id is null
      and grant_event.event_type = 'granted'
      and grant_event.effective_at <= p_at
      and (grant_event.valid_until is null or p_at < grant_event.valid_until)
      and not exists (
        select 1 from public.app_workforce_capability_assignments revoke_event
        where revoke_event.assignment_id = grant_event.assignment_id
          and revoke_event.event_type = 'revoked'
          and revoke_event.effective_at <= p_at
      )
    order by grant_event.effective_at desc
    limit 1;
    v_request := pg_catalog.left(p_request_id, 64) || ':cap:' ||
      pg_catalog.md5(capability.capability_code);
    if v_should_have and not found then
      insert into public.app_workforce_capability_assignments (
        assignment_id, workforce_identity_id, capability_code, event_type,
        effective_at, valid_until, decision_ref, reason_ref,
        recorded_by_actor_ref, request_id, supersedes_assignment_event_id
      ) values (
        gen_random_uuid(), p_workforce_identity_id,
        capability.capability_code, 'granted', p_at, null,
        p_decision_ref, null, p_actor_ref, v_request, null
      );
    elsif not v_should_have and found then
      insert into public.app_workforce_capability_assignments (
        assignment_id, workforce_identity_id, capability_code, event_type,
        effective_at, valid_until, decision_ref, reason_ref,
        recorded_by_actor_ref, request_id, supersedes_assignment_event_id
      ) values (
        current_grant.assignment_id, p_workforce_identity_id,
        capability.capability_code, 'revoked', p_at, null,
        p_decision_ref, 'seniority_or_policy_changed', p_actor_ref,
        v_request, current_grant.id
      );
    end if;
  end loop;
end;
$$;

create function public.app_workforce_first_admin_bootstrap_v1(
  p_auth_user_id uuid,
  p_environment text,
  p_expected_project_id text,
  p_request_id text,
  p_idempotency_key text,
  p_payload_sha256 text,
  p_idempotency_expires_at timestamptz,
  p_decision_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_scope text := 'workforce_bootstrap:v1:' || coalesce(p_environment, '');
  v_begin jsonb;
  v_identity_id uuid;
  v_actor_ref text;
  v_policy_id uuid;
  v_response jsonb;
begin
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_sha256,
    p_idempotency_expires_at, 'system', 'system:workforce_bootstrap', p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('workforce_genesis:v1', 0)
  );
  if p_auth_user_id is null
     or p_environment not in ('local', 'development', 'staging', 'production')
     or p_expected_project_id <> 'enval'
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or coalesce(btrim(p_decision_ref), '') = ''
     or exists (select 1 from public.app_workforce_identities)
     or not exists (
       select 1 from auth.users auth_user
       where auth_user.id = p_auth_user_id
         and auth_user.deleted_at is null
         and coalesce(auth_user.email_confirmed_at, auth_user.confirmed_at) is not null
     ) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'bootstrap_precondition_failed'
    );
    return public.app_workforce_admin_complete_v1(
      v_scope, p_idempotency_key, 'workforce_bootstrap_rejected',
      'workforce_identity', null, p_request_id,
      'system:workforce_bootstrap',
      pg_catalog.jsonb_build_object(
        'environment', p_environment, 'result', 'rejected'
      ), null, v_response
    );
  end if;
  select activation.policy_version_id into v_policy_id
  from public.app_workforce_policy_activations activation
  where activation.effective_at <= v_now
  order by activation.effective_at desc, activation.recorded_at desc
  limit 1;
  if v_policy_id is null then raise exception 'active policy missing'; end if;

  insert into public.app_workforce_identities (
    auth_user_id, created_by_actor_ref, creation_decision_ref, request_id
  ) values (
    p_auth_user_id, 'system:workforce_bootstrap', p_decision_ref,
    p_request_id || ':identity'
  ) returning id, workforce_ref into v_identity_id, v_actor_ref;
  insert into public.app_workforce_identity_states (
    workforce_identity_id, state, effective_at, decision_ref, reason_ref,
    recorded_by_actor_ref, request_id, supersedes_state_id
  ) values (
    v_identity_id, 'active', v_now, p_decision_ref, null,
    'system:workforce_bootstrap', p_request_id || ':state', null
  );
  insert into public.app_workforce_seniority_assignments (
    assignment_id, workforce_identity_id, seniority, effective_at,
    decision_ref, reason_ref, recorded_by_actor_ref, request_id,
    supersedes_seniority_assignment_id
  ) values (
    gen_random_uuid(), v_identity_id, 'admin', v_now,
    p_decision_ref, null, 'system:workforce_bootstrap',
    p_request_id || ':seniority', null
  );
  perform public.app_workforce_reconcile_capabilities_v1(
    v_identity_id, v_now, 'system:workforce_bootstrap',
    p_decision_ref, p_request_id
  );
  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'ok',
    'workforce_ref', v_actor_ref,
    'seniority', 'admin', 'policy_version_id', v_policy_id
  );
  return public.app_workforce_admin_complete_v1(
    v_scope, p_idempotency_key, 'workforce_bootstrap_completed',
    'workforce_identity', v_identity_id, p_request_id,
    'system:workforce_bootstrap',
    pg_catalog.jsonb_build_object(
      'environment', p_environment, 'seniority', 'admin',
      'capability', 'workforce.member.manage', 'decision', 'allowed'
    ), v_policy_id, v_response
  );
exception when unique_violation then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'bootstrap_precondition_failed'
  );
end;
$$;

create function public.app_workforce_member_manage_v1(
  p_auth_user_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_payload_sha256 text,
  p_idempotency_expires_at timestamptz,
  p_action text,
  p_target_auth_user_id uuid,
  p_target_workforce_identity_id uuid,
  p_seniority text,
  p_effective_at timestamptz,
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
  v_target public.app_workforce_identities%rowtype;
  v_state public.app_workforce_identity_states%rowtype;
  v_seniority public.app_workforce_seniority_assignments%rowtype;
  v_event_type text;
  v_response jsonb;
begin
  v_auth := public.app_workforce_authorize_v1(
    p_auth_user_id, 'workforce.member.manage', null, null, v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;
  if p_action not in ('create', 'activate', 'suspend', 'revoke', 'change_seniority')
     or p_effective_at is null or p_effective_at < v_now - interval '5 minutes'
     or coalesce(btrim(p_decision_ref), '') = ''
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or (p_action in ('suspend', 'revoke') and coalesce(btrim(p_reason_ref), '') = '')
     or (p_action in ('create', 'change_seniority') and p_seniority not in ('member', 'reviewer', 'admin')) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  v_scope := 'workforce_member_manage:v1:' ||
    coalesce(p_target_workforce_identity_id::text, p_target_auth_user_id::text, 'missing');
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_sha256,
    p_idempotency_expires_at, 'admin', v_auth->>'actor_ref', p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;

  if p_action = 'create' then
    if p_target_auth_user_id is null
       or p_target_workforce_identity_id is not null
       or not exists (
         select 1 from auth.users auth_user
         where auth_user.id = p_target_auth_user_id
           and auth_user.deleted_at is null
           and coalesce(auth_user.email_confirmed_at, auth_user.confirmed_at) is not null
       ) then
      raise exception 'invalid workforce create target' using errcode = '42501';
    end if;
    insert into public.app_workforce_identities (
      auth_user_id, created_by_actor_ref, creation_decision_ref, request_id
    ) values (
      p_target_auth_user_id, v_auth->>'actor_ref', p_decision_ref,
      p_request_id || ':identity'
    ) returning * into v_target;
    insert into public.app_workforce_identity_states (
      workforce_identity_id, state, effective_at, decision_ref, reason_ref,
      recorded_by_actor_ref, request_id, supersedes_state_id
    ) values (
      v_target.id, 'active', p_effective_at, p_decision_ref, null,
      v_auth->>'actor_ref', p_request_id || ':state', null
    );
    insert into public.app_workforce_seniority_assignments (
      assignment_id, workforce_identity_id, seniority, effective_at,
      decision_ref, reason_ref, recorded_by_actor_ref, request_id,
      supersedes_seniority_assignment_id
    ) values (
      gen_random_uuid(), v_target.id, p_seniority, p_effective_at,
      p_decision_ref, null, v_auth->>'actor_ref',
      p_request_id || ':seniority', null
    );
    perform public.app_workforce_reconcile_capabilities_v1(
      v_target.id, p_effective_at, v_auth->>'actor_ref',
      p_decision_ref, p_request_id
    );
    v_event_type := 'workforce_identity_created';
  else
    select * into v_target from public.app_workforce_identities
    where id = p_target_workforce_identity_id;
    if not found then raise exception 'workforce target missing' using errcode = '42501'; end if;
    if p_action = 'change_seniority' then
      select * into v_seniority
      from public.app_workforce_seniority_assignments seniority_event
      where seniority_event.workforce_identity_id = v_target.id
      order by seniority_event.effective_at desc, seniority_event.recorded_at desc
      limit 1 for update;
      if not found then raise exception 'workforce seniority missing'; end if;
      insert into public.app_workforce_seniority_assignments (
        assignment_id, workforce_identity_id, seniority, effective_at,
        decision_ref, reason_ref, recorded_by_actor_ref, request_id,
        supersedes_seniority_assignment_id
      ) values (
        v_seniority.assignment_id, v_target.id, p_seniority, p_effective_at,
        p_decision_ref, p_reason_ref, v_auth->>'actor_ref',
        p_request_id || ':seniority', v_seniority.id
      );
      perform public.app_workforce_reconcile_capabilities_v1(
        v_target.id, p_effective_at, v_auth->>'actor_ref',
        p_decision_ref, p_request_id
      );
      v_event_type := 'workforce_seniority_changed';
    else
      select * into v_state
      from public.app_workforce_identity_states state_event
      where state_event.workforce_identity_id = v_target.id
      order by state_event.effective_at desc, state_event.recorded_at desc
      limit 1 for update;
      if not found then raise exception 'workforce state missing'; end if;
      insert into public.app_workforce_identity_states (
        workforce_identity_id, state, effective_at, decision_ref, reason_ref,
        recorded_by_actor_ref, request_id, supersedes_state_id
      ) values (
        v_target.id,
        case p_action when 'activate' then 'active'
          when 'suspend' then 'suspended' else 'revoked' end,
        p_effective_at, p_decision_ref, p_reason_ref,
        v_auth->>'actor_ref', p_request_id || ':state', v_state.id
      );
      v_event_type := case p_action
        when 'activate' then 'workforce_identity_activated'
        when 'suspend' then 'workforce_identity_suspended'
        else 'workforce_identity_revoked' end;
    end if;
  end if;
  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 200, 'code', 'ok',
    'workforce_ref', v_target.workforce_ref, 'action', p_action
  );
  return public.app_workforce_admin_complete_v1(
    v_scope, p_idempotency_key, v_event_type, 'workforce_identity',
    v_target.id, p_request_id, v_auth->>'actor_ref',
    pg_catalog.jsonb_build_object(
      'capability', 'workforce.member.manage',
      'action', p_action, 'seniority', p_seniority, 'decision', 'allowed'
    ), (v_auth->>'policy_version_id')::uuid, v_response
  );
exception when unique_violation or check_violation or foreign_key_violation then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'workforce_change_rejected'
  );
end;
$$;

create function public.app_workforce_policy_manage_v1(
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
  v_scope := 'workforce_policy_manage:v1:' || coalesce(p_policy_version_id::text, p_policy_ref, 'missing');
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
    select count(*) into v_count from pg_catalog.jsonb_object_keys(p_requirements);
    if v_count <> 9 then raise exception 'policy capability count invalid' using errcode = '23514'; end if;
    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_requirements) as supplied(capability_code)
      where not exists (
        select 1 from public.app_workforce_capability_catalog catalog
        where catalog.capability_code = supplied.capability_code
      )
    ) then raise exception 'custom capability rejected' using errcode = '23514'; end if;
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
         or public.app_workforce_seniority_rank_v1(requirement.minimum_seniority) <
            public.app_workforce_seniority_rank_v1(requirement.floor_seniority) then
        raise exception 'policy weakens software floor' using errcode = '42501';
      end if;
      insert into public.app_workforce_policy_requirements (
        policy_version_id, capability_code, minimum_seniority
      ) values (v_policy_id, requirement.capability_code, requirement.minimum_seniority);
    end loop;
  else
    if p_policy_version_id is null or p_effective_at is null
       or not exists (
         select 1 from public.app_workforce_policy_versions policy_version
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
        p_decision_ref, p_request_id || ':' || pg_catalog.md5(identity_row.id::text)
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

create function public.app_workforce_case_assignment_manage_v1(
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
begin
  v_auth := public.app_workforce_authorize_v1(
    p_auth_user_id, 'case.assignment.manage', null, null, v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;
  if p_action not in ('grant', 'end')
     or p_target_workforce_identity_id is null
     or p_effective_at is null
     or p_effective_at < v_now - interval '5 minutes'
     or coalesce(btrim(p_decision_ref), '') = ''
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or p_capability_code not in (
       'location.root.create', 'location.observation.record',
       'location.version.accept.prepare', 'location.version.accept.approve',
       'location.version.correct.prepare', 'location.version.correct.approve'
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
       or (p_capability_code = 'location.root.create' and (
         p_location_id is not null or p_case_location_relation_id is not null
       ))
       or (p_capability_code <> 'location.root.create' and (
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
      and (grant_event.valid_until is null or p_effective_at < grant_event.valid_until)
      and not exists (
        select 1 from public.app_workforce_capability_assignments revoke_event
        where revoke_event.assignment_id = grant_event.assignment_id
          and revoke_event.event_type = 'revoked'
          and revoke_event.effective_at <= p_effective_at
      )
    order by grant_event.effective_at desc limit 1;
    if not found then raise exception 'target capability missing' using errcode = '42501'; end if;
    if p_location_id is not null and not exists (
      select 1 from public.app_case_location_relations relation
      where relation.id = p_case_location_relation_id
        and relation.case_id = p_case_id and relation.location_id = p_location_id
        and relation.event_type = 'linked'
        and relation.supersedes_relation_event_id is null
    ) then raise exception 'case location relation missing' using errcode = '42501'; end if;
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
    if not found then raise exception 'assignment missing' using errcode = '42501'; end if;
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

create or replace function public.app_workforce_operation_reviews_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  operation_request public.app_workforce_operation_requests%rowtype;
  expected_capability text;
  require_distinct boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'location_review:v1:' || new.operation_request_id::text, 0
    )
  );
  select * into operation_request
  from public.app_workforce_operation_requests
  where id = new.operation_request_id
  for update;
  expected_capability := case operation_request.operation_type
    when 'initial_location_acceptance' then 'location.version.accept.approve'
    when 'location_correction' then 'location.version.correct.approve'
    else null
  end;
  select policy.require_distinct_maker_checker into require_distinct
  from public.app_workforce_policy_versions policy
  where policy.id = new.authorization_policy_version_id;
  if not found
     or operation_request.execution_status <> 'pending'
     or new.reviewed_at < operation_request.created_at
     or new.reviewed_payload_hash <> operation_request.payload_hash
     or (require_distinct and new.checker_workforce_identity_id =
          operation_request.maker_workforce_identity_id)
     or new.checker_capability_code is distinct from expected_capability
     or not public.app_workforce_scope_is_authorized_v1(
       new.checker_workforce_identity_id,
       new.checker_scope_assignment_id,
       new.checker_capability_code,
       operation_request.case_id,
       operation_request.location_id,
       new.reviewed_at
     ) then
    raise exception 'invalid or unauthorized location operation review'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.app_workforce_operation_requests_update_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  review public.app_workforce_operation_reviews%rowtype;
  v_policy_id uuid;
  require_distinct boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'workforce operation requests cannot be deleted'
      using errcode = '23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('location_operation:v1:' || old.id::text, 0)
  );
  if old.execution_status <> 'pending'
     or new.execution_status <> 'executed'
     or new.id <> old.id
     or new.operation_type <> old.operation_type
     or new.case_id <> old.case_id
     or new.location_id <> old.location_id
     or new.observation_id <> old.observation_id
     or new.predecessor_version_id is distinct from old.predecessor_version_id
     or new.maker_workforce_identity_id <> old.maker_workforce_identity_id
     or new.maker_scope_assignment_id <> old.maker_scope_assignment_id
     or new.maker_capability_code <> old.maker_capability_code
     or new.payload_hash <> old.payload_hash
     or new.payload_contract_version <> old.payload_contract_version
     or new.request_id <> old.request_id
     or new.idempotency_key <> old.idempotency_key
     or new.created_at <> old.created_at
     or new.authorization_policy_version_id is distinct from
          old.authorization_policy_version_id
     or new.executed_at < old.created_at then
    raise exception 'only the exact pending to executed transition is allowed'
      using errcode = '23514';
  end if;
  select * into review
  from public.app_workforce_operation_reviews
  where operation_request_id = old.id;
  begin
    v_policy_id := nullif(pg_catalog.current_setting(
      'app.authorization_policy_version_id', true
    ), '')::uuid;
  exception when others then
    v_policy_id := null;
  end;
  select policy.require_distinct_maker_checker into require_distinct
  from public.app_workforce_policy_versions policy
  where policy.id = v_policy_id;
  if not found
     or review.outcome <> 'approved'
     or review.reviewed_payload_hash <> old.payload_hash
     or (require_distinct and review.checker_workforce_identity_id =
          old.maker_workforce_identity_id)
     or not public.app_workforce_scope_is_authorized_v1(
       old.maker_workforce_identity_id,
       old.maker_scope_assignment_id,
       old.maker_capability_code,
       old.case_id, old.location_id, new.executed_at
     )
     or not public.app_workforce_scope_is_authorized_v1(
       review.checker_workforce_identity_id,
       review.checker_scope_assignment_id,
       review.checker_capability_code,
       old.case_id, old.location_id, new.executed_at
     )
     or exists (
       select 1 from public.app_workforce_identity_states blocker
       where blocker.workforce_identity_id = old.maker_workforce_identity_id
         and blocker.effective_at > old.created_at
         and blocker.effective_at <= new.executed_at
         and blocker.state <> 'active'
     )
     or exists (
       select 1 from public.app_workforce_identity_states blocker
       where blocker.workforce_identity_id = review.checker_workforce_identity_id
         and blocker.effective_at > review.reviewed_at
         and blocker.effective_at <= new.executed_at
         and blocker.state <> 'active'
     ) then
    raise exception 'approved request is not execution eligible'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create function public.app_ops_location_policy_review_v1(
  p_auth_user_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_idempotency_expires_at timestamptz,
  p_payload jsonb,
  p_operation_type text,
  p_capability_code text,
  p_caller text,
  p_operation_label text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_operation_request_id uuid;
  v_request public.app_workforce_operation_requests%rowtype;
  v_outcome text;
  v_reviewed_hash text;
  v_auth jsonb;
  v_scope text;
  v_begin jsonb;
  v_review_id uuid;
  v_response jsonb;
begin
  if p_operation_type not in ('initial_location_acceptance', 'location_correction')
     or p_capability_code not in (
       'location.version.accept.approve',
       'location.version.correct.approve'
     )
     or p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or p_payload - array[
       'operation_request_id', 'outcome', 'reviewed_payload_hash',
       'decision_ref', 'reason_ref'
     ] <> '{}'::jsonb then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  begin
    v_operation_request_id := (p_payload->>'operation_request_id')::uuid;
  exception when others then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end;
  v_outcome := p_payload->>'outcome';
  v_reviewed_hash := p_payload->>'reviewed_payload_hash';
  select * into v_request
  from public.app_workforce_operation_requests
  where id = v_operation_request_id and operation_type = p_operation_type
  for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'operation_request_missing'
    );
  end if;
  if v_request.execution_status <> 'pending' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'operation_request_not_pending'
    );
  end if;
  v_auth := public.app_ops_location_authorization_resolve_v1(
    p_auth_user_id, p_capability_code,
    v_request.case_id, v_request.location_id, v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;
  if (v_auth->>'require_distinct_maker_checker')::boolean
     and (v_auth->>'workforce_identity_id')::uuid =
       v_request.maker_workforce_identity_id then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'self_approval_forbidden'
    );
  end if;
  if v_reviewed_hash is distinct from v_request.payload_hash then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'payload_hash_mismatch'
    );
  end if;
  if v_outcome not in ('approved', 'rejected')
     or coalesce(btrim(p_payload->>'decision_ref'), '') = ''
     or (v_outcome = 'approved' and p_payload->>'reason_ref' is not null)
     or (v_outcome = 'rejected' and coalesce(btrim(p_payload->>'reason_ref'), '') = '') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  v_scope := 'ops_location_policy_review:v1:' ||
    (v_auth->>'workforce_identity_id') || ':request:' ||
    v_operation_request_id::text;
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_hash, p_idempotency_expires_at,
    'worker', v_auth->>'actor_ref', p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;
  insert into public.app_workforce_operation_reviews (
    operation_request_id, outcome, reviewed_payload_hash,
    checker_workforce_identity_id, checker_scope_assignment_id,
    checker_capability_code, reviewed_at, decision_ref, reason_ref,
    request_id, idempotency_key, authorization_policy_version_id
  ) values (
    v_operation_request_id, v_outcome, v_reviewed_hash,
    (v_auth->>'workforce_identity_id')::uuid,
    (v_auth->>'scope_assignment_id')::uuid,
    p_capability_code, v_now, p_payload->>'decision_ref',
    case when v_outcome = 'rejected' then p_payload->>'reason_ref' else null end,
    p_request_id, p_idempotency_key,
    (v_auth->>'policy_version_id')::uuid
  ) returning id into v_review_id;
  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'ok',
    'operation', p_operation_label,
    'operation_request_id', v_operation_request_id,
    'review_id', v_review_id, 'outcome', v_outcome
  );
  return public.app_location_write_complete_v1(
    v_scope, p_idempotency_key,
    case p_operation_type
      when 'initial_location_acceptance' then 'ops_location_accept_reviewed'
      else 'ops_location_correct_reviewed' end,
    v_request.location_id, p_request_id, 'worker', v_auth->>'actor_ref',
    pg_catalog.jsonb_build_object(
      'caller', p_caller, 'action', 'review',
      'capability', p_capability_code,
      'case_id', v_request.case_id, 'location_id', v_request.location_id,
      'operation_request_id', v_operation_request_id,
      'review_id', v_review_id,
      'authorization_outcome', 'authorized',
      'business_outcome', v_outcome,
      'policy_version_id', v_auth->>'policy_version_id'
    ), v_response
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

create or replace function public.app_ops_location_accept_review_v1(
  p_auth_user_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_idempotency_expires_at timestamptz,
  p_payload jsonb
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.app_ops_location_policy_review_v1(
    p_auth_user_id, p_request_id, p_idempotency_key, p_payload_hash,
    p_idempotency_expires_at, p_payload,
    'initial_location_acceptance', 'location.version.accept.approve',
    'api-app-ops-location-version-accept', 'accept_review'
  );
$$;

create or replace function public.app_ops_location_correct_review_v1(
  p_auth_user_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_idempotency_expires_at timestamptz,
  p_payload jsonb
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.app_ops_location_policy_review_v1(
    p_auth_user_id, p_request_id, p_idempotency_key, p_payload_hash,
    p_idempotency_expires_at, p_payload,
    'location_correction', 'location.version.correct.approve',
    'api-app-ops-location-version-correct', 'correct_review'
  );
$$;

create function public.app_workforce_policy_requirement_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_floor text;
begin
  select catalog.floor_seniority into v_floor
  from public.app_workforce_capability_catalog catalog
  where catalog.capability_code = new.capability_code;
  if not found
     or public.app_workforce_seniority_rank_v1(new.minimum_seniority) <
        public.app_workforce_seniority_rank_v1(v_floor) then
    raise exception 'workforce policy weakens software floor'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger app_workforce_policy_requirement_insert_guard
before insert on public.app_workforce_policy_requirements
for each row execute function public.app_workforce_policy_requirement_insert_guard();

create function public.app_workforce_policy_activation_insert_guard()
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
    select count(*) from public.app_workforce_policy_requirements requirement
    where requirement.policy_version_id = new.policy_version_id
  ) <> 9 then
    raise exception 'incomplete workforce policy cannot activate'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger app_workforce_policy_activation_insert_guard
before insert on public.app_workforce_policy_activations
for each row execute function public.app_workforce_policy_activation_insert_guard();

alter table public.app_workforce_capability_catalog enable row level security;
alter table public.app_workforce_policy_versions enable row level security;
alter table public.app_workforce_policy_requirements enable row level security;
alter table public.app_workforce_policy_activations enable row level security;
alter table public.app_workforce_seniority_assignments enable row level security;

create policy deny_all on public.app_workforce_capability_catalog
for all to anon, authenticated using (false) with check (false);
create policy deny_all on public.app_workforce_policy_versions
for all to anon, authenticated using (false) with check (false);
create policy deny_all on public.app_workforce_policy_requirements
for all to anon, authenticated using (false) with check (false);
create policy deny_all on public.app_workforce_policy_activations
for all to anon, authenticated using (false) with check (false);
create policy deny_all on public.app_workforce_seniority_assignments
for all to anon, authenticated using (false) with check (false);

revoke all on table public.app_workforce_capability_catalog
  from public, anon, authenticated, service_role;
revoke all on table public.app_workforce_policy_versions
  from public, anon, authenticated, service_role;
revoke all on table public.app_workforce_policy_requirements
  from public, anon, authenticated, service_role;
revoke all on table public.app_workforce_policy_activations
  from public, anon, authenticated, service_role;
revoke all on table public.app_workforce_seniority_assignments
  from public, anon, authenticated, service_role;
grant select on table public.app_workforce_capability_catalog to service_role;
grant select on table public.app_workforce_policy_versions to service_role;
grant select on table public.app_workforce_policy_requirements to service_role;
grant select on table public.app_workforce_policy_activations to service_role;
grant select on table public.app_workforce_seniority_assignments to service_role;

-- Consequential workforce writes now flow only through the fixed RPCs below.
-- The bridge/admin functions are SECURITY DEFINER and do not require direct
-- service_role insert authority on the underlying append-only tables.
revoke insert on table public.app_workforce_identities from service_role;
revoke insert on table public.app_workforce_identity_states from service_role;
revoke insert on table public.app_workforce_capability_assignments from service_role;
revoke insert on table public.app_case_location_relations from service_role;
revoke insert on table public.app_workforce_scope_assignments from service_role;
revoke insert on table public.app_workforce_operation_requests from service_role;
revoke insert on table public.app_workforce_operation_reviews from service_role;

revoke all on function public.app_workforce_seniority_rank_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function public.app_workforce_policy_complete_guard()
  from public, anon, authenticated, service_role;
revoke all on function public.app_workforce_seniority_insert_guard()
  from public, anon, authenticated, service_role;
revoke all on function public.app_workforce_policy_context_before_insert()
  from public, anon, authenticated, service_role;
revoke all on function public.app_workforce_audit_immutable_guard()
  from public, anon, authenticated, service_role;
revoke all on function public.app_workforce_policy_requirement_insert_guard()
  from public, anon, authenticated, service_role;
revoke all on function public.app_workforce_policy_activation_insert_guard()
  from public, anon, authenticated, service_role;
revoke all on function public.app_workforce_authorize_v1(uuid, text, uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.app_workforce_admin_complete_v1(
  text, text, text, text, uuid, text, text, jsonb, uuid, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.app_workforce_reconcile_capabilities_v1(
  uuid, timestamptz, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.app_ops_location_policy_review_v1(
  uuid, text, text, text, timestamptz, jsonb, text, text, text, text
) from public, anon, authenticated, service_role;

revoke all on function public.app_workforce_first_admin_bootstrap_v1(
  uuid, text, text, text, text, text, timestamptz, text
) from public, anon, authenticated, service_role;
revoke all on function public.app_workforce_member_manage_v1(
  uuid, text, text, text, timestamptz, text, uuid, uuid, text,
  timestamptz, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.app_workforce_policy_manage_v1(
  uuid, text, text, text, timestamptz, text, uuid, text, boolean,
  jsonb, timestamptz, text
) from public, anon, authenticated, service_role;
revoke all on function public.app_workforce_case_assignment_manage_v1(
  uuid, text, text, text, timestamptz, text, uuid, text, uuid, uuid,
  uuid, uuid, timestamptz, timestamptz, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.app_workforce_first_admin_bootstrap_v1(
  uuid, text, text, text, text, text, timestamptz, text
) to service_role;
grant execute on function public.app_workforce_member_manage_v1(
  uuid, text, text, text, timestamptz, text, uuid, uuid, text,
  timestamptz, text, text
) to service_role;
grant execute on function public.app_workforce_policy_manage_v1(
  uuid, text, text, text, timestamptz, text, uuid, text, boolean,
  jsonb, timestamptz, text
) to service_role;
grant execute on function public.app_workforce_case_assignment_manage_v1(
  uuid, text, text, text, timestamptz, text, uuid, text, uuid, uuid,
  uuid, uuid, timestamptz, timestamptz, text, text
) to service_role;

comment on table public.app_workforce_capability_catalog is
  'Core-software-owned fixed pilot capability catalogue. Organizations cannot add capability identifiers or lower hard floors.';
comment on table public.app_workforce_policy_versions is
  'Immutable fixed-schema organization authorization policy versions. Maker/checker separation is an organization control, not a regulatory claim.';
comment on table public.app_workforce_seniority_assignments is
  'Append-only member, reviewer or admin seniority history. Seniority never replaces exact capability and scope authorization.';
comment on function public.app_workforce_authorize_v1(uuid, text, uuid, uuid, timestamptz) is
  'Single database-authoritative evaluator for active workforce identity, seniority, exact capability, exact scope, active policy version and hard software floors.';
comment on function public.app_workforce_first_admin_bootstrap_v1(
  uuid, text, text, text, text, text, timestamptz, text
) is
  'Service-role-only single-use first-admin genesis. It requires a verified existing Auth principal and permanently closes once any workforce identity exists.';

-- TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
--
-- WP3L-B bounded workforce authorization foundation.
--
-- Workforce authority is independent from customer identity. Customer
-- identities, case-party roles, representation authority and service_role do
-- not confer workforce capability. service_role is a technical database
-- caller, never a human principal.
--
-- Browser roles have no access. Initial location acceptance and correction
-- require distinct maker and checker workforce identities. There is no
-- emergency override.
--
-- This migration creates no bootstrap identity, seed, population, Edge
-- Function, caller or WP3J execution. Bootstrap remains a separately
-- controlled runbook: fixed bootstrap identities, self-enrollment and silent
-- admin authority are outside this migration. No remote or regulatory
-- acceptance is established. Retention remains an open category-specific
-- decision; no cleanup or hard-delete route is created.

alter table public.app_audit_events
  drop constraint app_audit_events_scope_type_chk;

alter table public.app_audit_events
  add constraint app_audit_events_scope_type_chk
  check (
    scope_type in (
      'intake',
      'auth',
      'customer',
      'dossier',
      'location',
      'charger',
      'document',
      'request',
      'support',
      'consent',
      'kwh',
      'result',
      'fee',
      'retention',
      'workforce_identity',
      'workforce_authorization',
      'location_operation_request'
    )
  );

create table public.app_workforce_identities (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null
    references auth.users (id) on delete restrict,
  workforce_ref text generated always as (
    'app_workforce_identity:' || id::text
  ) stored,
  created_at timestamptz not null default clock_timestamp(),
  created_by_actor_ref text not null,
  creation_decision_ref text not null,
  request_id text not null,

  constraint app_workforce_identities_auth_user_id_key
    unique (auth_user_id),
  constraint app_workforce_identities_workforce_ref_key
    unique (workforce_ref),
  constraint app_workforce_identities_request_id_key
    unique (request_id),
  constraint app_workforce_identities_refs_chk
    check (
      created_by_actor_ref = btrim(created_by_actor_ref)
      and char_length(created_by_actor_ref) between 1 and 200
      and creation_decision_ref = btrim(creation_decision_ref)
      and char_length(creation_decision_ref) between 1 and 200
      and request_id = btrim(request_id)
      and char_length(request_id) between 1 and 128
    )
);

create index app_workforce_identities_created_at_idx
  on public.app_workforce_identities (created_at);

create table public.app_workforce_identity_states (
  id uuid primary key default gen_random_uuid(),
  workforce_identity_id uuid not null
    references public.app_workforce_identities (id) on delete restrict,
  state text not null,
  effective_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  decision_ref text not null,
  reason_ref text,
  recorded_by_actor_ref text not null,
  request_id text not null,
  supersedes_state_id uuid
    references public.app_workforce_identity_states (id) on delete restrict,

  constraint app_workforce_identity_states_state_chk
    check (state in ('active', 'suspended', 'revoked')),
  constraint app_workforce_identity_states_reason_chk
    check (
      (
        state = 'active'
        and (
          reason_ref is null
          or (
            reason_ref = btrim(reason_ref)
            and char_length(reason_ref) between 1 and 200
          )
        )
      )
      or (
        state in ('suspended', 'revoked')
        and reason_ref = btrim(reason_ref)
        and char_length(reason_ref) between 1 and 200
      )
    ),
  constraint app_workforce_identity_states_refs_chk
    check (
      decision_ref = btrim(decision_ref)
      and char_length(decision_ref) between 1 and 200
      and recorded_by_actor_ref = btrim(recorded_by_actor_ref)
      and char_length(recorded_by_actor_ref) between 1 and 200
      and request_id = btrim(request_id)
      and char_length(request_id) between 1 and 128
    ),
  constraint app_workforce_identity_states_not_self_chk
    check (supersedes_state_id is null or supersedes_state_id <> id),
  constraint app_workforce_identity_states_identity_effective_key
    unique (workforce_identity_id, effective_at),
  constraint app_workforce_identity_states_request_id_key
    unique (request_id)
);

create unique index app_workforce_identity_states_successor_uidx
  on public.app_workforce_identity_states (supersedes_state_id)
  where supersedes_state_id is not null;

create index app_workforce_identity_states_identity_effective_idx
  on public.app_workforce_identity_states (
    workforce_identity_id,
    effective_at desc
  );

create table public.app_workforce_capability_assignments (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null,
  workforce_identity_id uuid not null
    references public.app_workforce_identities (id) on delete restrict,
  capability_code text not null,
  event_type text not null,
  effective_at timestamptz not null,
  valid_until timestamptz,
  recorded_at timestamptz not null default clock_timestamp(),
  decision_ref text not null,
  reason_ref text,
  recorded_by_actor_ref text not null,
  request_id text not null,
  supersedes_assignment_event_id uuid
    references public.app_workforce_capability_assignments (id)
    on delete restrict,

  constraint app_workforce_capability_assignments_capability_chk
    check (
      capability_code in (
        'location.root.create',
        'location.observation.record',
        'location.version.accept.prepare',
        'location.version.accept.approve',
        'location.version.correct.prepare',
        'location.version.correct.approve'
      )
    ),
  constraint app_workforce_capability_assignments_event_chk
    check (event_type in ('granted', 'revoked')),
  constraint app_workforce_capability_assignments_period_chk
    check (
      (
        event_type = 'granted'
        and (valid_until is null or valid_until > effective_at)
      )
      or (
        event_type = 'revoked'
        and valid_until is null
      )
    ),
  constraint app_workforce_capability_assignments_reason_chk
    check (
      (
        event_type = 'granted'
        and reason_ref is null
      )
      or (
        event_type = 'revoked'
        and reason_ref = btrim(reason_ref)
        and char_length(reason_ref) between 1 and 200
      )
    ),
  constraint app_workforce_capability_assignments_refs_chk
    check (
      decision_ref = btrim(decision_ref)
      and char_length(decision_ref) between 1 and 200
      and recorded_by_actor_ref = btrim(recorded_by_actor_ref)
      and char_length(recorded_by_actor_ref) between 1 and 200
      and request_id = btrim(request_id)
      and char_length(request_id) between 1 and 128
    ),
  constraint app_workforce_capability_assignments_not_self_chk
    check (
      supersedes_assignment_event_id is null
      or supersedes_assignment_event_id <> id
    ),
  constraint app_workforce_capability_assignments_request_id_key
    unique (request_id),
  constraint app_workforce_capability_assignments_identity_code_key
    unique (id, workforce_identity_id, capability_code)
);

create unique index app_workforce_capability_assignments_root_uidx
  on public.app_workforce_capability_assignments (assignment_id)
  where supersedes_assignment_event_id is null;

create unique index app_workforce_capability_assignments_successor_uidx
  on public.app_workforce_capability_assignments (
    supersedes_assignment_event_id
  )
  where supersedes_assignment_event_id is not null;

create index app_workforce_capability_assignments_lookup_idx
  on public.app_workforce_capability_assignments (
    workforce_identity_id,
    capability_code,
    effective_at
  );

create index app_workforce_capability_assignments_chain_idx
  on public.app_workforce_capability_assignments (
    assignment_id,
    effective_at
  );

create index app_workforce_capability_assignments_expiry_idx
  on public.app_workforce_capability_assignments (valid_until)
  where valid_until is not null;

create table public.app_case_location_relations (
  id uuid primary key default gen_random_uuid(),
  relation_id uuid not null,
  case_id uuid not null
    references public.app_cases (id) on delete restrict,
  location_id uuid not null
    references public.app_locations (id) on delete restrict,
  event_type text not null,
  effective_at timestamptz not null,
  valid_until timestamptz,
  recorded_at timestamptz not null default clock_timestamp(),
  decision_ref text not null,
  reason_ref text,
  recorded_by_actor_ref text not null,
  request_id text not null,
  supersedes_relation_event_id uuid
    references public.app_case_location_relations (id) on delete restrict,

  constraint app_case_location_relations_event_chk
    check (event_type in ('linked', 'unlinked')),
  constraint app_case_location_relations_period_chk
    check (
      (
        event_type = 'linked'
        and (valid_until is null or valid_until > effective_at)
      )
      or (
        event_type = 'unlinked'
        and valid_until is null
      )
    ),
  constraint app_case_location_relations_reason_chk
    check (
      (
        event_type = 'linked'
        and reason_ref is null
      )
      or (
        event_type = 'unlinked'
        and reason_ref = btrim(reason_ref)
        and char_length(reason_ref) between 1 and 200
      )
    ),
  constraint app_case_location_relations_refs_chk
    check (
      decision_ref = btrim(decision_ref)
      and char_length(decision_ref) between 1 and 200
      and recorded_by_actor_ref = btrim(recorded_by_actor_ref)
      and char_length(recorded_by_actor_ref) between 1 and 200
      and request_id = btrim(request_id)
      and char_length(request_id) between 1 and 128
    ),
  constraint app_case_location_relations_not_self_chk
    check (
      supersedes_relation_event_id is null
      or supersedes_relation_event_id <> id
    ),
  constraint app_case_location_relations_request_id_key
    unique (request_id),
  constraint app_case_location_relations_case_location_key
    unique (id, case_id, location_id)
);

create unique index app_case_location_relations_root_uidx
  on public.app_case_location_relations (relation_id)
  where supersedes_relation_event_id is null;

create unique index app_case_location_relations_successor_uidx
  on public.app_case_location_relations (supersedes_relation_event_id)
  where supersedes_relation_event_id is not null;

create index app_case_location_relations_case_effective_idx
  on public.app_case_location_relations (case_id, effective_at);

create index app_case_location_relations_location_effective_idx
  on public.app_case_location_relations (location_id, effective_at);

create index app_case_location_relations_pair_effective_idx
  on public.app_case_location_relations (
    case_id,
    location_id,
    effective_at
  );

create index app_case_location_relations_chain_idx
  on public.app_case_location_relations (relation_id, effective_at);

create table public.app_workforce_scope_assignments (
  id uuid primary key default gen_random_uuid(),
  scope_assignment_id uuid not null,
  workforce_identity_id uuid not null
    references public.app_workforce_identities (id) on delete restrict,
  capability_assignment_id uuid not null,
  capability_code text not null,
  case_id uuid not null
    references public.app_cases (id) on delete restrict,
  location_id uuid
    references public.app_locations (id) on delete restrict,
  case_location_relation_id uuid,
  event_type text not null,
  effective_at timestamptz not null,
  valid_until timestamptz,
  recorded_at timestamptz not null default clock_timestamp(),
  decision_ref text not null,
  reason_ref text,
  recorded_by_actor_ref text not null,
  request_id text not null,
  supersedes_scope_event_id uuid
    references public.app_workforce_scope_assignments (id)
    on delete restrict,

  constraint app_workforce_scope_assignments_capability_chk
    check (
      capability_code in (
        'location.root.create',
        'location.observation.record',
        'location.version.accept.prepare',
        'location.version.accept.approve',
        'location.version.correct.prepare',
        'location.version.correct.approve'
      )
    ),
  constraint app_workforce_scope_assignments_shape_chk
    check (
      (
        capability_code = 'location.root.create'
        and location_id is null
        and case_location_relation_id is null
      )
      or (
        capability_code <> 'location.root.create'
        and location_id is not null
        and case_location_relation_id is not null
      )
    ),
  constraint app_workforce_scope_assignments_event_chk
    check (event_type in ('granted', 'revoked')),
  constraint app_workforce_scope_assignments_period_chk
    check (
      (
        event_type = 'granted'
        and (valid_until is null or valid_until > effective_at)
      )
      or (
        event_type = 'revoked'
        and valid_until is null
      )
    ),
  constraint app_workforce_scope_assignments_reason_chk
    check (
      (
        event_type = 'granted'
        and reason_ref is null
      )
      or (
        event_type = 'revoked'
        and reason_ref = btrim(reason_ref)
        and char_length(reason_ref) between 1 and 200
      )
    ),
  constraint app_workforce_scope_assignments_refs_chk
    check (
      decision_ref = btrim(decision_ref)
      and char_length(decision_ref) between 1 and 200
      and recorded_by_actor_ref = btrim(recorded_by_actor_ref)
      and char_length(recorded_by_actor_ref) between 1 and 200
      and request_id = btrim(request_id)
      and char_length(request_id) between 1 and 128
    ),
  constraint app_workforce_scope_assignments_not_self_chk
    check (
      supersedes_scope_event_id is null
      or supersedes_scope_event_id <> id
    ),
  constraint app_workforce_scope_assignments_request_id_key
    unique (request_id),
  constraint app_workforce_scope_assignments_identity_code_key
    unique (id, workforce_identity_id, capability_code),
  constraint app_workforce_scope_assignments_exact_key
    unique (
      id,
      workforce_identity_id,
      capability_code,
      case_id,
      location_id
    ),
  constraint app_workforce_scope_assignments_capability_fkey
    foreign key (
      capability_assignment_id,
      workforce_identity_id,
      capability_code
    )
    references public.app_workforce_capability_assignments (
      id,
      workforce_identity_id,
      capability_code
    )
    on delete restrict,
  constraint app_workforce_scope_assignments_relation_fkey
    foreign key (
      case_location_relation_id,
      case_id,
      location_id
    )
    references public.app_case_location_relations (
      id,
      case_id,
      location_id
    )
    on delete restrict
);

create unique index app_workforce_scope_assignments_root_uidx
  on public.app_workforce_scope_assignments (scope_assignment_id)
  where supersedes_scope_event_id is null;

create unique index app_workforce_scope_assignments_successor_uidx
  on public.app_workforce_scope_assignments (supersedes_scope_event_id)
  where supersedes_scope_event_id is not null;

create index app_workforce_scope_assignments_lookup_idx
  on public.app_workforce_scope_assignments (
    workforce_identity_id,
    capability_code,
    case_id,
    location_id,
    effective_at
  );

create index app_workforce_scope_assignments_relation_idx
  on public.app_workforce_scope_assignments (case_location_relation_id)
  where case_location_relation_id is not null;

create index app_workforce_scope_assignments_chain_idx
  on public.app_workforce_scope_assignments (
    scope_assignment_id,
    effective_at
  );

create table public.app_workforce_operation_requests (
  id uuid primary key default gen_random_uuid(),
  operation_type text not null,
  case_id uuid not null
    references public.app_cases (id) on delete restrict,
  location_id uuid not null
    references public.app_locations (id) on delete restrict,
  observation_id uuid not null,
  predecessor_version_id uuid,
  maker_workforce_identity_id uuid not null
    references public.app_workforce_identities (id) on delete restrict,
  maker_scope_assignment_id uuid not null,
  maker_capability_code text not null,
  payload_hash text not null,
  payload_contract_version text not null,
  request_id text not null,
  idempotency_key text not null,
  created_at timestamptz not null default clock_timestamp(),
  execution_status text not null default 'pending',
  executed_at timestamptz,
  execution_request_id text,
  wp3j_rpc_name text,
  wp3j_result_code text,
  wp3j_result_ref text,

  constraint app_workforce_operation_requests_type_chk
    check (
      (
        operation_type = 'initial_location_acceptance'
        and maker_capability_code = 'location.version.accept.prepare'
        and predecessor_version_id is null
        and payload_contract_version = 'location_acceptance_v1'
      )
      or (
        operation_type = 'location_correction'
        and maker_capability_code = 'location.version.correct.prepare'
        and predecessor_version_id is not null
        and payload_contract_version = 'location_correction_v1'
      )
    ),
  constraint app_workforce_operation_requests_hash_chk
    check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint app_workforce_operation_requests_refs_chk
    check (
      request_id = btrim(request_id)
      and char_length(request_id) between 1 and 128
      and idempotency_key = btrim(idempotency_key)
      and char_length(idempotency_key) between 1 and 200
      and (
        execution_request_id is null
        or (
          execution_request_id = btrim(execution_request_id)
          and char_length(execution_request_id) between 1 and 128
        )
      )
      and (
        wp3j_result_code is null
        or (
          wp3j_result_code = btrim(wp3j_result_code)
          and char_length(wp3j_result_code) between 1 and 100
        )
      )
      and (
        wp3j_result_ref is null
        or (
          wp3j_result_ref = btrim(wp3j_result_ref)
          and char_length(wp3j_result_ref) between 1 and 200
        )
      )
    ),
  constraint app_workforce_operation_requests_execution_chk
    check (
      (
        execution_status = 'pending'
        and executed_at is null
        and execution_request_id is null
        and wp3j_rpc_name is null
        and wp3j_result_code is null
        and wp3j_result_ref is null
      )
      or (
        execution_status = 'executed'
        and executed_at is not null
        and execution_request_id is not null
        and wp3j_rpc_name is not null
        and wp3j_result_code is not null
        and wp3j_result_ref is not null
      )
    ),
  constraint app_workforce_operation_requests_rpc_chk
    check (
      wp3j_rpc_name is null
      or (
        operation_type = 'initial_location_acceptance'
        and wp3j_rpc_name = 'app_accept_initial_location_version_v1'
      )
      or (
        operation_type = 'location_correction'
        and wp3j_rpc_name = 'app_correct_location_version_v1'
      )
    ),
  constraint app_workforce_operation_requests_request_id_key
    unique (request_id),
  constraint app_workforce_operation_requests_maker_idempotency_key
    unique (
      maker_workforce_identity_id,
      operation_type,
      idempotency_key
    ),
  constraint app_workforce_operation_requests_execution_request_id_key
    unique (execution_request_id),
  constraint app_workforce_operation_requests_observation_fkey
    foreign key (location_id, observation_id)
    references public.app_location_address_observations (location_id, id)
    on delete restrict,
  constraint app_workforce_operation_requests_predecessor_fkey
    foreign key (location_id, predecessor_version_id)
    references public.app_location_versions (location_id, id)
    on delete restrict,
  constraint app_workforce_operation_requests_maker_scope_fkey
    foreign key (
      maker_scope_assignment_id,
      maker_workforce_identity_id,
      maker_capability_code,
      case_id,
      location_id
    )
    references public.app_workforce_scope_assignments (
      id,
      workforce_identity_id,
      capability_code,
      case_id,
      location_id
    )
    on delete restrict
);

create index app_workforce_operation_requests_pending_idx
  on public.app_workforce_operation_requests (
    case_id,
    location_id,
    created_at
  )
  where execution_status = 'pending';

create index app_workforce_operation_requests_maker_idx
  on public.app_workforce_operation_requests (
    maker_workforce_identity_id,
    created_at
  );

create index app_workforce_operation_requests_payload_idx
  on public.app_workforce_operation_requests (payload_hash);

create table public.app_workforce_operation_reviews (
  id uuid primary key default gen_random_uuid(),
  operation_request_id uuid not null
    references public.app_workforce_operation_requests (id)
    on delete restrict,
  outcome text not null,
  reviewed_payload_hash text not null,
  checker_workforce_identity_id uuid not null
    references public.app_workforce_identities (id) on delete restrict,
  checker_scope_assignment_id uuid not null,
  checker_capability_code text not null,
  reviewed_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  decision_ref text not null,
  reason_ref text,
  request_id text not null,
  idempotency_key text not null,

  constraint app_workforce_operation_reviews_outcome_chk
    check (outcome in ('approved', 'rejected')),
  constraint app_workforce_operation_reviews_hash_chk
    check (reviewed_payload_hash ~ '^[0-9a-f]{64}$'),
  constraint app_workforce_operation_reviews_reason_chk
    check (
      (
        outcome = 'approved'
        and reason_ref is null
      )
      or (
        outcome = 'rejected'
        and reason_ref = btrim(reason_ref)
        and char_length(reason_ref) between 1 and 200
      )
    ),
  constraint app_workforce_operation_reviews_refs_chk
    check (
      decision_ref = btrim(decision_ref)
      and char_length(decision_ref) between 1 and 200
      and request_id = btrim(request_id)
      and char_length(request_id) between 1 and 128
      and idempotency_key = btrim(idempotency_key)
      and char_length(idempotency_key) between 1 and 200
    ),
  constraint app_workforce_operation_reviews_operation_request_id_key
    unique (operation_request_id),
  constraint app_workforce_operation_reviews_request_id_key
    unique (request_id),
  constraint app_workforce_operation_reviews_checker_idempotency_key
    unique (checker_workforce_identity_id, idempotency_key),
  constraint app_workforce_operation_reviews_checker_scope_fkey
    foreign key (
      checker_scope_assignment_id,
      checker_workforce_identity_id,
      checker_capability_code
    )
    references public.app_workforce_scope_assignments (
      id,
      workforce_identity_id,
      capability_code
    )
    on delete restrict
);

create index app_workforce_operation_reviews_checker_idx
  on public.app_workforce_operation_reviews (
    checker_workforce_identity_id,
    reviewed_at
  );

create index app_workforce_operation_reviews_outcome_idx
  on public.app_workforce_operation_reviews (outcome, reviewed_at);

create function public.app_workforce_identity_requires_initial_state()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if (
    select count(*)
    from public.app_workforce_identity_states state_event
    where state_event.workforce_identity_id = new.id
      and state_event.supersedes_state_id is null
      and state_event.state = 'active'
  ) <> 1 then
    raise exception
      'workforce identity requires exactly one atomic initial active state'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create function public.app_workforce_identity_states_insert_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  predecessor public.app_workforce_identity_states%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'workforce_state:v1:' || new.workforce_identity_id::text,
      0
    )
  );

  if new.supersedes_state_id is null then
    if new.state <> 'active'
       or exists (
         select 1
         from public.app_workforce_identity_states existing
         where existing.workforce_identity_id = new.workforce_identity_id
       ) then
      raise exception 'workforce state root must be the sole initial active state'
        using errcode = '23514';
    end if;
  else
    select *
    into predecessor
    from public.app_workforce_identity_states
    where id = new.supersedes_state_id
    for update;

    if not found
       or predecessor.workforce_identity_id <> new.workforce_identity_id
       or exists (
         select 1
         from public.app_workforce_identity_states successor
         where successor.supersedes_state_id = predecessor.id
       )
       or new.effective_at <= predecessor.effective_at
       or new.recorded_at <= predecessor.recorded_at
       or predecessor.state = 'revoked'
       or (
         predecessor.state = 'active'
         and new.state not in ('suspended', 'revoked')
       )
       or (
         predecessor.state = 'suspended'
         and new.state not in ('active', 'revoked')
       ) then
      raise exception 'invalid workforce identity state transition'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create function public.app_workforce_capability_assignments_insert_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  predecessor public.app_workforce_capability_assignments%rowtype;
  identity_state text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'workforce_capability:v1:' ||
      new.workforce_identity_id::text || ':' || new.capability_code,
      0
    )
  );

  if new.supersedes_assignment_event_id is null then
    if new.event_type <> 'granted' then
      raise exception 'capability assignment root must be granted'
        using errcode = '23514';
    end if;

    select state_event.state
    into identity_state
    from public.app_workforce_identity_states state_event
    where state_event.workforce_identity_id = new.workforce_identity_id
      and state_event.effective_at <= new.effective_at
    order by state_event.effective_at desc, state_event.recorded_at desc
    limit 1;

    if identity_state is distinct from 'active' then
      raise exception 'capability grant requires active workforce identity'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.app_workforce_capability_assignments grant_event
      where grant_event.workforce_identity_id = new.workforce_identity_id
        and grant_event.capability_code = new.capability_code
        and grant_event.event_type = 'granted'
        and grant_event.effective_at
          < coalesce(new.valid_until, 'infinity'::timestamptz)
        and new.effective_at < least(
          coalesce(grant_event.valid_until, 'infinity'::timestamptz),
          coalesce(
            (
              select revoke_event.effective_at
              from public.app_workforce_capability_assignments revoke_event
              where revoke_event.assignment_id = grant_event.assignment_id
                and revoke_event.event_type = 'revoked'
              order by revoke_event.effective_at
              limit 1
            ),
            'infinity'::timestamptz
          )
        )
    ) then
      raise exception 'overlapping workforce capability grants are not allowed'
        using errcode = '23514';
    end if;
  else
    select *
    into predecessor
    from public.app_workforce_capability_assignments
    where id = new.supersedes_assignment_event_id
    for update;

    if not found
       or predecessor.event_type <> 'granted'
       or new.event_type <> 'revoked'
       or new.assignment_id <> predecessor.assignment_id
       or new.workforce_identity_id <> predecessor.workforce_identity_id
       or new.capability_code <> predecessor.capability_code
       or new.effective_at <= predecessor.effective_at
       or new.recorded_at <= predecessor.recorded_at
       or (
         predecessor.valid_until is not null
         and new.effective_at > predecessor.valid_until
       )
       or exists (
         select 1
         from public.app_workforce_capability_assignments successor
         where successor.supersedes_assignment_event_id = predecessor.id
       ) then
      raise exception 'invalid workforce capability revocation'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create function public.app_case_location_relations_insert_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  predecessor public.app_case_location_relations%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'case_location:v1:' ||
      new.case_id::text || ':' || new.location_id::text,
      0
    )
  );

  if new.supersedes_relation_event_id is null then
    if new.event_type <> 'linked' then
      raise exception 'case location relation root must be linked'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.app_case_location_relations link_event
      where link_event.case_id = new.case_id
        and link_event.location_id = new.location_id
        and link_event.event_type = 'linked'
        and link_event.effective_at
          < coalesce(new.valid_until, 'infinity'::timestamptz)
        and new.effective_at < least(
          coalesce(link_event.valid_until, 'infinity'::timestamptz),
          coalesce(
            (
              select unlink_event.effective_at
              from public.app_case_location_relations unlink_event
              where unlink_event.relation_id = link_event.relation_id
                and unlink_event.event_type = 'unlinked'
              order by unlink_event.effective_at
              limit 1
            ),
            'infinity'::timestamptz
          )
        )
    ) then
      raise exception 'overlapping case location relations are not allowed'
        using errcode = '23514';
    end if;
  else
    select *
    into predecessor
    from public.app_case_location_relations
    where id = new.supersedes_relation_event_id
    for update;

    if not found
       or predecessor.event_type <> 'linked'
       or new.event_type <> 'unlinked'
       or new.relation_id <> predecessor.relation_id
       or new.case_id <> predecessor.case_id
       or new.location_id <> predecessor.location_id
       or new.effective_at <= predecessor.effective_at
       or new.recorded_at <= predecessor.recorded_at
       or (
         predecessor.valid_until is not null
         and new.effective_at > predecessor.valid_until
       )
       or exists (
         select 1
         from public.app_case_location_relations successor
         where successor.supersedes_relation_event_id = predecessor.id
       ) then
      raise exception 'invalid case location unlink'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create function public.app_workforce_scope_is_authorized_v1(
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
set search_path = pg_catalog, public
as $$
  select
    coalesce(
      (
        select state_event.state = 'active'
        from public.app_workforce_identity_states state_event
        where state_event.workforce_identity_id = p_workforce_identity_id
          and state_event.effective_at <= p_at
        order by state_event.effective_at desc, state_event.recorded_at desc
        limit 1
      ),
      false
    )
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
        and (
          scope_grant.valid_until is null
          or p_at < scope_grant.valid_until
        )
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
          where capability_revoke.assignment_id =
                capability_grant.assignment_id
            and capability_revoke.event_type = 'revoked'
            and capability_revoke.effective_at <= p_at
        )
        and (
          p_capability_code = 'location.root.create'
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
                where relation_unlink.relation_id =
                      relation_link.relation_id
                  and relation_unlink.event_type = 'unlinked'
                  and relation_unlink.effective_at <= p_at
              )
          )
        )
    );
$$;

create function public.app_workforce_scope_assignments_insert_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  predecessor public.app_workforce_scope_assignments%rowtype;
  capability_grant public.app_workforce_capability_assignments%rowtype;
  relation_link public.app_case_location_relations%rowtype;
  identity_state text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'workforce_scope:v1:' ||
      new.workforce_identity_id::text || ':' || new.capability_code || ':' ||
      new.case_id::text || ':' || coalesce(new.location_id::text, 'case'),
      0
    )
  );

  if new.supersedes_scope_event_id is null then
    if new.event_type <> 'granted' then
      raise exception 'workforce scope root must be granted'
        using errcode = '23514';
    end if;

    select state_event.state
    into identity_state
    from public.app_workforce_identity_states state_event
    where state_event.workforce_identity_id = new.workforce_identity_id
      and state_event.effective_at <= new.effective_at
    order by state_event.effective_at desc, state_event.recorded_at desc
    limit 1;

    select *
    into capability_grant
    from public.app_workforce_capability_assignments
    where id = new.capability_assignment_id;

    if identity_state is distinct from 'active'
       or not found
       or capability_grant.supersedes_assignment_event_id is not null
       or capability_grant.event_type <> 'granted'
       or capability_grant.effective_at > new.effective_at
       or (
         capability_grant.valid_until is not null
         and (
           new.effective_at >= capability_grant.valid_until
           or new.valid_until is null
           or new.valid_until > capability_grant.valid_until
         )
       )
       or exists (
         select 1
         from public.app_workforce_capability_assignments capability_revoke
         where capability_revoke.assignment_id =
               capability_grant.assignment_id
           and capability_revoke.event_type = 'revoked'
           and capability_revoke.effective_at <= new.effective_at
       ) then
      raise exception 'scope grant requires active identity and capability'
        using errcode = '23514';
    end if;

    if new.capability_code <> 'location.root.create' then
      select *
      into relation_link
      from public.app_case_location_relations
      where id = new.case_location_relation_id;

      if not found
         or relation_link.supersedes_relation_event_id is not null
         or relation_link.event_type <> 'linked'
         or relation_link.effective_at > new.effective_at
         or (
           relation_link.valid_until is not null
           and (
             new.effective_at >= relation_link.valid_until
             or new.valid_until is null
             or new.valid_until > relation_link.valid_until
           )
         )
         or exists (
           select 1
           from public.app_case_location_relations relation_unlink
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
          coalesce(
            (
              select scope_revoke.effective_at
              from public.app_workforce_scope_assignments scope_revoke
              where scope_revoke.scope_assignment_id =
                    scope_grant.scope_assignment_id
                and scope_revoke.event_type = 'revoked'
              order by scope_revoke.effective_at
              limit 1
            ),
            'infinity'::timestamptz
          )
        )
    ) then
      raise exception 'overlapping workforce scope grants are not allowed'
        using errcode = '23514';
    end if;
  else
    select *
    into predecessor
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
         select 1
         from public.app_workforce_scope_assignments successor
         where successor.supersedes_scope_event_id = predecessor.id
       ) then
      raise exception 'invalid workforce scope revocation'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create function public.app_workforce_operation_requests_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'location_operation_intent:v1:' ||
      new.maker_workforce_identity_id::text || ':' ||
      new.operation_type || ':' || new.idempotency_key,
      0
    )
  );

  if not public.app_workforce_scope_is_authorized_v1(
    new.maker_workforce_identity_id,
    new.maker_scope_assignment_id,
    new.maker_capability_code,
    new.case_id,
    new.location_id,
    new.created_at
  ) then
    raise exception 'maker is not authorized for location operation request'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create function public.app_workforce_operation_reviews_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  operation_request public.app_workforce_operation_requests%rowtype;
  expected_capability text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'location_review:v1:' || new.operation_request_id::text,
      0
    )
  );

  select *
  into operation_request
  from public.app_workforce_operation_requests
  where id = new.operation_request_id
  for update;

  expected_capability := case operation_request.operation_type
    when 'initial_location_acceptance'
      then 'location.version.accept.approve'
    when 'location_correction'
      then 'location.version.correct.approve'
    else null
  end;

  if not found
     or operation_request.execution_status <> 'pending'
     or new.reviewed_at < operation_request.created_at
     or new.reviewed_payload_hash <> operation_request.payload_hash
     or new.checker_workforce_identity_id =
          operation_request.maker_workforce_identity_id
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

create function public.app_workforce_operation_requests_update_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  review public.app_workforce_operation_reviews%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception 'workforce operation requests cannot be deleted'
      using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'location_operation:v1:' || old.id::text,
      0
    )
  );

  if old.execution_status <> 'pending'
     or new.execution_status <> 'executed'
     or new.id <> old.id
     or new.operation_type <> old.operation_type
     or new.case_id <> old.case_id
     or new.location_id <> old.location_id
     or new.observation_id <> old.observation_id
     or new.predecessor_version_id is distinct from old.predecessor_version_id
     or new.maker_workforce_identity_id <>
          old.maker_workforce_identity_id
     or new.maker_scope_assignment_id <> old.maker_scope_assignment_id
     or new.maker_capability_code <> old.maker_capability_code
     or new.payload_hash <> old.payload_hash
     or new.payload_contract_version <> old.payload_contract_version
     or new.request_id <> old.request_id
     or new.idempotency_key <> old.idempotency_key
     or new.created_at <> old.created_at
     or new.executed_at < old.created_at then
    raise exception 'only the exact pending to executed transition is allowed'
      using errcode = '23514';
  end if;

  select *
  into review
  from public.app_workforce_operation_reviews
  where operation_request_id = old.id;

  if not found
     or review.outcome <> 'approved'
     or review.reviewed_payload_hash <> old.payload_hash
     or review.checker_workforce_identity_id =
          old.maker_workforce_identity_id
     or not public.app_workforce_scope_is_authorized_v1(
       old.maker_workforce_identity_id,
       old.maker_scope_assignment_id,
       old.maker_capability_code,
       old.case_id,
       old.location_id,
       new.executed_at
     )
     or not public.app_workforce_scope_is_authorized_v1(
       review.checker_workforce_identity_id,
       review.checker_scope_assignment_id,
       review.checker_capability_code,
       old.case_id,
       old.location_id,
       new.executed_at
     )
     or exists (
       select 1
       from public.app_workforce_identity_states blocker
       where blocker.workforce_identity_id =
             old.maker_workforce_identity_id
         and blocker.effective_at > old.created_at
         and blocker.effective_at <= new.executed_at
         and blocker.state <> 'active'
     )
     or exists (
       select 1
       from public.app_workforce_identity_states blocker
       where blocker.workforce_identity_id =
             review.checker_workforce_identity_id
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

create constraint trigger app_workforce_identity_initial_state_guard
after insert on public.app_workforce_identities
deferrable initially deferred
for each row
execute function public.app_workforce_identity_requires_initial_state();

create trigger app_workforce_identities_immutable
before update or delete on public.app_workforce_identities
for each row
execute function public.app_wp2b_i_immutable_guard();

create trigger app_workforce_identity_states_immutable
before update or delete on public.app_workforce_identity_states
for each row
execute function public.app_wp2b_i_immutable_guard();

create trigger app_workforce_identity_states_insert_guard
before insert on public.app_workforce_identity_states
for each row
execute function public.app_workforce_identity_states_insert_guard();

create trigger app_workforce_capability_assignments_immutable
before update or delete on public.app_workforce_capability_assignments
for each row
execute function public.app_wp2b_i_immutable_guard();

create trigger app_workforce_capability_assignments_insert_guard
before insert on public.app_workforce_capability_assignments
for each row
execute function public.app_workforce_capability_assignments_insert_guard();

create trigger app_case_location_relations_immutable
before update or delete on public.app_case_location_relations
for each row
execute function public.app_wp2b_i_immutable_guard();

create trigger app_case_location_relations_insert_guard
before insert on public.app_case_location_relations
for each row
execute function public.app_case_location_relations_insert_guard();

create trigger app_workforce_scope_assignments_immutable
before update or delete on public.app_workforce_scope_assignments
for each row
execute function public.app_wp2b_i_immutable_guard();

create trigger app_workforce_scope_assignments_insert_guard
before insert on public.app_workforce_scope_assignments
for each row
execute function public.app_workforce_scope_assignments_insert_guard();

create trigger app_workforce_operation_requests_insert_guard
before insert on public.app_workforce_operation_requests
for each row
execute function public.app_workforce_operation_requests_insert_guard();

create trigger app_workforce_operation_requests_update_guard
before update or delete on public.app_workforce_operation_requests
for each row
execute function public.app_workforce_operation_requests_update_guard();

create trigger app_workforce_operation_reviews_immutable
before update or delete on public.app_workforce_operation_reviews
for each row
execute function public.app_wp2b_i_immutable_guard();

create trigger app_workforce_operation_reviews_insert_guard
before insert on public.app_workforce_operation_reviews
for each row
execute function public.app_workforce_operation_reviews_insert_guard();

alter table public.app_workforce_identities enable row level security;
alter table public.app_workforce_identity_states enable row level security;
alter table public.app_workforce_capability_assignments
  enable row level security;
alter table public.app_case_location_relations enable row level security;
alter table public.app_workforce_scope_assignments enable row level security;
alter table public.app_workforce_operation_requests enable row level security;
alter table public.app_workforce_operation_reviews enable row level security;

create policy deny_all on public.app_workforce_identities
for all to anon, authenticated using (false) with check (false);

create policy deny_all on public.app_workforce_identity_states
for all to anon, authenticated using (false) with check (false);

create policy deny_all on public.app_workforce_capability_assignments
for all to anon, authenticated using (false) with check (false);

create policy deny_all on public.app_case_location_relations
for all to anon, authenticated using (false) with check (false);

create policy deny_all on public.app_workforce_scope_assignments
for all to anon, authenticated using (false) with check (false);

create policy deny_all on public.app_workforce_operation_requests
for all to anon, authenticated using (false) with check (false);

create policy deny_all on public.app_workforce_operation_reviews
for all to anon, authenticated using (false) with check (false);

revoke all on table public.app_workforce_identities
  from public, anon, authenticated, service_role;
revoke all on table public.app_workforce_identity_states
  from public, anon, authenticated, service_role;
revoke all on table public.app_workforce_capability_assignments
  from public, anon, authenticated, service_role;
revoke all on table public.app_case_location_relations
  from public, anon, authenticated, service_role;
revoke all on table public.app_workforce_scope_assignments
  from public, anon, authenticated, service_role;
revoke all on table public.app_workforce_operation_requests
  from public, anon, authenticated, service_role;
revoke all on table public.app_workforce_operation_reviews
  from public, anon, authenticated, service_role;

grant select, insert on table public.app_workforce_identities to service_role;
grant select, insert on table public.app_workforce_identity_states
  to service_role;
grant select, insert on table public.app_workforce_capability_assignments
  to service_role;
grant select, insert on table public.app_case_location_relations
  to service_role;
grant select, insert on table public.app_workforce_scope_assignments
  to service_role;
grant select, insert on table public.app_workforce_operation_requests
  to service_role;
grant select, insert on table public.app_workforce_operation_reviews
  to service_role;

revoke all on function public.app_workforce_identity_requires_initial_state()
  from public, anon, authenticated, service_role;
revoke all on function
  public.app_workforce_identity_states_insert_guard()
  from public, anon, authenticated, service_role;
revoke all on function
  public.app_workforce_capability_assignments_insert_guard()
  from public, anon, authenticated, service_role;
revoke all on function public.app_case_location_relations_insert_guard()
  from public, anon, authenticated, service_role;
revoke all on function public.app_workforce_scope_is_authorized_v1(
  uuid,
  uuid,
  text,
  uuid,
  uuid,
  timestamptz
) from public, anon, authenticated, service_role;
revoke all on function
  public.app_workforce_scope_assignments_insert_guard()
  from public, anon, authenticated, service_role;
revoke all on function
  public.app_workforce_operation_requests_insert_guard()
  from public, anon, authenticated, service_role;
revoke all on function
  public.app_workforce_operation_reviews_insert_guard()
  from public, anon, authenticated, service_role;
revoke all on function
  public.app_workforce_operation_requests_update_guard()
  from public, anon, authenticated, service_role;

comment on table public.app_workforce_identities is
  'Opaque workforce principals bound to Auth credentials. Customer identity, case participation, representation and service_role never confer workforce authority. No self-enrollment or migration bootstrap exists.';

comment on table public.app_workforce_identity_states is
  'Immutable active, suspended and terminal revoked lifecycle history. Opaque reason references only; retention remains undecided.';

comment on table public.app_workforce_capability_assignments is
  'Immutable grant/revoke chains for exactly six location capabilities. No wildcard, title, JWT claim or generic RBAC semantics.';

comment on table public.app_case_location_relations is
  'Explicit temporal workflow scope only. It proves no ownership, EAN, aangeslotene, representation, physical match, acceptance or dossier-location truth.';

comment on table public.app_workforce_scope_assignments is
  'Immutable workforce capability scope. Case-only scope exists solely for location.root.create; other capabilities require an explicit case/location relation.';

comment on table public.app_workforce_operation_requests is
  'Immutable maker intent with one guarded eligibility-only pending-to-executed transition. This foundation performs no WP3J call or business execution.';

comment on table public.app_workforce_operation_reviews is
  'One immutable approve/reject decision over the exact maker payload hash by a distinct authorized checker. No emergency override.';

-- ENVAL /app WP2B-I case and case-party-role foundation
-- Date: 2026-07-24
--
-- Boundaries:
-- - Additive local schema/proof foundation only.
-- - Case participation is not representation authority, a mandate, EAN truth,
--   evidence acceptance, verifier approval, eligibility, or settlement truth.
-- - No RPC, Edge Function, Auth, frontend, backfill, cutover, or remote work.

create table public.app_cases (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null
    references public.app_customers (id) on delete restrict,
  case_reference text not null,
  created_at timestamptz not null,
  created_by_actor_type text not null,
  created_by_actor_ref text not null,
  source_class text not null,
  source_ref text not null,
  request_id text not null,

  constraint app_cases_case_reference_chk
    check (
      case_reference = btrim(case_reference)
      and char_length(case_reference) between 8 and 64
    ),

  constraint app_cases_created_by_actor_type_chk
    check (
      created_by_actor_type in (
        'customer',
        'system',
        'support',
        'admin',
        'edge_function',
        'worker',
        'provider',
        'unknown'
      )
    ),

  constraint app_cases_provenance_not_blank_chk
    check (
      btrim(created_by_actor_ref) <> ''
      and btrim(source_class) <> ''
      and btrim(source_ref) <> ''
      and btrim(request_id) <> ''
    )
);

create unique index app_cases_case_reference_uidx
  on public.app_cases (case_reference);

create table public.app_case_party_roles (
  id uuid primary key default gen_random_uuid(),
  role_claim_id uuid not null default gen_random_uuid(),
  case_id uuid not null
    references public.app_cases (id) on delete restrict,
  party_id uuid not null
    references public.app_parties (id) on delete restrict,
  person_profile_version_id uuid null
    references public.app_party_person_versions (id) on delete restrict,
  organization_profile_version_id uuid null
    references public.app_party_organization_versions (id) on delete restrict,
  role_type text not null,
  claim_status text not null,
  valid_from timestamptz not null,
  valid_to timestamptz null,
  recorded_at timestamptz not null,
  recorded_by_actor_type text not null,
  recorded_by_actor_ref text not null,
  source_class text not null,
  source_ref text not null,
  request_id text not null,
  decision_at timestamptz null,
  decided_by_actor_type text null,
  decided_by_actor_ref text null,
  decision_reason text null,
  supersedes_id uuid null
    references public.app_case_party_roles (id) on delete restrict,
  supersession_reason text null,

  constraint app_case_party_roles_role_type_chk
    check (role_type in ('service_recipient', 'case_contact')),

  constraint app_case_party_roles_claim_status_chk
    check (
      claim_status in ('asserted', 'case_confirmed', 'disputed', 'rejected')
    ),

  constraint app_case_party_roles_profile_xor_chk
    check (
      num_nonnulls(
        person_profile_version_id,
        organization_profile_version_id
      ) = 1
    ),

  constraint app_case_party_roles_valid_range_chk
    check (valid_to is null or valid_to > valid_from),

  constraint app_case_party_roles_recorded_actor_type_chk
    check (
      recorded_by_actor_type in (
        'customer',
        'system',
        'support',
        'admin',
        'edge_function',
        'worker',
        'provider',
        'unknown'
      )
    ),

  constraint app_case_party_roles_decided_actor_type_chk
    check (
      decided_by_actor_type is null
      or decided_by_actor_type in (
        'customer',
        'system',
        'support',
        'admin',
        'edge_function',
        'worker',
        'provider',
        'unknown'
      )
    ),

  constraint app_case_party_roles_provenance_not_blank_chk
    check (
      btrim(recorded_by_actor_ref) <> ''
      and btrim(source_class) <> ''
      and btrim(source_ref) <> ''
      and btrim(request_id) <> ''
    ),

  constraint app_case_party_roles_decision_metadata_chk
    check (
      (
        claim_status = 'asserted'
        and decision_at is null
        and decided_by_actor_type is null
        and decided_by_actor_ref is null
        and decision_reason is null
      )
      or
      (
        claim_status in ('case_confirmed', 'disputed', 'rejected')
        and decision_at is not null
        and decided_by_actor_type is not null
        and decided_by_actor_ref is not null
        and btrim(decided_by_actor_ref) <> ''
        and decision_reason is not null
        and btrim(decision_reason) <> ''
      )
    ),

  constraint app_case_party_roles_no_self_supersede_chk
    check (supersedes_id is null or supersedes_id <> id),

  constraint app_case_party_roles_supersession_reason_chk
    check (
      (
        supersedes_id is null
        and supersession_reason is null
      )
      or
      (
        supersedes_id is not null
        and supersession_reason is not null
        and btrim(supersession_reason) <> ''
      )
    )
);

create unique index app_case_party_roles_root_claim_uidx
  on public.app_case_party_roles (role_claim_id)
  where supersedes_id is null;

create unique index app_case_party_roles_direct_successor_uidx
  on public.app_case_party_roles (supersedes_id)
  where supersedes_id is not null;

create index app_case_party_roles_case_id_idx
  on public.app_case_party_roles (case_id);

create index app_case_party_roles_party_id_idx
  on public.app_case_party_roles (party_id);

create index app_case_party_roles_role_claim_id_idx
  on public.app_case_party_roles (role_claim_id);

create index app_case_party_roles_person_profile_version_id_idx
  on public.app_case_party_roles (person_profile_version_id)
  where person_profile_version_id is not null;

create index app_case_party_roles_organization_profile_version_id_idx
  on public.app_case_party_roles (organization_profile_version_id)
  where organization_profile_version_id is not null;

create index app_case_party_roles_operational_overlap_idx
  on public.app_case_party_roles (
    case_id,
    role_type,
    party_id,
    valid_from,
    valid_to
  )
  where claim_status = 'case_confirmed';

create or replace function public.app_wp2b_i_immutable_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception '% rows are immutable and cannot be updated or deleted',
    tg_table_name;
end;
$$;

create or replace function public.app_case_party_roles_insert_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_actor_types constant text[] := array[
    'customer',
    'system',
    'support',
    'admin',
    'edge_function',
    'worker',
    'provider',
    'unknown'
  ];
  v_party_kind text;
  v_profile_party_id uuid;
  v_predecessor public.app_case_party_roles%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.case_id::text, 0)
  );

  if not exists (
    select 1
    from public.app_cases
    where id = new.case_id
  ) then
    raise exception 'app_case_party_roles require an existing case';
  end if;

  if new.recorded_by_actor_type <> all(v_actor_types) then
    raise exception 'invalid recorded_by_actor_type for app_case_party_roles';
  end if;

  if new.decided_by_actor_type is not null
     and new.decided_by_actor_type <> all(v_actor_types) then
    raise exception 'invalid decided_by_actor_type for app_case_party_roles';
  end if;

  if btrim(new.recorded_by_actor_ref) = ''
     or btrim(new.source_class) = ''
     or btrim(new.source_ref) = ''
     or btrim(new.request_id) = '' then
    raise exception 'app_case_party_roles provenance references must be nonblank';
  end if;

  if new.claim_status = 'asserted' then
    if new.decision_at is not null
       or new.decided_by_actor_type is not null
       or new.decided_by_actor_ref is not null
       or new.decision_reason is not null then
      raise exception 'asserted app_case_party_roles require null decision metadata';
    end if;
  elsif new.decision_at is null
     or new.decided_by_actor_type is null
     or new.decided_by_actor_ref is null
     or btrim(new.decided_by_actor_ref) = ''
     or new.decision_reason is null
     or btrim(new.decision_reason) = '' then
    raise exception 'decided app_case_party_roles require complete decision metadata';
  end if;

  select party_kind
  into v_party_kind
  from public.app_parties
  where id = new.party_id;

  if not found then
    raise exception 'app_case_party_roles require an existing party';
  end if;

  if new.person_profile_version_id is not null then
    select party_id
    into v_profile_party_id
    from public.app_party_person_versions
    where id = new.person_profile_version_id;

    if not found or v_profile_party_id <> new.party_id then
      raise exception 'person profile version must belong to the role party';
    end if;

    if v_party_kind <> 'natural_person'
       or new.organization_profile_version_id is not null then
      raise exception 'natural_person roles require only a person profile version';
    end if;
  elsif new.organization_profile_version_id is not null then
    select party_id
    into v_profile_party_id
    from public.app_party_organization_versions
    where id = new.organization_profile_version_id;

    if not found or v_profile_party_id <> new.party_id then
      raise exception 'organization profile version must belong to the role party';
    end if;

    if v_party_kind <> 'organization'
       or new.person_profile_version_id is not null then
      raise exception 'organization roles require only an organization profile version';
    end if;
  else
    raise exception 'app_case_party_roles require exactly one profile version';
  end if;

  if new.role_type = 'case_contact'
     and v_party_kind <> 'natural_person' then
    raise exception 'case_contact requires a natural_person party';
  end if;

  if new.supersedes_id is not null then
    select *
    into v_predecessor
    from public.app_case_party_roles
    where id = new.supersedes_id
    for update;

    if not found then
      raise exception 'app_case_party_roles predecessor does not exist';
    end if;

    if exists (
      select 1
      from public.app_case_party_roles successor
      where successor.supersedes_id = v_predecessor.id
    ) then
      raise exception 'app_case_party_roles predecessor must be terminal';
    end if;

    if new.role_claim_id <> v_predecessor.role_claim_id
       or new.case_id <> v_predecessor.case_id
       or new.party_id <> v_predecessor.party_id
       or new.role_type <> v_predecessor.role_type then
      raise exception 'app_case_party_roles successor must preserve chain, case, party, and role';
    end if;

    if new.recorded_at <= v_predecessor.recorded_at then
      raise exception 'app_case_party_roles successor recorded_at must increase';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.app_case_party_roles_deferred_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
    from public.app_case_party_roles role_version
    where role_version.case_id = new.case_id
    group by role_version.role_claim_id
    having count(*) filter (where role_version.supersedes_id is null) <> 1
  ) then
    raise exception 'app_case_party_roles claim chains require exactly one root';
  end if;

  if exists (
    with recursive supersession_walk as (
      select
        role_version.id as start_id,
        role_version.id as current_id,
        role_version.supersedes_id,
        array[role_version.id]::uuid[] as visited,
        false as cycle_found
      from public.app_case_party_roles role_version
      where role_version.case_id = new.case_id

      union all

      select
        walk.start_id,
        predecessor.id,
        predecessor.supersedes_id,
        walk.visited || predecessor.id,
        predecessor.id = any(walk.visited)
      from supersession_walk walk
      join public.app_case_party_roles predecessor
        on predecessor.id = walk.supersedes_id
      where walk.supersedes_id is not null
        and not walk.cycle_found
    )
    select 1
    from supersession_walk
    where cycle_found
  ) then
    raise exception 'app_case_party_roles supersession cycles are not allowed';
  end if;

  if exists (
    select 1
    from public.app_case_party_roles successor
    join public.app_case_party_roles predecessor
      on predecessor.id = successor.supersedes_id
    where successor.case_id = new.case_id
      and (
        successor.role_claim_id <> predecessor.role_claim_id
        or successor.case_id <> predecessor.case_id
        or successor.party_id <> predecessor.party_id
        or successor.role_type <> predecessor.role_type
        or successor.recorded_at <= predecessor.recorded_at
      )
  ) then
    raise exception 'app_case_party_roles supersession chain is not linear';
  end if;

  if exists (
    with terminal_operational as (
      select role_version.*
      from public.app_case_party_roles role_version
      where role_version.case_id = new.case_id
        and role_version.claim_status = 'case_confirmed'
        and not exists (
          select 1
          from public.app_case_party_roles successor
          where successor.supersedes_id = role_version.id
        )
    )
    select 1
    from terminal_operational left_role
    join terminal_operational right_role
      on left_role.id < right_role.id
     and left_role.case_id = right_role.case_id
     and left_role.role_type = 'service_recipient'
     and right_role.role_type = 'service_recipient'
     and (
       left_role.valid_to is null
       or right_role.valid_from < left_role.valid_to
     )
     and (
       right_role.valid_to is null
       or left_role.valid_from < right_role.valid_to
     )
  ) then
    raise exception 'overlapping operational service_recipients are not allowed per case';
  end if;

  if exists (
    with terminal_operational as (
      select role_version.*
      from public.app_case_party_roles role_version
      where role_version.case_id = new.case_id
        and role_version.claim_status = 'case_confirmed'
        and not exists (
          select 1
          from public.app_case_party_roles successor
          where successor.supersedes_id = role_version.id
        )
    )
    select 1
    from terminal_operational left_role
    join terminal_operational right_role
      on left_role.id < right_role.id
     and left_role.case_id = right_role.case_id
     and left_role.party_id = right_role.party_id
     and left_role.role_type = right_role.role_type
     and (
       left_role.valid_to is null
       or right_role.valid_from < left_role.valid_to
     )
     and (
       right_role.valid_to is null
       or left_role.valid_from < right_role.valid_to
     )
  ) then
    raise exception 'overlapping operational case roles are not allowed for the same party and role';
  end if;

  return null;
end;
$$;

create trigger trg_app_cases_immutable_guard
before update or delete on public.app_cases
for each row
execute function public.app_wp2b_i_immutable_guard();

create trigger trg_app_case_party_roles_immutable_guard
before update or delete on public.app_case_party_roles
for each row
execute function public.app_wp2b_i_immutable_guard();

create trigger trg_app_case_party_roles_insert_guard
before insert on public.app_case_party_roles
for each row
execute function public.app_case_party_roles_insert_guard();

create constraint trigger trg_app_case_party_roles_deferred_guard
after insert on public.app_case_party_roles
deferrable initially deferred
for each row
execute function public.app_case_party_roles_deferred_guard();

alter table public.app_cases enable row level security;
alter table public.app_case_party_roles enable row level security;

create policy deny_all on public.app_cases
for all to anon, authenticated
using (false)
with check (false);

create policy deny_all on public.app_case_party_roles
for all to anon, authenticated
using (false)
with check (false);

revoke all on table public.app_cases
from public, anon, authenticated, service_role;

revoke all on table public.app_case_party_roles
from public, anon, authenticated, service_role;

grant select, insert on table public.app_cases to service_role;
grant select, insert on table public.app_case_party_roles to service_role;

revoke all on function public.app_wp2b_i_immutable_guard()
from public, anon, authenticated, service_role;

revoke all on function public.app_case_party_roles_insert_guard()
from public, anon, authenticated, service_role;

revoke all on function public.app_case_party_roles_deferred_guard()
from public, anon, authenticated, service_role;

comment on table public.app_cases is
'Immutable customer-owned case roots. A case does not prove party identity, representation authority, mandate, EAN, evidence acceptance, eligibility, or settlement truth.';

comment on table public.app_case_party_roles is
'Immutable case-participation claim versions. Only terminal case_confirmed rows are operational roles; case roles are never representation authority or mandates.';

comment on column public.app_case_party_roles.person_profile_version_id is
'Historical natural-person profile anchor; later profile versions do not rewrite this role version.';

comment on column public.app_case_party_roles.organization_profile_version_id is
'Historical organization profile anchor; later profile versions do not rewrite this role version.';

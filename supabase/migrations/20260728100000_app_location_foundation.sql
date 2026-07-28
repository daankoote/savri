-- TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE
--
-- Additive internal location truth foundation:
-- - immutable location roots;
-- - immutable source observations;
-- - immutable accepted versions with transaction-end lineage and leaf-period checks.
--
-- This migration intentionally does not read, reinterpret, or backfill
-- public.app_dossier_locations.

create table public.app_locations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default clock_timestamp(),
  created_by_actor_ref text not null,
  created_from_request_id text not null,
  creation_basis text not null,

  constraint app_locations_created_by_actor_ref_chk
    check (
      created_by_actor_ref = btrim(created_by_actor_ref)
      and created_by_actor_ref <> ''
    ),
  constraint app_locations_created_from_request_id_chk
    check (
      created_from_request_id = btrim(created_from_request_id)
      and created_from_request_id <> ''
    ),
  constraint app_locations_creation_basis_chk
    check (
      creation_basis in (
        'customer_declaration',
        'source_observation',
        'manual_migration_review'
      )
    )
);

comment on table public.app_locations is
  'TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE. Immutable root identity only; no location identity or address is automatically accepted.';

comment on column public.app_locations.creation_basis is
  'Controlled internal provenance basis; not a verification or acceptance status.';

create table public.app_location_address_observations (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  observation_kind text not null,
  descriptor_kind text not null,
  observed_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by_actor_ref text not null,
  recorded_from_request_id text not null,
  source_ref_sha256 text,
  source_payload_sha256 text,
  source_retrieved_at timestamptz,
  fresh_until timestamptz,
  country_code text not null,
  postal_code text,
  house_number integer,
  house_number_addition text,
  street text,
  city text,
  site_reference text,

  constraint app_location_address_observations_location_id_fkey
    foreign key (location_id)
    references public.app_locations (id)
    on delete restrict,
  constraint app_location_address_observations_location_id_id_key
    unique (location_id, id),
  constraint app_location_address_observations_kind_chk
    check (
      observation_kind in (
        'customer_declared',
        'document_parsed',
        'pdok_observed',
        'bag_observed',
        'provider_observed',
        'manual_observed',
        'migration_snapshot'
      )
    ),
  constraint app_location_address_observations_descriptor_kind_chk
    check (descriptor_kind in ('postal_address', 'site_reference')),
  constraint app_location_address_observations_provenance_chk
    check (
      recorded_by_actor_ref = btrim(recorded_by_actor_ref)
      and recorded_by_actor_ref <> ''
      and recorded_from_request_id = btrim(recorded_from_request_id)
      and recorded_from_request_id <> ''
    ),
  constraint app_location_address_observations_hashes_chk
    check (
      (source_ref_sha256 is null or source_ref_sha256 ~ '^[0-9a-f]{64}$')
      and (
        source_payload_sha256 is null
        or source_payload_sha256 ~ '^[0-9a-f]{64}$'
      )
      and (
        observation_kind not in (
          'document_parsed',
          'pdok_observed',
          'bag_observed',
          'provider_observed'
        )
        or source_payload_sha256 is not null
      )
    ),
  constraint app_location_address_observations_freshness_chk
    check (
      (source_retrieved_at is null or source_retrieved_at <= recorded_at)
      and (
        fresh_until is null
        or (
          source_retrieved_at is not null
          and fresh_until > source_retrieved_at
        )
      )
      and (
        observation_kind not in (
          'pdok_observed',
          'bag_observed',
          'provider_observed'
        )
        or source_retrieved_at is not null
      )
      and (
        observation_kind not in (
          'customer_declared',
          'manual_observed',
          'migration_snapshot'
        )
        or fresh_until is null
      )
    ),
  constraint app_location_address_observations_descriptor_values_chk
    check (
      country_code ~ '^[A-Z]{2}$'
      and (
        postal_code is null
        or (
          postal_code = btrim(postal_code)
          and postal_code = upper(postal_code)
          and postal_code <> ''
        )
      )
      and (
        house_number_addition is null
        or (
          house_number_addition = btrim(house_number_addition)
          and house_number_addition <> ''
        )
      )
      and (
        street is null
        or (
          street = btrim(street)
          and street <> ''
        )
      )
      and (
        city is null
        or (
          city = btrim(city)
          and city <> ''
        )
      )
      and (
        site_reference is null
        or (
          site_reference = btrim(site_reference)
          and site_reference <> ''
        )
      )
      and (house_number is null or house_number > 0)
    ),
  constraint app_location_address_observations_descriptor_shape_chk
    check (
      (
        descriptor_kind = 'postal_address'
        and postal_code is not null
        and house_number is not null
        and street is not null
        and city is not null
        and site_reference is null
      )
      or (
        descriptor_kind = 'site_reference'
        and site_reference is not null
        and postal_code is null
        and house_number is null
        and house_number_addition is null
        and street is null
        and city is null
      )
    )
);

comment on table public.app_location_address_observations is
  'TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE. Immutable source observations; never accepted current location truth by themselves.';

comment on column public.app_location_address_observations.source_ref_sha256 is
  'Optional lowercase SHA-256 reference identity; never raw source content.';

comment on column public.app_location_address_observations.source_payload_sha256 is
  'Optional or source-kind-required lowercase SHA-256 payload identity; never raw source content.';

create index app_location_address_observations_location_recorded_idx
  on public.app_location_address_observations (location_id, recorded_at);

create table public.app_location_versions (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  accepted_from_observation_id uuid not null,
  valid_from timestamptz not null,
  valid_to timestamptz,
  recorded_at timestamptz not null default clock_timestamp(),
  accepted_at timestamptz not null,
  accepted_by_actor_ref text not null,
  accepted_from_request_id text not null,
  acceptance_decision_ref text not null,
  descriptor_kind text not null,
  country_code text not null,
  postal_code text,
  house_number integer,
  house_number_addition text,
  street text,
  city text,
  site_reference text,
  supersedes_version_id uuid,
  correction_reason text,

  constraint app_location_versions_location_id_fkey
    foreign key (location_id)
    references public.app_locations (id)
    on delete restrict,
  constraint app_location_versions_location_id_id_key
    unique (location_id, id),
  constraint app_location_versions_accepted_observation_id_key
    unique (accepted_from_observation_id),
  constraint app_location_versions_acceptance_decision_ref_key
    unique (acceptance_decision_ref),
  constraint app_location_versions_accepted_observation_same_root_fkey
    foreign key (location_id, accepted_from_observation_id)
    references public.app_location_address_observations (location_id, id)
    on delete restrict,
  constraint app_location_versions_supersedes_same_root_fkey
    foreign key (location_id, supersedes_version_id)
    references public.app_location_versions (location_id, id)
    on delete restrict,
  constraint app_location_versions_descriptor_kind_chk
    check (descriptor_kind in ('postal_address', 'site_reference')),
  constraint app_location_versions_acceptance_provenance_chk
    check (
      accepted_by_actor_ref = btrim(accepted_by_actor_ref)
      and accepted_by_actor_ref <> ''
      and accepted_from_request_id = btrim(accepted_from_request_id)
      and accepted_from_request_id <> ''
      and acceptance_decision_ref = btrim(acceptance_decision_ref)
      and acceptance_decision_ref <> ''
    ),
  constraint app_location_versions_acceptance_time_chk
    check (accepted_at <= recorded_at),
  constraint app_location_versions_valid_range_chk
    check (valid_to is null or valid_to > valid_from),
  constraint app_location_versions_not_self_superseding_chk
    check (supersedes_version_id is null or supersedes_version_id <> id),
  constraint app_location_versions_correction_reason_chk
    check (
      (
        supersedes_version_id is null
        and correction_reason is null
      )
      or (
        supersedes_version_id is not null
        and correction_reason is not null
        and correction_reason = btrim(correction_reason)
        and correction_reason <> ''
      )
    ),
  constraint app_location_versions_descriptor_values_chk
    check (
      country_code ~ '^[A-Z]{2}$'
      and (
        postal_code is null
        or (
          postal_code = btrim(postal_code)
          and postal_code = upper(postal_code)
          and postal_code <> ''
        )
      )
      and (
        house_number_addition is null
        or (
          house_number_addition = btrim(house_number_addition)
          and house_number_addition <> ''
        )
      )
      and (
        street is null
        or (
          street = btrim(street)
          and street <> ''
        )
      )
      and (
        city is null
        or (
          city = btrim(city)
          and city <> ''
        )
      )
      and (
        site_reference is null
        or (
          site_reference = btrim(site_reference)
          and site_reference <> ''
        )
      )
      and (house_number is null or house_number > 0)
    ),
  constraint app_location_versions_descriptor_shape_chk
    check (
      (
        descriptor_kind = 'postal_address'
        and postal_code is not null
        and house_number is not null
        and street is not null
        and city is not null
        and site_reference is null
      )
      or (
        descriptor_kind = 'site_reference'
        and site_reference is not null
        and postal_code is null
        and house_number is null
        and house_number_addition is null
        and street is null
        and city is null
      )
    )
);

comment on table public.app_location_versions is
  'TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE. Immutable accepted internal versions require authorized human acceptance provenance; they are not provider, fiscal, settlement, verifier, NEa, or regulatory acceptance.';

comment on column public.app_location_versions.acceptance_decision_ref is
  'Unique internal decision reference; not a provider or regulatory decision.';

comment on column public.app_location_versions.supersedes_version_id is
  'Optional same-root predecessor. A successor is an immutable correction, not an in-place mutation.';

comment on column public.app_location_versions.descriptor_kind is
  'Internal accepted descriptor only. This foundation proves no EAN, connection, connected party, meter, MID, kWh, eligibility, settlement, or physical-site match.';

create unique index app_location_versions_direct_successor_uidx
  on public.app_location_versions (supersedes_version_id)
  where supersedes_version_id is not null;

create index app_location_versions_location_period_idx
  on public.app_location_versions (location_id, valid_from, valid_to);

create function public.app_location_versions_deferred_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (
    with recursive lineage as (
      select
        v.id as start_id,
        v.id,
        v.supersedes_version_id,
        array[v.id] as visited,
        false as cycle_found
      from public.app_location_versions v
      where v.location_id = new.location_id

      union all

      select
        lineage.start_id,
        predecessor.id,
        predecessor.supersedes_version_id,
        lineage.visited || predecessor.id,
        predecessor.id = any(lineage.visited)
      from lineage
      join public.app_location_versions predecessor
        on predecessor.location_id = new.location_id
       and predecessor.id = lineage.supersedes_version_id
      where lineage.supersedes_version_id is not null
        and not lineage.cycle_found
    )
    select 1
    from lineage
    where cycle_found
  ) then
    raise exception
      'app_location_versions lineage cycle for location root'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.app_location_versions successor
    join public.app_location_versions predecessor
      on predecessor.location_id = successor.location_id
     and predecessor.id = successor.supersedes_version_id
    where successor.location_id = new.location_id
      and successor.recorded_at <= predecessor.recorded_at
  ) then
    raise exception
      'app_location_versions successor must be recorded later than predecessor'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.app_location_versions left_leaf
    join public.app_location_versions right_leaf
      on right_leaf.location_id = left_leaf.location_id
     and right_leaf.id > left_leaf.id
    where left_leaf.location_id = new.location_id
      and not exists (
        select 1
        from public.app_location_versions left_successor
        where left_successor.supersedes_version_id = left_leaf.id
      )
      and not exists (
        select 1
        from public.app_location_versions right_successor
        where right_successor.supersedes_version_id = right_leaf.id
      )
      and left_leaf.valid_from
            < coalesce(right_leaf.valid_to, 'infinity'::timestamptz)
      and right_leaf.valid_from
            < coalesce(left_leaf.valid_to, 'infinity'::timestamptz)
  ) then
    raise exception
      'app_location_versions leaf validity periods overlap for location root'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

comment on function public.app_location_versions_deferred_guard() is
  'Transaction-end guard for same-root lineage cycles, successor recorded order, and overlap among final leaf versions. No operational write RPC or concurrency route is implemented.';

create trigger app_locations_immutable
before update or delete on public.app_locations
for each row
execute function public.app_wp2b_i_immutable_guard();

create trigger app_location_address_observations_immutable
before update or delete on public.app_location_address_observations
for each row
execute function public.app_wp2b_i_immutable_guard();

create trigger app_location_versions_immutable
before update or delete on public.app_location_versions
for each row
execute function public.app_wp2b_i_immutable_guard();

create constraint trigger app_location_versions_deferred_guard_trigger
after insert on public.app_location_versions
deferrable initially deferred
for each row
execute function public.app_location_versions_deferred_guard();

alter table public.app_locations enable row level security;
alter table public.app_location_address_observations enable row level security;
alter table public.app_location_versions enable row level security;

create policy deny_all
on public.app_locations
for all
to anon, authenticated
using (false)
with check (false);

create policy deny_all
on public.app_location_address_observations
for all
to anon, authenticated
using (false)
with check (false);

create policy deny_all
on public.app_location_versions
for all
to anon, authenticated
using (false)
with check (false);

revoke all on table public.app_locations
  from public, anon, authenticated, service_role;
revoke all on table public.app_location_address_observations
  from public, anon, authenticated, service_role;
revoke all on table public.app_location_versions
  from public, anon, authenticated, service_role;

grant select, insert on table public.app_locations to service_role;
grant select, insert on table public.app_location_address_observations
  to service_role;
grant select, insert on table public.app_location_versions to service_role;

revoke all on function public.app_location_versions_deferred_guard()
  from public, anon, authenticated, service_role;

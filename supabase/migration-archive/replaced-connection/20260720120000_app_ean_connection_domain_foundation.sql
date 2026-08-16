-- ENVAL /app EAN and electricity connection domain foundation
-- Date: 2026-07-20
--
-- Purpose:
-- - Add the local Gate 1 foundation for EAN/electricity connections, connection
--   validity periods, and aangeslotene/ownership claims.
-- - Model declared/observed/verified facts without treating CAR, invoices, or
--   secondary allocation points as automatically accepted truth.
--
-- Boundaries:
-- - Local schema/proof foundation only.
-- - No remote mutation.
-- - No Edge Function, Storage, Auth, cron, UI, or legacy schema changes.
-- - No CAR integration and no raw external response storage.

create table public.app_connections (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.app_customers (id) on delete restrict,
  dossier_id uuid not null references public.app_customer_dossiers (id) on delete restrict,
  location_id uuid not null references public.app_dossier_locations (id) on delete restrict,
  ean_normalized text not null,
  connection_type text not null,
  declared_network_operator text null,
  status text not null default 'declared',
  source_type text not null,
  source_reference_type text not null,
  source_reference_id text not null,
  observed_at timestamptz not null default now(),
  request_id text not null,
  actor_type text not null,
  actor_ref text not null,
  decision_actor_type text null,
  decision_actor_ref text null,
  decision_request_id text null,
  decision_reason text null,
  decided_at timestamptz null,
  supersedes_connection_id uuid null references public.app_connections (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint app_connections_ean_normalized_chk
    check (ean_normalized ~ '^[0-9]{18}$'),

  constraint app_connections_connection_type_chk
    check (connection_type in ('primary', 'secondary_allocation_point', 'direct_line')),

  constraint app_connections_status_chk
    check (status in ('declared', 'under_review', 'verified', 'rejected', 'superseded')),

  constraint app_connections_source_type_chk
    check (source_type in ('customer_declared', 'invoice_observed', 'car_observed', 'network_operator_observed', 'manual_review')),

  constraint app_connections_not_blank_chk
    check (
      btrim(source_reference_type) <> ''
      and btrim(source_reference_id) <> ''
      and btrim(request_id) <> ''
      and btrim(actor_type) <> ''
      and btrim(actor_ref) <> ''
    ),

  constraint app_connections_decision_metadata_chk
    check (
      status not in ('verified', 'rejected', 'superseded')
      or (
        decided_at is not null
        and decision_actor_type is not null
        and btrim(decision_actor_type) <> ''
        and decision_actor_ref is not null
        and btrim(decision_actor_ref) <> ''
        and decision_request_id is not null
        and btrim(decision_request_id) <> ''
      )
    ),

  constraint app_connections_rejected_reason_chk
    check (status <> 'rejected' or (decision_reason is not null and btrim(decision_reason) <> '')),

  constraint app_connections_superseded_link_chk
    check (status <> 'superseded' or supersedes_connection_id is not null),

  constraint app_connections_no_self_supersede_chk
    check (supersedes_connection_id is null or supersedes_connection_id <> id)
);

create unique index app_connections_ean_active_uidx
  on public.app_connections (ean_normalized)
  where status not in ('rejected', 'superseded');

create index app_connections_customer_id_idx
  on public.app_connections (customer_id);

create index app_connections_dossier_id_idx
  on public.app_connections (dossier_id);

create index app_connections_location_id_idx
  on public.app_connections (location_id);

create index app_connections_type_status_idx
  on public.app_connections (connection_type, status);

create table public.app_connection_periods (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.app_connections (id) on delete restrict,
  location_id uuid not null references public.app_dossier_locations (id) on delete restrict,
  valid_from date not null,
  valid_to date null,
  network_operator text null,
  configuration_type text not null default 'unknown',
  status text not null default 'declared',
  source_type text not null,
  source_reference_type text not null,
  source_reference_id text not null,
  observed_at timestamptz not null default now(),
  request_id text not null,
  actor_type text not null,
  actor_ref text not null,
  decision_actor_type text null,
  decision_actor_ref text null,
  decision_request_id text null,
  decision_reason text null,
  decided_at timestamptz null,
  supersedes_period_id uuid null references public.app_connection_periods (id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint app_connection_periods_valid_range_chk
    check (valid_to is null or valid_to > valid_from),

  constraint app_connection_periods_configuration_type_chk
    check (configuration_type in ('unknown', 'exclusive_transport_connection', 'shared_connection', 'secondary_allocation_point', 'direct_line')),

  constraint app_connection_periods_status_chk
    check (status in ('declared', 'under_review', 'verified', 'rejected', 'superseded')),

  constraint app_connection_periods_source_type_chk
    check (source_type in ('customer_declared', 'invoice_observed', 'car_observed', 'network_operator_observed', 'manual_review')),

  constraint app_connection_periods_not_blank_chk
    check (
      btrim(source_reference_type) <> ''
      and btrim(source_reference_id) <> ''
      and btrim(request_id) <> ''
      and btrim(actor_type) <> ''
      and btrim(actor_ref) <> ''
    ),

  constraint app_connection_periods_decision_metadata_chk
    check (
      status not in ('verified', 'rejected', 'superseded')
      or (
        decided_at is not null
        and decision_actor_type is not null
        and btrim(decision_actor_type) <> ''
        and decision_actor_ref is not null
        and btrim(decision_actor_ref) <> ''
        and decision_request_id is not null
        and btrim(decision_request_id) <> ''
      )
    ),

  constraint app_connection_periods_rejected_reason_chk
    check (status <> 'rejected' or (decision_reason is not null and btrim(decision_reason) <> '')),

  constraint app_connection_periods_superseded_link_chk
    check (status <> 'superseded' or supersedes_period_id is not null),

  constraint app_connection_periods_no_self_supersede_chk
    check (supersedes_period_id is null or supersedes_period_id <> id)
);

create index app_connection_periods_connection_period_idx
  on public.app_connection_periods (connection_id, valid_from, valid_to);

create index app_connection_periods_location_id_idx
  on public.app_connection_periods (location_id);

create index app_connection_periods_status_idx
  on public.app_connection_periods (status);

create table public.app_connection_ownership_periods (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.app_connections (id) on delete restrict,
  customer_id uuid not null references public.app_customers (id) on delete restrict,
  dossier_id uuid not null references public.app_customer_dossiers (id) on delete restrict,
  valid_from date not null,
  valid_to date null,
  claim_source_type text not null,
  source_reference_type text not null,
  source_reference_id text not null,
  claim_status text not null default 'declared',
  observed_at timestamptz not null default now(),
  verified_at timestamptz null,
  request_id text not null,
  actor_type text not null,
  actor_ref text not null,
  decision_actor_type text null,
  decision_actor_ref text null,
  decision_request_id text null,
  decision_reason text null,
  decided_at timestamptz null,
  supersedes_ownership_period_id uuid null references public.app_connection_ownership_periods (id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint app_connection_ownership_periods_valid_range_chk
    check (valid_to is null or valid_to > valid_from),

  constraint app_connection_ownership_periods_claim_source_type_chk
    check (claim_source_type in ('customer_declared', 'invoice_observed', 'car_observed', 'network_operator_observed', 'manual_review')),

  constraint app_connection_ownership_periods_claim_status_chk
    check (claim_status in ('declared', 'under_review', 'verified', 'rejected', 'superseded')),

  constraint app_connection_ownership_periods_not_blank_chk
    check (
      btrim(source_reference_type) <> ''
      and btrim(source_reference_id) <> ''
      and btrim(request_id) <> ''
      and btrim(actor_type) <> ''
      and btrim(actor_ref) <> ''
    ),

  constraint app_connection_ownership_periods_decision_metadata_chk
    check (
      claim_status not in ('verified', 'rejected', 'superseded')
      or (
        decided_at is not null
        and decision_actor_type is not null
        and btrim(decision_actor_type) <> ''
        and decision_actor_ref is not null
        and btrim(decision_actor_ref) <> ''
        and decision_request_id is not null
        and btrim(decision_request_id) <> ''
      )
    ),

  constraint app_connection_ownership_periods_verified_metadata_chk
    check (claim_status <> 'verified' or verified_at is not null),

  constraint app_connection_ownership_periods_rejected_reason_chk
    check (claim_status <> 'rejected' or (decision_reason is not null and btrim(decision_reason) <> '')),

  constraint app_connection_ownership_periods_superseded_link_chk
    check (claim_status <> 'superseded' or supersedes_ownership_period_id is not null),

  constraint app_connection_ownership_periods_no_self_supersede_chk
    check (supersedes_ownership_period_id is null or supersedes_ownership_period_id <> id)
);

create index app_connection_ownership_periods_connection_period_idx
  on public.app_connection_ownership_periods (connection_id, valid_from, valid_to);

create index app_connection_ownership_periods_customer_id_idx
  on public.app_connection_ownership_periods (customer_id);

create index app_connection_ownership_periods_dossier_id_idx
  on public.app_connection_ownership_periods (dossier_id);

create index app_connection_ownership_periods_status_idx
  on public.app_connection_ownership_periods (claim_status);

create or replace function public.app_connection_periods_overlap_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.status in ('rejected', 'superseded') then
    return new;
  end if;

  if exists (
    select 1
    from public.app_connection_periods existing
    where existing.connection_id = new.connection_id
      and existing.id <> new.id
      and existing.status not in ('rejected', 'superseded')
      and (existing.valid_to is null or new.valid_from < existing.valid_to)
      and (new.valid_to is null or existing.valid_from < new.valid_to)
  ) then
    raise exception 'overlapping app_connection_periods are not allowed for the same connection';
  end if;

  return new;
end;
$$;

create or replace function public.app_connection_ownership_periods_overlap_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.claim_status in ('rejected', 'superseded') then
    return new;
  end if;

  if exists (
    select 1
    from public.app_connection_ownership_periods existing
    where existing.connection_id = new.connection_id
      and existing.id <> new.id
      and existing.claim_status not in ('rejected', 'superseded')
      and (existing.valid_to is null or new.valid_from < existing.valid_to)
      and (new.valid_to is null or existing.valid_from < new.valid_to)
  ) then
    raise exception 'overlapping app_connection_ownership_periods are not allowed for the same connection';
  end if;

  return new;
end;
$$;

create or replace function public.app_connections_boundary_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  dossier_customer_id uuid;
  location_dossier_id uuid;
begin
  select customer_id into dossier_customer_id
  from public.app_customer_dossiers
  where id = new.dossier_id;

  if dossier_customer_id is null or dossier_customer_id <> new.customer_id then
    raise exception 'app_connections customer/dossier boundary mismatch';
  end if;

  select dossier_id into location_dossier_id
  from public.app_dossier_locations
  where id = new.location_id;

  if location_dossier_id is null or location_dossier_id <> new.dossier_id then
    raise exception 'app_connections dossier/location boundary mismatch';
  end if;

  return new;
end;
$$;

create or replace function public.app_connection_periods_boundary_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  connection_dossier_id uuid;
  location_dossier_id uuid;
begin
  select dossier_id into connection_dossier_id
  from public.app_connections
  where id = new.connection_id;

  select dossier_id into location_dossier_id
  from public.app_dossier_locations
  where id = new.location_id;

  if connection_dossier_id is null or location_dossier_id is null or connection_dossier_id <> location_dossier_id then
    raise exception 'app_connection_periods connection/location boundary mismatch';
  end if;

  return new;
end;
$$;

create or replace function public.app_connection_ownership_periods_boundary_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  connection_customer_id uuid;
  connection_dossier_id uuid;
  dossier_customer_id uuid;
begin
  select customer_id, dossier_id into connection_customer_id, connection_dossier_id
  from public.app_connections
  where id = new.connection_id;

  select customer_id into dossier_customer_id
  from public.app_customer_dossiers
  where id = new.dossier_id;

  if connection_customer_id is null
     or connection_dossier_id is null
     or dossier_customer_id is null
     or connection_customer_id <> new.customer_id
     or connection_dossier_id <> new.dossier_id
     or dossier_customer_id <> new.customer_id then
    raise exception 'app_connection_ownership_periods customer/dossier/connection boundary mismatch';
  end if;

  return new;
end;
$$;

create or replace function public.app_connections_transition_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.id is distinct from old.id
     or new.customer_id is distinct from old.customer_id
     or new.dossier_id is distinct from old.dossier_id
     or new.location_id is distinct from old.location_id
     or new.ean_normalized is distinct from old.ean_normalized
     or new.connection_type is distinct from old.connection_type
     or new.created_at is distinct from old.created_at then
    raise exception 'immutable app_connections core fields cannot be changed';
  end if;

  if old.status in ('verified', 'rejected', 'superseded') then
    raise exception 'terminal app_connections rows cannot be updated';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'declared' and new.status in ('under_review', 'verified', 'rejected', 'superseded') then
      return new;
    end if;
    if old.status = 'under_review' and new.status in ('verified', 'rejected', 'superseded') then
      return new;
    end if;
    raise exception 'invalid app_connections status transition from % to %', old.status, new.status;
  end if;

  return new;
end;
$$;

create or replace function public.app_connection_periods_transition_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.id is distinct from old.id
     or new.connection_id is distinct from old.connection_id
     or new.valid_from is distinct from old.valid_from
     or new.created_at is distinct from old.created_at then
    raise exception 'immutable app_connection_periods core fields cannot be changed';
  end if;

  if old.status in ('verified', 'rejected', 'superseded') then
    raise exception 'terminal app_connection_periods rows cannot be updated';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'declared' and new.status in ('under_review', 'verified', 'rejected', 'superseded') then
      return new;
    end if;
    if old.status = 'under_review' and new.status in ('verified', 'rejected', 'superseded') then
      return new;
    end if;
    raise exception 'invalid app_connection_periods status transition from % to %', old.status, new.status;
  end if;

  return new;
end;
$$;

create or replace function public.app_connection_ownership_periods_transition_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.id is distinct from old.id
     or new.connection_id is distinct from old.connection_id
     or new.customer_id is distinct from old.customer_id
     or new.dossier_id is distinct from old.dossier_id
     or new.valid_from is distinct from old.valid_from
     or new.created_at is distinct from old.created_at then
    raise exception 'immutable app_connection_ownership_periods core fields cannot be changed';
  end if;

  if old.claim_status in ('verified', 'rejected', 'superseded') then
    raise exception 'terminal app_connection_ownership_periods rows cannot be updated';
  end if;

  if new.claim_status is distinct from old.claim_status then
    if old.claim_status = 'declared' and new.claim_status in ('under_review', 'verified', 'rejected', 'superseded') then
      return new;
    end if;
    if old.claim_status = 'under_review' and new.claim_status in ('verified', 'rejected', 'superseded') then
      return new;
    end if;
    raise exception 'invalid app_connection_ownership_periods status transition from % to %', old.claim_status, new.claim_status;
  end if;

  return new;
end;
$$;

create trigger trg_app_connections_boundary_guard
before insert or update on public.app_connections
for each row
execute function public.app_connections_boundary_guard();

create trigger trg_app_connections_transition_guard
before update on public.app_connections
for each row
execute function public.app_connections_transition_guard();

create trigger trg_app_connections_updated_at
before update on public.app_connections
for each row
execute function public.app_set_updated_at();

create trigger trg_app_connection_periods_boundary_guard
before insert or update on public.app_connection_periods
for each row
execute function public.app_connection_periods_boundary_guard();

create trigger trg_app_connection_periods_overlap_guard
before insert or update on public.app_connection_periods
for each row
execute function public.app_connection_periods_overlap_guard();

create trigger trg_app_connection_periods_transition_guard
before update on public.app_connection_periods
for each row
execute function public.app_connection_periods_transition_guard();

create trigger trg_app_connection_ownership_periods_boundary_guard
before insert or update on public.app_connection_ownership_periods
for each row
execute function public.app_connection_ownership_periods_boundary_guard();

create trigger trg_app_connection_ownership_periods_overlap_guard
before insert or update on public.app_connection_ownership_periods
for each row
execute function public.app_connection_ownership_periods_overlap_guard();

create trigger trg_app_connection_ownership_periods_transition_guard
before update on public.app_connection_ownership_periods
for each row
execute function public.app_connection_ownership_periods_transition_guard();

alter table public.app_connections enable row level security;
alter table public.app_connection_periods enable row level security;
alter table public.app_connection_ownership_periods enable row level security;

create policy deny_all on public.app_connections
for all to anon, authenticated
using (false)
with check (false);

create policy deny_all on public.app_connection_periods
for all to anon, authenticated
using (false)
with check (false);

create policy deny_all on public.app_connection_ownership_periods
for all to anon, authenticated
using (false)
with check (false);

revoke all on table public.app_connections from public;
revoke all on table public.app_connections from anon;
revoke all on table public.app_connections from authenticated;
revoke all on table public.app_connections from service_role;

revoke all on table public.app_connection_periods from public;
revoke all on table public.app_connection_periods from anon;
revoke all on table public.app_connection_periods from authenticated;
revoke all on table public.app_connection_periods from service_role;

revoke all on table public.app_connection_ownership_periods from public;
revoke all on table public.app_connection_ownership_periods from anon;
revoke all on table public.app_connection_ownership_periods from authenticated;
revoke all on table public.app_connection_ownership_periods from service_role;

grant select, insert, update on table public.app_connections to service_role;
grant select, insert, update on table public.app_connection_periods to service_role;
grant select, insert, update on table public.app_connection_ownership_periods to service_role;

revoke all on function public.app_connection_periods_overlap_guard() from public, anon, authenticated;
revoke all on function public.app_connection_ownership_periods_overlap_guard() from public, anon, authenticated;
revoke all on function public.app_connections_boundary_guard() from public, anon, authenticated;
revoke all on function public.app_connection_periods_boundary_guard() from public, anon, authenticated;
revoke all on function public.app_connection_ownership_periods_boundary_guard() from public, anon, authenticated;
revoke all on function public.app_connections_transition_guard() from public, anon, authenticated;
revoke all on function public.app_connection_periods_transition_guard() from public, anon, authenticated;
revoke all on function public.app_connection_ownership_periods_transition_guard() from public, anon, authenticated;

grant execute on function public.app_connection_periods_overlap_guard() to service_role;
grant execute on function public.app_connection_ownership_periods_overlap_guard() to service_role;
grant execute on function public.app_connections_boundary_guard() to service_role;
grant execute on function public.app_connection_periods_boundary_guard() to service_role;
grant execute on function public.app_connection_ownership_periods_boundary_guard() to service_role;
grant execute on function public.app_connections_transition_guard() to service_role;
grant execute on function public.app_connection_periods_transition_guard() to service_role;
grant execute on function public.app_connection_ownership_periods_transition_guard() to service_role;

comment on table public.app_connections is
'Gate 1 EAN/electricity connection record for ENVAL /app. Stores normalized 18-digit EAN and declared connection type without asserting eligibility, CAR availability, or ownership truth.';

comment on column public.app_connections.ean_normalized is
'Normalized EAN core identifier. Local proven syntax is exactly 18 numeric digits; no checksum, registry, CAR, or ownership assertion is made by this column.';

comment on column public.app_connections.connection_type is
'Declared construct: primary, secondary allocation point, or direct line. Secondary allocation point is not automatically eligible or approved.';

comment on table public.app_connection_periods is
'Time-bound connection facts for address/location, network operator, and configuration. History is added or superseded; derived observations do not overwrite core truth.';

comment on column public.app_connection_periods.configuration_type is
'Declared or reviewed connection configuration for the period. It enables later eligibility review but does not decide eligibility.';

comment on table public.app_connection_ownership_periods is
'Aangeslotene/ownership claim per connection and period. Rows are claims with declared, observed, reviewed, verified, rejected, or superseded status; CAR or invoice observations do not automatically mutate customer or connection truth.';

comment on column public.app_connection_ownership_periods.claim_status is
'Claim lifecycle. New claims default to declared and are not automatically verified.';

comment on column public.app_connection_ownership_periods.claim_source_type is
'Source class for the claim. Raw CAR responses or unrestricted provider payloads are intentionally not stored in this table.';

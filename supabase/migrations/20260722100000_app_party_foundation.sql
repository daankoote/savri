-- ENVAL /app WP2A party foundation
-- Date: 2026-07-22
--
-- Purpose:
-- - Add provider-independent party roots and immutable person/organization
--   profile history alongside the existing customer-account model.
-- - Add time-bound customer-to-party service/account relationships.
--
-- Boundaries:
-- - Local additive schema/proof foundation only.
-- - No Auth binding, case role, address role, representation authority,
--   mandate, EAN/connection link, RPC, Edge Function, frontend, or backfill.

create table public.app_parties (
  id uuid primary key default gen_random_uuid(),
  party_kind text not null,
  source_type text not null,
  source_reference_type text not null,
  source_reference_id text not null,
  request_id text not null,
  actor_type text not null,
  actor_ref text not null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint app_parties_party_kind_chk
    check (party_kind in ('natural_person', 'organization')),

  constraint app_parties_actor_type_chk
    check (actor_type in ('customer', 'system', 'support', 'admin', 'edge_function', 'worker', 'provider', 'unknown')),

  constraint app_parties_provenance_not_blank_chk
    check (
      btrim(source_type) <> ''
      and btrim(source_reference_type) <> ''
      and btrim(source_reference_id) <> ''
      and btrim(request_id) <> ''
      and btrim(actor_ref) <> ''
    )
);

create index app_parties_party_kind_idx
  on public.app_parties (party_kind);

create table public.app_party_person_versions (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.app_parties (id) on delete restrict,
  full_name text not null,
  valid_from date not null,
  valid_to date null,
  source_type text not null,
  source_reference_type text not null,
  source_reference_id text not null,
  request_id text not null,
  actor_type text not null,
  actor_ref text not null,
  recorded_at timestamptz not null default now(),
  supersedes_person_version_id uuid null,

  constraint app_party_person_versions_full_name_not_blank_chk
    check (btrim(full_name) <> ''),

  constraint app_party_person_versions_valid_range_chk
    check (valid_to is null or valid_to > valid_from),

  constraint app_party_person_versions_actor_type_chk
    check (actor_type in ('customer', 'system', 'support', 'admin', 'edge_function', 'worker', 'provider', 'unknown')),

  constraint app_party_person_versions_provenance_not_blank_chk
    check (
      btrim(source_type) <> ''
      and btrim(source_reference_type) <> ''
      and btrim(source_reference_id) <> ''
      and btrim(request_id) <> ''
      and btrim(actor_ref) <> ''
    ),

  constraint app_party_person_versions_no_self_supersede_chk
    check (supersedes_person_version_id is null or supersedes_person_version_id <> id),

  constraint app_party_person_versions_party_id_id_key
    unique (party_id, id),

  constraint app_party_person_versions_supersession_fk
    foreign key (party_id, supersedes_person_version_id)
    references public.app_party_person_versions (party_id, id)
    on delete restrict
);

create index app_party_person_versions_party_period_idx
  on public.app_party_person_versions (party_id, valid_from, valid_to);

create unique index app_party_person_versions_supersedes_uidx
  on public.app_party_person_versions (supersedes_person_version_id)
  where supersedes_person_version_id is not null;

create table public.app_party_organization_versions (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.app_parties (id) on delete restrict,
  legal_name text not null,
  organization_classification text not null,
  legal_form text null,
  trade_register_number text null,
  valid_from date not null,
  valid_to date null,
  source_type text not null,
  source_reference_type text not null,
  source_reference_id text not null,
  request_id text not null,
  actor_type text not null,
  actor_ref text not null,
  recorded_at timestamptz not null default now(),
  supersedes_organization_version_id uuid null,

  constraint app_party_organization_versions_legal_name_not_blank_chk
    check (btrim(legal_name) <> ''),

  constraint app_party_organization_versions_classification_chk
    check (organization_classification in ('business', 'vve', 'other_organization')),

  constraint app_party_organization_versions_optional_facts_not_blank_chk
    check (
      (legal_form is null or btrim(legal_form) <> '')
      and (trade_register_number is null or btrim(trade_register_number) <> '')
    ),

  constraint app_party_organization_versions_valid_range_chk
    check (valid_to is null or valid_to > valid_from),

  constraint app_party_organization_versions_actor_type_chk
    check (actor_type in ('customer', 'system', 'support', 'admin', 'edge_function', 'worker', 'provider', 'unknown')),

  constraint app_party_organization_versions_provenance_not_blank_chk
    check (
      btrim(source_type) <> ''
      and btrim(source_reference_type) <> ''
      and btrim(source_reference_id) <> ''
      and btrim(request_id) <> ''
      and btrim(actor_ref) <> ''
    ),

  constraint app_party_organization_versions_no_self_supersede_chk
    check (supersedes_organization_version_id is null or supersedes_organization_version_id <> id),

  constraint app_party_organization_versions_party_id_id_key
    unique (party_id, id),

  constraint app_party_organization_versions_supersession_fk
    foreign key (party_id, supersedes_organization_version_id)
    references public.app_party_organization_versions (party_id, id)
    on delete restrict
);

create index app_party_organization_versions_party_period_idx
  on public.app_party_organization_versions (party_id, valid_from, valid_to);

create index app_party_organization_versions_classification_idx
  on public.app_party_organization_versions (organization_classification);

create index app_party_organization_versions_trade_register_number_idx
  on public.app_party_organization_versions (trade_register_number)
  where trade_register_number is not null;

create unique index app_party_organization_versions_supersedes_uidx
  on public.app_party_organization_versions (supersedes_organization_version_id)
  where supersedes_organization_version_id is not null;

create table public.app_customer_party_relationships (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.app_customers (id) on delete restrict,
  party_id uuid not null references public.app_parties (id) on delete restrict,
  relationship_role text not null,
  valid_from date not null,
  valid_to date null,
  source_type text not null,
  source_reference_type text not null,
  source_reference_id text not null,
  request_id text not null,
  actor_type text not null,
  actor_ref text not null,
  recorded_at timestamptz not null default now(),
  supersedes_relationship_id uuid null,

  constraint app_customer_party_relationships_role_chk
    check (relationship_role in ('account_owner', 'contact', 'service_recipient')),

  constraint app_customer_party_relationships_valid_range_chk
    check (valid_to is null or valid_to > valid_from),

  constraint app_customer_party_relationships_actor_type_chk
    check (actor_type in ('customer', 'system', 'support', 'admin', 'edge_function', 'worker', 'provider', 'unknown')),

  constraint app_customer_party_relationships_provenance_not_blank_chk
    check (
      btrim(source_type) <> ''
      and btrim(source_reference_type) <> ''
      and btrim(source_reference_id) <> ''
      and btrim(request_id) <> ''
      and btrim(actor_ref) <> ''
    ),

  constraint app_customer_party_relationships_no_self_supersede_chk
    check (supersedes_relationship_id is null or supersedes_relationship_id <> id),

  constraint app_customer_party_relationships_scope_id_key
    unique (customer_id, party_id, relationship_role, id),

  constraint app_customer_party_relationships_supersession_fk
    foreign key (customer_id, party_id, relationship_role, supersedes_relationship_id)
    references public.app_customer_party_relationships (customer_id, party_id, relationship_role, id)
    on delete restrict
);

create index app_customer_party_relationships_customer_id_idx
  on public.app_customer_party_relationships (customer_id);

create index app_customer_party_relationships_party_id_idx
  on public.app_customer_party_relationships (party_id);

create index app_customer_party_relationships_scope_period_idx
  on public.app_customer_party_relationships (
    customer_id,
    party_id,
    relationship_role,
    valid_from,
    valid_to
  );

create unique index app_customer_party_relationships_supersedes_uidx
  on public.app_customer_party_relationships (supersedes_relationship_id)
  where supersedes_relationship_id is not null;

create or replace function public.app_parties_immutable_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'app_parties roots are immutable and cannot be updated or deleted';
end;
$$;

create or replace function public.app_party_history_immutable_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'app party history rows are immutable and cannot be updated or deleted';
end;
$$;

create or replace function public.app_party_person_versions_boundary_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_party_kind text;
begin
  select party_kind into v_party_kind
  from public.app_parties
  where id = new.party_id;

  if v_party_kind is distinct from 'natural_person' then
    raise exception 'app_party_person_versions require a natural_person party';
  end if;

  return new;
end;
$$;

create or replace function public.app_party_organization_versions_boundary_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_party_kind text;
begin
  select party_kind into v_party_kind
  from public.app_parties
  where id = new.party_id;

  if v_party_kind is distinct from 'organization' then
    raise exception 'app_party_organization_versions require an organization party';
  end if;

  return new;
end;
$$;

create or replace function public.app_party_person_versions_overlap_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  perform 1
  from public.app_parties
  where id = new.party_id
  for update;

  if exists (
    select 1
    from public.app_party_person_versions existing
    where existing.party_id = new.party_id
      and existing.id <> new.id
      and existing.id is distinct from new.supersedes_person_version_id
      and not exists (
        select 1
        from public.app_party_person_versions successor
        where successor.supersedes_person_version_id = existing.id
      )
      and (existing.valid_to is null or new.valid_from < existing.valid_to)
      and (new.valid_to is null or existing.valid_from < new.valid_to)
  ) then
    raise exception 'overlapping active app_party_person_versions are not allowed for the same party';
  end if;

  return new;
end;
$$;

create or replace function public.app_party_organization_versions_overlap_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  perform 1
  from public.app_parties
  where id = new.party_id
  for update;

  if exists (
    select 1
    from public.app_party_organization_versions existing
    where existing.party_id = new.party_id
      and existing.id <> new.id
      and existing.id is distinct from new.supersedes_organization_version_id
      and not exists (
        select 1
        from public.app_party_organization_versions successor
        where successor.supersedes_organization_version_id = existing.id
      )
      and (existing.valid_to is null or new.valid_from < existing.valid_to)
      and (new.valid_to is null or existing.valid_from < new.valid_to)
  ) then
    raise exception 'overlapping active app_party_organization_versions are not allowed for the same party';
  end if;

  return new;
end;
$$;

create or replace function public.app_customer_party_relationships_overlap_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  perform 1
  from public.app_parties
  where id = new.party_id
  for update;

  if exists (
    select 1
    from public.app_customer_party_relationships existing
    where existing.customer_id = new.customer_id
      and existing.party_id = new.party_id
      and existing.relationship_role = new.relationship_role
      and existing.id <> new.id
      and existing.id is distinct from new.supersedes_relationship_id
      and not exists (
        select 1
        from public.app_customer_party_relationships successor
        where successor.supersedes_relationship_id = existing.id
      )
      and (existing.valid_to is null or new.valid_from < existing.valid_to)
      and (new.valid_to is null or existing.valid_from < new.valid_to)
  ) then
    raise exception 'overlapping active app_customer_party_relationships are not allowed for the same customer, party, and role';
  end if;

  return new;
end;
$$;

create trigger trg_app_parties_immutable_guard
before update or delete on public.app_parties
for each row
execute function public.app_parties_immutable_guard();

create trigger trg_app_party_person_versions_boundary_guard
before insert on public.app_party_person_versions
for each row
execute function public.app_party_person_versions_boundary_guard();

create trigger trg_app_party_person_versions_overlap_guard
before insert on public.app_party_person_versions
for each row
execute function public.app_party_person_versions_overlap_guard();

create trigger trg_app_party_person_versions_immutable_guard
before update or delete on public.app_party_person_versions
for each row
execute function public.app_party_history_immutable_guard();

create trigger trg_app_party_organization_versions_boundary_guard
before insert on public.app_party_organization_versions
for each row
execute function public.app_party_organization_versions_boundary_guard();

create trigger trg_app_party_organization_versions_overlap_guard
before insert on public.app_party_organization_versions
for each row
execute function public.app_party_organization_versions_overlap_guard();

create trigger trg_app_party_organization_versions_immutable_guard
before update or delete on public.app_party_organization_versions
for each row
execute function public.app_party_history_immutable_guard();

create trigger trg_app_customer_party_relationships_overlap_guard
before insert on public.app_customer_party_relationships
for each row
execute function public.app_customer_party_relationships_overlap_guard();

create trigger trg_app_customer_party_relationships_immutable_guard
before update or delete on public.app_customer_party_relationships
for each row
execute function public.app_party_history_immutable_guard();

alter table public.app_parties enable row level security;
alter table public.app_party_person_versions enable row level security;
alter table public.app_party_organization_versions enable row level security;
alter table public.app_customer_party_relationships enable row level security;

create policy deny_all on public.app_parties
for all to anon, authenticated
using (false)
with check (false);

create policy deny_all on public.app_party_person_versions
for all to anon, authenticated
using (false)
with check (false);

create policy deny_all on public.app_party_organization_versions
for all to anon, authenticated
using (false)
with check (false);

create policy deny_all on public.app_customer_party_relationships
for all to anon, authenticated
using (false)
with check (false);

revoke all on table public.app_parties from public, anon, authenticated, service_role;
revoke all on table public.app_party_person_versions from public, anon, authenticated, service_role;
revoke all on table public.app_party_organization_versions from public, anon, authenticated, service_role;
revoke all on table public.app_customer_party_relationships from public, anon, authenticated, service_role;

grant select, insert on table public.app_parties to service_role;
grant select, insert on table public.app_party_person_versions to service_role;
grant select, insert on table public.app_party_organization_versions to service_role;
grant select, insert on table public.app_customer_party_relationships to service_role;

revoke all on function public.app_parties_immutable_guard() from public, anon, authenticated, service_role;
revoke all on function public.app_party_history_immutable_guard() from public, anon, authenticated, service_role;
revoke all on function public.app_party_person_versions_boundary_guard() from public, anon, authenticated, service_role;
revoke all on function public.app_party_organization_versions_boundary_guard() from public, anon, authenticated, service_role;
revoke all on function public.app_party_person_versions_overlap_guard() from public, anon, authenticated, service_role;
revoke all on function public.app_party_organization_versions_overlap_guard() from public, anon, authenticated, service_role;
revoke all on function public.app_customer_party_relationships_overlap_guard() from public, anon, authenticated, service_role;

comment on table public.app_parties is
'Stable provider-independent party roots. A party is not an Auth user, customer account, case, representation, authority, or mandate; roots are immutable and have no normal hard-delete path.';

comment on table public.app_party_person_versions is
'Immutable natural-person profile history. Business validity is separate from recorded_at; an active version is a row not superseded by a later version.';

comment on table public.app_party_organization_versions is
'Immutable organization profile history. VvE is organization_classification vve, not a third party_kind. Trade-register facts are source-bound and intentionally not globally unique.';

comment on column public.app_party_organization_versions.trade_register_number is
'Versioned handelsregisternummer fact. Optional when the source does not establish one; no global uniqueness or external-register verification is asserted.';

comment on table public.app_customer_party_relationships is
'Time-bound customer-account to party service/account roles. This relationship does not prove legal identity, grant representation authority, or constitute a mandate.';

comment on column public.app_customer_party_relationships.relationship_role is
'Bounded account/service role: account_owner, contact, or service_recipient. It is not a case role, legal authority, or mandate scope.';

-- ENVAL /app locations and chargers schema
-- Date: 2026-07-08
--
-- Purpose:
-- - Add location and charger records for api-app-signup-submit write v2.
-- - Keep these tables alongside the app foundation schema.
-- - Preserve stable client IDs for idempotent mapping from the signup payload.
--
-- Boundaries:
-- - No legacy table changes.
-- - No Edge Function changes.
-- - No frontend changes.
-- - No customer read policies yet; reads will be exposed through app endpoints/projections later.

create table public.app_dossier_locations (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.app_customer_dossiers (id) on delete cascade,
  client_location_id text not null,
  label text null,
  status text not null default 'submitted',
  postcode_normalized text not null,
  house_number text not null,
  suffix_normalized text null,
  street text null,
  city text null,
  country text not null default 'Nederland',
  lookup_provider text null,
  lookup_provider_id text null,
  lookup_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint app_dossier_locations_dossier_client_location_key
    unique (dossier_id, client_location_id),

  constraint app_dossier_locations_status_chk
    check (
      status in (
        'submitted',
        'needs_review',
        'accepted_for_processing',
        'needs_customer_action',
        'rejected_or_paused'
      )
    )
);

create index if not exists app_dossier_locations_dossier_id_idx
  on public.app_dossier_locations (dossier_id);

create index if not exists app_dossier_locations_status_idx
  on public.app_dossier_locations (status);

create table public.app_dossier_chargers (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.app_customer_dossiers (id) on delete cascade,
  location_id uuid not null references public.app_dossier_locations (id) on delete cascade,
  client_charger_id text not null,
  status text not null default 'submitted',
  brand_id text null,
  brand_label text null,
  manual_brand text null,
  model_id text null,
  model_label text null,
  manual_model text null,
  serial_number text null,
  mid_number text not null,
  mid_status text not null default 'submitted',
  backend_supplier_id text null,
  backend_supplier_label text null,
  manual_backend_supplier text null,
  installation_year integer null,
  solar_export_status text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint app_dossier_chargers_dossier_client_charger_key
    unique (dossier_id, client_charger_id),

  constraint app_dossier_chargers_status_chk
    check (
      status in (
        'submitted',
        'needs_review',
        'accepted_for_processing',
        'needs_customer_action',
        'rejected_or_paused'
      )
    ),

  constraint app_dossier_chargers_mid_status_chk
    check (
      mid_status in (
        'submitted',
        'needs_review',
        'accepted_for_processing',
        'duplicate_risk',
        'rejected_or_paused'
      )
    ),

  constraint app_dossier_chargers_installation_year_chk
    check (installation_year is null or (installation_year >= 1990 and installation_year <= 2050))
);

create index if not exists app_dossier_chargers_dossier_id_idx
  on public.app_dossier_chargers (dossier_id);

create index if not exists app_dossier_chargers_location_id_idx
  on public.app_dossier_chargers (location_id);

create index if not exists app_dossier_chargers_mid_number_idx
  on public.app_dossier_chargers (mid_number)
  where mid_number is not null;

create index if not exists app_dossier_chargers_status_idx
  on public.app_dossier_chargers (status);

drop trigger if exists trg_app_dossier_locations_updated_at on public.app_dossier_locations;

create trigger trg_app_dossier_locations_updated_at
before update on public.app_dossier_locations
for each row
execute function public.app_set_updated_at();

drop trigger if exists trg_app_dossier_chargers_updated_at on public.app_dossier_chargers;

create trigger trg_app_dossier_chargers_updated_at
before update on public.app_dossier_chargers
for each row
execute function public.app_set_updated_at();

alter table public.app_dossier_locations enable row level security;
alter table public.app_dossier_chargers enable row level security;

drop policy if exists deny_all on public.app_dossier_locations;
drop policy if exists deny_all on public.app_dossier_chargers;

create policy deny_all
on public.app_dossier_locations
for all
to anon, authenticated
using (false)
with check (false);

create policy deny_all
on public.app_dossier_chargers
for all
to anon, authenticated
using (false)
with check (false);

revoke all on table public.app_dossier_locations from public;
revoke all on table public.app_dossier_locations from anon;
revoke all on table public.app_dossier_locations from authenticated;
revoke all on table public.app_dossier_locations from service_role;

revoke all on table public.app_dossier_chargers from public;
revoke all on table public.app_dossier_chargers from anon;
revoke all on table public.app_dossier_chargers from authenticated;
revoke all on table public.app_dossier_chargers from service_role;

grant select, insert, update, delete on table public.app_dossier_locations to service_role;
grant select, insert, update, delete on table public.app_dossier_chargers to service_role;

comment on table public.app_dossier_locations is
'Address/location records under an ENVAL /app customer dossier. Service-role writes only; customer reads will use app endpoints/projections later.';

comment on column public.app_dossier_locations.client_location_id is
'Stable client-generated location ID from the signup payload for idempotent mapping.';

comment on column public.app_dossier_locations.postcode_normalized is
'Normalized postcode from the frontend/backend validation flow. Street and city may remain null until review if lookup was unavailable.';

comment on column public.app_dossier_locations.lookup_metadata is
'Provider metadata for address lookup, such as normalized lookup key or non-sensitive provider details.';

comment on table public.app_dossier_chargers is
'Charger records linked to ENVAL /app dossier locations. Service-role writes only; customer reads will use app endpoints/projections later.';

comment on column public.app_dossier_chargers.client_charger_id is
'Stable client-generated charger ID from the signup payload for idempotent mapping.';

comment on column public.app_dossier_chargers.mid_number is
'Customer-provided MID number. Not globally unique at schema level yet; duplicate risk checks are handled by later backend review logic.';

comment on column public.app_dossier_chargers.backend_supplier_id is
'Optional backend supplier catalog ID. Backend supplier is intentionally optional in signup.';

comment on column public.app_dossier_chargers.manual_backend_supplier is
'Optional manual backend supplier label when the customer selects an uncatalogued supplier.';

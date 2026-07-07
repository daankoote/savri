-- ENVAL /app foundation schema
-- Date: 2026-07-07
--
-- Purpose:
-- - Create the first foundation tables for the new /app backend.
-- - Keep the schema alongside the legacy dossier schema.
-- - Provide customer, identity, dossier, audit, intake-audit, and idempotency primitives.
--
-- Boundaries:
-- - No legacy table changes.
-- - No Edge Function changes.
-- - No frontend changes.
-- - No customer read policies yet; reads will be designed through app endpoints/projections first.

create table public.app_customers (
  id uuid primary key default gen_random_uuid(),
  customer_number text null,
  customer_type text not null,
  display_name text null,
  preferred_language text not null default 'nl',
  primary_email_normalized text null,
  primary_phone_normalized text null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  minimized_at timestamptz null,

  constraint app_customers_customer_number_key
    unique (customer_number),

  constraint app_customers_customer_type_chk
    check (customer_type in ('particulier', 'zakelijk', 'vve')),

  constraint app_customers_preferred_language_chk
    check (preferred_language in ('nl', 'en')),

  constraint app_customers_status_chk
    check (status in ('active', 'inactive', 'minimized'))
);

create index if not exists app_customers_primary_email_normalized_idx
  on public.app_customers (primary_email_normalized)
  where primary_email_normalized is not null;

create index if not exists app_customers_status_idx
  on public.app_customers (status);

create table public.app_customer_identities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.app_customers (id) on delete cascade,
  auth_user_id uuid null references auth.users (id) on delete set null,
  email_normalized text not null,
  email_verified_at timestamptz null,
  phone_normalized text null,
  phone_verified_at timestamptz null,
  identity_provider text not null default 'supabase',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  last_login_at timestamptz null,

  constraint app_customer_identities_status_chk
    check (status in ('active', 'inactive', 'revoked')),

  constraint app_customer_identities_identity_provider_chk
    check (identity_provider in ('supabase', 'enval_magic_link'))
);

create unique index if not exists app_customer_identities_active_auth_user_id_uidx
  on public.app_customer_identities (auth_user_id)
  where auth_user_id is not null and status = 'active';

create index if not exists app_customer_identities_customer_id_idx
  on public.app_customer_identities (customer_id);

create index if not exists app_customer_identities_email_normalized_idx
  on public.app_customer_identities (email_normalized);

create table public.app_customer_dossiers (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.app_customers (id) on delete restrict,
  dossier_number text null,
  account_type text not null,
  status text not null default 'submitted',
  retention_class text not null default 'standard',
  submitted_at timestamptz null,
  locked_at timestamptz null,
  paused_at timestamptz null,
  rejected_at timestamptz null,
  minimized_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint app_customer_dossiers_dossier_number_key
    unique (dossier_number),

  constraint app_customer_dossiers_account_type_chk
    check (account_type in ('particulier', 'zakelijk', 'vve')),

  constraint app_customer_dossiers_status_chk
    check (
      status in (
        'draft',
        'submitted',
        'needs_customer_action',
        'under_review',
        'eligible_ready_for_inboeking',
        'inboeking_in_progress',
        'year_kwh_required',
        'result_pending',
        'successful_value_realized',
        'fee_due',
        'paid_out_or_settled',
        'rejected_or_paused',
        'expired_minimized'
      )
    ),

  constraint app_customer_dossiers_retention_class_chk
    check (retention_class in ('standard', 'draft', 'submitted', 'successful', 'rejected', 'legal_hold', 'minimized'))
);

create index if not exists app_customer_dossiers_customer_id_idx
  on public.app_customer_dossiers (customer_id);

create index if not exists app_customer_dossiers_status_idx
  on public.app_customer_dossiers (status);

create index if not exists app_customer_dossiers_account_type_idx
  on public.app_customer_dossiers (account_type);

create table public.app_intake_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  request_id text null,
  idempotency_key text null,
  actor_type text not null default 'anonymous',
  actor_ref text null,
  ip_hash text null,
  user_agent_hash text null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint app_intake_audit_events_actor_type_chk
    check (actor_type in ('anonymous', 'customer', 'system', 'edge_function', 'unknown'))
);

create index if not exists app_intake_audit_events_created_at_idx
  on public.app_intake_audit_events (created_at desc);

create index if not exists app_intake_audit_events_event_type_idx
  on public.app_intake_audit_events (event_type);

create index if not exists app_intake_audit_events_request_id_idx
  on public.app_intake_audit_events (request_id)
  where request_id is not null;

create table public.app_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  scope_type text not null,
  scope_id uuid null,
  customer_id uuid null references public.app_customers (id) on delete set null,
  dossier_id uuid null references public.app_customer_dossiers (id) on delete set null,
  request_id text null,
  idempotency_key text null,
  actor_type text not null,
  actor_ref text null,
  ip_hash text null,
  user_agent_hash text null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint app_audit_events_actor_type_chk
    check (actor_type in ('customer', 'system', 'support', 'admin', 'edge_function', 'worker', 'provider', 'unknown')),

  constraint app_audit_events_scope_type_chk
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
        'retention'
      )
    )
);

create index if not exists app_audit_events_customer_id_idx
  on public.app_audit_events (customer_id);

create index if not exists app_audit_events_dossier_id_idx
  on public.app_audit_events (dossier_id);

create index if not exists app_audit_events_created_at_idx
  on public.app_audit_events (created_at desc);

create index if not exists app_audit_events_event_type_idx
  on public.app_audit_events (event_type);

create index if not exists app_audit_events_request_id_idx
  on public.app_audit_events (request_id)
  where request_id is not null;

create table public.app_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  key text not null,
  payload_hash text not null,
  response_status integer null,
  response_body jsonb null,
  locked_at timestamptz null,
  completed_at timestamptz null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),

  constraint app_idempotency_keys_scope_key_key
    unique (scope, key),

  constraint app_idempotency_keys_response_status_chk
    check (response_status is null or (response_status >= 100 and response_status <= 599))
);

create index if not exists app_idempotency_keys_expires_at_idx
  on public.app_idempotency_keys (expires_at);

create index if not exists app_idempotency_keys_created_at_idx
  on public.app_idempotency_keys (created_at desc);

create or replace function public.app_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_customers_updated_at on public.app_customers;

create trigger trg_app_customers_updated_at
before update on public.app_customers
for each row
execute function public.app_set_updated_at();

drop trigger if exists trg_app_customer_dossiers_updated_at on public.app_customer_dossiers;

create trigger trg_app_customer_dossiers_updated_at
before update on public.app_customer_dossiers
for each row
execute function public.app_set_updated_at();

alter table public.app_customers enable row level security;
alter table public.app_customer_identities enable row level security;
alter table public.app_customer_dossiers enable row level security;
alter table public.app_intake_audit_events enable row level security;
alter table public.app_audit_events enable row level security;
alter table public.app_idempotency_keys enable row level security;

drop policy if exists deny_all on public.app_customers;
drop policy if exists deny_all on public.app_customer_identities;
drop policy if exists deny_all on public.app_customer_dossiers;
drop policy if exists deny_all on public.app_intake_audit_events;
drop policy if exists deny_all on public.app_audit_events;
drop policy if exists deny_all on public.app_idempotency_keys;

create policy deny_all
on public.app_customers
for all
to anon, authenticated
using (false)
with check (false);

create policy deny_all
on public.app_customer_identities
for all
to anon, authenticated
using (false)
with check (false);

create policy deny_all
on public.app_customer_dossiers
for all
to anon, authenticated
using (false)
with check (false);

create policy deny_all
on public.app_intake_audit_events
for all
to anon, authenticated
using (false)
with check (false);

create policy deny_all
on public.app_audit_events
for all
to anon, authenticated
using (false)
with check (false);

create policy deny_all
on public.app_idempotency_keys
for all
to anon, authenticated
using (false)
with check (false);

revoke all on table public.app_customers from public;
revoke all on table public.app_customers from anon;
revoke all on table public.app_customers from authenticated;
revoke all on table public.app_customers from service_role;

revoke all on table public.app_customer_identities from public;
revoke all on table public.app_customer_identities from anon;
revoke all on table public.app_customer_identities from authenticated;
revoke all on table public.app_customer_identities from service_role;

revoke all on table public.app_customer_dossiers from public;
revoke all on table public.app_customer_dossiers from anon;
revoke all on table public.app_customer_dossiers from authenticated;
revoke all on table public.app_customer_dossiers from service_role;

revoke all on table public.app_intake_audit_events from public;
revoke all on table public.app_intake_audit_events from anon;
revoke all on table public.app_intake_audit_events from authenticated;
revoke all on table public.app_intake_audit_events from service_role;

revoke all on table public.app_audit_events from public;
revoke all on table public.app_audit_events from anon;
revoke all on table public.app_audit_events from authenticated;
revoke all on table public.app_audit_events from service_role;

revoke all on table public.app_idempotency_keys from public;
revoke all on table public.app_idempotency_keys from anon;
revoke all on table public.app_idempotency_keys from authenticated;
revoke all on table public.app_idempotency_keys from service_role;

grant select, insert, update, delete on table public.app_customers to service_role;
grant select, insert, update, delete on table public.app_customer_identities to service_role;
grant select, insert, update, delete on table public.app_customer_dossiers to service_role;
grant select, insert, update, delete on table public.app_intake_audit_events to service_role;
grant select, insert, update, delete on table public.app_audit_events to service_role;
grant select, insert, update, delete on table public.app_idempotency_keys to service_role;

revoke all on function public.app_set_updated_at() from public;
revoke all on function public.app_set_updated_at() from anon;
revoke all on function public.app_set_updated_at() from authenticated;

comment on table public.app_customers is
'Canonical ENVAL /app customer record. Service-role writes only; customer reads will be exposed through app endpoints/projections later.';

comment on column public.app_customers.customer_number is
'Optional future customer number. Generation is intentionally deferred.';

comment on column public.app_customers.primary_email_normalized is
'Normalized email used for matching/search. Not globally unique until duplicate/customer matching policy is finalized.';

comment on table public.app_customer_identities is
'Maps ENVAL customers to Supabase Auth users or future ENVAL-owned magic-link identities. Internal table; no direct customer access.';

comment on column public.app_customer_identities.auth_user_id is
'Nullable until Supabase Auth bootstrap is implemented. References auth.users when present.';

comment on column public.app_customer_identities.email_normalized is
'Normalized identity email. Indexed but not unique to avoid premature duplicate matching assumptions.';

comment on table public.app_customer_dossiers is
'Customer-owned /app dossier lifecycle for the commercial ENVAL inboekservice. Replaces legacy wizard dossier assumptions for new app flows.';

comment on column public.app_customer_dossiers.status is
'Customer-safe lifecycle status. Internal review states may be more granular in future tables.';

comment on table public.app_intake_audit_events is
'Pre-customer/pre-dossier audit events for public signup attempts, rejects, rate limits, and malformed submits. Event data must be minimized.';

comment on column public.app_intake_audit_events.event_data is
'Minimized structured metadata only. Do not store raw documents, secrets, full payloads, or unnecessary PII.';

comment on table public.app_audit_events is
'Internal raw audit truth for /app customer, dossier, evidence, consent, result, fee, and retention actions. Not customer-visible directly.';

comment on column public.app_audit_events.event_data is
'Structured internal audit metadata. Keep PII minimized and do not expose directly to customers.';

comment on table public.app_idempotency_keys is
'Scoped idempotency table for /app business writes. Stores payload hashes and replayable responses, not raw secrets or PII-heavy payloads.';

comment on column public.app_idempotency_keys.scope is
'Endpoint plus business actor scope. Idempotency keys must not be global across unrelated operations.';

comment on column public.app_idempotency_keys.key is
'Client/server idempotency key unique only within scope.';

comment on column public.app_idempotency_keys.payload_hash is
'Hash of canonical normalized request payload. Do not store the raw payload here.';

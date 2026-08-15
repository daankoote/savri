create schema if not exists platform;

revoke all on schema platform from public;
revoke all on schema platform from anon;
revoke all on schema platform from authenticated;

create table platform.tenants (
  id uuid primary key default gen_random_uuid(),
  lifecycle_status text not null,
  public_slug text null,
  display_name text null,
  created_at timestamptz not null default clock_timestamp(),
  created_by_actor_ref text not null,
  created_from_request_id text not null,
  deactivated_at timestamptz null,
  deactivated_by_actor_ref text null,
  change_reason_ref text null,
  constraint platform_tenants_lifecycle_status_chk check (
    lifecycle_status in ('provisioning', 'active', 'suspended', 'deactivated')
  ),
  constraint platform_tenants_public_slug_chk check (
    public_slug is null or (
      public_slug = lower(public_slug)
      and public_slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'
    )
  ),
  constraint platform_tenants_display_name_chk check (
    display_name is null or (
      display_name = btrim(display_name)
      and char_length(display_name) between 1 and 160
    )
  ),
  constraint platform_tenants_created_actor_chk check (
    created_by_actor_ref = btrim(created_by_actor_ref)
    and char_length(created_by_actor_ref) between 1 and 200
  ),
  constraint platform_tenants_created_request_chk check (
    created_from_request_id = btrim(created_from_request_id)
    and char_length(created_from_request_id) between 1 and 200
  ),
  constraint platform_tenants_deactivation_shape_chk check (
    (
      lifecycle_status = 'deactivated'
      and deactivated_at is not null
      and deactivated_by_actor_ref is not null
      and deactivated_by_actor_ref = btrim(deactivated_by_actor_ref)
      and char_length(deactivated_by_actor_ref) between 1 and 200
    ) or (
      lifecycle_status <> 'deactivated'
      and deactivated_at is null
      and deactivated_by_actor_ref is null
    )
  ),
  constraint platform_tenants_change_reason_chk check (
    change_reason_ref is null or (
      change_reason_ref = btrim(change_reason_ref)
      and char_length(change_reason_ref) between 1 and 300
    )
  )
);

create unique index platform_tenants_public_slug_unique
  on platform.tenants (public_slug)
  where public_slug is not null;

create table platform.routing_identities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  identity_kind text not null,
  normalized_value text not null,
  lifecycle_status text not null,
  verified_at timestamptz null,
  verification_method text null,
  verification_evidence_ref text null,
  created_at timestamptz not null default clock_timestamp(),
  created_by_actor_ref text not null,
  created_from_request_id text not null,
  activated_at timestamptz null,
  deactivated_at timestamptz null,
  constraint platform_routing_identity_kind_chk check (
    identity_kind = 'host'
  ),
  constraint platform_routing_normalized_value_chk check (
    normalized_value = lower(normalized_value)
    and normalized_value = btrim(normalized_value)
    and char_length(normalized_value) between 1 and 253
    and normalized_value ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'
    and normalized_value !~ '\.\.'
  ),
  constraint platform_routing_lifecycle_status_chk check (
    lifecycle_status in ('pending_verification', 'active', 'inactive', 'revoked')
  ),
  constraint platform_routing_verification_shape_chk check (
    (
      lifecycle_status = 'pending_verification'
      and verified_at is null
      and activated_at is null
    ) or (
      lifecycle_status <> 'pending_verification'
      and verified_at is not null
      and verification_method is not null
      and verification_evidence_ref is not null
    )
  ),
  constraint platform_routing_verification_method_chk check (
    verification_method is null or (
      verification_method = btrim(verification_method)
      and char_length(verification_method) between 1 and 100
    )
  ),
  constraint platform_routing_verification_evidence_chk check (
    verification_evidence_ref is null or (
      verification_evidence_ref = btrim(verification_evidence_ref)
      and char_length(verification_evidence_ref) between 1 and 300
    )
  ),
  constraint platform_routing_created_actor_chk check (
    created_by_actor_ref = btrim(created_by_actor_ref)
    and char_length(created_by_actor_ref) between 1 and 200
  ),
  constraint platform_routing_created_request_chk check (
    created_from_request_id = btrim(created_from_request_id)
    and char_length(created_from_request_id) between 1 and 200
  ),
  constraint platform_routing_active_time_chk check (
    lifecycle_status <> 'active' or activated_at is not null
  )
);

create unique index platform_routing_identities_active_value_unique
  on platform.routing_identities (identity_kind, normalized_value)
  where lifecycle_status = 'active';

create index platform_routing_identities_tenant_idx
  on platform.routing_identities (tenant_id);

create table platform.data_plane_locators (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  deployment_ownership text not null,
  provider_type text not null,
  environment text not null,
  region text null,
  provider_project_ref text not null,
  application_route_ref text not null,
  secret_reference_id uuid not null,
  lifecycle_status text not null,
  effective_at timestamptz null,
  retired_at timestamptz null,
  created_at timestamptz not null default clock_timestamp(),
  created_by_actor_ref text not null,
  created_from_request_id text not null,
  change_reason_ref text null,
  constraint platform_locator_deployment_ownership_chk check (
    deployment_ownership in (
      'ENVAL_MANAGED_DEDICATED',
      'CUSTOMER_MANAGED_SELF_HOSTED'
    )
  ),
  constraint platform_locator_provider_type_chk check (
    provider_type = lower(provider_type)
    and provider_type = btrim(provider_type)
    and provider_type ~ '^[a-z][a-z0-9_-]{1,63}$'
  ),
  constraint platform_locator_environment_chk check (
    environment = lower(environment)
    and environment = btrim(environment)
    and environment ~ '^[a-z][a-z0-9_-]{1,63}$'
  ),
  constraint platform_locator_region_chk check (
    region is null or (
      region = lower(region)
      and region = btrim(region)
      and region ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
    )
  ),
  constraint platform_locator_project_ref_chk check (
    provider_project_ref = btrim(provider_project_ref)
    and char_length(provider_project_ref) between 1 and 200
    and provider_project_ref !~ '[[:space:]]'
  ),
  constraint platform_locator_application_route_chk check (
    application_route_ref = btrim(application_route_ref)
    and char_length(application_route_ref) between 1 and 500
    and application_route_ref !~ '[[:space:]]'
  ),
  constraint platform_locator_lifecycle_status_chk check (
    lifecycle_status in ('provisioning', 'active', 'inactive', 'retired')
  ),
  constraint platform_locator_active_time_chk check (
    lifecycle_status <> 'active' or effective_at is not null
  ),
  constraint platform_locator_retired_time_chk check (
    lifecycle_status <> 'retired' or retired_at is not null
  ),
  constraint platform_locator_created_actor_chk check (
    created_by_actor_ref = btrim(created_by_actor_ref)
    and char_length(created_by_actor_ref) between 1 and 200
  ),
  constraint platform_locator_created_request_chk check (
    created_from_request_id = btrim(created_from_request_id)
    and char_length(created_from_request_id) between 1 and 200
  ),
  constraint platform_locator_change_reason_chk check (
    change_reason_ref is null or (
      change_reason_ref = btrim(change_reason_ref)
      and char_length(change_reason_ref) between 1 and 300
    )
  )
);

create unique index platform_data_plane_locators_active_tenant_environment_unique
  on platform.data_plane_locators (tenant_id, environment)
  where lifecycle_status = 'active';

create unique index platform_data_plane_locators_active_project_unique
  on platform.data_plane_locators (
    provider_type,
    environment,
    provider_project_ref
  ) where lifecycle_status = 'active';

create table platform.action_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_kind text not null,
  actor_reference text not null,
  tenant_id uuid null references platform.tenants(id) on delete restrict,
  action_type text not null,
  reason_or_purpose_ref text null,
  result text not null,
  request_id text not null,
  correlation_ref text null,
  environment text not null,
  component text not null,
  provenance_ref text null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint platform_audit_actor_kind_chk check (
    actor_kind in ('system', 'platform_principal')
  ),
  constraint platform_audit_actor_reference_chk check (
    actor_reference = btrim(actor_reference)
    and char_length(actor_reference) between 1 and 200
  ),
  constraint platform_audit_action_type_chk check (
    action_type = lower(action_type)
    and action_type = btrim(action_type)
    and action_type ~ '^[a-z][a-z0-9._-]{2,119}$'
  ),
  constraint platform_audit_reason_chk check (
    reason_or_purpose_ref is null or (
      reason_or_purpose_ref = btrim(reason_or_purpose_ref)
      and char_length(reason_or_purpose_ref) between 1 and 300
    )
  ),
  constraint platform_audit_result_chk check (
    result in ('success', 'rejected', 'failed')
  ),
  constraint platform_audit_request_id_chk check (
    request_id = btrim(request_id)
    and char_length(request_id) between 1 and 200
  ),
  constraint platform_audit_correlation_chk check (
    correlation_ref is null or (
      correlation_ref = btrim(correlation_ref)
      and char_length(correlation_ref) between 1 and 300
    )
  ),
  constraint platform_audit_environment_chk check (
    environment = lower(environment)
    and environment = btrim(environment)
    and environment ~ '^[a-z][a-z0-9_-]{1,63}$'
  ),
  constraint platform_audit_component_chk check (
    component = lower(component)
    and component = btrim(component)
    and component ~ '^[a-z][a-z0-9._-]{1,119}$'
  ),
  constraint platform_audit_provenance_chk check (
    provenance_ref is null or (
      provenance_ref = btrim(provenance_ref)
      and char_length(provenance_ref) between 1 and 300
    )
  )
);

create index platform_action_audit_events_tenant_recorded_idx
  on platform.action_audit_events (tenant_id, recorded_at desc);

create or replace function platform.reject_identity_key_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'platform_identity_key_is_immutable';
  end if;
  return new;
end;
$$;

create trigger platform_tenants_identity_key_immutable
before update on platform.tenants
for each row execute function platform.reject_identity_key_update();

create trigger platform_routing_identity_key_immutable
before update on platform.routing_identities
for each row execute function platform.reject_identity_key_update();

create trigger platform_locator_identity_key_immutable
before update on platform.data_plane_locators
for each row execute function platform.reject_identity_key_update();

create or replace function platform.reject_action_audit_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'platform_action_audit_is_append_only';
end;
$$;

create trigger platform_action_audit_reject_update_delete
before update or delete on platform.action_audit_events
for each row execute function platform.reject_action_audit_mutation();

create trigger platform_action_audit_reject_truncate
before truncate on platform.action_audit_events
for each statement execute function platform.reject_action_audit_mutation();

alter table platform.tenants enable row level security;
alter table platform.tenants force row level security;
alter table platform.routing_identities enable row level security;
alter table platform.routing_identities force row level security;
alter table platform.data_plane_locators enable row level security;
alter table platform.data_plane_locators force row level security;
alter table platform.action_audit_events enable row level security;
alter table platform.action_audit_events force row level security;

revoke all on all tables in schema platform from public;
revoke all on all tables in schema platform from anon;
revoke all on all tables in schema platform from authenticated;
revoke all on all tables in schema platform from service_role;
revoke all on all sequences in schema platform from public;
revoke all on all sequences in schema platform from anon;
revoke all on all sequences in schema platform from authenticated;
revoke all on all sequences in schema platform from service_role;
revoke all on all functions in schema platform from public;
revoke all on all functions in schema platform from anon;
revoke all on all functions in schema platform from authenticated;
revoke all on all functions in schema platform from service_role;

grant usage on schema platform to service_role;
grant select on platform.tenants to service_role;
grant select on platform.routing_identities to service_role;
grant select on platform.data_plane_locators to service_role;

alter default privileges in schema platform revoke all on tables from public;
alter default privileges in schema platform revoke all on tables from anon;
alter default privileges in schema platform revoke all on tables from authenticated;
alter default privileges in schema platform revoke all on tables from service_role;
alter default privileges in schema platform revoke all on sequences from public;
alter default privileges in schema platform revoke all on sequences from anon;
alter default privileges in schema platform revoke all on sequences from authenticated;
alter default privileges in schema platform revoke all on sequences from service_role;
alter default privileges in schema platform revoke all on functions from public;
alter default privileges in schema platform revoke all on functions from anon;
alter default privileges in schema platform revoke all on functions from authenticated;
alter default privileges in schema platform revoke all on functions from service_role;

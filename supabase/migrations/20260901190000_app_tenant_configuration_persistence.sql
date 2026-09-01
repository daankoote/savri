begin;

create table public.app_tenant_configuration_component_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  environment text not null,
  component_kind text not null,
  revision_id text not null,
  content_sha256 text not null,
  approval_status text not null,
  approved_at timestamptz not null,
  approved_by_actor_ref text not null,
  supersedes_component_revision_id uuid null references
    public.app_tenant_configuration_component_revisions(id),
  created_at timestamptz not null default now(),
  constraint app_tenant_configuration_component_context_revision_unique
    unique (tenant_id, environment, revision_id),
  constraint app_tenant_configuration_component_environment_valid check (
    environment ~ '^[a-z][a-z0-9_-]{1,63}$'
  ),
  constraint app_tenant_configuration_component_kind_valid check (
    component_kind in (
      'operational', 'legal', 'fee_commercial', 'provider_integration'
    )
  ),
  constraint app_tenant_configuration_component_revision_id_valid check (
    revision_id ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'
  ),
  constraint app_tenant_configuration_component_sha_valid check (
    content_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint app_tenant_configuration_component_approval_valid check (
    approval_status = 'APPROVED'
  ),
  constraint app_tenant_configuration_component_actor_valid check (
    length(approved_by_actor_ref) between 1 and 200
    and approved_by_actor_ref = btrim(approved_by_actor_ref)
    and approved_by_actor_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$'
  ),
  constraint app_tenant_configuration_component_not_self_superseding check (
    supersedes_component_revision_id is null
    or supersedes_component_revision_id <> id
  )
);

create table public.app_tenant_configuration_manifests (
  id uuid primary key default gen_random_uuid(),
  schema_version text not null,
  manifest_revision_id text not null,
  tenant_id uuid not null,
  environment text not null,
  operational_component_revision_id uuid not null references
    public.app_tenant_configuration_component_revisions(id),
  legal_component_revision_id uuid not null references
    public.app_tenant_configuration_component_revisions(id),
  fee_commercial_component_revision_id uuid not null references
    public.app_tenant_configuration_component_revisions(id),
  provider_integration_component_revision_id uuid not null references
    public.app_tenant_configuration_component_revisions(id),
  approval_status text not null,
  approved_at timestamptz not null,
  approved_by_actor_ref text not null,
  effective_from timestamptz not null,
  effective_until timestamptz null,
  supersedes_manifest_id uuid null references
    public.app_tenant_configuration_manifests(id),
  canonical_sha256 text not null,
  created_at timestamptz not null default now(),
  constraint app_tenant_configuration_manifest_context_revision_unique
    unique (tenant_id, environment, manifest_revision_id),
  constraint app_tenant_configuration_manifest_schema_valid check (
    schema_version = 'tenant-configuration-manifest-v1'
  ),
  constraint app_tenant_configuration_manifest_revision_id_valid check (
    manifest_revision_id ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'
  ),
  constraint app_tenant_configuration_manifest_environment_valid check (
    environment ~ '^[a-z][a-z0-9_-]{1,63}$'
  ),
  constraint app_tenant_configuration_manifest_approval_valid check (
    approval_status = 'APPROVED'
  ),
  constraint app_tenant_configuration_manifest_actor_valid check (
    length(approved_by_actor_ref) between 1 and 200
    and approved_by_actor_ref = btrim(approved_by_actor_ref)
    and approved_by_actor_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$'
  ),
  constraint app_tenant_configuration_manifest_window_valid check (
    effective_until is null or effective_until > effective_from
  ),
  constraint app_tenant_configuration_manifest_sha_valid check (
    canonical_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint app_tenant_configuration_manifest_not_self_superseding check (
    supersedes_manifest_id is null or supersedes_manifest_id <> id
  )
);

create function public.app_tenant_configuration_insert_integrity_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_component public.app_tenant_configuration_component_revisions%rowtype;
  prior_manifest public.app_tenant_configuration_manifests%rowtype;
  matching_component_count integer;
begin
  if tg_table_name = 'app_tenant_configuration_component_revisions' then
    if new.supersedes_component_revision_id is not null then
      select * into prior_component
      from public.app_tenant_configuration_component_revisions
      where id = new.supersedes_component_revision_id;
      if not found
        or prior_component.tenant_id <> new.tenant_id
        or prior_component.environment <> new.environment
        or prior_component.component_kind <> new.component_kind
      then
        raise exception 'tenant configuration component supersession invalid'
          using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  if new.supersedes_manifest_id is not null then
    select * into prior_manifest
    from public.app_tenant_configuration_manifests
    where id = new.supersedes_manifest_id;
    if not found
      or prior_manifest.tenant_id <> new.tenant_id
      or prior_manifest.environment <> new.environment
    then
      raise exception 'tenant configuration manifest supersession invalid'
        using errcode = '23514';
    end if;
  end if;

  select count(*) into matching_component_count
  from (
    values
      ('operational', new.operational_component_revision_id),
      ('legal', new.legal_component_revision_id),
      ('fee_commercial', new.fee_commercial_component_revision_id),
      ('provider_integration', new.provider_integration_component_revision_id)
  ) as expected(component_kind, component_revision_id)
  join public.app_tenant_configuration_component_revisions component
    on component.id = expected.component_revision_id
   and component.tenant_id = new.tenant_id
   and component.environment = new.environment
   and component.component_kind = expected.component_kind;
  if matching_component_count <> 4 then
    raise exception 'tenant configuration manifest component context invalid'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_app_tenant_configuration_components_insert_integrity
before insert on public.app_tenant_configuration_component_revisions
for each row execute function
  public.app_tenant_configuration_insert_integrity_v1();
create trigger trg_app_tenant_configuration_manifests_insert_integrity
before insert on public.app_tenant_configuration_manifests
for each row execute function
  public.app_tenant_configuration_insert_integrity_v1();

create trigger trg_app_tenant_configuration_components_immutable
before update or delete on public.app_tenant_configuration_component_revisions
for each row execute function public.app_wp2b_i_immutable_guard();
create trigger trg_app_tenant_configuration_components_truncate_guard
before truncate on public.app_tenant_configuration_component_revisions
for each statement execute function public.app_wp2b_i_immutable_guard();
create trigger trg_app_tenant_configuration_manifests_immutable
before update or delete on public.app_tenant_configuration_manifests
for each row execute function public.app_wp2b_i_immutable_guard();
create trigger trg_app_tenant_configuration_manifests_truncate_guard
before truncate on public.app_tenant_configuration_manifests
for each statement execute function public.app_wp2b_i_immutable_guard();

create index app_tenant_configuration_components_context_idx
  on public.app_tenant_configuration_component_revisions(
    tenant_id, environment, component_kind, approved_at, created_at
  );
create index app_tenant_configuration_manifests_context_idx
  on public.app_tenant_configuration_manifests(
    tenant_id, environment, effective_from, effective_until, approved_at
  );

alter table public.app_tenant_configuration_component_revisions
  enable row level security;
alter table public.app_tenant_configuration_manifests
  enable row level security;
create policy deny_all
on public.app_tenant_configuration_component_revisions
for all to anon, authenticated using (false) with check (false);
create policy deny_all
on public.app_tenant_configuration_manifests
for all to anon, authenticated using (false) with check (false);

revoke all on table public.app_tenant_configuration_component_revisions
  from public, anon, authenticated, service_role;
revoke all on table public.app_tenant_configuration_manifests
  from public, anon, authenticated, service_role;
grant select, insert
on table public.app_tenant_configuration_component_revisions to service_role;
grant select, insert
on table public.app_tenant_configuration_manifests to service_role;
revoke all on function public.app_tenant_configuration_insert_integrity_v1()
  from public, anon, authenticated, service_role;

comment on table public.app_tenant_configuration_component_revisions is
  'Immutable tenant-data-plane-local approved configuration component revision metadata. Contains no component payload or secret.';
comment on table public.app_tenant_configuration_manifests is
  'Immutable tenant-data-plane-local approved manifest metadata selecting one relational revision for each TF02-B component kind.';

commit;

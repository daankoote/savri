begin;

create table public.app_tenant_signing_material_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  environment text not null,
  material_kind text not null,
  material_revision_id text not null,
  component_revision_id uuid not null unique references
    public.app_tenant_configuration_component_revisions(id),
  canonical_content_sha256 text not null,
  binding_authority text not null,
  binding_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint app_tenant_signing_material_context_revision_unique
    unique (tenant_id, environment, material_kind, material_revision_id),
  constraint app_tenant_signing_material_id_kind_unique
    unique (id, material_kind),
  constraint app_tenant_signing_material_environment_valid check (
    environment ~ '^[a-z][a-z0-9_-]{1,63}$'
  ),
  constraint app_tenant_signing_material_kind_valid check (
    material_kind in ('operational', 'legal', 'fee_commercial')
  ),
  constraint app_tenant_signing_material_revision_valid check (
    material_revision_id ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'
  ),
  constraint app_tenant_signing_material_sha_valid check (
    canonical_content_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint app_tenant_signing_material_binding_authority_valid check (
    binding_authority = 'server_canonical_signing_material_v1'
  )
);

create table public.app_tenant_signing_operational_material (
  signing_material_revision_id uuid primary key,
  material_kind text not null default 'operational',
  operator_legal_entity_reference text not null,
  operator_identity_sha256 text not null,
  regulated_operator_legal_entity_reference text not null,
  contracting_party_legal_entity_reference text not null,
  controller_legal_entity_reference text null,
  mandate_grantee_legal_entity_reference text not null,
  created_at timestamptz not null default now(),
  constraint app_tenant_signing_operational_material_root_fk
    foreign key (signing_material_revision_id, material_kind) references
      public.app_tenant_signing_material_revisions(id, material_kind),
  constraint app_tenant_signing_operational_material_kind_valid check (
    material_kind = 'operational'
  ),
  constraint app_tenant_signing_operational_material_operator_ref_valid check (
    operator_legal_entity_reference ~
      '^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,199}$'
  ),
  constraint app_tenant_signing_operational_material_identity_sha_valid check (
    operator_identity_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint app_tenant_signing_operational_material_roles_valid check (
    regulated_operator_legal_entity_reference =
      operator_legal_entity_reference
    and contracting_party_legal_entity_reference =
      operator_legal_entity_reference
    and mandate_grantee_legal_entity_reference =
      operator_legal_entity_reference
    and (
      controller_legal_entity_reference is null
      or controller_legal_entity_reference = operator_legal_entity_reference
    )
  )
);

create table public.app_tenant_signing_legal_material (
  signing_material_revision_id uuid primary key,
  material_kind text not null default 'legal',
  bundle_revision text not null,
  bundle_canonical_sha256 text not null,
  privacy_notice_document_reference text not null,
  privacy_notice_version text not null,
  privacy_notice_language text not null,
  privacy_notice_content_sha256 text not null,
  service_terms_document_reference text not null,
  service_terms_version text not null,
  service_terms_language text not null,
  service_terms_content_sha256 text not null,
  fee_terms_document_reference text not null,
  fee_terms_version text not null,
  fee_terms_language text not null,
  fee_terms_content_sha256 text not null,
  mandate_document_reference text not null,
  mandate_version text not null,
  mandate_language text not null,
  mandate_content_sha256 text not null,
  created_at timestamptz not null default now(),
  constraint app_tenant_signing_legal_material_root_fk
    foreign key (signing_material_revision_id, material_kind) references
      public.app_tenant_signing_material_revisions(id, material_kind),
  constraint app_tenant_signing_legal_material_kind_valid check (
    material_kind = 'legal'
  ),
  constraint app_tenant_signing_legal_material_bundle_revision_valid check (
    bundle_revision ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'
  ),
  constraint app_tenant_signing_legal_material_bundle_sha_valid check (
    bundle_canonical_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint app_tenant_signing_legal_material_languages_valid check (
    privacy_notice_language = 'nl'
    and service_terms_language = 'nl'
    and fee_terms_language = 'nl'
    and mandate_language = 'nl'
  ),
  constraint app_tenant_signing_legal_material_references_valid check (
    privacy_notice_document_reference ~
      '^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,199}$'
    and service_terms_document_reference ~
      '^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,199}$'
    and fee_terms_document_reference ~
      '^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,199}$'
    and mandate_document_reference ~
      '^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,199}$'
  ),
  constraint app_tenant_signing_legal_material_versions_valid check (
    privacy_notice_version ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'
    and service_terms_version ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'
    and fee_terms_version ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'
    and mandate_version ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'
  ),
  constraint app_tenant_signing_legal_material_hashes_valid check (
    privacy_notice_content_sha256 ~ '^[0-9a-f]{64}$'
    and service_terms_content_sha256 ~ '^[0-9a-f]{64}$'
    and fee_terms_content_sha256 ~ '^[0-9a-f]{64}$'
    and mandate_content_sha256 ~ '^[0-9a-f]{64}$'
  )
);

create table public.app_tenant_signing_fee_material (
  signing_material_revision_id uuid primary key,
  material_kind text not null default 'fee_commercial',
  document_type text not null,
  document_reference text not null,
  version text not null,
  language text not null,
  content_sha256 text not null,
  created_at timestamptz not null default now(),
  constraint app_tenant_signing_fee_material_root_fk
    foreign key (signing_material_revision_id, material_kind) references
      public.app_tenant_signing_material_revisions(id, material_kind),
  constraint app_tenant_signing_fee_material_kind_valid check (
    material_kind = 'fee_commercial'
  ),
  constraint app_tenant_signing_fee_material_document_type_valid check (
    document_type = 'fee_terms'
  ),
  constraint app_tenant_signing_fee_material_document_reference_valid check (
    document_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,199}$'
  ),
  constraint app_tenant_signing_fee_material_version_valid check (
    version ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'
  ),
  constraint app_tenant_signing_fee_material_language_valid check (
    language = 'nl'
  ),
  constraint app_tenant_signing_fee_material_sha_valid check (
    content_sha256 ~ '^[0-9a-f]{64}$'
  )
);

create table public.app_tenant_signing_configuration_invalidations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  environment text not null,
  subject_type text not null,
  subject_reference uuid not null,
  effective_at timestamptz not null,
  reason_code text not null,
  authorized_actor_ref text not null,
  evidence_reference text not null,
  created_at timestamptz not null default now(),
  constraint app_tenant_signing_invalidation_subject_unique
    unique (tenant_id, environment, subject_type, subject_reference),
  constraint app_tenant_signing_invalidation_environment_valid check (
    environment ~ '^[a-z][a-z0-9_-]{1,63}$'
  ),
  constraint app_tenant_signing_invalidation_subject_type_valid check (
    subject_type in (
      'manifest', 'component_revision', 'signing_material_revision'
    )
  ),
  constraint app_tenant_signing_invalidation_reason_valid check (
    reason_code = 'explicit_invalidation'
  ),
  constraint app_tenant_signing_invalidation_actor_valid check (
    authorized_actor_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,199}$'
  ),
  constraint app_tenant_signing_invalidation_evidence_valid check (
    evidence_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,199}$'
  )
);

create function public.app_tenant_signing_material_insert_integrity_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  component public.app_tenant_configuration_component_revisions%rowtype;
begin
  select * into component
  from public.app_tenant_configuration_component_revisions
  where id = new.component_revision_id;
  if not found
    or component.tenant_id <> new.tenant_id
    or component.environment <> new.environment
    or component.component_kind <> new.material_kind
    or component.content_sha256 <> new.canonical_content_sha256
  then
    raise exception 'tenant signing material component binding invalid'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create function public.app_tenant_signing_material_complete_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  operational_count integer;
  legal_count integer;
  fee_count integer;
begin
  select count(*) into operational_count
  from public.app_tenant_signing_operational_material
  where signing_material_revision_id = new.id;
  select count(*) into legal_count
  from public.app_tenant_signing_legal_material
  where signing_material_revision_id = new.id;
  select count(*) into fee_count
  from public.app_tenant_signing_fee_material
  where signing_material_revision_id = new.id;

  if (new.material_kind = 'operational' and
      (operational_count <> 1 or legal_count <> 0 or fee_count <> 0))
    or (new.material_kind = 'legal' and
      (operational_count <> 0 or legal_count <> 1 or fee_count <> 0))
    or (new.material_kind = 'fee_commercial' and
      (operational_count <> 0 or legal_count <> 0 or fee_count <> 1))
  then
    raise exception 'tenant signing material typed content incomplete'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create function public.app_tenant_signing_legal_material_integrity_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.app_tenant_signing_material_revisions root
    where root.id = new.signing_material_revision_id
      and root.material_kind = 'legal'
      and root.canonical_content_sha256 = new.bundle_canonical_sha256
  ) then
    raise exception 'tenant signing legal bundle hash binding invalid'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create function public.app_tenant_signing_invalidation_integrity_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.subject_type = 'manifest' then
    if not exists (
      select 1 from public.app_tenant_configuration_manifests subject
      where subject.id = new.subject_reference
        and subject.tenant_id = new.tenant_id
        and subject.environment = new.environment
    ) then
      raise exception 'tenant signing invalidation subject context invalid'
        using errcode = '23514';
    end if;
  elsif new.subject_type = 'component_revision' then
    if not exists (
      select 1
      from public.app_tenant_configuration_component_revisions subject
      where subject.id = new.subject_reference
        and subject.tenant_id = new.tenant_id
        and subject.environment = new.environment
    ) then
      raise exception 'tenant signing invalidation subject context invalid'
        using errcode = '23514';
    end if;
  elsif not exists (
    select 1 from public.app_tenant_signing_material_revisions subject
    where subject.id = new.subject_reference
      and subject.tenant_id = new.tenant_id
      and subject.environment = new.environment
  ) then
    raise exception 'tenant signing invalidation subject context invalid'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_app_tenant_signing_material_insert_integrity
before insert on public.app_tenant_signing_material_revisions
for each row execute function
  public.app_tenant_signing_material_insert_integrity_v1();
create constraint trigger trg_app_tenant_signing_material_complete
after insert on public.app_tenant_signing_material_revisions
deferrable initially deferred
for each row execute function public.app_tenant_signing_material_complete_v1();
create trigger trg_app_tenant_signing_legal_material_integrity
before insert on public.app_tenant_signing_legal_material
for each row execute function
  public.app_tenant_signing_legal_material_integrity_v1();
create trigger trg_app_tenant_signing_invalidation_integrity
before insert on public.app_tenant_signing_configuration_invalidations
for each row execute function
  public.app_tenant_signing_invalidation_integrity_v1();

create trigger trg_app_tenant_signing_material_immutable
before update or delete on public.app_tenant_signing_material_revisions
for each row execute function public.app_wp2b_i_immutable_guard();
create trigger trg_app_tenant_signing_operational_material_immutable
before update or delete on public.app_tenant_signing_operational_material
for each row execute function public.app_wp2b_i_immutable_guard();
create trigger trg_app_tenant_signing_legal_material_immutable
before update or delete on public.app_tenant_signing_legal_material
for each row execute function public.app_wp2b_i_immutable_guard();
create trigger trg_app_tenant_signing_fee_material_immutable
before update or delete on public.app_tenant_signing_fee_material
for each row execute function public.app_wp2b_i_immutable_guard();
create trigger trg_app_tenant_signing_invalidations_immutable
before update or delete on public.app_tenant_signing_configuration_invalidations
for each row execute function public.app_wp2b_i_immutable_guard();

create trigger trg_app_tenant_signing_material_truncate_guard
before truncate on public.app_tenant_signing_material_revisions
for each statement execute function public.app_wp2b_i_immutable_guard();
create trigger trg_app_tenant_signing_operational_material_truncate_guard
before truncate on public.app_tenant_signing_operational_material
for each statement execute function public.app_wp2b_i_immutable_guard();
create trigger trg_app_tenant_signing_legal_material_truncate_guard
before truncate on public.app_tenant_signing_legal_material
for each statement execute function public.app_wp2b_i_immutable_guard();
create trigger trg_app_tenant_signing_fee_material_truncate_guard
before truncate on public.app_tenant_signing_fee_material
for each statement execute function public.app_wp2b_i_immutable_guard();
create trigger trg_app_tenant_signing_invalidations_truncate_guard
before truncate on public.app_tenant_signing_configuration_invalidations
for each statement execute function public.app_wp2b_i_immutable_guard();

create index app_tenant_signing_material_context_idx
  on public.app_tenant_signing_material_revisions(
    tenant_id, environment, material_kind, created_at
  );
create index app_tenant_signing_invalidations_context_idx
  on public.app_tenant_signing_configuration_invalidations(
    tenant_id, environment, subject_type, effective_at
  );

alter table public.app_tenant_signing_material_revisions
  enable row level security;
alter table public.app_tenant_signing_operational_material
  enable row level security;
alter table public.app_tenant_signing_legal_material
  enable row level security;
alter table public.app_tenant_signing_fee_material
  enable row level security;
alter table public.app_tenant_signing_configuration_invalidations
  enable row level security;

create policy deny_all on public.app_tenant_signing_material_revisions
for all to anon, authenticated using (false) with check (false);
create policy deny_all on public.app_tenant_signing_operational_material
for all to anon, authenticated using (false) with check (false);
create policy deny_all on public.app_tenant_signing_legal_material
for all to anon, authenticated using (false) with check (false);
create policy deny_all on public.app_tenant_signing_fee_material
for all to anon, authenticated using (false) with check (false);
create policy deny_all on public.app_tenant_signing_configuration_invalidations
for all to anon, authenticated using (false) with check (false);

revoke all on table public.app_tenant_signing_material_revisions
  from public, anon, authenticated, service_role;
revoke all on table public.app_tenant_signing_operational_material
  from public, anon, authenticated, service_role;
revoke all on table public.app_tenant_signing_legal_material
  from public, anon, authenticated, service_role;
revoke all on table public.app_tenant_signing_fee_material
  from public, anon, authenticated, service_role;
revoke all on table public.app_tenant_signing_configuration_invalidations
  from public, anon, authenticated, service_role;

grant select, insert on table public.app_tenant_signing_material_revisions
  to service_role;
grant select, insert on table public.app_tenant_signing_operational_material
  to service_role;
grant select, insert on table public.app_tenant_signing_legal_material
  to service_role;
grant select, insert on table public.app_tenant_signing_fee_material
  to service_role;
grant select, insert
  on table public.app_tenant_signing_configuration_invalidations
  to service_role;

revoke all on function public.app_tenant_signing_material_insert_integrity_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.app_tenant_signing_material_complete_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.app_tenant_signing_legal_material_integrity_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.app_tenant_signing_invalidation_integrity_v1()
  from public, anon, authenticated, service_role;

comment on table public.app_tenant_signing_material_revisions is
  'Immutable tenant-local signing-material binding root. The trusted server canonical material authority verifies that canonical_content_sha256 covers the typed relational child and exactly equals the approved TF02 component content hash.';
comment on table public.app_tenant_signing_operational_material is
  'Strict signing-specific operator identity digest and operator-role bindings. No customer party, support identity, branding or generic business profile.';
comment on table public.app_tenant_signing_legal_material is
  'Strict four-slot references into the canonical signing legal-document authority. Stores no legal text and no generic configuration payload.';
comment on table public.app_tenant_signing_fee_material is
  'Governing fee_terms document provenance only. Stores no numeric fee, calculator or settlement configuration.';
comment on table public.app_tenant_signing_configuration_invalidations is
  'Append-only explicit signing-configuration invalidation evidence. Supersession does not insert invalidation and no real-world invalidation policy is inferred.';

commit;

-- ENVAL 09C1C-R4 signed-signup declared-data parity.
--
-- This is a declared/review-input foundation only. It creates no accepted
-- charger, MID, location, evidence, conformity or eligibility truth.

create table public.app_chargers (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null
    references public.app_signup_promotions (id) on delete restrict,
  case_id uuid not null
    references public.app_cases (id) on delete restrict,
  location_id uuid not null
    references public.app_locations (id) on delete restrict,
  source_ref_sha256 text not null,
  created_at timestamptz not null,
  created_by_actor_ref text not null,
  created_from_request_id text not null,

  constraint app_chargers_source_ref_sha256_chk
    check (source_ref_sha256 ~ '^[0-9a-f]{64}$'),
  constraint app_chargers_provenance_chk
    check (
      btrim(created_by_actor_ref) <> ''
      and btrim(created_from_request_id) <> ''
    ),
  constraint app_chargers_promotion_source_key
    unique (promotion_id, source_ref_sha256),
  constraint app_chargers_promotion_id_id_key
    unique (promotion_id, id)
);

create index app_chargers_case_id_idx on public.app_chargers (case_id);
create index app_chargers_location_id_idx on public.app_chargers (location_id);

create table public.app_charger_declarations (
  id uuid primary key default gen_random_uuid(),
  charger_id uuid not null unique
    references public.app_chargers (id) on delete restrict,
  signing_snapshot_id uuid not null
    references public.app_signup_signing_snapshots (id) on delete restrict,
  source_payload_sha256 text not null,
  brand text null,
  model text null,
  serial_number text null,
  mid_identifier text null,
  installation_date_text text null,
  installation_year integer null,
  backend_supplier text null,
  solar_export_declaration text null,
  declaration_status text not null default 'confirmed_awaiting_review',
  declared_at timestamptz not null,
  created_at timestamptz not null,
  created_by_actor_ref text not null,
  created_from_request_id text not null,

  constraint app_charger_declarations_hash_chk
    check (source_payload_sha256 ~ '^[0-9a-f]{64}$'),
  constraint app_charger_declarations_values_chk
    check (
      (brand is null or (brand = btrim(brand) and brand <> '' and char_length(brand) <= 200))
      and (model is null or (model = btrim(model) and model <> '' and char_length(model) <= 200))
      and (serial_number is null or (serial_number = btrim(serial_number) and serial_number <> '' and char_length(serial_number) <= 200))
      and (mid_identifier is null or (mid_identifier = btrim(mid_identifier) and mid_identifier <> '' and char_length(mid_identifier) <= 200))
      and (installation_date_text is null or (installation_date_text = btrim(installation_date_text) and installation_date_text <> '' and char_length(installation_date_text) <= 100))
      and (backend_supplier is null or (backend_supplier = btrim(backend_supplier) and backend_supplier <> '' and char_length(backend_supplier) <= 200))
      and (solar_export_declaration is null or (solar_export_declaration = btrim(solar_export_declaration) and solar_export_declaration <> '' and char_length(solar_export_declaration) <= 100))
      and (installation_year is null or installation_year between 1990 and 2050)
    ),
  constraint app_charger_declarations_status_chk
    check (declaration_status = 'confirmed_awaiting_review'),
  constraint app_charger_declarations_provenance_chk
    check (
      btrim(created_by_actor_ref) <> ''
      and btrim(created_from_request_id) <> ''
    )
);

create table public.app_evidence_declaration_contexts (
  evidence_file_id uuid primary key
    references public.app_evidence_files (id) on delete restrict,
  promotion_id uuid not null
    references public.app_signup_promotions (id) on delete restrict,
  source_slot_ref_sha256 text not null,
  location_id uuid null
    references public.app_locations (id) on delete restrict,
  charger_id uuid null
    references public.app_chargers (id) on delete restrict,
  association_basis text not null,
  created_at timestamptz not null,
  created_by_actor_ref text not null,
  created_from_request_id text not null,

  constraint app_evidence_declaration_contexts_hash_chk
    check (source_slot_ref_sha256 ~ '^[0-9a-f]{64}$'),
  constraint app_evidence_declaration_contexts_basis_chk
    check (
      association_basis in (
        'unscoped',
        'single_declared_location',
        'single_declared_charger',
        'ambiguous_source_scope'
      )
    ),
  constraint app_evidence_declaration_contexts_shape_chk
    check (
      (association_basis = 'unscoped' and location_id is null and charger_id is null)
      or (association_basis = 'single_declared_location' and location_id is not null and charger_id is null)
      or (association_basis = 'single_declared_charger' and location_id is not null and charger_id is not null)
      or (association_basis = 'ambiguous_source_scope' and location_id is null and charger_id is null)
    ),
  constraint app_evidence_declaration_contexts_provenance_chk
    check (
      btrim(created_by_actor_ref) <> ''
      and btrim(created_from_request_id) <> ''
    )
);

create trigger trg_app_chargers_immutable
before update or delete on public.app_chargers
for each row execute function public.app_signup_promotion_immutable_guard();

create trigger trg_app_charger_declarations_immutable
before update or delete on public.app_charger_declarations
for each row execute function public.app_signup_promotion_immutable_guard();

create trigger trg_app_evidence_declaration_contexts_immutable
before update or delete on public.app_evidence_declaration_contexts
for each row execute function public.app_signup_promotion_immutable_guard();

create or replace function public.app_materialize_signed_signup_declared_data_v1(
  p_intake_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_promotion public.app_signup_promotions%rowtype;
  v_snapshot public.app_signup_signing_snapshots%rowtype;
  v_intake public.app_signup_intakes%rowtype;
  v_charger_ref text;
  v_location_ref text;
  v_location_id uuid;
  v_charger_id uuid;
  v_brand text;
  v_model text;
  v_serial_number text;
  v_mid_identifier text;
  v_installation_date_text text;
  v_installation_year integer;
  v_backend_supplier text;
  v_solar_export_declaration text;
  v_distinct_count integer;
  v_source_location_count integer;
  v_durable_location_count integer;
  v_source_charger_count integer;
  v_evidence public.app_evidence_files%rowtype;
  v_source_file public.app_signup_intake_files%rowtype;
  v_context_location_id uuid;
  v_context_charger_id uuid;
  v_association_basis text;
  v_existing_declaration public.app_charger_declarations%rowtype;
  v_existing_context public.app_evidence_declaration_contexts%rowtype;
begin
  select * into strict v_promotion
  from public.app_signup_promotions
  where intake_id = p_intake_id;

  select * into strict v_snapshot
  from public.app_signup_signing_snapshots
  where id = v_promotion.signing_snapshot_id
    and intake_id = p_intake_id;

  select * into strict v_intake
  from public.app_signup_intakes
  where id = p_intake_id
    and status = 'promoted'
    and promotion_case_id = v_promotion.case_id;

  select count(distinct scope_item ->> 'location_id')
  into v_source_location_count
  from jsonb_array_elements(
    coalesce(
      (select mandate_content -> 'connection_scope'
       from public.app_signup_mandates
       where id = v_promotion.mandate_id),
      '[]'::jsonb
    )
  ) scope_item
  where btrim(coalesce(scope_item ->> 'location_id', '')) <> '';

  select count(*) into v_durable_location_count
  from (
    select distinct on (relation.relation_id)
      relation.event_type
    from public.app_case_location_relations relation
    where relation.case_id = v_promotion.case_id
    order by relation.relation_id, relation.recorded_at desc
  ) current_relation
  where current_relation.event_type = 'linked';
  if v_durable_location_count <> v_source_location_count then
    raise exception 'durable location count does not match signed source';
  end if;

  select count(distinct fact ->> 'charger_id')
  into v_source_charger_count
  from jsonb_array_elements(
    coalesce(v_snapshot.canonical_snapshot #> '{canonical_facts,facts}', '[]'::jsonb)
  ) fact
  where btrim(coalesce(fact ->> 'charger_id', '')) <> '';

  for v_charger_ref in
    select distinct fact ->> 'charger_id'
    from jsonb_array_elements(
      coalesce(v_snapshot.canonical_snapshot #> '{canonical_facts,facts}', '[]'::jsonb)
    ) fact
    where btrim(coalesce(fact ->> 'charger_id', '')) <> ''
    order by fact ->> 'charger_id'
  loop
    select count(distinct fact ->> 'location_id'), min(fact ->> 'location_id')
    into v_distinct_count, v_location_ref
    from jsonb_array_elements(
      coalesce(v_snapshot.canonical_snapshot #> '{canonical_facts,facts}', '[]'::jsonb)
    ) fact
    where fact ->> 'charger_id' = v_charger_ref
      and btrim(coalesce(fact ->> 'location_id', '')) <> '';
    if v_distinct_count <> 1 then
      raise exception 'signed charger/location declaration is ambiguous';
    end if;

    select relation.location_id into strict v_location_id
    from public.app_case_location_relations relation
    where relation.case_id = v_promotion.case_id
      and relation.event_type = 'linked'
      and relation.request_id = v_promotion.request_id || ':case-location:' || v_location_ref;

    select count(distinct btrim(fact ->> 'value')),
           min(btrim(fact ->> 'value'))
    into v_distinct_count, v_brand
    from jsonb_array_elements(v_snapshot.canonical_snapshot #> '{canonical_facts,facts}') fact
    where fact ->> 'charger_id' = v_charger_ref
      and fact ->> 'fact_key' = 'chargerBrand'
      and btrim(coalesce(fact ->> 'value', '')) <> '';
    if v_distinct_count > 1 then raise exception 'signed charger brand declaration is ambiguous'; end if;

    select count(distinct btrim(fact ->> 'value')),
           min(btrim(fact ->> 'value'))
    into v_distinct_count, v_model
    from jsonb_array_elements(v_snapshot.canonical_snapshot #> '{canonical_facts,facts}') fact
    where fact ->> 'charger_id' = v_charger_ref
      and fact ->> 'fact_key' = 'chargerModel'
      and btrim(coalesce(fact ->> 'value', '')) <> '';
    if v_distinct_count > 1 then raise exception 'signed charger model declaration is ambiguous'; end if;

    select count(distinct btrim(fact ->> 'value')),
           min(btrim(fact ->> 'value'))
    into v_distinct_count, v_serial_number
    from jsonb_array_elements(v_snapshot.canonical_snapshot #> '{canonical_facts,facts}') fact
    where fact ->> 'charger_id' = v_charger_ref
      and fact ->> 'fact_key' = 'serialNumber'
      and btrim(coalesce(fact ->> 'value', '')) <> '';
    if v_distinct_count > 1 then raise exception 'signed charger serial declaration is ambiguous'; end if;

    select count(distinct btrim(fact ->> 'value')),
           min(btrim(fact ->> 'value'))
    into v_distinct_count, v_mid_identifier
    from jsonb_array_elements(v_snapshot.canonical_snapshot #> '{canonical_facts,facts}') fact
    where fact ->> 'charger_id' = v_charger_ref
      and fact ->> 'fact_key' = 'midNumber'
      and btrim(coalesce(fact ->> 'value', '')) <> '';
    if v_distinct_count > 1 then raise exception 'signed charger MID declaration is ambiguous'; end if;

    select count(distinct btrim(fact ->> 'value')),
           min(btrim(fact ->> 'value'))
    into v_distinct_count, v_installation_date_text
    from jsonb_array_elements(v_snapshot.canonical_snapshot #> '{canonical_facts,facts}') fact
    where fact ->> 'charger_id' = v_charger_ref
      and fact ->> 'fact_key' in ('explicitInstallationDate', 'installationYear')
      and btrim(coalesce(fact ->> 'value', '')) <> '';
    if v_distinct_count > 1 then raise exception 'signed charger installation declaration is ambiguous'; end if;
    v_installation_year := case
      when v_installation_date_text ~ '^[0-9]{4}$'
        then v_installation_date_text::integer
      when v_installation_date_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        then left(v_installation_date_text, 4)::integer
      else null
    end;

    select count(distinct btrim(fact ->> 'value')),
           min(btrim(fact ->> 'value'))
    into v_distinct_count, v_backend_supplier
    from jsonb_array_elements(v_snapshot.canonical_snapshot #> '{canonical_facts,facts}') fact
    where fact ->> 'charger_id' = v_charger_ref
      and fact ->> 'fact_key' = 'backendSupplier'
      and btrim(coalesce(fact ->> 'value', '')) <> '';
    if v_distinct_count > 1 then raise exception 'signed charger backend declaration is ambiguous'; end if;

    select count(distinct btrim(fact ->> 'value')),
           min(btrim(fact ->> 'value'))
    into v_distinct_count, v_solar_export_declaration
    from jsonb_array_elements(v_snapshot.canonical_snapshot #> '{canonical_facts,facts}') fact
    where fact ->> 'charger_id' = v_charger_ref
      and fact ->> 'fact_key' = 'solarExportStatus'
      and btrim(coalesce(fact ->> 'value', '')) <> '';
    if v_distinct_count > 1 then raise exception 'signed charger solar/export declaration is ambiguous'; end if;

    insert into public.app_chargers (
      promotion_id, case_id, location_id, source_ref_sha256,
      created_at, created_by_actor_ref, created_from_request_id
    ) values (
      v_promotion.id, v_promotion.case_id, v_location_id,
      encode(extensions.digest(v_charger_ref, 'sha256'), 'hex'),
      v_promotion.promoted_at, v_promotion.actor_ref,
      v_promotion.request_id || ':declared-charger'
    )
    on conflict (promotion_id, source_ref_sha256) do nothing;

    select id into strict v_charger_id
    from public.app_chargers
    where promotion_id = v_promotion.id
      and source_ref_sha256 = encode(extensions.digest(v_charger_ref, 'sha256'), 'hex')
      and case_id = v_promotion.case_id
      and location_id = v_location_id;

    insert into public.app_charger_declarations (
      charger_id, signing_snapshot_id, source_payload_sha256,
      brand, model, serial_number, mid_identifier,
      installation_date_text, installation_year, backend_supplier,
      solar_export_declaration, declaration_status, declared_at,
      created_at, created_by_actor_ref, created_from_request_id
    ) values (
      v_charger_id, v_snapshot.id, v_snapshot.canonical_snapshot_sha256,
      v_brand, v_model, v_serial_number, v_mid_identifier,
      v_installation_date_text, v_installation_year, v_backend_supplier,
      v_solar_export_declaration, 'confirmed_awaiting_review',
      v_intake.finalized_at, v_promotion.promoted_at, v_promotion.actor_ref,
      v_promotion.request_id || ':declared-charger'
    )
    on conflict (charger_id) do nothing;

    select * into strict v_existing_declaration
    from public.app_charger_declarations
    where charger_id = v_charger_id;
    if row(
      v_existing_declaration.signing_snapshot_id,
      v_existing_declaration.source_payload_sha256,
      v_existing_declaration.brand,
      v_existing_declaration.model,
      v_existing_declaration.serial_number,
      v_existing_declaration.mid_identifier,
      v_existing_declaration.installation_date_text,
      v_existing_declaration.installation_year,
      v_existing_declaration.backend_supplier,
      v_existing_declaration.solar_export_declaration,
      v_existing_declaration.declaration_status
    ) is distinct from row(
      v_snapshot.id,
      v_snapshot.canonical_snapshot_sha256,
      v_brand,
      v_model,
      v_serial_number,
      v_mid_identifier,
      v_installation_date_text,
      v_installation_year,
      v_backend_supplier,
      v_solar_export_declaration,
      'confirmed_awaiting_review'::text
    ) then
      raise exception 'durable charger declaration conflicts with signed source';
    end if;
  end loop;

  if (select count(*) from public.app_chargers where promotion_id = v_promotion.id)
       <> v_source_charger_count then
    raise exception 'durable charger count does not match signed source';
  end if;

  for v_evidence in
    select * from public.app_evidence_files
    where promotion_id = v_promotion.id
    order by id
  loop
    select * into strict v_source_file
    from public.app_signup_intake_files
    where id = v_evidence.source_ref::uuid
      and intake_id = p_intake_id
      and promoted_evidence_file_id = v_evidence.id;

    v_context_location_id := null;
    v_context_charger_id := null;
    v_association_basis := 'unscoped';

    if v_source_file.document_type = 'energy_bill_or_contract' then
      if v_source_location_count = 1 then
        select relation.location_id into strict v_context_location_id
        from public.app_case_location_relations relation
        where relation.case_id = v_promotion.case_id
          and relation.event_type = 'linked';
        v_association_basis := 'single_declared_location';
      else
        v_association_basis := 'ambiguous_source_scope';
      end if;
    elsif v_source_file.document_type = 'installation_invoice' then
      if v_source_charger_count = 1 then
        select charger.id, charger.location_id
        into strict v_context_charger_id, v_context_location_id
        from public.app_chargers charger
        where charger.promotion_id = v_promotion.id;
        v_association_basis := 'single_declared_charger';
      else
        v_association_basis := 'ambiguous_source_scope';
      end if;
    end if;

    insert into public.app_evidence_declaration_contexts (
      evidence_file_id, promotion_id, source_slot_ref_sha256,
      location_id, charger_id, association_basis,
      created_at, created_by_actor_ref, created_from_request_id
    ) values (
      v_evidence.id, v_promotion.id,
      encode(extensions.digest(v_source_file.client_slot_id, 'sha256'), 'hex'),
      v_context_location_id, v_context_charger_id, v_association_basis,
      v_promotion.promoted_at, v_promotion.actor_ref,
      v_promotion.request_id || ':evidence-context'
    )
    on conflict (evidence_file_id) do nothing;

    select * into strict v_existing_context
    from public.app_evidence_declaration_contexts
    where evidence_file_id = v_evidence.id;
    if row(
      v_existing_context.promotion_id,
      v_existing_context.source_slot_ref_sha256,
      v_existing_context.location_id,
      v_existing_context.charger_id,
      v_existing_context.association_basis
    ) is distinct from row(
      v_promotion.id,
      encode(extensions.digest(v_source_file.client_slot_id, 'sha256'), 'hex'),
      v_context_location_id,
      v_context_charger_id,
      v_association_basis
    ) then
      raise exception 'durable evidence context conflicts with signed source';
    end if;
  end loop;

  if (
    select count(*)
    from public.app_evidence_declaration_contexts context
    where context.promotion_id = v_promotion.id
  ) <> (
    select count(*)
    from public.app_evidence_files evidence
    where evidence.promotion_id = v_promotion.id
  ) then
    raise exception 'durable evidence context count does not match evidence';
  end if;
end;
$$;

create or replace function public.app_signed_signup_declared_data_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'promoted' and old.status is distinct from new.status then
    perform public.app_materialize_signed_signup_declared_data_v1(new.id);
  end if;
  return null;
end;
$$;

create trigger trg_app_signed_signup_declared_data
after update of status on public.app_signup_intakes
for each row execute function public.app_signed_signup_declared_data_trigger();

do $$
declare
  v_intake_id uuid;
begin
  for v_intake_id in
    select intake_id from public.app_signup_promotions order by promoted_at, id
  loop
    perform public.app_materialize_signed_signup_declared_data_v1(v_intake_id);
  end loop;
end;
$$;

alter table public.app_chargers enable row level security;
alter table public.app_charger_declarations enable row level security;
alter table public.app_evidence_declaration_contexts enable row level security;

create policy deny_all on public.app_chargers
  for all using (false) with check (false);
create policy deny_all on public.app_charger_declarations
  for all using (false) with check (false);
create policy deny_all on public.app_evidence_declaration_contexts
  for all using (false) with check (false);

revoke all on table public.app_chargers from public, anon, authenticated, service_role;
revoke all on table public.app_charger_declarations from public, anon, authenticated, service_role;
revoke all on table public.app_evidence_declaration_contexts from public, anon, authenticated, service_role;
grant select on table public.app_chargers to service_role;
grant select on table public.app_charger_declarations to service_role;
grant select on table public.app_evidence_declaration_contexts to service_role;

revoke all on function public.app_materialize_signed_signup_declared_data_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.app_signed_signup_declared_data_trigger()
  from public, anon, authenticated, service_role;

comment on table public.app_chargers is
'Immutable case-owned charger roots materialized from signed customer declarations. A row is not charger, MID, conformity or eligibility acceptance.';
comment on table public.app_charger_declarations is
'Immutable signed charger declaration observations awaiting review. MID remains declared input and never accepted truth.';
comment on table public.app_evidence_declaration_contexts is
'Immutable source-slot identity and only deterministic declared subject context for promoted signup evidence; no evidence acceptance.';

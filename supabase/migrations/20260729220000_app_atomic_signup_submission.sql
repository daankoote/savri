-- ENVAL PILOT-SIGNUP-ATOMIC-01 atomic signup submission.
-- Date: 2026-07-29
--
-- One service-role-only transaction now owns the existing direct signup
-- customer, identity, dossier, location, charger, document-slot, legal
-- acceptance, audit and idempotency writes plus one immutable declaration
-- source. The declaration records applicant-declared facts only. It proves no
-- verified identity, KvK validity, VvE registration, address, representation,
-- mandate, EAN/aangeslotene, ownership, eligibility, evidence acceptance,
-- verifier acceptance or NEa acceptance.

create table public.app_party_declaration_sources (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null
    references public.app_customers (id) on delete restrict,
  dossier_id uuid not null
    references public.app_customer_dossiers (id) on delete restrict,
  account_type text not null,
  declaration_kind text not null,
  declared_at timestamptz not null,
  valid_from timestamptz not null,
  created_at timestamptz not null default now(),

  person_first_name text null,
  person_last_name text null,
  person_full_name text null,

  organization_classification text null,
  organization_legal_name text null,
  trade_register_number text null,

  source_type text not null,
  source_request_id text not null,
  source_payload_sha256 text not null,
  declarative_actor_ref text not null,
  environment text not null,

  constraint app_party_declaration_sources_dossier_key
    unique (dossier_id),

  constraint app_party_declaration_sources_source_request_key
    unique (source_type, source_request_id),

  constraint app_party_declaration_sources_account_type_chk
    check (account_type in ('particulier', 'zakelijk', 'vve')),

  constraint app_party_declaration_sources_kind_chk
    check (declaration_kind in ('natural_person', 'organization')),

  constraint app_party_declaration_sources_source_type_chk
    check (source_type = 'signup_applicant_declaration'),

  constraint app_party_declaration_sources_payload_sha256_chk
    check (source_payload_sha256 ~ '^[0-9a-f]{64}$'),

  constraint app_party_declaration_sources_request_not_blank_chk
    check (btrim(source_request_id) <> ''),

  constraint app_party_declaration_sources_actor_not_blank_chk
    check (btrim(declarative_actor_ref) <> ''),

  constraint app_party_declaration_sources_environment_not_blank_chk
    check (btrim(environment) <> ''),

  constraint app_party_declaration_sources_validity_chk
    check (valid_from = declared_at),

  constraint app_party_declaration_sources_shape_chk
    check (
      (
        account_type = 'particulier'
        and declaration_kind = 'natural_person'
        and person_first_name is not null
        and btrim(person_first_name) <> ''
        and person_last_name is not null
        and btrim(person_last_name) <> ''
        and person_full_name =
          btrim(person_first_name) || ' ' || btrim(person_last_name)
        and organization_classification is null
        and organization_legal_name is null
        and trade_register_number is null
      )
      or
      (
        account_type in ('zakelijk', 'vve')
        and declaration_kind = 'organization'
        and person_first_name is null
        and person_last_name is null
        and person_full_name is null
        and organization_classification =
          case account_type when 'zakelijk' then 'business' else 'vve' end
        and organization_legal_name is not null
        and btrim(organization_legal_name) <> ''
        and trade_register_number ~ '^[0-9]{8}$'
      )
    )
);

create index app_party_declaration_sources_customer_id_idx
  on public.app_party_declaration_sources (customer_id);

create index app_party_declaration_sources_declared_at_idx
  on public.app_party_declaration_sources (declared_at);

create or replace function public.app_party_declaration_sources_immutable_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'app_party_declaration_sources rows are immutable and cannot be changed';
end;
$$;

create trigger trg_app_party_declaration_sources_immutable_guard
before update or delete on public.app_party_declaration_sources
for each row
execute function public.app_party_declaration_sources_immutable_guard();

create trigger trg_app_party_declaration_sources_truncate_guard
before truncate on public.app_party_declaration_sources
for each statement
execute function public.app_party_declaration_sources_immutable_guard();

alter table public.app_party_declaration_sources enable row level security;

create policy deny_all
on public.app_party_declaration_sources
for all
to anon, authenticated
using (false)
with check (false);

revoke all on table public.app_party_declaration_sources from public;
revoke all on table public.app_party_declaration_sources from anon;
revoke all on table public.app_party_declaration_sources from authenticated;
revoke all on table public.app_party_declaration_sources from service_role;

grant select, insert
on table public.app_party_declaration_sources
to service_role;

revoke all
on function public.app_party_declaration_sources_immutable_guard()
from public;
revoke all
on function public.app_party_declaration_sources_immutable_guard()
from anon;
revoke all
on function public.app_party_declaration_sources_immutable_guard()
from authenticated;
revoke all
on function public.app_party_declaration_sources_immutable_guard()
from service_role;

comment on table public.app_party_declaration_sources is
'Immutable applicant-declared party facts captured by the current direct signup transaction. Declaration is not verification, representation, mandate, address, EAN/aangeslotene, ownership, eligibility, evidence acceptance, verifier acceptance or NEa acceptance.';

comment on column public.app_party_declaration_sources.valid_from is
'ENVAL declaration validity starts at the server-side recording timestamp. This does not prove any earlier external or legal validity.';

comment on column public.app_party_declaration_sources.trade_register_number is
'Exactly eight applicant-declared digits. This is not a verified KvK or register fact.';

create or replace function public.app_submit_signup_v4(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_scope text;
  v_key text;
  v_payload_hash text;
  v_request_id text;
  v_environment text;
  v_actor_ref text;
  v_ip_hash text;
  v_user_agent_hash text;
  v_email text;
  v_account_type text;
  v_display_name text;
  v_declaration jsonb;
  v_declaration_kind text;
  v_person_first_name text;
  v_person_last_name text;
  v_person_full_name text;
  v_organization_classification text;
  v_organization_legal_name text;
  v_trade_register_number text;
  v_expires_at timestamptz;
  v_idempotency public.app_idempotency_keys%rowtype;
  v_customer_id uuid;
  v_dossier_id uuid;
  v_source_id uuid;
  v_customer_event_type text := 'customer_matched';
  v_location jsonb;
  v_charger jsonb;
  v_acceptance jsonb;
  v_location_id uuid;
  v_charger_id uuid;
  v_location_count integer := 0;
  v_charger_count integer := 0;
  v_document_slot_count integer := 0;
  v_legal_acceptance_count integer := 0;
  v_client_location_ids text[] := array[]::text[];
  v_client_charger_ids text[] := array[]::text[];
  v_document_types text[] := array[]::text[];
  v_acceptance_types text[] := array[]::text[];
  v_response_body jsonb;
  v_failure_stage text :=
    pg_catalog.current_setting('enval.proof_failure_stage', true);
begin
  if p_request is null
     or pg_catalog.jsonb_typeof(p_request) <> 'object' then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 400,
      'code', 'invalid_signup_contract',
      'message', 'Controleer de aanvraag.'
    );
  end if;

  v_scope := pg_catalog.btrim(p_request ->> 'idempotency_scope');
  v_key := pg_catalog.btrim(p_request ->> 'idempotency_key');
  v_payload_hash := pg_catalog.lower(
    pg_catalog.btrim(p_request ->> 'payload_hash')
  );
  v_request_id := pg_catalog.btrim(p_request ->> 'request_id');
  v_environment := pg_catalog.btrim(p_request ->> 'environment');
  v_actor_ref := pg_catalog.btrim(p_request ->> 'actor_ref');
  v_ip_hash := nullif(
    pg_catalog.lower(pg_catalog.btrim(p_request ->> 'ip_hash')),
    ''
  );
  v_user_agent_hash := nullif(
    pg_catalog.lower(pg_catalog.btrim(p_request ->> 'user_agent_hash')),
    ''
  );
  v_email := pg_catalog.lower(pg_catalog.btrim(p_request ->> 'email_normalized'));
  v_account_type := pg_catalog.btrim(p_request ->> 'account_type');
  v_display_name := pg_catalog.btrim(p_request ->> 'display_name');
  v_declaration := p_request -> 'declaration';

  begin
    v_expires_at := (p_request ->> 'idempotency_expires_at')::timestamptz;
  exception
    when others then
      v_expires_at := null;
  end;

  if v_scope <> 'api-app-signup-submit:v3'
     or v_key is null
     or v_key = ''
     or v_payload_hash !~ '^[0-9a-f]{64}$'
     or v_request_id is null
     or v_request_id = ''
     or v_environment is null
     or v_environment = ''
     or v_actor_ref <> 'api-app-signup-submit'
     or v_email is null
     or v_email = ''
     or pg_catalog.strpos(v_email, '@') <= 1
     or v_account_type not in ('particulier', 'zakelijk', 'vve')
     or v_display_name is null
     or v_display_name = ''
     or v_expires_at is null
     or v_expires_at <= v_now
     or (
       v_ip_hash is not null
       and v_ip_hash !~ '^[0-9a-f]{64}$'
     )
     or (
       v_user_agent_hash is not null
       and v_user_agent_hash !~ '^[0-9a-f]{64}$'
     )
     or v_declaration is null
     or pg_catalog.jsonb_typeof(v_declaration) <> 'object'
     or pg_catalog.jsonb_typeof(p_request -> 'locations') <> 'array'
     or pg_catalog.jsonb_array_length(p_request -> 'locations') < 1
     or pg_catalog.jsonb_typeof(p_request -> 'legal_acceptances') <> 'array'
  then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 400,
      'code', 'invalid_signup_contract',
      'message', 'Controleer de aanvraag.'
    );
  end if;

  v_declaration_kind :=
    pg_catalog.btrim(v_declaration ->> 'declaration_kind');
  v_person_first_name := nullif(
    pg_catalog.btrim(v_declaration ->> 'person_first_name'),
    ''
  );
  v_person_last_name := nullif(
    pg_catalog.btrim(v_declaration ->> 'person_last_name'),
    ''
  );
  v_person_full_name := nullif(
    pg_catalog.btrim(v_declaration ->> 'person_full_name'),
    ''
  );
  v_organization_classification := nullif(
    pg_catalog.btrim(v_declaration ->> 'organization_classification'),
    ''
  );
  v_organization_legal_name := nullif(
    pg_catalog.btrim(v_declaration ->> 'organization_legal_name'),
    ''
  );
  v_trade_register_number := nullif(
    pg_catalog.btrim(v_declaration ->> 'trade_register_number'),
    ''
  );

  if (
    v_account_type = 'particulier'
    and (
      v_declaration_kind <> 'natural_person'
      or v_person_first_name is null
      or v_person_last_name is null
      or v_person_full_name is distinct from
        v_person_first_name || ' ' || v_person_last_name
      or v_display_name is distinct from v_person_full_name
      or v_organization_classification is not null
      or v_organization_legal_name is not null
      or v_trade_register_number is not null
    )
  ) or (
    v_account_type in ('zakelijk', 'vve')
    and (
      v_declaration_kind <> 'organization'
      or v_person_first_name is not null
      or v_person_last_name is not null
      or v_person_full_name is not null
      or v_organization_classification is distinct from
        case v_account_type
          when 'zakelijk' then 'business'
          else 'vve'
        end
      or v_organization_legal_name is null
      or v_trade_register_number !~ '^[0-9]{8}$'
      or v_display_name is distinct from v_organization_legal_name
    )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 400,
      'code', 'invalid_signup_contract',
      'message', 'Controleer de aanvrager- of organisatiegegevens.'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'app_submit_signup_v4:idempotency:' || v_scope || ':' || v_key,
      0
    )
  );

  select i.*
    into v_idempotency
  from public.app_idempotency_keys i
  where i.scope = v_scope
    and i.key = v_key
  for update;

  if found then
    if v_idempotency.payload_hash <> v_payload_hash then
      insert into public.app_intake_audit_events (
        event_type,
        request_id,
        idempotency_key,
        actor_type,
        actor_ref,
        ip_hash,
        user_agent_hash,
        event_data,
        created_at
      )
      values (
        'signup_submit_idempotency_conflict',
        v_request_id,
        v_key,
        'edge_function',
        v_actor_ref,
        v_ip_hash,
        v_user_agent_hash,
        pg_catalog.jsonb_build_object(
          'reason', 'idempotency_conflict',
          'scope', v_scope,
          'environment', v_environment
        ),
        v_now
      );

      return pg_catalog.jsonb_build_object(
        'ok', false,
        'status', 409,
        'code', 'idempotency_conflict',
        'message', 'Deze aanvraag hoort bij een andere payload.'
      );
    end if;

    if (v_idempotency.response_status is null)
         <> (v_idempotency.response_body is null) then
      raise exception 'signup idempotency response state invalid';
    end if;

    if v_idempotency.response_status is not null then
      return pg_catalog.jsonb_build_object(
        'ok', true,
        'status', v_idempotency.response_status,
        'replayed', true,
        'body', v_idempotency.response_body
      );
    end if;

    return pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 409,
      'code', 'request_in_progress',
      'message', 'Aanmelding wordt al verwerkt.'
    );
  end if;

  insert into public.app_idempotency_keys (
    scope,
    key,
    payload_hash,
    locked_at,
    expires_at,
    created_at
  )
  values (
    v_scope,
    v_key,
    v_payload_hash,
    v_now,
    v_expires_at,
    v_now
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'app_submit_signup_v4:email:' || v_email,
      0
    )
  );

  select i.customer_id
    into v_customer_id
  from public.app_customer_identities i
  where i.email_normalized = v_email
    and i.status = 'active'
  order by i.created_at, i.id
  limit 1
  for update;

  if not found then
    insert into public.app_customers (
      customer_type,
      display_name,
      preferred_language,
      primary_email_normalized,
      status,
      created_at,
      updated_at
    )
    values (
      v_account_type,
      v_display_name,
      'nl',
      v_email,
      'active',
      v_now,
      v_now
    )
    returning id into v_customer_id;

    v_customer_event_type := 'customer_created';

    if v_failure_stage = 'after_customer' then
      raise exception 'proof_failure_after_customer';
    end if;

    insert into public.app_customer_identities (
      customer_id,
      email_normalized,
      identity_provider,
      status,
      created_at
    )
    values (
      v_customer_id,
      v_email,
      'supabase',
      'active',
      v_now
    );
  elsif v_failure_stage = 'after_customer' then
    raise exception 'proof_failure_after_customer';
  end if;

  insert into public.app_customer_dossiers (
    customer_id,
    account_type,
    status,
    retention_class,
    submitted_at,
    created_at,
    updated_at
  )
  values (
    v_customer_id,
    v_account_type,
    'submitted',
    'standard',
    v_now,
    v_now,
    v_now
  )
  returning id into v_dossier_id;

  if v_failure_stage = 'after_dossier' then
    raise exception 'proof_failure_after_dossier';
  end if;

  for v_location in
    select value
    from pg_catalog.jsonb_array_elements(p_request -> 'locations')
  loop
    if pg_catalog.jsonb_typeof(v_location) <> 'object'
       or pg_catalog.btrim(v_location ->> 'client_location_id') = ''
       or pg_catalog.btrim(v_location ->> 'postcode_normalized') = ''
       or pg_catalog.btrim(v_location ->> 'house_number') = ''
       or pg_catalog.jsonb_typeof(v_location -> 'chargers') <> 'array'
       or pg_catalog.jsonb_array_length(v_location -> 'chargers') < 1
       or pg_catalog.btrim(v_location ->> 'client_location_id') =
         any(v_client_location_ids)
    then
      raise exception 'invalid normalized signup location';
    end if;

    v_client_location_ids := pg_catalog.array_append(
      v_client_location_ids,
      pg_catalog.btrim(v_location ->> 'client_location_id')
    );

    insert into public.app_dossier_locations (
      dossier_id,
      client_location_id,
      label,
      status,
      postcode_normalized,
      house_number,
      suffix_normalized,
      street,
      city,
      country,
      lookup_provider,
      lookup_provider_id,
      lookup_metadata,
      created_at,
      updated_at
    )
    values (
      v_dossier_id,
      pg_catalog.btrim(v_location ->> 'client_location_id'),
      nullif(pg_catalog.btrim(v_location ->> 'label'), ''),
      'submitted',
      pg_catalog.btrim(v_location ->> 'postcode_normalized'),
      pg_catalog.btrim(v_location ->> 'house_number'),
      nullif(pg_catalog.btrim(v_location ->> 'suffix_normalized'), ''),
      nullif(pg_catalog.btrim(v_location ->> 'street'), ''),
      nullif(pg_catalog.btrim(v_location ->> 'city'), ''),
      coalesce(
        nullif(pg_catalog.btrim(v_location ->> 'country'), ''),
        'Nederland'
      ),
      nullif(pg_catalog.btrim(v_location ->> 'lookup_provider'), ''),
      nullif(pg_catalog.btrim(v_location ->> 'lookup_provider_id'), ''),
      coalesce(v_location -> 'lookup_metadata', '{}'::jsonb),
      v_now,
      v_now
    )
    returning id into v_location_id;

    v_location_count := v_location_count + 1;

    for v_charger in
      select value
      from pg_catalog.jsonb_array_elements(v_location -> 'chargers')
    loop
      if pg_catalog.jsonb_typeof(v_charger) <> 'object'
         or pg_catalog.btrim(v_charger ->> 'client_charger_id') = ''
         or pg_catalog.btrim(v_charger ->> 'mid_number') = ''
         or pg_catalog.btrim(v_charger ->> 'client_charger_id') =
           any(v_client_charger_ids)
         or (
           v_charger ->> 'installation_year' is not null
           and (
             (v_charger ->> 'installation_year') !~ '^[0-9]{4}$'
             or (v_charger ->> 'installation_year')::integer
               not between 1990 and 2050
           )
         )
      then
        raise exception 'invalid normalized signup charger';
      end if;

      v_client_charger_ids := pg_catalog.array_append(
        v_client_charger_ids,
        pg_catalog.btrim(v_charger ->> 'client_charger_id')
      );

      insert into public.app_dossier_chargers (
        dossier_id,
        location_id,
        client_charger_id,
        status,
        brand_id,
        brand_label,
        manual_brand,
        model_id,
        model_label,
        manual_model,
        serial_number,
        mid_number,
        mid_status,
        backend_supplier_id,
        backend_supplier_label,
        manual_backend_supplier,
        installation_year,
        solar_export_status,
        created_at,
        updated_at
      )
      values (
        v_dossier_id,
        v_location_id,
        pg_catalog.btrim(v_charger ->> 'client_charger_id'),
        'submitted',
        nullif(pg_catalog.btrim(v_charger ->> 'brand_id'), ''),
        nullif(pg_catalog.btrim(v_charger ->> 'brand_label'), ''),
        nullif(pg_catalog.btrim(v_charger ->> 'manual_brand'), ''),
        nullif(pg_catalog.btrim(v_charger ->> 'model_id'), ''),
        nullif(pg_catalog.btrim(v_charger ->> 'model_label'), ''),
        nullif(pg_catalog.btrim(v_charger ->> 'manual_model'), ''),
        nullif(pg_catalog.btrim(v_charger ->> 'serial_number'), ''),
        pg_catalog.btrim(v_charger ->> 'mid_number'),
        'submitted',
        nullif(pg_catalog.btrim(v_charger ->> 'backend_supplier_id'), ''),
        nullif(pg_catalog.btrim(v_charger ->> 'backend_supplier_label'), ''),
        nullif(
          pg_catalog.btrim(v_charger ->> 'manual_backend_supplier'),
          ''
        ),
        nullif(v_charger ->> 'installation_year', '')::integer,
        nullif(pg_catalog.btrim(v_charger ->> 'solar_export_status'), ''),
        v_now,
        v_now
      )
      returning id into v_charger_id;

      v_charger_count := v_charger_count + 1;

      insert into public.app_dossier_document_slots (
        dossier_id,
        location_id,
        charger_id,
        client_slot_id,
        document_type,
        status,
        required,
        title,
        metadata,
        created_at,
        updated_at
      )
      values
      (
        v_dossier_id,
        v_location_id,
        v_charger_id,
        'charger-' ||
          pg_catalog.btrim(v_charger ->> 'client_charger_id') ||
          '-mid-evidence',
        'mid_meter_evidence',
        'expected',
        true,
        'MID bewijs laadpaal',
        pg_catalog.jsonb_build_object(
          'source', 'signup_submit',
          'client_location_id',
            pg_catalog.btrim(v_location ->> 'client_location_id'),
          'client_charger_id',
            pg_catalog.btrim(v_charger ->> 'client_charger_id')
        ),
        v_now,
        v_now
      ),
      (
        v_dossier_id,
        v_location_id,
        v_charger_id,
        'charger-' ||
          pg_catalog.btrim(v_charger ->> 'client_charger_id') ||
          '-invoice-or-ownership',
        'invoice_or_ownership_evidence',
        'expected',
        true,
        'Factuur of eigendomsbewijs laadpaal',
        pg_catalog.jsonb_build_object(
          'source', 'signup_submit',
          'client_location_id',
            pg_catalog.btrim(v_location ->> 'client_location_id'),
          'client_charger_id',
            pg_catalog.btrim(v_charger ->> 'client_charger_id')
        ),
        v_now,
        v_now
      );

      v_document_slot_count := v_document_slot_count + 2;
    end loop;
  end loop;

  insert into public.app_dossier_document_slots (
    dossier_id,
    location_id,
    charger_id,
    client_slot_id,
    document_type,
    status,
    required,
    title,
    metadata,
    created_at,
    updated_at
  )
  values (
    v_dossier_id,
    null,
    null,
    'dossier-contract-or-mandate',
    'mandate_or_authorization',
    'expected',
    true,
    'Machtiging of akkoord voor verwerking',
    pg_catalog.jsonb_build_object('source', 'signup_submit'),
    v_now,
    v_now
  );

  v_document_slot_count := v_document_slot_count + 1;
  v_document_types := array[
    'invoice_or_ownership_evidence',
    'mandate_or_authorization',
    'mid_meter_evidence'
  ];

  for v_acceptance in
    select value
    from pg_catalog.jsonb_array_elements(p_request -> 'legal_acceptances')
  loop
    if pg_catalog.jsonb_typeof(v_acceptance) <> 'object'
       or pg_catalog.btrim(v_acceptance ->> 'acceptance_type') not in (
         'consent_bundle',
         'fee_terms',
         'privacy_terms',
         'service_terms',
         'mandate_authorization'
       )
       or pg_catalog.btrim(v_acceptance ->> 'version_ref') = ''
       or (
         nullif(pg_catalog.btrim(v_acceptance ->> 'version_hash'), '')
           is not null
         and pg_catalog.lower(
           pg_catalog.btrim(v_acceptance ->> 'version_hash')
         ) !~ '^[0-9a-f]{64}$'
       )
       or (
         pg_catalog.btrim(v_acceptance ->> 'acceptance_type') || '|' ||
         pg_catalog.btrim(v_acceptance ->> 'version_ref')
       ) = any(v_acceptance_types)
    then
      raise exception 'invalid normalized signup legal acceptance';
    end if;

    v_acceptance_types := pg_catalog.array_append(
      v_acceptance_types,
      pg_catalog.btrim(v_acceptance ->> 'acceptance_type') || '|' ||
        pg_catalog.btrim(v_acceptance ->> 'version_ref')
    );

    insert into public.app_dossier_legal_acceptances (
      dossier_id,
      customer_id,
      acceptance_type,
      status,
      version_ref,
      version_hash,
      accepted_at,
      actor_type,
      actor_ref,
      ip_hash,
      user_agent_hash,
      evidence_data,
      created_at,
      updated_at
    )
    values (
      v_dossier_id,
      v_customer_id,
      pg_catalog.btrim(v_acceptance ->> 'acceptance_type'),
      'accepted',
      pg_catalog.btrim(v_acceptance ->> 'version_ref'),
      nullif(
        pg_catalog.lower(
          pg_catalog.btrim(v_acceptance ->> 'version_hash')
        ),
        ''
      ),
      v_now,
      'customer',
      v_customer_id::text,
      v_ip_hash,
      v_user_agent_hash,
      pg_catalog.jsonb_build_object(
        'source', 'signup_submit',
        'accepted', true
      ),
      v_now,
      v_now
    );

    v_legal_acceptance_count := v_legal_acceptance_count + 1;
  end loop;

  if not exists (
    select 1
    from pg_catalog.unnest(v_acceptance_types) value
    where value like 'consent_bundle|%'
  ) or not exists (
    select 1
    from pg_catalog.unnest(v_acceptance_types) value
    where value like 'fee_terms|%'
  ) then
    raise exception 'required legal acceptance missing';
  end if;

  if v_failure_stage = 'after_underlying_objects' then
    raise exception 'proof_failure_after_underlying_objects';
  end if;

  insert into public.app_party_declaration_sources (
    customer_id,
    dossier_id,
    account_type,
    declaration_kind,
    declared_at,
    valid_from,
    created_at,
    person_first_name,
    person_last_name,
    person_full_name,
    organization_classification,
    organization_legal_name,
    trade_register_number,
    source_type,
    source_request_id,
    source_payload_sha256,
    declarative_actor_ref,
    environment
  )
  values (
    v_customer_id,
    v_dossier_id,
    v_account_type,
    v_declaration_kind,
    v_now,
    v_now,
    v_now,
    v_person_first_name,
    v_person_last_name,
    v_person_full_name,
    v_organization_classification,
    v_organization_legal_name,
    v_trade_register_number,
    'signup_applicant_declaration',
    v_request_id,
    v_payload_hash,
    'anonymous_signup_applicant',
    v_environment
  )
  returning id into v_source_id;

  if v_failure_stage = 'after_declaration_source' then
    raise exception 'proof_failure_after_declaration_source';
  end if;

  insert into public.app_audit_events (
    event_type,
    scope_type,
    scope_id,
    customer_id,
    dossier_id,
    request_id,
    idempotency_key,
    actor_type,
    actor_ref,
    ip_hash,
    user_agent_hash,
    event_data,
    created_at
  )
  values
  (
    v_customer_event_type,
    'customer',
    v_customer_id,
    v_customer_id,
    null,
    v_request_id,
    v_key,
    'edge_function',
    v_actor_ref,
    v_ip_hash,
    v_user_agent_hash,
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'account_type', v_account_type,
      'matched_by',
        case
          when v_customer_event_type = 'customer_matched'
          then 'email_normalized'
          else null
        end,
      'environment', v_environment
    )),
    v_now
  ),
  (
    'dossier_created',
    'dossier',
    v_dossier_id,
    v_customer_id,
    v_dossier_id,
    v_request_id,
    v_key,
    'edge_function',
    v_actor_ref,
    v_ip_hash,
    v_user_agent_hash,
    pg_catalog.jsonb_build_object(
      'account_type', v_account_type,
      'status', 'submitted',
      'retention_class', 'standard',
      'environment', v_environment
    ),
    v_now
  ),
  (
    'locations_created',
    'dossier',
    v_dossier_id,
    v_customer_id,
    v_dossier_id,
    v_request_id,
    v_key,
    'edge_function',
    v_actor_ref,
    v_ip_hash,
    v_user_agent_hash,
    pg_catalog.jsonb_build_object(
      'count', v_location_count,
      'client_location_ids', pg_catalog.to_jsonb(v_client_location_ids),
      'environment', v_environment
    ),
    v_now
  ),
  (
    'chargers_created',
    'dossier',
    v_dossier_id,
    v_customer_id,
    v_dossier_id,
    v_request_id,
    v_key,
    'edge_function',
    v_actor_ref,
    v_ip_hash,
    v_user_agent_hash,
    pg_catalog.jsonb_build_object(
      'count', v_charger_count,
      'client_charger_ids', pg_catalog.to_jsonb(v_client_charger_ids),
      'environment', v_environment
    ),
    v_now
  ),
  (
    'document_slots_created',
    'dossier',
    v_dossier_id,
    v_customer_id,
    v_dossier_id,
    v_request_id,
    v_key,
    'edge_function',
    v_actor_ref,
    v_ip_hash,
    v_user_agent_hash,
    pg_catalog.jsonb_build_object(
      'count', v_document_slot_count,
      'document_types', pg_catalog.to_jsonb(v_document_types),
      'environment', v_environment
    ),
    v_now
  ),
  (
    'legal_acceptances_created',
    'dossier',
    v_dossier_id,
    v_customer_id,
    v_dossier_id,
    v_request_id,
    v_key,
    'edge_function',
    v_actor_ref,
    v_ip_hash,
    v_user_agent_hash,
    pg_catalog.jsonb_build_object(
      'count', v_legal_acceptance_count,
      'acceptance_types',
        pg_catalog.to_jsonb(
          array(
            select pg_catalog.split_part(value, '|', 1)
            from pg_catalog.unnest(v_acceptance_types) value
            order by value
          )
        ),
      'environment', v_environment
    ),
    v_now
  ),
  (
    'signup_party_declaration_recorded',
    'dossier',
    v_dossier_id,
    v_customer_id,
    v_dossier_id,
    v_request_id,
    v_key,
    'edge_function',
    v_actor_ref,
    v_ip_hash,
    v_user_agent_hash,
    pg_catalog.jsonb_build_object(
      'request_id', v_request_id,
      'customer_reference', v_customer_id,
      'dossier_reference', v_dossier_id,
      'declaration_kind', v_declaration_kind,
      'account_type', v_account_type,
      'source_reference', v_source_id,
      'outcome', 'created',
      'payload_hash', v_payload_hash,
      'environment', v_environment,
      'recorded_at', v_now
    ),
    v_now
  );

  insert into public.app_intake_audit_events (
    event_type,
    request_id,
    idempotency_key,
    actor_type,
    actor_ref,
    ip_hash,
    user_agent_hash,
    event_data,
    created_at
  )
  values (
    'signup_submit_write_accepted',
    v_request_id,
    v_key,
    'edge_function',
    v_actor_ref,
    v_ip_hash,
    v_user_agent_hash,
    pg_catalog.jsonb_build_object(
      'account_type', v_account_type,
      'customer_id', v_customer_id,
      'dossier_id', v_dossier_id,
      'declaration_source_id', v_source_id,
      'scope', v_scope,
      'mode', 'write_v3',
      'location_count', v_location_count,
      'charger_count', v_charger_count,
      'document_slot_count', v_document_slot_count,
      'legal_acceptance_count', v_legal_acceptance_count,
      'payload_hash', v_payload_hash,
      'environment', v_environment
    ),
    v_now
  );

  v_response_body := pg_catalog.jsonb_build_object(
    'ok', true,
    'mode', 'write_v3',
    'request_id', v_request_id,
    'customer_id', v_customer_id,
    'dossier_id', v_dossier_id,
    'location_count', v_location_count,
    'charger_count', v_charger_count,
    'document_slot_count', v_document_slot_count,
    'legal_acceptance_count', v_legal_acceptance_count,
    'payload_hash', v_payload_hash,
    'message',
      'Foundation submit geaccepteerd; dossier shell, locaties, laadpalen, document-slots en juridische acceptaties zijn aangemaakt. Uploadverwerking is nog niet geimplementeerd.'
  );

  if v_failure_stage = 'before_idempotency_completion' then
    raise exception 'proof_failure_before_idempotency_completion';
  end if;

  update public.app_idempotency_keys
  set response_status = 200,
      response_body = v_response_body,
      completed_at = v_now
  where scope = v_scope
    and key = v_key
    and payload_hash = v_payload_hash
    and response_status is null
    and response_body is null;

  if not found then
    raise exception 'signup idempotency completion failed';
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'status', 200,
    'replayed', false,
    'body', v_response_body
  );
end;
$$;

revoke all on function public.app_submit_signup_v4(jsonb) from public;
revoke all on function public.app_submit_signup_v4(jsonb) from anon;
revoke all on function public.app_submit_signup_v4(jsonb) from authenticated;
revoke all on function public.app_submit_signup_v4(jsonb) from service_role;
grant execute on function public.app_submit_signup_v4(jsonb) to service_role;

comment on function public.app_submit_signup_v4(jsonb) is
'Service-role-only atomic current direct signup. All business, declaration, audit and idempotency writes succeed or roll back together; public response mode remains write_v3.';

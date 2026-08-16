-- ENVAL PILOT-CONNECTION-01B assisted connection capture correction.
-- Date: 2026-07-30
--
-- A location may enter the initial signup without a confirmed EAN. A source
-- row is created only for an explicitly customer-confirmed EAN. Parser output
-- remains observed/derived until that confirmation. Network operator and
-- connection-period claims are not required customer input.

alter table public.app_connection_declaration_sources
  alter column network_operator_declared drop not null,
  alter column claimed_valid_from drop not null;

alter table public.app_connection_declaration_sources
  drop constraint app_connection_declaration_sources_network_operator_chk,
  drop constraint app_connection_declaration_sources_claimed_period_chk;

alter table public.app_connection_declaration_sources
  add column capture_method text,
  add column customer_confirmed_at timestamptz;

-- PILOT-CONNECTION-01 is LOCAL ONLY and its real source table is empty before
-- this correction. These NOT NULL changes therefore require no UPDATE or
-- invented backfill of an existing declaration fact.
alter table public.app_connection_declaration_sources
  alter column capture_method set not null,
  alter column customer_confirmed_at set not null;

alter table public.app_connection_declaration_sources
  add constraint app_connection_declaration_sources_network_operator_chk
    check (
      network_operator_declared is null
      or (
        network_operator_declared <> ''
        and network_operator_declared =
          pg_catalog.regexp_replace(
            pg_catalog.btrim(network_operator_declared),
            '[[:space:]]+',
            ' ',
            'g'
          )
      )
    ),
  add constraint app_connection_declaration_sources_claimed_period_chk
    check (
      (
        claimed_valid_from is null
        and claimed_valid_to is null
      )
      or (
        claimed_valid_from is not null
        and (
          claimed_valid_to is null
          or claimed_valid_to >= claimed_valid_from
        )
      )
    ),
  add constraint app_connection_declaration_sources_capture_method_chk
    check (
      capture_method in (
        'energy_document_customer_confirmed',
        'manual_customer_confirmed'
      )
    ),
  add constraint app_connection_declaration_sources_confirmation_chk
    check (
      customer_confirmed_at = declared_at
      and customer_confirmed_at = valid_from
      and customer_confirmed_at = created_at
    );

comment on table public.app_connection_declaration_sources is
'Immutable customer-confirmed declared EAN source per signup dossier location. The optional network-operator and claimed-period columns are not required signup input. This source is not parser-observed truth, an accepted canonical connection or location, CAR result, aangeslotene/ownership decision, mandate, role or eligibility truth.';

comment on column
  public.app_connection_declaration_sources.network_operator_declared is
'Optional normalized customer-declared network-operator text. Signup does not require it and no derivation or verification is claimed.';

comment on column
  public.app_connection_declaration_sources.claimed_valid_from is
'Optional exceptional customer claim about a connection-period start. It is not a mandate start and signup does not require it.';

comment on column
  public.app_connection_declaration_sources.claimed_valid_to is
'Optional exceptional customer claim about a connection-period end. It is not mandate or calendar-year validity and signup does not require it.';

comment on column
  public.app_connection_declaration_sources.capture_method is
'Bounded acquisition method: energy_document_customer_confirmed or manual_customer_confirmed. No API, registry or verified claim.';

comment on column
  public.app_connection_declaration_sources.customer_confirmed_at is
'Server-recorded declared-boundary timestamp after explicit customer confirmation. Parser candidates before confirmation remain observed/derived and create no row.';

create or replace function public.app_submit_signup_v5(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_v4_result jsonb;
  v_response_body jsonb;
  v_customer_id uuid;
  v_dossier_id uuid;
  v_request_id text;
  v_idempotency_key text;
  v_payload_hash text;
  v_environment text;
  v_actor_ref text;
  v_ip_hash text;
  v_user_agent_hash text;
  v_failure_stage text :=
    pg_catalog.current_setting('enval.proof_failure_stage', true);
  v_location jsonb;
  v_connection_declaration jsonb;
  v_client_location_id text;
  v_ean text;
  v_capture_method text;
  v_customer_confirmed boolean;
  v_dossier_location_id uuid;
  v_source_id uuid;
  v_existing public.app_connection_declaration_sources%rowtype;
  v_outcome text;
  v_now timestamptz;
  v_source_count integer := 0;
  v_expected_source_count integer := 0;
begin
  if p_request is null
     or pg_catalog.jsonb_typeof(p_request) <> 'object'
     or pg_catalog.jsonb_typeof(p_request -> 'locations') <> 'array'
     or pg_catalog.jsonb_array_length(p_request -> 'locations') < 1
  then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 400,
      'code', 'invalid_signup_contract',
      'message', 'Controleer de aansluitgegevens van iedere locatie.'
    );
  end if;

  v_request_id := pg_catalog.btrim(p_request ->> 'request_id');
  v_idempotency_key :=
    pg_catalog.btrim(p_request ->> 'idempotency_key');
  v_payload_hash := pg_catalog.lower(
    pg_catalog.btrim(p_request ->> 'payload_hash')
  );
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

  for v_location in
    select value
    from pg_catalog.jsonb_array_elements(p_request -> 'locations')
  loop
    if pg_catalog.jsonb_typeof(v_location) <> 'object' then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'status', 400,
        'code', 'invalid_signup_contract',
        'message', 'Controleer de aansluitgegevens van iedere locatie.'
      );
    end if;

    v_client_location_id :=
      pg_catalog.btrim(v_location ->> 'client_location_id');
    v_connection_declaration := v_location -> 'connection_declaration';

    if v_client_location_id is null or v_client_location_id = '' then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'status', 400,
        'code', 'invalid_signup_contract',
        'message', 'Controleer de aansluitgegevens van iedere locatie.'
      );
    end if;

    if v_connection_declaration is null
       or v_connection_declaration = 'null'::jsonb
    then
      continue;
    end if;

    if pg_catalog.jsonb_typeof(v_connection_declaration) <> 'object' then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'status', 400,
        'code', 'invalid_signup_contract',
        'message', 'Controleer de bevestigde EAN van iedere locatie.'
      );
    end if;

    v_ean :=
      pg_catalog.btrim(v_connection_declaration ->> 'ean_normalized');
    v_capture_method :=
      pg_catalog.btrim(v_connection_declaration ->> 'capture_method');
    begin
      v_customer_confirmed :=
        coalesce(
          (v_connection_declaration ->> 'customer_confirmed')::boolean,
          false
        );
    exception
      when others then
        v_customer_confirmed := false;
    end;

    if v_ean is null
       or v_ean !~ '^[0-9]{18}$'
       or v_capture_method is null
       or v_capture_method not in (
         'energy_document_customer_confirmed',
         'manual_customer_confirmed'
       )
       or v_customer_confirmed is not true
    then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'status', 400,
        'code', 'invalid_signup_contract',
        'message', 'Controleer en bevestig de EAN van iedere locatie.'
      );
    end if;

    v_expected_source_count := v_expected_source_count + 1;
  end loop;

  v_v4_result := public.app_submit_signup_v4(p_request);

  if coalesce((v_v4_result ->> 'ok')::boolean, false)
     is not true
  then
    return v_v4_result;
  end if;

  v_response_body := v_v4_result -> 'body';
  if pg_catalog.jsonb_typeof(v_response_body) <> 'object' then
    raise exception 'app_submit_signup_v5 v4 response body missing';
  end if;

  begin
    v_customer_id := (v_response_body ->> 'customer_id')::uuid;
    v_dossier_id := (v_response_body ->> 'dossier_id')::uuid;
  exception
    when others then
      raise exception 'app_submit_signup_v5 v4 references invalid';
  end;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'app_submit_signup_v5:dossier:' || v_dossier_id::text,
      0
    )
  );

  for v_location in
    select value
    from pg_catalog.jsonb_array_elements(p_request -> 'locations')
  loop
    v_connection_declaration := v_location -> 'connection_declaration';
    if v_connection_declaration is null
       or v_connection_declaration = 'null'::jsonb
    then
      continue;
    end if;

    v_client_location_id :=
      pg_catalog.btrim(v_location ->> 'client_location_id');
    v_ean :=
      pg_catalog.btrim(v_connection_declaration ->> 'ean_normalized');
    v_capture_method :=
      pg_catalog.btrim(v_connection_declaration ->> 'capture_method');

    select l.id
      into v_dossier_location_id
    from public.app_dossier_locations l
    where l.dossier_id = v_dossier_id
      and l.client_location_id = v_client_location_id
    for update;

    if v_dossier_location_id is null then
      raise exception
        'app_submit_signup_v5 dossier location resolution failed';
    end if;

    select s.*
      into v_existing
    from public.app_connection_declaration_sources s
    where s.dossier_location_id = v_dossier_location_id
    for update;

    if found then
      if v_existing.customer_id <> v_customer_id
         or v_existing.dossier_id <> v_dossier_id
         or v_existing.client_location_id <> v_client_location_id
         or v_existing.ean_normalized <> v_ean
         or v_existing.network_operator_declared is not null
         or v_existing.claimed_valid_from is not null
         or v_existing.claimed_valid_to is not null
         or v_existing.address_role <> 'connection_service_location'
         or v_existing.capture_method <> v_capture_method
         or v_existing.source_type <> 'signup_connection_declaration'
         or v_existing.source_payload_sha256 <> v_payload_hash
      then
        raise exception
          'app_submit_signup_v5 existing connection source mismatch';
      end if;

      v_source_id := v_existing.id;
      v_outcome := 'resolved';
    else
      v_now := pg_catalog.clock_timestamp();

      insert into public.app_connection_declaration_sources (
        customer_id,
        dossier_id,
        dossier_location_id,
        client_location_id,
        ean_normalized,
        network_operator_declared,
        claimed_valid_from,
        claimed_valid_to,
        address_role,
        capture_method,
        customer_confirmed_at,
        declared_at,
        valid_from,
        source_type,
        source_request_id,
        source_payload_sha256,
        declarative_actor_ref,
        environment,
        created_at
      )
      values (
        v_customer_id,
        v_dossier_id,
        v_dossier_location_id,
        v_client_location_id,
        v_ean,
        null,
        null,
        null,
        'connection_service_location',
        v_capture_method,
        v_now,
        v_now,
        v_now,
        'signup_connection_declaration',
        v_request_id,
        v_payload_hash,
        'anonymous_signup_applicant',
        v_environment,
        v_now
      )
      returning id into v_source_id;

      v_outcome := 'created';
    end if;

    v_source_count := v_source_count + 1;

    if v_failure_stage = 'after_connection_sources' then
      raise exception 'proof_failure_after_connection_sources';
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
    values (
      'signup_connection_declaration_recorded',
      'location',
      v_dossier_location_id,
      v_customer_id,
      v_dossier_id,
      v_request_id,
      v_idempotency_key,
      'edge_function',
      v_actor_ref,
      v_ip_hash,
      v_user_agent_hash,
      pg_catalog.jsonb_build_object(
        'request_id', v_request_id,
        'customer_reference', v_customer_id,
        'dossier_reference', v_dossier_id,
        'location_reference', v_dossier_location_id,
        'connection_source_reference', v_source_id,
        'outcome', v_outcome,
        'capture_method', v_capture_method,
        'customer_confirmed', true,
        'network_operator_present', false,
        'claimed_period_present', false,
        'idempotency_correlation', v_idempotency_key,
        'recorded_at', pg_catalog.clock_timestamp()
      ),
      pg_catalog.clock_timestamp()
    );

    if v_failure_stage = 'during_connection_audit' then
      raise exception 'proof_failure_during_connection_audit';
    end if;
  end loop;

  if v_source_count <> v_expected_source_count then
    raise exception 'app_submit_signup_v5 connection source count mismatch';
  end if;

  return v_v4_result;
end;
$$;

revoke all
on function public.app_submit_signup_v5(jsonb)
from public;
revoke all
on function public.app_submit_signup_v5(jsonb)
from anon;
revoke all
on function public.app_submit_signup_v5(jsonb)
from authenticated;
revoke all
on function public.app_submit_signup_v5(jsonb)
from service_role;
grant execute
on function public.app_submit_signup_v5(jsonb)
to service_role;

comment on function public.app_submit_signup_v5(jsonb) is
'Service-role-only atomic signup wrapper. Calls app_submit_signup_v4; a missing confirmed EAN is a safe deferred state, while an explicitly customer-confirmed EAN records or resolves exactly one immutable declared source in the same transaction. Parser candidates alone create no source and the public write_v3 response remains unchanged.';

-- ENVAL PILOT-CONNECTION-01 atomic per-location declared connection capture.
-- Date: 2026-07-30
--
-- This purpose-specific source records customer-declared EAN, network operator
-- text and a claimed connection period for an existing signup dossier location.
-- It creates no accepted canonical connection/location, CAR result,
-- aangeslotene/ownership decision, mandate, role or eligibility truth.

create table public.app_connection_declaration_sources (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null
    references public.app_customers (id) on delete restrict,
  dossier_id uuid not null
    references public.app_customer_dossiers (id) on delete restrict,
  dossier_location_id uuid not null
    references public.app_dossier_locations (id) on delete restrict,
  client_location_id text not null,
  ean_normalized text not null,
  network_operator_declared text not null,
  claimed_valid_from date not null,
  claimed_valid_to date null,
  address_role text not null,
  declared_at timestamptz not null,
  valid_from timestamptz not null,
  source_type text not null,
  source_request_id text not null,
  source_payload_sha256 text not null,
  declarative_actor_ref text not null,
  environment text not null,
  created_at timestamptz not null,

  constraint app_connection_declaration_sources_location_key
    unique (dossier_location_id),

  constraint app_connection_declaration_sources_dossier_client_key
    unique (dossier_id, client_location_id),

  constraint app_connection_declaration_sources_request_location_key
    unique (source_type, source_request_id, client_location_id),

  constraint app_connection_declaration_sources_ean_chk
    check (ean_normalized ~ '^[0-9]{18}$'),

  constraint app_connection_declaration_sources_network_operator_chk
    check (
      network_operator_declared <> ''
      and network_operator_declared =
        pg_catalog.regexp_replace(
          pg_catalog.btrim(network_operator_declared),
          '[[:space:]]+',
          ' ',
          'g'
        )
    ),

  constraint app_connection_declaration_sources_claimed_period_chk
    check (
      claimed_valid_to is null
      or claimed_valid_to >= claimed_valid_from
    ),

  constraint app_connection_declaration_sources_address_role_chk
    check (address_role = 'connection_service_location'),

  constraint app_connection_declaration_sources_source_type_chk
    check (source_type = 'signup_connection_declaration'),

  constraint app_connection_declaration_sources_payload_sha256_chk
    check (source_payload_sha256 ~ '^[0-9a-f]{64}$'),

  constraint app_connection_declaration_sources_provenance_chk
    check (
      pg_catalog.btrim(client_location_id) <> ''
      and pg_catalog.btrim(source_request_id) <> ''
      and pg_catalog.btrim(declarative_actor_ref) <> ''
      and pg_catalog.btrim(environment) <> ''
    ),

  constraint app_connection_declaration_sources_validity_chk
    check (valid_from = declared_at and created_at = declared_at)
);

create index app_connection_declaration_sources_customer_id_idx
  on public.app_connection_declaration_sources (customer_id);

create index app_connection_declaration_sources_dossier_id_idx
  on public.app_connection_declaration_sources (dossier_id);

create index app_connection_declaration_sources_ean_idx
  on public.app_connection_declaration_sources (ean_normalized);

create or replace function
  public.app_connection_declaration_sources_boundary_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_dossier_customer_id uuid;
  v_location_dossier_id uuid;
  v_location_client_id text;
begin
  select d.customer_id
    into v_dossier_customer_id
  from public.app_customer_dossiers d
  where d.id = new.dossier_id;

  select l.dossier_id, l.client_location_id
    into v_location_dossier_id, v_location_client_id
  from public.app_dossier_locations l
  where l.id = new.dossier_location_id;

  if v_dossier_customer_id is null
     or v_location_dossier_id is null
     or v_dossier_customer_id <> new.customer_id
     or v_location_dossier_id <> new.dossier_id
     or v_location_client_id is distinct from new.client_location_id
  then
    raise exception
      'app_connection_declaration_sources customer/dossier/location boundary mismatch';
  end if;

  return new;
end;
$$;

create or replace function
  public.app_connection_declaration_sources_immutable_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'app_connection_declaration_sources rows are immutable and cannot be changed';
end;
$$;

create trigger trg_app_connection_declaration_sources_boundary_guard
before insert on public.app_connection_declaration_sources
for each row
execute function
  public.app_connection_declaration_sources_boundary_guard();

create trigger trg_app_connection_declaration_sources_immutable_guard
before update or delete on public.app_connection_declaration_sources
for each row
execute function
  public.app_connection_declaration_sources_immutable_guard();

create trigger trg_app_connection_declaration_sources_truncate_guard
before truncate on public.app_connection_declaration_sources
for each statement
execute function
  public.app_connection_declaration_sources_immutable_guard();

alter table public.app_connection_declaration_sources enable row level security;

create policy deny_all
on public.app_connection_declaration_sources
for all
to anon, authenticated
using (false)
with check (false);

revoke all
on table public.app_connection_declaration_sources
from public;
revoke all
on table public.app_connection_declaration_sources
from anon;
revoke all
on table public.app_connection_declaration_sources
from authenticated;
revoke all
on table public.app_connection_declaration_sources
from service_role;

grant select, insert
on table public.app_connection_declaration_sources
to service_role;

revoke all
on function public.app_connection_declaration_sources_boundary_guard()
from public;
revoke all
on function public.app_connection_declaration_sources_boundary_guard()
from anon;
revoke all
on function public.app_connection_declaration_sources_boundary_guard()
from authenticated;
revoke all
on function public.app_connection_declaration_sources_boundary_guard()
from service_role;

revoke all
on function public.app_connection_declaration_sources_immutable_guard()
from public;
revoke all
on function public.app_connection_declaration_sources_immutable_guard()
from anon;
revoke all
on function public.app_connection_declaration_sources_immutable_guard()
from authenticated;
revoke all
on function public.app_connection_declaration_sources_immutable_guard()
from service_role;

comment on table public.app_connection_declaration_sources is
'Immutable customer-declared EAN, network operator text and claimed period per signup dossier location. This source is not an accepted canonical connection or location, CAR result, aangeslotene/ownership decision, mandate, role or eligibility truth.';

comment on column
  public.app_connection_declaration_sources.ean_normalized is
'Customer-declared EAN with the CURRENT connection-foundation syntax of exactly 18 numeric digits. No checksum, registry, CAR or acceptance claim.';

comment on column
  public.app_connection_declaration_sources.claimed_valid_from is
'Customer-claimed connection-period start. It is separate from the server-side declaration timestamp and does not prove external validity.';

comment on column
  public.app_connection_declaration_sources.valid_from is
'Source validity begins at the exact server-side declaration timestamp and is separate from the customer-claimed connection period.';

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
  v_client_location_id text;
  v_ean text;
  v_network_operator text;
  v_claimed_valid_from date;
  v_claimed_valid_to date;
  v_dossier_location_id uuid;
  v_source_id uuid;
  v_existing public.app_connection_declaration_sources%rowtype;
  v_outcome text;
  v_now timestamptz;
  v_source_count integer := 0;
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
    v_client_location_id :=
      pg_catalog.btrim(v_location ->> 'client_location_id');
    v_ean := pg_catalog.btrim(v_location ->> 'ean_normalized');
    v_network_operator := pg_catalog.regexp_replace(
      pg_catalog.btrim(v_location ->> 'network_operator_declared'),
      '[[:space:]]+',
      ' ',
      'g'
    );

    begin
      v_claimed_valid_from :=
        (v_location ->> 'claimed_valid_from')::date;
      v_claimed_valid_to :=
        nullif(v_location ->> 'claimed_valid_to', '')::date;
    exception
      when others then
        return pg_catalog.jsonb_build_object(
          'ok', false,
          'status', 400,
          'code', 'invalid_signup_contract',
          'message', 'Controleer de opgegeven aansluitperiode.'
        );
    end;

    if pg_catalog.jsonb_typeof(v_location) <> 'object'
       or v_client_location_id is null
       or v_client_location_id = ''
       or v_ean !~ '^[0-9]{18}$'
       or v_network_operator is null
       or v_network_operator = ''
       or v_claimed_valid_from is null
       or (
         v_claimed_valid_to is not null
         and v_claimed_valid_to < v_claimed_valid_from
       )
    then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'status', 400,
        'code', 'invalid_signup_contract',
        'message', 'Controleer de aansluitgegevens van iedere locatie.'
      );
    end if;
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
    v_client_location_id :=
      pg_catalog.btrim(v_location ->> 'client_location_id');
    v_ean := pg_catalog.btrim(v_location ->> 'ean_normalized');
    v_network_operator := pg_catalog.regexp_replace(
      pg_catalog.btrim(v_location ->> 'network_operator_declared'),
      '[[:space:]]+',
      ' ',
      'g'
    );
    v_claimed_valid_from :=
      (v_location ->> 'claimed_valid_from')::date;
    v_claimed_valid_to :=
      nullif(v_location ->> 'claimed_valid_to', '')::date;

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
         or v_existing.network_operator_declared <> v_network_operator
         or v_existing.claimed_valid_from <> v_claimed_valid_from
         or v_existing.claimed_valid_to is distinct from v_claimed_valid_to
         or v_existing.address_role <> 'connection_service_location'
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
        v_network_operator,
        v_claimed_valid_from,
        v_claimed_valid_to,
        'connection_service_location',
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
        'claimed_valid_from_present', true,
        'claimed_valid_to_present', v_claimed_valid_to is not null,
        'idempotency_correlation', v_idempotency_key,
        'recorded_at', pg_catalog.clock_timestamp()
      ),
      pg_catalog.clock_timestamp()
    );

    if v_failure_stage = 'during_connection_audit' then
      raise exception 'proof_failure_during_connection_audit';
    end if;
  end loop;

  if v_source_count <>
    pg_catalog.jsonb_array_length(p_request -> 'locations')
  then
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
'Service-role-only atomic signup wrapper. Calls app_submit_signup_v4 and records or resolves exactly one immutable customer-declared connection source per dossier location in the same transaction. Public write_v3 response remains unchanged.';

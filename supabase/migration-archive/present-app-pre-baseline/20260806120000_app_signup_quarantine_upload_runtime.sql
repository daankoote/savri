-- ENVAL /app pre-auth signup quarantine upload runtime
-- Date: 2026-08-06
--
-- Forward-only extension of the 20260716100000 quarantine foundation.
-- Browser access remains Edge-only. These RPCs are service-role-only and create
-- no customer, identity, case, dossier, location, charger, acceptance, mandate,
-- signing-evidence, or OTP records.

alter table public.app_signup_intake_files
  add column revision_number integer not null default 1,
  add column supersedes_intake_file_id uuid null,
  add column superseded_at timestamptz null,
  add column superseded_by_intake_file_id uuid null,
  add column server_size_bytes bigint null,
  add column server_sha256 text null;

alter table public.app_signup_intake_files
  drop constraint app_signup_intake_files_intake_client_slot_key,
  drop constraint app_signup_intake_files_status_chk;

alter table public.app_signup_intake_files
  add constraint app_signup_intake_files_revision_positive_chk
    check (revision_number > 0),
  add constraint app_signup_intake_files_intake_slot_revision_key
    unique (intake_id, client_slot_id, revision_number),
  add constraint app_signup_intake_files_supersedes_fk
    foreign key (supersedes_intake_file_id)
    references public.app_signup_intake_files (id),
  add constraint app_signup_intake_files_superseded_by_fk
    foreign key (superseded_by_intake_file_id)
    references public.app_signup_intake_files (id)
    deferrable initially deferred,
  add constraint app_signup_intake_files_no_self_supersession_chk
    check (
      supersedes_intake_file_id is null or supersedes_intake_file_id <> id
    ),
  add constraint app_signup_intake_files_no_self_superseded_by_chk
    check (
      superseded_by_intake_file_id is null or superseded_by_intake_file_id <> id
    ),
  add constraint app_signup_intake_files_status_chk
    check (
      status in (
        'expected',
        'upload_issued',
        'uploaded_pending_confirm',
        'confirmed_quarantine',
        'superseded',
        'promoted',
        'rejected',
        'expired'
      )
    ),
  add constraint app_signup_intake_files_superseded_state_chk
    check (status <> 'superseded' or superseded_at is not null),
  add constraint app_signup_intake_files_server_size_bytes_chk
    check (server_size_bytes is null or server_size_bytes > 0),
  add constraint app_signup_intake_files_server_sha256_chk
    check (server_sha256 is null or server_sha256 ~ '^[0-9a-f]{64}$');

create unique index app_signup_intake_files_one_current_revision_idx
  on public.app_signup_intake_files (intake_id, client_slot_id)
  where status not in ('superseded', 'promoted', 'rejected', 'expired');

create index app_signup_intake_files_supersedes_idx
  on public.app_signup_intake_files (supersedes_intake_file_id)
  where supersedes_intake_file_id is not null;

alter table public.app_signup_intake_capabilities
  drop constraint app_signup_intake_capabilities_capability_type_chk,
  drop constraint app_signup_intake_capabilities_type_file_scope_chk;

alter table public.app_signup_intake_capabilities
  add constraint app_signup_intake_capabilities_capability_type_chk
    check (
      capability_type in (
        'intake_manage',
        'quarantine_upload',
        'email_verification'
      )
    ),
  add constraint app_signup_intake_capabilities_type_file_scope_chk
    check (
      (capability_type = 'quarantine_upload' and intake_file_id is not null)
      or (
        capability_type in ('intake_manage', 'email_verification')
        and intake_file_id is null
      )
    );

create unique index app_signup_intake_capabilities_one_manage_idx
  on public.app_signup_intake_capabilities (intake_id)
  where capability_type = 'intake_manage';

create or replace function public.app_signup_intake_files_transition_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.intake_id is distinct from old.intake_id
     or new.client_slot_id is distinct from old.client_slot_id
     or new.document_type is distinct from old.document_type
     or new.original_filename is distinct from old.original_filename
     or new.declared_mime_type is distinct from old.declared_mime_type
     or new.size_bytes is distinct from old.size_bytes
     or new.sha256 is distinct from old.sha256
     or new.storage_bucket is distinct from old.storage_bucket
     or new.storage_path is distinct from old.storage_path
     or new.expires_at is distinct from old.expires_at
     or new.created_at is distinct from old.created_at
     or new.revision_number is distinct from old.revision_number
     or new.supersedes_intake_file_id is distinct from old.supersedes_intake_file_id then
    raise exception 'immutable app_signup_intake_files identity fields cannot be changed';
  end if;

  if old.detected_mime_type is not null
     and new.detected_mime_type is distinct from old.detected_mime_type then
    raise exception 'observed app_signup_intake_files mime cannot be changed';
  end if;

  if old.server_size_bytes is not null
     and new.server_size_bytes is distinct from old.server_size_bytes then
    raise exception 'observed app_signup_intake_files size cannot be changed';
  end if;

  if old.server_sha256 is not null
     and new.server_sha256 is distinct from old.server_sha256 then
    raise exception 'observed app_signup_intake_files hash cannot be changed';
  end if;

  if old.confirmed_at is not null then
    if new.uploaded_at is distinct from old.uploaded_at
       or new.confirmed_at is distinct from old.confirmed_at then
      raise exception 'confirmed app_signup_intake_files metadata cannot be changed';
    end if;
  end if;

  if old.superseded_at is not null then
    if new.superseded_at is distinct from old.superseded_at
       or new.superseded_by_intake_file_id is distinct from old.superseded_by_intake_file_id then
      raise exception 'supersession metadata cannot be changed';
    end if;
  end if;

  if new.status is distinct from old.status then
    if old.status = 'expected' and new.status in ('upload_issued', 'rejected', 'expired', 'superseded') then
      return new;
    end if;
    if old.status = 'upload_issued' and new.status in ('uploaded_pending_confirm', 'confirmed_quarantine', 'rejected', 'expired', 'superseded') then
      return new;
    end if;
    if old.status = 'uploaded_pending_confirm' and new.status in ('confirmed_quarantine', 'rejected', 'expired', 'superseded') then
      return new;
    end if;
    if old.status = 'confirmed_quarantine' and new.status in ('promoted', 'rejected', 'expired', 'superseded') then
      return new;
    end if;
    raise exception 'invalid app_signup_intake_files status transition from % to %', old.status, new.status;
  end if;

  if old.status in ('superseded', 'promoted', 'rejected', 'expired') then
    raise exception 'terminal app_signup_intake_files rows cannot be updated';
  end if;

  return new;
end;
$$;

create or replace function public.app_signup_intake_capabilities_transition_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.intake_id is distinct from old.intake_id
     or new.intake_file_id is distinct from old.intake_file_id
     or new.capability_type is distinct from old.capability_type
     or new.token_sha256 is distinct from old.token_sha256
     or new.issued_at is distinct from old.issued_at
     or new.expires_at is distinct from old.expires_at
     or new.created_at is distinct from old.created_at then
    raise exception 'immutable app_signup_intake_capabilities fields cannot be changed';
  end if;

  if old.consumed_at is not null or old.invalidated_at is not null then
    raise exception 'terminal app_signup_intake_capabilities rows cannot be updated';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_app_signup_intake_capabilities_transition_guard
  on public.app_signup_intake_capabilities;

create trigger trg_app_signup_intake_capabilities_transition_guard
before update on public.app_signup_intake_capabilities
for each row
execute function public.app_signup_intake_capabilities_transition_guard();

create or replace function public.app_signup_quarantine_start_v1(
  p_account_type text,
  p_email_normalized text,
  p_payload_hash text,
  p_manage_token_sha256 text,
  p_intake_expires_at timestamptz,
  p_capability_expires_at timestamptz,
  p_request_id text,
  p_idempotency_key text,
  p_ip_hash text,
  p_user_agent_hash text,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_scope text := 'api-app-signup-intake-start:v1';
  v_inserted integer := 0;
  v_idem public.app_idempotency_keys%rowtype;
  v_intake_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if p_account_type not in ('particulier', 'zakelijk', 'vve')
     or p_email_normalized is null
     or p_email_normalized <> lower(btrim(p_email_normalized))
     or p_email_normalized !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_manage_token_sha256 !~ '^[0-9a-f]{64}$'
     or p_idempotency_key is null
     or btrim(p_idempotency_key) = '' then
    raise exception 'invalid signup intake start input';
  end if;

  if p_intake_expires_at <= v_now + interval '5 minutes'
     or p_intake_expires_at > v_now + interval '7 days'
     or p_capability_expires_at <= v_now + interval '5 minutes'
     or p_capability_expires_at > p_intake_expires_at then
    raise exception 'invalid signup intake expiry';
  end if;

  insert into public.app_idempotency_keys (
    scope, key, payload_hash, locked_at, expires_at
  ) values (
    v_scope, p_idempotency_key, p_payload_hash, v_now, v_now + interval '24 hours'
  ) on conflict (scope, key) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_idem
  from public.app_idempotency_keys
  where scope = v_scope and key = p_idempotency_key
  for update;

  if v_idem.payload_hash <> p_payload_hash then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'idempotency_conflict', 'error', 'Aanvraag is al gebruikt met andere inhoud.');
  end if;
  if v_idem.response_status is not null and v_idem.response_body is not null then
    return v_idem.response_body || jsonb_build_object('replayed', true);
  end if;
  if v_inserted = 0 then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'request_in_progress', 'error', 'Aanvraag wordt al verwerkt.');
  end if;

  insert into public.app_signup_intakes (
    id, status, submitted_payload, submitted_payload_sha256,
    accepted_legal_versions, email_normalized, request_id, expires_at
  ) values (
    v_intake_id, 'collecting', jsonb_build_object(
      'account_type', p_account_type,
      'email', p_email_normalized
    ),
    p_payload_hash, jsonb_build_object('items', jsonb_build_array()),
    p_email_normalized, p_request_id, p_intake_expires_at
  );

  insert into public.app_signup_intake_capabilities (
    intake_id, intake_file_id, capability_type, token_sha256,
    issued_at, expires_at
  ) values (
    v_intake_id, null, 'intake_manage', p_manage_token_sha256,
    v_now, p_capability_expires_at
  );

  insert into public.app_intake_audit_events (
    event_type, request_id, idempotency_key, actor_type, ip_hash,
    user_agent_hash, event_data
  ) values (
    'signup_intake_collecting_started', p_request_id, p_idempotency_key,
    'anonymous', p_ip_hash, p_user_agent_hash,
    jsonb_build_object(
      'environment', coalesce(p_environment, 'unknown'),
      'intake_reference', v_intake_id,
      'status', 'collecting'
    )
  );

  v_response := jsonb_build_object(
    'ok', true,
    'status', 201,
    'mode', 'signup_intake_start_v1',
    'request_id', p_request_id,
    'intake_reference', v_intake_id,
    'intake_expires_at', p_intake_expires_at,
    'capability_expires_at', p_capability_expires_at,
    'replayed', false
  );

  update public.app_idempotency_keys
  set response_status = 201, response_body = v_response, completed_at = v_now
  where scope = v_scope and key = p_idempotency_key;

  return v_response;
end;
$$;

create or replace function public.app_signup_quarantine_issue_v1(
  p_intake_id uuid,
  p_manage_token_sha256 text,
  p_client_slot_id text,
  p_document_type text,
  p_original_filename text,
  p_declared_mime_type text,
  p_size_bytes bigint,
  p_client_sha256 text,
  p_payload_hash text,
  p_upload_token_sha256 text,
  p_file_expires_at timestamptz,
  p_capability_expires_at timestamptz,
  p_request_id text,
  p_idempotency_key text,
  p_ip_hash text,
  p_user_agent_hash text,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_scope text := 'api-app-signup-upload-url:v1:' || p_intake_id::text || ':' || p_client_slot_id;
  v_inserted integer := 0;
  v_idem public.app_idempotency_keys%rowtype;
  v_intake public.app_signup_intakes%rowtype;
  v_manage public.app_signup_intake_capabilities%rowtype;
  v_current public.app_signup_intake_files%rowtype;
  v_file_id uuid := gen_random_uuid();
  v_revision integer;
  v_storage_path text;
  v_response jsonb;
begin
  if p_manage_token_sha256 !~ '^[0-9a-f]{64}$'
     or p_upload_token_sha256 !~ '^[0-9a-f]{64}$'
     or p_client_sha256 !~ '^[0-9a-f]{64}$'
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_client_slot_id is null or btrim(p_client_slot_id) = '' or length(p_client_slot_id) > 200
     or p_document_type not in ('organization_extract', 'energy_bill_or_contract', 'installation_invoice')
     or p_original_filename is null or btrim(p_original_filename) = '' or length(p_original_filename) > 180
     or p_original_filename ~ '[/\\]'
     or p_original_filename like '%..%'
     or lower(btrim(p_declared_mime_type)) <> 'application/pdf'
     or p_size_bytes <= 0 or p_size_bytes > 15728640
     or p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'invalid signup upload issue input';
  end if;

  if p_file_expires_at <= v_now + interval '5 minutes'
     or p_file_expires_at > v_now + interval '24 hours'
     or p_capability_expires_at <= v_now + interval '5 minutes'
     or p_capability_expires_at > p_file_expires_at then
    raise exception 'invalid signup upload expiry';
  end if;

  insert into public.app_idempotency_keys (
    scope, key, payload_hash, locked_at, expires_at
  ) values (
    v_scope, p_idempotency_key, p_payload_hash, v_now, v_now + interval '24 hours'
  ) on conflict (scope, key) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_idem
  from public.app_idempotency_keys
  where scope = v_scope and key = p_idempotency_key
  for update;

  if v_idem.payload_hash <> p_payload_hash then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'idempotency_conflict', 'error', 'Aanvraag is al gebruikt met andere inhoud.');
  end if;
  if v_idem.response_status is not null and v_idem.response_body is not null then
    return v_idem.response_body || jsonb_build_object('replayed', true);
  end if;
  if v_inserted = 0 then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'request_in_progress', 'error', 'Upload wordt al voorbereid.');
  end if;

  select * into v_intake
  from public.app_signup_intakes
  where id = p_intake_id
  for update;

  if not found or v_intake.status <> 'collecting' or v_intake.expires_at <= v_now then
    raise exception 'signup intake unavailable';
  end if;

  select * into v_manage
  from public.app_signup_intake_capabilities
  where intake_id = p_intake_id
    and intake_file_id is null
    and capability_type = 'intake_manage'
    and token_sha256 = p_manage_token_sha256
  for update;

  if not found or v_manage.consumed_at is not null
     or v_manage.invalidated_at is not null or v_manage.expires_at <= v_now then
    raise exception 'signup intake capability unavailable';
  end if;

  select * into v_current
  from public.app_signup_intake_files
  where intake_id = p_intake_id
    and client_slot_id = p_client_slot_id
    and status not in ('superseded', 'promoted', 'rejected', 'expired')
  for update;

  select coalesce(max(revision_number), 0) + 1 into v_revision
  from public.app_signup_intake_files
  where intake_id = p_intake_id and client_slot_id = p_client_slot_id;

  if v_current.id is not null then
    update public.app_signup_intake_files
    set status = 'superseded',
        superseded_at = v_now,
        superseded_by_intake_file_id = v_file_id
    where id = v_current.id;

    update public.app_signup_intake_capabilities
    set invalidated_at = v_now
    where intake_file_id = v_current.id
      and capability_type = 'quarantine_upload'
      and consumed_at is null
      and invalidated_at is null;
  end if;

  v_storage_path := 'signup-quarantine/' || p_intake_id::text || '/' || v_file_id::text || '/document.pdf';

  insert into public.app_signup_intake_files (
    id, intake_id, client_slot_id, document_type, original_filename,
    declared_mime_type, size_bytes, sha256, storage_bucket, storage_path,
    status, issued_at, expires_at, revision_number,
    supersedes_intake_file_id
  ) values (
    v_file_id, p_intake_id, p_client_slot_id, p_document_type,
    btrim(p_original_filename), 'application/pdf', p_size_bytes,
    lower(p_client_sha256), 'app-documents', v_storage_path,
    'upload_issued', v_now, p_file_expires_at, v_revision, v_current.id
  );

  insert into public.app_signup_intake_capabilities (
    intake_id, intake_file_id, capability_type, token_sha256,
    issued_at, expires_at
  ) values (
    p_intake_id, v_file_id, 'quarantine_upload', p_upload_token_sha256,
    v_now, p_capability_expires_at
  );

  insert into public.app_intake_audit_events (
    event_type, request_id, idempotency_key, actor_type, ip_hash,
    user_agent_hash, event_data
  ) values (
    'signup_quarantine_upload_issued', p_request_id, p_idempotency_key,
    'anonymous', p_ip_hash, p_user_agent_hash,
    jsonb_build_object(
      'environment', coalesce(p_environment, 'unknown'),
      'intake_reference', p_intake_id,
      'file_reference', v_file_id,
      'client_slot_id', p_client_slot_id,
      'document_type', p_document_type,
      'revision_number', v_revision,
      'replacement', v_current.id is not null
    )
  );

  v_response := jsonb_build_object(
    'ok', true,
    'status', 201,
    'mode', 'signup_upload_url_v1',
    'request_id', p_request_id,
    'intake_reference', p_intake_id,
    'file_reference', v_file_id,
    'client_slot_id', p_client_slot_id,
    'revision_number', v_revision,
    'storage_bucket', 'app-documents',
    'storage_path', v_storage_path,
    'expires_at', p_file_expires_at,
    'replayed', false
  );

  update public.app_idempotency_keys
  set response_status = 201, response_body = v_response, completed_at = v_now
  where scope = v_scope and key = p_idempotency_key;

  return v_response;
end;
$$;

create or replace function public.app_signup_quarantine_remove_v1(
  p_intake_id uuid,
  p_manage_token_sha256 text,
  p_client_slot_id text,
  p_payload_hash text,
  p_request_id text,
  p_idempotency_key text,
  p_ip_hash text,
  p_user_agent_hash text,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_scope text := 'api-app-signup-upload-remove:v1:' || p_intake_id::text || ':' || p_client_slot_id;
  v_inserted integer := 0;
  v_idem public.app_idempotency_keys%rowtype;
  v_intake public.app_signup_intakes%rowtype;
  v_manage public.app_signup_intake_capabilities%rowtype;
  v_current public.app_signup_intake_files%rowtype;
  v_response jsonb;
begin
  if p_manage_token_sha256 !~ '^[0-9a-f]{64}$'
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_client_slot_id is null or btrim(p_client_slot_id) = '' or length(p_client_slot_id) > 200
     or p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'invalid signup upload remove input';
  end if;

  insert into public.app_idempotency_keys (
    scope, key, payload_hash, locked_at, expires_at
  ) values (
    v_scope, p_idempotency_key, p_payload_hash, v_now, v_now + interval '24 hours'
  ) on conflict (scope, key) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_idem from public.app_idempotency_keys
  where scope = v_scope and key = p_idempotency_key for update;
  if v_idem.payload_hash <> p_payload_hash then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'idempotency_conflict', 'error', 'Aanvraag is al gebruikt met andere inhoud.');
  end if;
  if v_idem.response_status is not null and v_idem.response_body is not null then
    return v_idem.response_body || jsonb_build_object('replayed', true);
  end if;
  if v_inserted = 0 then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'request_in_progress', 'error', 'Wijziging wordt al verwerkt.');
  end if;

  select * into v_intake from public.app_signup_intakes
  where id = p_intake_id for update;
  if not found or v_intake.status <> 'collecting' or v_intake.expires_at <= v_now then
    raise exception 'signup intake unavailable';
  end if;

  select * into v_manage from public.app_signup_intake_capabilities
  where intake_id = p_intake_id and intake_file_id is null
    and capability_type = 'intake_manage'
    and token_sha256 = p_manage_token_sha256 for update;
  if not found or v_manage.consumed_at is not null
     or v_manage.invalidated_at is not null or v_manage.expires_at <= v_now then
    raise exception 'signup intake capability unavailable';
  end if;

  select * into v_current from public.app_signup_intake_files
  where intake_id = p_intake_id and client_slot_id = p_client_slot_id
    and status not in ('superseded', 'promoted', 'rejected', 'expired')
  for update;

  if v_current.id is not null then
    update public.app_signup_intake_files
    set status = 'superseded', superseded_at = v_now
    where id = v_current.id;
    update public.app_signup_intake_capabilities
    set invalidated_at = v_now
    where intake_file_id = v_current.id and capability_type = 'quarantine_upload'
      and consumed_at is null and invalidated_at is null;
  end if;

  insert into public.app_intake_audit_events (
    event_type, request_id, idempotency_key, actor_type, ip_hash,
    user_agent_hash, event_data
  ) values (
    'signup_quarantine_upload_removed', p_request_id, p_idempotency_key,
    'anonymous', p_ip_hash, p_user_agent_hash,
    jsonb_build_object(
      'environment', coalesce(p_environment, 'unknown'),
      'intake_reference', p_intake_id,
      'client_slot_id', p_client_slot_id,
      'removed', v_current.id is not null
    )
  );

  v_response := jsonb_build_object(
    'ok', true, 'status', 200, 'mode', 'signup_upload_remove_v1',
    'request_id', p_request_id, 'intake_reference', p_intake_id,
    'client_slot_id', p_client_slot_id, 'removed', v_current.id is not null,
    'replayed', false
  );
  update public.app_idempotency_keys
  set response_status = 200, response_body = v_response, completed_at = v_now
  where scope = v_scope and key = p_idempotency_key;
  return v_response;
end;
$$;

create or replace function public.app_signup_quarantine_confirm_v1(
  p_intake_id uuid,
  p_file_id uuid,
  p_upload_token_sha256 text,
  p_actual_size_bytes bigint,
  p_detected_mime_type text,
  p_server_sha256 text,
  p_failure_code text,
  p_payload_hash text,
  p_request_id text,
  p_idempotency_key text,
  p_ip_hash text,
  p_user_agent_hash text,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_scope text := 'api-app-signup-upload-confirm:v1:' || p_intake_id::text || ':' || p_file_id::text;
  v_inserted integer := 0;
  v_idem public.app_idempotency_keys%rowtype;
  v_intake public.app_signup_intakes%rowtype;
  v_file public.app_signup_intake_files%rowtype;
  v_capability public.app_signup_intake_capabilities%rowtype;
  v_reason text := null;
  v_response jsonb;
begin
  if p_upload_token_sha256 !~ '^[0-9a-f]{64}$'
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or (p_server_sha256 is not null and p_server_sha256 !~ '^[0-9a-f]{64}$')
     or p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'invalid signup upload confirm input';
  end if;

  insert into public.app_idempotency_keys (
    scope, key, payload_hash, locked_at, expires_at
  ) values (
    v_scope, p_idempotency_key, p_payload_hash, v_now, v_now + interval '24 hours'
  ) on conflict (scope, key) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_idem from public.app_idempotency_keys
  where scope = v_scope and key = p_idempotency_key for update;
  if v_idem.payload_hash <> p_payload_hash then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'idempotency_conflict', 'error', 'Aanvraag is al gebruikt met andere inhoud.');
  end if;
  if v_idem.response_status is not null and v_idem.response_body is not null then
    return v_idem.response_body || jsonb_build_object('replayed', true);
  end if;
  if v_inserted = 0 then
    return jsonb_build_object('ok', false, 'status', 409, 'code', 'request_in_progress', 'error', 'Upload wordt al bevestigd.');
  end if;

  select * into v_intake from public.app_signup_intakes
  where id = p_intake_id for update;
  select * into v_file from public.app_signup_intake_files
  where id = p_file_id and intake_id = p_intake_id for update;
  select * into v_capability from public.app_signup_intake_capabilities
  where intake_id = p_intake_id and intake_file_id = p_file_id
    and capability_type = 'quarantine_upload'
    and token_sha256 = p_upload_token_sha256 for update;

  if v_intake.id is null or v_file.id is null or v_capability.id is null then
    raise exception 'signup upload capability scope mismatch';
  end if;
  if v_intake.status <> 'collecting' or v_intake.expires_at <= v_now
     or v_file.status not in ('upload_issued', 'uploaded_pending_confirm')
     or v_file.superseded_at is not null
     or v_capability.consumed_at is not null
     or v_capability.invalidated_at is not null then
    raise exception 'signup upload is not confirmable';
  end if;

  if v_capability.expires_at <= v_now or v_file.expires_at <= v_now then
    update public.app_signup_intake_capabilities
    set invalidated_at = v_now where id = v_capability.id;
    update public.app_signup_intake_files
    set status = 'expired' where id = v_file.id;
    v_response := jsonb_build_object('ok', false, 'status', 410, 'code', 'upload_expired', 'error', 'Upload is verlopen.');
  else
    if p_failure_code is not null then
      v_reason := p_failure_code;
    elsif p_actual_size_bytes is null or p_server_sha256 is null or p_detected_mime_type is null then
      v_reason := 'object_missing';
    elsif p_actual_size_bytes <> v_file.size_bytes then
      v_reason := 'size_mismatch';
    elsif lower(p_server_sha256) <> v_file.sha256 then
      v_reason := 'hash_mismatch';
    elsif lower(p_detected_mime_type) <> 'application/pdf' then
      v_reason := 'unsupported_file_type';
    end if;

    update public.app_signup_intake_capabilities
    set consumed_at = v_now where id = v_capability.id;

    if v_reason is null then
      update public.app_signup_intake_files
      set status = 'confirmed_quarantine',
          uploaded_at = v_now,
          confirmed_at = v_now,
          detected_mime_type = 'application/pdf',
          server_size_bytes = p_actual_size_bytes,
          server_sha256 = lower(p_server_sha256)
      where id = v_file.id;
      v_response := jsonb_build_object(
        'ok', true, 'status', 200, 'mode', 'signup_upload_confirm_v1',
        'request_id', p_request_id, 'intake_reference', p_intake_id,
        'file_reference', p_file_id, 'client_slot_id', v_file.client_slot_id,
        'revision_number', v_file.revision_number,
        'file_status', 'confirmed_quarantine', 'replayed', false
      );
    else
      update public.app_signup_intake_files
      set status = 'rejected',
          uploaded_at = case when p_actual_size_bytes is null then null else v_now end,
          rejected_at = v_now,
          detected_mime_type = nullif(lower(coalesce(p_detected_mime_type, '')), ''),
          server_size_bytes = p_actual_size_bytes,
          server_sha256 = lower(p_server_sha256)
      where id = v_file.id;
      v_response := jsonb_build_object(
        'ok', false, 'status', 409, 'code', 'upload_rejected',
        'error', 'Upload kon niet worden bevestigd.'
      );
    end if;
  end if;

  insert into public.app_intake_audit_events (
    event_type, request_id, idempotency_key, actor_type, ip_hash,
    user_agent_hash, event_data
  ) values (
    case when (v_response ->> 'ok')::boolean then
      'signup_quarantine_upload_confirmed'
    else 'signup_quarantine_upload_rejected' end,
    p_request_id, p_idempotency_key, 'anonymous', p_ip_hash,
    p_user_agent_hash,
    jsonb_build_object(
      'environment', coalesce(p_environment, 'unknown'),
      'intake_reference', p_intake_id,
      'file_reference', p_file_id,
      'client_slot_id', v_file.client_slot_id,
      'revision_number', v_file.revision_number,
      'result', case when (v_response ->> 'ok')::boolean then 'confirmed_quarantine' else coalesce(v_reason, 'expired') end
    )
  );

  update public.app_idempotency_keys
  set response_status = (v_response ->> 'status')::integer,
      response_body = v_response,
      completed_at = v_now
  where scope = v_scope and key = p_idempotency_key;
  return v_response;
end;
$$;

revoke delete on table public.app_signup_intakes from service_role;
revoke delete on table public.app_signup_intake_files from service_role;

revoke all on function public.app_signup_intake_capabilities_transition_guard() from public, anon, authenticated;
grant execute on function public.app_signup_intake_capabilities_transition_guard() to service_role;

revoke all on function public.app_signup_quarantine_start_v1(text, text, text, text, timestamptz, timestamptz, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.app_signup_quarantine_start_v1(text, text, text, text, timestamptz, timestamptz, text, text, text, text, text) to service_role;

revoke all on function public.app_signup_quarantine_issue_v1(uuid, text, text, text, text, text, bigint, text, text, text, timestamptz, timestamptz, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.app_signup_quarantine_issue_v1(uuid, text, text, text, text, text, bigint, text, text, text, timestamptz, timestamptz, text, text, text, text, text) to service_role;

revoke all on function public.app_signup_quarantine_remove_v1(uuid, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.app_signup_quarantine_remove_v1(uuid, text, text, text, text, text, text, text, text) to service_role;

revoke all on function public.app_signup_quarantine_confirm_v1(uuid, uuid, text, bigint, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.app_signup_quarantine_confirm_v1(uuid, uuid, text, bigint, text, text, text, text, text, text, text, text, text) to service_role;

comment on column public.app_signup_intake_files.revision_number is
'Immutable revision number, starting at 1, scoped to one intake and client slot.';
comment on column public.app_signup_intake_files.superseded_at is
'Terminal withdrawal/replacement marker. Superseded files never satisfy signup journey gating.';
comment on column public.app_signup_intake_files.server_sha256 is
'Server-computed digest recorded during confirmation or rejection; never supplied by the browser to SQL.';
comment on column public.app_signup_intake_capabilities.capability_type is
'intake_manage is reusable and intake-scoped; quarantine_upload is one-time and file-scoped; raw tokens are never stored.';

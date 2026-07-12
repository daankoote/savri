-- ENVAL /app document upload confirm RPC
-- Date: 2026-07-11
--
-- Purpose:
-- - Provide the atomic database transition for api-app-document-upload-confirm.
-- - Keep storage reads/hash verification in the Edge Function, but keep file,
--   version, slot, audit, and idempotency writes in one transaction.
--
-- Boundaries:
-- - No legacy table changes.
-- - No frontend changes.
-- - No storage bucket or storage policy changes.
-- - Service-role execution only.

create or replace function public.app_confirm_document_upload_v1(
  p_dossier_id uuid,
  p_document_slot_id uuid,
  p_document_file_id uuid,
  p_customer_id uuid,
  p_identity_id uuid,
  p_actor_ref text,
  p_request_id text,
  p_idempotency_scope text,
  p_idempotency_key text,
  p_payload_hash text,
  p_ip_hash text,
  p_user_agent_hash text,
  p_environment text,
  p_detected_mime_type text,
  p_stored_size_bytes bigint,
  p_server_sha256 text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_identity record;
  v_dossier record;
  v_slot record;
  v_file record;
  v_idem record;
  v_current_version record;
  v_new_version_id uuid := gen_random_uuid();
  v_next_version_number integer;
  v_confirmed_at timestamptz := now();
  v_response jsonb;
begin
  if p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid payload hash';
  end if;

  if p_server_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid server sha256';
  end if;

  if p_actor_ref <> ('app_customer_identity:' || p_identity_id::text) then
    raise exception 'actor reference mismatch';
  end if;

  select id, customer_id, status
    into v_identity
  from public.app_customer_identities
  where id = p_identity_id
    and customer_id = p_customer_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'identity not found or inactive';
  end if;

  select id, customer_id, status
    into v_dossier
  from public.app_customer_dossiers
  where id = p_dossier_id
    and customer_id = p_customer_id
  for update;

  if not found then
    raise exception 'dossier not found or forbidden';
  end if;

  select *
    into v_slot
  from public.app_dossier_document_slots
  where id = p_document_slot_id
    and dossier_id = p_dossier_id
  for update;

  if not found then
    raise exception 'document slot not found';
  end if;

  select *
    into v_file
  from public.app_dossier_document_files
  where id = p_document_file_id
    and document_slot_id = p_document_slot_id
    and dossier_id = p_dossier_id
  for update;

  if not found then
    raise exception 'document file not found';
  end if;

  if v_file.status not in ('issued', 'uploaded') then
    raise exception 'document file is not confirmable';
  end if;

  if v_file.expires_at <= now() then
    raise exception 'document file expired';
  end if;

  select *
    into v_idem
  from public.app_idempotency_keys
  where scope = p_idempotency_scope
    and key = p_idempotency_key
  for update;

  if not found then
    raise exception 'idempotency row missing';
  end if;

  if v_idem.payload_hash <> p_payload_hash then
    raise exception 'idempotency payload conflict';
  end if;

  if v_idem.response_status is not null or v_idem.response_body is not null then
    raise exception 'idempotency already completed';
  end if;

  if exists (
    select 1
    from public.app_dossier_document_versions
    where document_file_id = p_document_file_id
  ) then
    raise exception 'document file already has a version';
  end if;

  if v_slot.current_version_id is not null then
    select *
      into v_current_version
    from public.app_dossier_document_versions
    where id = v_slot.current_version_id
      and document_slot_id = p_document_slot_id
      and dossier_id = p_dossier_id
    for update;

    if not found or v_current_version.status <> 'current' then
      raise exception 'current document version pointer is invalid';
    end if;
  end if;

  select coalesce(max(version_number), 0) + 1
    into v_next_version_number
  from public.app_dossier_document_versions
  where document_slot_id = p_document_slot_id;

  update public.app_dossier_document_files
  set
    status = 'confirmed',
    detected_mime_type = p_detected_mime_type,
    stored_size_bytes = p_stored_size_bytes,
    server_sha256 = p_server_sha256,
    upload_observed_at = v_confirmed_at,
    confirmed_at = v_confirmed_at,
    confirmed_request_id = p_request_id
  where id = p_document_file_id
    and document_slot_id = p_document_slot_id
    and dossier_id = p_dossier_id
    and status in ('issued', 'uploaded');

  if not found then
    raise exception 'document file confirm transition failed';
  end if;

  insert into public.app_dossier_document_versions (
    id,
    dossier_id,
    document_slot_id,
    document_file_id,
    version_number,
    status,
    created_request_id,
    created_idempotency_key,
    confirmed_at,
    metadata
  )
  values (
    v_new_version_id,
    p_dossier_id,
    p_document_slot_id,
    p_document_file_id,
    v_next_version_number,
    'confirmed_pending_current',
    p_request_id,
    p_idempotency_key,
    v_confirmed_at,
    jsonb_build_object(
      'source', 'api-app-document-upload-confirm',
      'mode', 'upload_confirm_v1',
      'payload_hash', p_payload_hash,
      'verified_server_side', true,
      'detected_mime_type', p_detected_mime_type,
      'stored_size_bytes', p_stored_size_bytes,
      'server_sha256', p_server_sha256
    )
  );

  if v_slot.current_version_id is not null then
    update public.app_dossier_document_versions
    set
      status = 'superseded',
      replaced_by_version_id = v_new_version_id
    where id = v_slot.current_version_id
      and document_slot_id = p_document_slot_id
      and dossier_id = p_dossier_id
      and status = 'current';

    if not found then
      raise exception 'supersede current document version failed';
    end if;
  end if;

  update public.app_dossier_document_versions
  set status = 'current'
  where id = v_new_version_id
    and document_slot_id = p_document_slot_id
    and dossier_id = p_dossier_id
    and status = 'confirmed_pending_current';

  if not found then
    raise exception 'promote document version failed';
  end if;

  update public.app_dossier_document_slots
  set
    status = 'uploaded',
    current_version_id = v_new_version_id,
    current_version_number = v_next_version_number,
    file_object_path = v_file.storage_path,
    file_name = v_file.normalized_file_name,
    file_mime_type = p_detected_mime_type,
    file_size_bytes = p_stored_size_bytes,
    file_sha256 = p_server_sha256,
    uploaded_at = v_confirmed_at,
    verified_at = v_confirmed_at
  where id = p_document_slot_id
    and dossier_id = p_dossier_id;

  if not found then
    raise exception 'document slot current pointer update failed';
  end if;

  v_response := jsonb_build_object(
    'ok', true,
    'mode', 'upload_confirm_v1',
    'request_id', p_request_id,
    'document_file_id', p_document_file_id,
    'document_slot_id', p_document_slot_id,
    'document_version_id', v_new_version_id,
    'version_number', v_next_version_number,
    'status', 'confirmed',
    'file_sha256', p_server_sha256,
    'confirmed_at', v_confirmed_at,
    'payload_hash', p_payload_hash,
    'replayed', false
  );

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
    event_data
  )
  values (
    'document_upload_confirmed',
    'document',
    p_document_slot_id,
    p_customer_id,
    p_dossier_id,
    p_request_id,
    p_idempotency_key,
    'customer',
    p_actor_ref,
    p_ip_hash,
    p_user_agent_hash,
    jsonb_build_object(
      'environment', p_environment,
      'request_id', p_request_id,
      'idempotency_key', p_idempotency_key,
      'actor_ref', p_actor_ref,
      'customer_id', p_customer_id,
      'identity_id', p_identity_id,
      'dossier_id', p_dossier_id,
      'document_slot_id', p_document_slot_id,
      'document_file_id', p_document_file_id,
      'document_version_id', v_new_version_id,
      'version_number', v_next_version_number,
      'stage', 'confirmed',
      'status', 200,
      'declared_mime_type', v_file.declared_mime_type,
      'detected_mime_type', p_detected_mime_type,
      'declared_size_bytes', v_file.declared_size_bytes,
      'stored_size_bytes', p_stored_size_bytes,
      'client_sha256', v_file.client_sha256,
      'server_sha256', p_server_sha256,
      'verified_server_side', true,
      'confirmed_at', v_confirmed_at,
      'storage_bucket', v_file.storage_bucket,
      'storage_path_present', true
    )
  );

  update public.app_idempotency_keys
  set
    response_status = 200,
    response_body = v_response,
    completed_at = v_confirmed_at
  where scope = p_idempotency_scope
    and key = p_idempotency_key;

  if not found then
    raise exception 'idempotency finalize failed';
  end if;

  return v_response;
end;
$$;

revoke all on function public.app_confirm_document_upload_v1(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  bigint,
  text
) from public;

revoke all on function public.app_confirm_document_upload_v1(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  bigint,
  text
) from anon;

revoke all on function public.app_confirm_document_upload_v1(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  bigint,
  text
) from authenticated;

grant execute on function public.app_confirm_document_upload_v1(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  bigint,
  text
) to service_role;

comment on function public.app_confirm_document_upload_v1(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  bigint,
  text
) is
'Atomic service-role-only transition for ENVAL /app upload confirm: file confirmed, immutable version created/promoted, slot current pointer updated, audit written, and idempotency finalized.';

create or replace function public.app_reject_document_upload_v1(
  p_dossier_id uuid,
  p_document_slot_id uuid,
  p_document_file_id uuid,
  p_customer_id uuid,
  p_identity_id uuid,
  p_actor_ref text,
  p_request_id text,
  p_idempotency_scope text,
  p_idempotency_key text,
  p_payload_hash text,
  p_ip_hash text,
  p_user_agent_hash text,
  p_environment text,
  p_response_status integer,
  p_error_code text,
  p_error_message text,
  p_stage text,
  p_reject_policy text,
  p_rejection_reason text,
  p_event_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_identity record;
  v_dossier record;
  v_slot record;
  v_file record;
  v_idem record;
  v_rejected_at timestamptz := now();
  v_response jsonb;
begin
  if p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid payload hash';
  end if;

  if p_response_status < 100 or p_response_status > 599 then
    raise exception 'invalid response status';
  end if;

  if p_reject_policy not in ('nonterminal', 'terminal') then
    raise exception 'invalid reject policy';
  end if;

  if p_actor_ref <> ('app_customer_identity:' || p_identity_id::text) then
    raise exception 'actor reference mismatch';
  end if;

  select id, customer_id, status
    into v_identity
  from public.app_customer_identities
  where id = p_identity_id
    and customer_id = p_customer_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'identity not found or inactive';
  end if;

  select id, customer_id, status
    into v_dossier
  from public.app_customer_dossiers
  where id = p_dossier_id
    and customer_id = p_customer_id
  for update;

  if not found then
    raise exception 'dossier not found or forbidden';
  end if;

  select *
    into v_slot
  from public.app_dossier_document_slots
  where id = p_document_slot_id
    and dossier_id = p_dossier_id
  for update;

  if not found then
    raise exception 'document slot not found';
  end if;

  select *
    into v_file
  from public.app_dossier_document_files
  where id = p_document_file_id
    and document_slot_id = p_document_slot_id
    and dossier_id = p_dossier_id
  for update;

  if not found then
    raise exception 'document file not found';
  end if;

  select *
    into v_idem
  from public.app_idempotency_keys
  where scope = p_idempotency_scope
    and key = p_idempotency_key
  for update;

  if not found then
    raise exception 'idempotency row missing';
  end if;

  if v_idem.payload_hash <> p_payload_hash then
    raise exception 'idempotency payload conflict';
  end if;

  if v_idem.response_status is not null or v_idem.response_body is not null then
    raise exception 'idempotency already completed';
  end if;

  v_response := jsonb_build_object(
    'ok', false,
    'error', p_error_message,
    'code', p_error_code
  );

  if p_reject_policy = 'terminal' then
    update public.app_dossier_document_files
    set
      status = 'rejected',
      rejected_at = v_rejected_at,
      rejection_reason = p_rejection_reason,
      terminal_reason = p_rejection_reason
    where id = p_document_file_id
      and document_slot_id = p_document_slot_id
      and dossier_id = p_dossier_id
      and status in ('issued', 'uploaded');

    if not found then
      raise exception 'document file reject transition failed';
    end if;
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
    event_data
  )
  values (
    'document_upload_confirm_rejected',
    'document',
    p_document_slot_id,
    p_customer_id,
    p_dossier_id,
    p_request_id,
    p_idempotency_key,
    'customer',
    p_actor_ref,
    p_ip_hash,
    p_user_agent_hash,
    jsonb_strip_nulls(jsonb_build_object(
      'environment', p_environment,
      'request_id', p_request_id,
      'idempotency_key', p_idempotency_key,
      'actor_ref', p_actor_ref,
      'customer_id', p_customer_id,
      'identity_id', p_identity_id,
      'dossier_id', p_dossier_id,
      'document_slot_id', p_document_slot_id,
      'document_file_id', p_document_file_id,
      'stage', p_stage,
      'status', p_response_status,
      'reason', p_error_code,
      'reject_policy', p_reject_policy,
      'terminal_transition', p_reject_policy = 'terminal',
      'rejection_reason', p_rejection_reason,
      'rejected_at', case when p_reject_policy = 'terminal' then v_rejected_at else null end
    )) || coalesce(p_event_data, '{}'::jsonb)
  );

  update public.app_idempotency_keys
  set
    response_status = p_response_status,
    response_body = v_response,
    completed_at = v_rejected_at
  where scope = p_idempotency_scope
    and key = p_idempotency_key;

  if not found then
    raise exception 'idempotency finalize failed';
  end if;

  return v_response;
end;
$$;

revoke all on function public.app_reject_document_upload_v1(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from public;

revoke all on function public.app_reject_document_upload_v1(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from anon;

revoke all on function public.app_reject_document_upload_v1(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from authenticated;

grant execute on function public.app_reject_document_upload_v1(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to service_role;

comment on function public.app_reject_document_upload_v1(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text,
  jsonb
) is
'Atomic service-role-only rejection for ENVAL /app upload confirm: optional terminal file rejection, reject audit, and idempotency finalization in one transaction.';

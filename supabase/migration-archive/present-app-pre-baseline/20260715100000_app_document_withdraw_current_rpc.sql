-- ENVAL /app current document withdrawal RPC
-- Date: 2026-07-15
--
-- Purpose:
-- - Allow a customer to withdraw the current document pointer before the dossier
--   is locked/finalized.
-- - Preserve immutable document file/version evidence.
-- - Keep the atomic mutation, audit event, and idempotency finalization in one
--   service-role-only transaction.

create or replace function public.app_dossier_document_versions_transition_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'app_dossier_document_versions rows are immutable and cannot be deleted';
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'current'
       and new.status = 'superseded'
       and old.replaced_by_version_id is null
       and new.replaced_by_version_id is not null
       and new.replaced_by_version_id <> old.id
       and new.id is not distinct from old.id
       and new.dossier_id is not distinct from old.dossier_id
       and new.document_slot_id is not distinct from old.document_slot_id
       and new.document_file_id is not distinct from old.document_file_id
       and new.version_number is not distinct from old.version_number
       and new.created_request_id is not distinct from old.created_request_id
       and new.created_idempotency_key is not distinct from old.created_idempotency_key
       and new.confirmed_at is not distinct from old.confirmed_at
       and new.metadata is not distinct from old.metadata
       and new.created_at is not distinct from old.created_at then
      return new;
    end if;

    if old.status = 'current'
       and new.status = 'withdrawn'
       and new.id is not distinct from old.id
       and new.dossier_id is not distinct from old.dossier_id
       and new.document_slot_id is not distinct from old.document_slot_id
       and new.document_file_id is not distinct from old.document_file_id
       and new.version_number is not distinct from old.version_number
       and new.replaced_by_version_id is not distinct from old.replaced_by_version_id
       and new.created_request_id is not distinct from old.created_request_id
       and new.created_idempotency_key is not distinct from old.created_idempotency_key
       and new.confirmed_at is not distinct from old.confirmed_at
       and new.metadata is not distinct from old.metadata
       and new.created_at is not distinct from old.created_at then
      return new;
    end if;

    if old.status = 'confirmed_pending_current'
       and new.status = 'current'
       and new.id is not distinct from old.id
       and new.dossier_id is not distinct from old.dossier_id
       and new.document_slot_id is not distinct from old.document_slot_id
       and new.document_file_id is not distinct from old.document_file_id
       and new.version_number is not distinct from old.version_number
       and new.replaced_by_version_id is not distinct from old.replaced_by_version_id
       and new.created_request_id is not distinct from old.created_request_id
       and new.created_idempotency_key is not distinct from old.created_idempotency_key
       and new.confirmed_at is not distinct from old.confirmed_at
       and new.metadata is not distinct from old.metadata
       and new.created_at is not distinct from old.created_at then
      return new;
    end if;

    raise exception 'app_dossier_document_versions rows are immutable except allowed status transitions';
  end if;

  return new;
end;
$$;

create or replace function public.app_withdraw_current_document_v1(
  p_dossier_id uuid,
  p_document_slot_id uuid,
  p_customer_id uuid,
  p_identity_id uuid,
  p_actor_ref text,
  p_request_id text,
  p_idempotency_scope text,
  p_idempotency_key text,
  p_payload_hash text,
  p_ip_hash text,
  p_user_agent_hash text,
  p_environment text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_identity record;
  v_dossier record;
  v_slot record;
  v_version record;
  v_idem record;
  v_now timestamptz := now();
  v_status integer := 200;
  v_response jsonb;
  v_event_type text := 'document_current_withdrawn';
  v_reason text := null;
begin
  if p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid payload hash';
  end if;

  if p_actor_ref <> ('app_customer_identity:' || p_identity_id::text) then
    raise exception 'actor reference mismatch';
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

  select id, customer_id, status, locked_at
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

  if v_dossier.locked_at is not null
     or v_dossier.status not in ('draft', 'submitted', 'needs_customer_action') then
    v_status := 409;
    v_reason := 'document_changes_locked';
    v_event_type := 'document_current_withdraw_rejected';
    v_response := jsonb_build_object(
      'ok', false,
      'mode', 'document_withdraw_current_v1',
      'request_id', p_request_id,
      'code', v_reason,
      'error', 'Document kan niet meer worden aangepast.',
      'slot_status', v_slot.status,
      'has_current_document', v_slot.current_version_id is not null,
      'replayed', false
    );
  elsif v_slot.current_version_id is null or v_slot.current_version_number is null then
    v_status := 409;
    v_reason := 'document_current_missing';
    v_event_type := 'document_current_withdraw_rejected';
    v_response := jsonb_build_object(
      'ok', false,
      'mode', 'document_withdraw_current_v1',
      'request_id', p_request_id,
      'code', v_reason,
      'error', 'Er is geen huidig document om te verwijderen.',
      'slot_status', v_slot.status,
      'has_current_document', false,
      'replayed', false
    );
  else
    select *
      into v_version
    from public.app_dossier_document_versions
    where id = v_slot.current_version_id
      and document_slot_id = p_document_slot_id
      and dossier_id = p_dossier_id
    for update;

    if not found or v_version.status <> 'current' then
      raise exception 'current version pointer invalid';
    end if;

    update public.app_dossier_document_versions
    set status = 'withdrawn'
    where id = v_slot.current_version_id
      and document_slot_id = p_document_slot_id
      and dossier_id = p_dossier_id
      and status = 'current';

    if not found then
      raise exception 'current version withdraw transition failed';
    end if;

    update public.app_dossier_document_slots
    set
      status = 'expected',
      current_version_id = null,
      current_version_number = null,
      file_object_path = null,
      file_name = null,
      file_mime_type = null,
      file_size_bytes = null,
      file_sha256 = null,
      uploaded_at = null,
      verified_at = null,
      rejected_at = null,
      rejection_reason = null
    where id = p_document_slot_id
      and dossier_id = p_dossier_id;

    if not found then
      raise exception 'document slot withdraw transition failed';
    end if;

    v_response := jsonb_build_object(
      'ok', true,
      'mode', 'document_withdraw_current_v1',
      'request_id', p_request_id,
      'slot_status', 'expected',
      'has_current_document', false,
      'payload_hash', p_payload_hash,
      'replayed', false
    );
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
    v_event_type,
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
      'status', v_status,
      'reason', v_reason,
      'slot_status_after', case when v_status = 200 then 'expected' else v_slot.status end,
      'has_current_document_after', case when v_status = 200 then false else v_slot.current_version_id is not null end
    ))
  );

  update public.app_idempotency_keys
  set
    response_status = v_status,
    response_body = v_response,
    completed_at = v_now
  where scope = p_idempotency_scope
    and key = p_idempotency_key;

  if not found then
    raise exception 'idempotency finalize failed';
  end if;

  return v_response;
end;
$$;

revoke all on function public.app_withdraw_current_document_v1(
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
  text
) from public;

revoke all on function public.app_withdraw_current_document_v1(
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
  text
) from anon;

revoke all on function public.app_withdraw_current_document_v1(
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
  text
) from authenticated;

grant execute on function public.app_withdraw_current_document_v1(
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
  text
) to service_role;

comment on function public.app_withdraw_current_document_v1(
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
  text
) is
'Atomic service-role-only withdrawal of the current ENVAL /app document pointer. Preserves file/version rows, clears slot current pointer, writes audit, and finalizes idempotency.';

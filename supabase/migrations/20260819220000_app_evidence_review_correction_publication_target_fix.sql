begin;

-- REVIEW20B separates the stable case-owned publication target from the Auth
-- principal grant required later to read the published customer handoff.

create or replace function public.app_evidence_review_correction_publish_v1(
  p_auth_user_id uuid,
  p_case_ref text,
  p_round_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_payload_sha256 text,
  p_idempotency_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_case public.app_cases%rowtype;
  v_round public.app_evidence_review_rounds%rowtype;
  v_existing public.app_evidence_review_correction_handoffs%rowtype;
  v_auth jsonb;
  v_manifest jsonb;
  v_scope text;
  v_begin jsonb;
  v_bundle jsonb;
  v_bundle_sha256 text;
  v_handoff_id uuid;
  v_handoff_reference text;
  v_response jsonb;
begin
  if p_auth_user_id is null
     or p_case_ref is null
     or p_case_ref <> pg_catalog.btrim(p_case_ref)
     or pg_catalog.char_length(p_case_ref) not between 8 and 64
     or p_round_id is null
     or p_request_id is null
     or p_request_id <> pg_catalog.btrim(p_request_id)
     or pg_catalog.char_length(p_request_id) not between 1 and 128
     or p_idempotency_key is null
     or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
     or pg_catalog.char_length(p_idempotency_key) not between 1 and 200
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or p_idempotency_expires_at is null
     or p_idempotency_expires_at <= v_now then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;

  select case_row.* into v_case
  from public.app_cases case_row
  where case_row.case_reference = p_case_ref;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'case_missing'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'evidence_review_correction_handoff:v1:' || v_case.id::text || ':' ||
    p_round_id::text, 0
  ));

  v_auth := public.app_workforce_authorize_v1(
    p_auth_user_id, 'evidence.review.correction.publish',
    v_case.id, null, v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;

  select round_row.* into v_round
  from public.app_evidence_review_rounds round_row
  where round_row.id = p_round_id
    and round_row.case_id = v_case.id;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'review_round_missing'
    );
  end if;

  v_manifest := public.app_evidence_fact_review_manifest_v1(v_case.id);
  if v_manifest->>'ok' <> 'true' then return v_manifest; end if;
  if v_round.manifest_version <> v_manifest->>'manifest_version'
     or v_round.manifest_hash <> v_manifest->>'manifest_hash' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'stale_review_round'
    );
  end if;
  if v_round.outcome <> 'CORRECTIONS_REQUIRED' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'correction_handoff_not_eligible'
    );
  end if;

  -- app_cases.customer_id is the stable publication target. A current Auth
  -- grant is separate read authority and may legitimately not exist yet.
  if not exists (
    select 1 from public.app_customers customer_row
    where customer_row.id = v_case.customer_id
      and customer_row.status = 'active'
  )
     or exists (
       select 1 from public.app_customer_access_grants access_grant
       where access_grant.granted_case_id = v_case.id
         and access_grant.customer_id <> v_case.customer_id
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'customer_context_unavailable'
    );
  end if;

  select pg_catalog.jsonb_build_object(
    'schema_version', 'evidence-review-correction-handoff-bundle-v1',
    'case_ref', v_case.case_reference,
    'source_round_ref', v_round.id,
    'manifest_version', v_round.manifest_version,
    'manifest_hash', v_round.manifest_hash,
    'target_customer_ref', v_case.customer_id,
    'items', coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'subject_ref', decision.subject_ref,
        'evidence_file_ref', decision.evidence_file_id,
        'evidence_version_ref', decision.evidence_version_id,
        'evidence_kind', decision.evidence_kind,
        'fact_key', decision.fact_key,
        'scope_ref', decision.scope_ref,
        'source_round_ref', v_round.id,
        'customer_safe', pg_catalog.jsonb_strip_nulls(
          pg_catalog.jsonb_build_object(
            'document_label', case decision.evidence_kind
              when 'energy_bill_or_contract' then 'Energiedocument'
              when 'installation_invoice' then 'Installatiefactuur'
              else null
            end,
            'fact_label', decision.fact_label,
            'current_value', subject.item->'value',
            'correction_reason', decision.correction_reason,
            'correction_reason_label', case decision.correction_reason
              when 'MISSING_INFORMATION' then 'Gegeven ontbreekt'
              when 'INCORRECT_INFORMATION' then 'Gegeven onjuist'
              when 'INCONSISTENT_INFORMATION' then 'Gegevens inconsistent'
              when 'OTHER' then 'Aanpassing nodig'
              else null
            end,
            'correction_instruction', decision.correction_instruction
          )
        )
      ) order by decision.subject_ref
    ), '[]'::jsonb)
  ) into v_bundle
  from public.app_evidence_review_round_subject_decisions decision
  join pg_catalog.jsonb_array_elements(v_manifest->'subjects') subject(item)
    on subject.item->>'subject_ref' = decision.subject_ref
  where decision.round_id = v_round.id
    and decision.disposition = 'CORRECTION_REQUIRED'
    and decision.correction_reason in (
      'MISSING_INFORMATION', 'INCORRECT_INFORMATION',
      'INCONSISTENT_INFORMATION', 'OTHER'
    )
    and decision.correction_instruction is not null
    and decision.evidence_kind in (
      'energy_bill_or_contract', 'installation_invoice'
    );

  if pg_catalog.jsonb_array_length(v_bundle->'items') < 1
     or pg_catalog.jsonb_array_length(v_bundle->'items') <> (
       select pg_catalog.count(*)
       from public.app_evidence_review_round_subject_decisions decision
       where decision.round_id = v_round.id
         and decision.disposition = 'CORRECTION_REQUIRED'
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'correction_bundle_unavailable'
    );
  end if;

  select pg_catalog.encode(extensions.digest(v_bundle::text, 'sha256'), 'hex')
    into v_bundle_sha256;
  v_scope := 'evidence_review_correction_publish:v1:case:' ||
    v_case.id::text || ':round:' || v_round.id::text;
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_sha256,
    p_idempotency_expires_at, 'worker', v_auth->>'actor_ref', p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;

  select * into v_existing
  from public.app_evidence_review_correction_handoffs handoff
  where handoff.round_id = v_round.id;
  if found then
    v_response := case when
      v_existing.case_id = v_case.id
      and v_existing.target_customer_id = v_case.customer_id
      and v_existing.manifest_version = v_round.manifest_version
      and v_existing.manifest_hash = v_round.manifest_hash
      and v_existing.bundle_sha256 = v_bundle_sha256
      and v_existing.correction_bundle = v_bundle
    then pg_catalog.jsonb_build_object(
      'ok', true, 'status', 200, 'code', 'already_published',
      'handoff_id', v_existing.id,
      'handoff_ref', v_existing.handoff_reference,
      'round_id', v_existing.round_id,
      'bundle_sha256', v_existing.bundle_sha256,
      'published_at', v_existing.published_at
    ) else pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'correction_handoff_conflict'
    ) end;
    return public.app_evidence_review_idempotency_complete_v1(
      v_scope, p_idempotency_key, v_response
    );
  end if;

  v_handoff_id := gen_random_uuid();
  select 'CRH-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.encode(
    extensions.digest(
      'correction-handoff-v1|' || v_round.id::text || '|' ||
      v_case.customer_id::text || '|' || v_bundle_sha256,
      'sha256'
    ), 'hex'
  ), 1, 16)) into v_handoff_reference;

  insert into public.app_evidence_review_correction_handoffs (
    id, handoff_reference, case_id, round_id,
    manifest_version, manifest_hash, target_customer_id,
    correction_bundle, bundle_sha256,
    publisher_workforce_identity_id, publisher_scope_assignment_id,
    capability_code, authorization_policy_version_id,
    payload_sha256, request_id, idempotency_key, published_at
  ) values (
    v_handoff_id, v_handoff_reference, v_case.id, v_round.id,
    v_round.manifest_version, v_round.manifest_hash, v_case.customer_id,
    v_bundle, v_bundle_sha256,
    (v_auth->>'workforce_identity_id')::uuid,
    (v_auth->>'scope_assignment_id')::uuid,
    'evidence.review.correction.publish',
    (v_auth->>'policy_version_id')::uuid,
    p_payload_sha256, p_request_id, p_idempotency_key, v_now
  );

  insert into public.app_audit_events (
    event_type, scope_type, scope_id, request_id, idempotency_key,
    actor_type, actor_ref, event_data,
    authorization_policy_version_id, created_at
  ) values (
    'evidence_review_correction_handoff_published',
    'case', v_case.id, p_request_id, p_idempotency_key,
    'worker', v_auth->>'actor_ref',
    pg_catalog.jsonb_build_object(
      'handoff_ref', v_handoff_reference,
      'round_ref', v_round.id,
      'manifest_version', v_round.manifest_version,
      'manifest_hash', v_round.manifest_hash,
      'bundle_sha256', v_bundle_sha256,
      'correction_count', pg_catalog.jsonb_array_length(v_bundle->'items')
    ),
    (v_auth->>'policy_version_id')::uuid, v_now
  );

  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'published',
    'handoff_id', v_handoff_id,
    'handoff_ref', v_handoff_reference,
    'round_id', v_round.id,
    'bundle_sha256', v_bundle_sha256,
    'published_at', v_now
  );
  return public.app_evidence_review_idempotency_complete_v1(
    v_scope, p_idempotency_key, v_response
  );
exception when unique_violation then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'concurrent_write_conflict'
  );
when others then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 500, 'code', 'internal_error'
  );
end;
$$;

revoke all on function public.app_evidence_review_correction_publish_v1(
  uuid, text, uuid, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.app_evidence_review_correction_publish_v1(
  uuid, text, uuid, text, text, text, timestamptz
) to service_role;

comment on function public.app_evidence_review_correction_publish_v1(
  uuid, text, uuid, text, text, text, timestamptz
) is
  'Private REVIEW20B publication authority. It binds the immutable correction handoff to the active customer owned by the exact case without requiring a customer Auth/access grant; conflicting case grants fail closed and customer read authorization remains separate.';

commit;

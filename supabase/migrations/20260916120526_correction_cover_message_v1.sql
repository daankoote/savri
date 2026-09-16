begin;

alter table public.app_evidence_review_correction_handoffs
  drop constraint app_evidence_review_correction_handoffs_bundle_chk;
alter table public.app_evidence_review_correction_handoffs
  add constraint app_evidence_review_correction_handoffs_bundle_chk check (
    pg_catalog.jsonb_typeof(correction_bundle) is not distinct from 'object'
    and pg_catalog.jsonb_typeof(correction_bundle->'schema_version')
      is not distinct from 'string'
    and correction_bundle->>'schema_version' in (
      'evidence-review-correction-handoff-bundle-v1',
      'evidence-review-correction-handoff-bundle-v2',
      'evidence-review-correction-handoff-bundle-v3'
    )
    and pg_catalog.jsonb_typeof(correction_bundle->'items')
      is not distinct from 'array'
    and pg_catalog.jsonb_array_length(correction_bundle->'items') > 0
    and case
      when correction_bundle->>'schema_version' =
        'evidence-review-correction-handoff-bundle-v3' then
        pg_catalog.jsonb_typeof(
          correction_bundle->'customer_publication'
        ) is not distinct from 'object'
        and pg_catalog.jsonb_typeof(
          correction_bundle->'customer_publication'->'schema_version'
        ) is not distinct from 'string'
        and pg_catalog.jsonb_typeof(
          correction_bundle->'customer_publication'->'cover_message'
        ) is not distinct from 'string'
        and (
          (correction_bundle->'customer_publication')
            - 'schema_version'::text - 'cover_message'::text
        ) = '{}'::jsonb
        and (correction_bundle #>>
          '{customer_publication,schema_version}') =
            'correction-customer-publication-v1'
        and (correction_bundle #>> '{customer_publication,cover_message}') =
          pg_catalog.btrim(
            correction_bundle #>> '{customer_publication,cover_message}'
          )
        and (correction_bundle #>> '{customer_publication,cover_message}')
          !~ '^[[:space:]]|[[:space:]]$'
        and pg_catalog.char_length(
          correction_bundle #>> '{customer_publication,cover_message}'
        ) between 1 and 1000
        and (correction_bundle #>> '{customer_publication,cover_message}')
          ~ '[[:alnum:]]'
        and pg_catalog.strpos(
          correction_bundle #>> '{customer_publication,cover_message}',
          chr(13)
        ) = 0
        and pg_catalog.regexp_replace(
          correction_bundle #>> '{customer_publication,cover_message}',
          chr(10), '', 'g'
        ) !~ '[[:cntrl:]]'
      else not (correction_bundle ? 'customer_publication')
    end
  );

create or replace function
  public.app_evidence_review_correction_handoff_lineage_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_predecessor public.app_evidence_review_correction_handoffs%rowtype;
begin
  if new.supersedes_handoff_id is null then
    if new.capability_code <> 'evidence.review.correction.publish'
       or (new.correction_bundle->>'schema_version') is distinct from
         'evidence-review-correction-handoff-bundle-v3' then
      raise exception 'correction handoff root shape invalid'
        using errcode = '23514';
    end if;
    return new;
  end if;

  select predecessor.* into v_predecessor
  from public.app_evidence_review_correction_handoffs predecessor
  where predecessor.id = new.supersedes_handoff_id
  for key share;
  if not found
     or new.capability_code <> 'evidence.review.correction.supersede'
     or (new.correction_bundle->>'schema_version') is distinct from
       'evidence-review-correction-handoff-bundle-v3'
     or new.case_id <> v_predecessor.case_id
     or new.round_id <> v_predecessor.round_id
     or new.manifest_version <> v_predecessor.manifest_version
     or new.manifest_hash <> v_predecessor.manifest_hash
     or new.target_customer_id <> v_predecessor.target_customer_id
     or new.published_at < v_predecessor.published_at
     or exists (
       select 1
       from public.app_evidence_review_customer_submissions submission
       where submission.handoff_id = v_predecessor.id
     )
     or exists (
       select 1
       from public.app_evidence_review_correction_handoffs successor
       where successor.supersedes_handoff_id = v_predecessor.id
     )
     or pg_catalog.jsonb_array_length(new.correction_bundle->'items') <>
       pg_catalog.jsonb_array_length(v_predecessor.correction_bundle->'items')
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(
         v_predecessor.correction_bundle->'items'
       ) with ordinality predecessor_item(value, ordinality)
       full join pg_catalog.jsonb_array_elements(new.correction_bundle->'items')
         with ordinality successor_item(value, ordinality)
         using (ordinality)
       where predecessor_item.value is null
          or successor_item.value is null
          or predecessor_item.value - 'response_requirement' <>
            successor_item.value - 'response_requirement'
          or successor_item.value->>'response_requirement' not in (
            'VALUE_CORRECTION',
            'MISSING_VALUE',
            'DOCUMENT_REPLACEMENT',
            'VALUE_PLUS_DOCUMENT_REPLACEMENT'
          )
     ) then
    raise exception 'correction handoff successor shape invalid'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create function public.app_evidence_review_correction_publish_v2(
  p_auth_user_id uuid,
  p_case_ref text,
  p_round_id uuid,
  p_cover_message text,
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
     or p_cover_message is null
     or p_cover_message <> pg_catalog.btrim(p_cover_message)
     or p_cover_message ~ '^[[:space:]]|[[:space:]]$'
     or pg_catalog.char_length(p_cover_message) not between 1 and 1000
     or p_cover_message !~ '[[:alnum:]]'
     or pg_catalog.strpos(p_cover_message, chr(13)) > 0
     or pg_catalog.regexp_replace(p_cover_message, chr(10), '', 'g')
       ~ '[[:cntrl:]]'
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

  v_auth := public.app_workforce_authorize_v1(
    p_auth_user_id, 'evidence.review.correction.publish',
    v_case.id, null, v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'customer_case_action:v1:' || v_case.id::text, 0
  ));
  if exists (
    select 1
    from public.app_customer_information_requests information_request
    where information_request.case_id = v_case.id
      and information_request.terminal_action is null
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'information_request_active'
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'evidence_review_correction_handoff:v2:' || v_case.id::text || ':' ||
    p_round_id::text, 0
  ));

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

  if not exists (
    select 1 from public.app_customers customer_row
    where customer_row.id = v_case.customer_id
      and customer_row.status = 'active'
  ) or exists (
    select 1 from public.app_customer_access_grants access_grant
    where access_grant.granted_case_id = v_case.id
      and access_grant.customer_id <> v_case.customer_id
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'customer_context_unavailable'
    );
  end if;

  select pg_catalog.jsonb_build_object(
    'schema_version', 'evidence-review-correction-handoff-bundle-v3',
    'case_ref', v_case.case_reference,
    'source_round_ref', v_round.id,
    'manifest_version', v_round.manifest_version,
    'manifest_hash', v_round.manifest_hash,
    'target_customer_ref', v_case.customer_id,
    'customer_publication', pg_catalog.jsonb_build_object(
      'schema_version', 'correction-customer-publication-v1',
      'cover_message', p_cover_message
    ),
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
  v_scope := 'evidence_review_correction_publish:v2:case:' ||
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
      'correction-handoff-v2|' || v_round.id::text || '|' ||
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

create function public.app_evidence_review_correction_supersede_v2(
  p_auth_user_id uuid,
  p_case_ref text,
  p_predecessor_handoff_ref text,
  p_item_requirements jsonb,
  p_reason text,
  p_explanation text,
  p_cover_message text,
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
  v_predecessor public.app_evidence_review_correction_handoffs%rowtype;
  v_auth jsonb;
  v_scope text;
  v_begin jsonb;
  v_items jsonb;
  v_bundle jsonb;
  v_bundle_sha256 text;
  v_successor_id uuid := gen_random_uuid();
  v_successor_reference text;
  v_response jsonb;
begin
  if p_auth_user_id is null
     or p_case_ref is null
     or p_case_ref <> pg_catalog.btrim(p_case_ref)
     or pg_catalog.char_length(p_case_ref) not between 8 and 64
     or p_predecessor_handoff_ref !~ '^CRH-[0-9A-F]{16}$'
     or pg_catalog.jsonb_typeof(p_item_requirements) <> 'array'
     or pg_catalog.jsonb_array_length(p_item_requirements) not between 1 and 100
     or p_reason not in (
       'NEW_EVIDENCE_REQUIRED',
       'REQUIREMENT_CORRECTION',
       'PROCESS_CORRECTION',
       'OTHER'
     )
     or (
       p_reason = 'OTHER'
       and (
         p_explanation is null
         or p_explanation <> pg_catalog.btrim(p_explanation)
         or pg_catalog.char_length(p_explanation) not between 1 and 500
       )
     )
     or (p_reason <> 'OTHER' and p_explanation is not null)
     or p_cover_message is null
     or p_cover_message <> pg_catalog.btrim(p_cover_message)
     or p_cover_message ~ '^[[:space:]]|[[:space:]]$'
     or pg_catalog.char_length(p_cover_message) not between 1 and 1000
     or p_cover_message !~ '[[:alnum:]]'
     or pg_catalog.strpos(p_cover_message, chr(13)) > 0
     or pg_catalog.regexp_replace(p_cover_message, chr(10), '', 'g')
       ~ '[[:cntrl:]]'
     or p_request_id is null
     or p_request_id <> pg_catalog.btrim(p_request_id)
     or pg_catalog.char_length(p_request_id) not between 1 and 128
     or p_idempotency_key is null
     or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
     or pg_catalog.char_length(p_idempotency_key) not between 1 and 200
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or p_idempotency_expires_at is null
     or p_idempotency_expires_at <= v_now
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(p_item_requirements) item(value)
       where pg_catalog.jsonb_typeof(item.value) <> 'object'
          or (
            select pg_catalog.count(*)
            from pg_catalog.jsonb_object_keys(item.value)
          ) <> 2
          or not (item.value ? 'item_ref')
          or not (item.value ? 'response_requirement')
          or item.value->>'item_ref' !~ '^CCI-[A-F0-9]{32}$'
          or item.value->>'response_requirement' not in (
            'VALUE_CORRECTION',
            'MISSING_VALUE',
            'DOCUMENT_REPLACEMENT',
            'VALUE_PLUS_DOCUMENT_REPLACEMENT'
          )
     )
     or (
       select pg_catalog.count(distinct item.value->>'item_ref')
       from pg_catalog.jsonb_array_elements(p_item_requirements) item(value)
     ) <> pg_catalog.jsonb_array_length(p_item_requirements) then
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
    'evidence_review_correction_supersede:v2:' || v_case.id::text, 0
  ));
  v_auth := public.app_workforce_authorize_v1(
    p_auth_user_id,
    'evidence.review.correction.supersede',
    v_case.id,
    null,
    v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;

  select predecessor.* into v_predecessor
  from public.app_evidence_review_correction_handoffs predecessor
  where predecessor.handoff_reference = p_predecessor_handoff_ref
    and predecessor.case_id = v_case.id;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'correction_handoff_missing'
    );
  end if;

  v_scope := 'evidence_review_correction_supersede:v2:case:' ||
    v_case.id::text || ':predecessor:' || v_predecessor.id::text;
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope,
    p_idempotency_key,
    p_payload_sha256,
    p_idempotency_expires_at,
    'worker',
    v_auth->>'actor_ref',
    p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;

  if exists (
    select 1
    from public.app_evidence_review_customer_submissions submission
    where submission.handoff_id = v_predecessor.id
  ) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'correction_handoff_answered'
    );
    return public.app_evidence_review_idempotency_complete_v1(
      v_scope, p_idempotency_key, v_response
    );
  end if;
  if v_predecessor.id is distinct from
       public.app_evidence_review_current_correction_handoff_v1(
         v_case.id,
         v_predecessor.manifest_version,
         v_predecessor.manifest_hash
       ) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'correction_handoff_not_current'
    );
    return public.app_evidence_review_idempotency_complete_v1(
      v_scope, p_idempotency_key, v_response
    );
  end if;
  if v_predecessor.bundle_sha256 <> pg_catalog.encode(
    extensions.digest(v_predecessor.correction_bundle::text, 'sha256'), 'hex'
  ) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409,
      'code', 'correction_handoff_integrity_failed'
    );
    return public.app_evidence_review_idempotency_complete_v1(
      v_scope, p_idempotency_key, v_response
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    (predecessor_item.value - 'response_requirement') ||
      pg_catalog.jsonb_build_object(
        'response_requirement', requirement.value->>'response_requirement'
      )
    order by predecessor_item.ordinality
  ), '[]'::jsonb) into v_items
  from pg_catalog.jsonb_array_elements(v_predecessor.correction_bundle->'items')
    with ordinality predecessor_item(value, ordinality)
  join pg_catalog.jsonb_array_elements(p_item_requirements) requirement(value)
    on requirement.value->>'item_ref' =
      public.app_customer_correction_item_ref_v1(
        v_predecessor.id,
        v_predecessor.case_id,
        v_predecessor.target_customer_id,
        predecessor_item.value->>'subject_ref'
      );
  if pg_catalog.jsonb_array_length(v_items) <>
       pg_catalog.jsonb_array_length(v_predecessor.correction_bundle->'items')
     or pg_catalog.jsonb_array_length(v_items) <>
       pg_catalog.jsonb_array_length(p_item_requirements) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'correction_item_set_mismatch'
    );
    return public.app_evidence_review_idempotency_complete_v1(
      v_scope, p_idempotency_key, v_response
    );
  end if;

  v_bundle := pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(
        v_predecessor.correction_bundle - 'customer_publication'::text,
        '{schema_version}',
        '"evidence-review-correction-handoff-bundle-v3"'::jsonb
      ),
      '{items}',
      v_items
    ),
    '{customer_publication}',
    pg_catalog.jsonb_build_object(
      'schema_version', 'correction-customer-publication-v1',
      'cover_message', p_cover_message
    )
  );
  select pg_catalog.encode(extensions.digest(v_bundle::text, 'sha256'), 'hex')
    into v_bundle_sha256;
  select 'CRH-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.encode(
    extensions.digest(
      'correction-handoff-supersession-v2|' || v_predecessor.id::text || '|' ||
      v_bundle_sha256 || '|' || p_reason || '|' || coalesce(p_explanation, ''),
      'sha256'
    ), 'hex'
  ), 1, 16)) into v_successor_reference;

  insert into public.app_evidence_review_correction_handoffs (
    id, handoff_reference, case_id, round_id,
    manifest_version, manifest_hash, target_customer_id,
    correction_bundle, bundle_sha256,
    publisher_workforce_identity_id, publisher_scope_assignment_id,
    capability_code, authorization_policy_version_id,
    payload_sha256, request_id, idempotency_key, published_at,
    supersedes_handoff_id, supersession_reason, supersession_explanation
  ) values (
    v_successor_id, v_successor_reference, v_predecessor.case_id,
    v_predecessor.round_id, v_predecessor.manifest_version,
    v_predecessor.manifest_hash, v_predecessor.target_customer_id,
    v_bundle, v_bundle_sha256,
    (v_auth->>'workforce_identity_id')::uuid,
    (v_auth->>'scope_assignment_id')::uuid,
    'evidence.review.correction.supersede',
    (v_auth->>'policy_version_id')::uuid,
    p_payload_sha256, p_request_id, p_idempotency_key, v_now,
    v_predecessor.id, p_reason, p_explanation
  );

  insert into public.app_audit_events (
    event_type, scope_type, scope_id, request_id, idempotency_key,
    actor_type, actor_ref, event_data,
    authorization_policy_version_id, created_at
  ) values (
    'evidence_review_correction_handoff_superseded',
    'case', v_case.id, p_request_id, p_idempotency_key,
    'worker', v_auth->>'actor_ref',
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'predecessor_handoff_ref', v_predecessor.handoff_reference,
      'successor_handoff_ref', v_successor_reference,
      'source_round_ref', v_predecessor.round_id,
      'reason', p_reason,
      'explanation', p_explanation,
      'successor_bundle_sha256', v_bundle_sha256,
      'item_count', pg_catalog.jsonb_array_length(v_items)
    )),
    (v_auth->>'policy_version_id')::uuid, v_now
  );

  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'superseded',
    'predecessor_handoff_id', v_predecessor.id,
    'predecessor_handoff_ref', v_predecessor.handoff_reference,
    'successor_handoff_id', v_successor_id,
    'successor_handoff_ref', v_successor_reference,
    'round_id', v_predecessor.round_id,
    'bundle_sha256', v_bundle_sha256,
    'published_at', v_now
  );
  return public.app_evidence_review_idempotency_complete_v1(
    v_scope, p_idempotency_key, v_response
  );
exception
  when unique_violation then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'concurrent_write_conflict'
    );
  when check_violation or foreign_key_violation then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'correction_item_set_mismatch'
    );
  when others then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500, 'code', 'internal_error'
    );
end;
$$;

create function public.app_correction_customer_publication_snapshot_v1(
  p_handoff_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_handoff public.app_evidence_review_correction_handoffs%rowtype;
  v_snapshot jsonb;
begin
  select handoff.* into v_handoff
  from public.app_evidence_review_correction_handoffs handoff
  where handoff.id = p_handoff_id;
  if not found or v_handoff.bundle_sha256 <> pg_catalog.encode(
    extensions.digest(v_handoff.correction_bundle::text, 'sha256'), 'hex'
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500, 'code', 'handoff_integrity_failed'
    );
  end if;

  if pg_catalog.jsonb_typeof(
       v_handoff.correction_bundle->'schema_version'
     ) is distinct from 'string' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500, 'code', 'handoff_integrity_failed'
    );
  end if;
  if v_handoff.correction_bundle->>'schema_version' in (
    'evidence-review-correction-handoff-bundle-v1',
    'evidence-review-correction-handoff-bundle-v2'
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'snapshot', null,
      'snapshot_sha256', null
    );
  end if;
  if (v_handoff.correction_bundle->>'schema_version') is distinct from
       'evidence-review-correction-handoff-bundle-v3' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500, 'code', 'handoff_integrity_failed'
    );
  end if;

  v_snapshot := v_handoff.correction_bundle->'customer_publication';
  if pg_catalog.jsonb_typeof(v_snapshot) is distinct from 'object'
     or pg_catalog.jsonb_typeof(v_snapshot->'schema_version')
       is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_snapshot->'cover_message')
       is distinct from 'string'
     or (
       v_snapshot - 'schema_version'::text - 'cover_message'::text
     ) <> '{}'::jsonb
     or (v_snapshot->>'schema_version') is distinct from
       'correction-customer-publication-v1'
     or v_snapshot->>'cover_message' <> pg_catalog.btrim(
       v_snapshot->>'cover_message'
     )
     or v_snapshot->>'cover_message' ~ '^[[:space:]]|[[:space:]]$'
     or pg_catalog.char_length(v_snapshot->>'cover_message')
       not between 1 and 1000
     or v_snapshot->>'cover_message' !~ '[[:alnum:]]'
     or pg_catalog.strpos(v_snapshot->>'cover_message', chr(13)) > 0
     or pg_catalog.regexp_replace(
       v_snapshot->>'cover_message', chr(10), '', 'g'
     ) ~ '[[:cntrl:]]' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500, 'code', 'handoff_integrity_failed'
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'snapshot', v_snapshot,
    'snapshot_sha256', pg_catalog.encode(
      extensions.digest(v_snapshot::text, 'sha256'), 'hex'
    )
  );
end;
$$;

create function public.app_customer_correction_handoff_read_v6(
  p_auth_user_id uuid,
  p_case_ref text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_read jsonb;
  v_handoff_id uuid;
  v_publication jsonb;
begin
  v_read := public.app_customer_correction_handoff_read_v5(
    p_auth_user_id,
    p_case_ref
  );
  if v_read->>'ok' <> 'true'
     or coalesce(pg_catalog.jsonb_typeof(v_read->'handoff'), 'missing') <>
       'object' then
    return v_read;
  end if;

  select handoff.id into v_handoff_id
  from public.app_evidence_review_correction_handoffs handoff
  where handoff.handoff_reference = (v_read #>> '{handoff,handoff_ref}');
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500,
      'code', 'correction_handoff_reconstruction_failed'
    );
  end if;
  v_publication := public.app_correction_customer_publication_snapshot_v1(
    v_handoff_id
  );
  if v_publication->>'ok' <> 'true' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500,
      'code', 'correction_handoff_reconstruction_failed'
    );
  end if;

  return pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      v_read,
      '{handoff,cover_message}',
      coalesce(v_publication #> '{snapshot,cover_message}', 'null'::jsonb),
      true
    ),
    '{handoff,customer_publication_snapshot_sha256}',
    coalesce(v_publication->'snapshot_sha256', 'null'::jsonb),
    true
  );
end;
$$;

revoke all on function public.app_evidence_review_correction_publish_v1(
  uuid, text, uuid, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.app_evidence_review_correction_supersede_v1(
  uuid, text, text, jsonb, text, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.app_evidence_review_correction_publish_v2(
  uuid, text, uuid, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.app_evidence_review_correction_publish_v2(
  uuid, text, uuid, text, text, text, text, timestamptz
) to service_role;
revoke all on function public.app_evidence_review_correction_supersede_v2(
  uuid, text, text, jsonb, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.app_evidence_review_correction_supersede_v2(
  uuid, text, text, jsonb, text, text, text, text, text, text, timestamptz
) to service_role;
revoke all on function public.app_correction_customer_publication_snapshot_v1(
  uuid
) from public, anon, authenticated, service_role;
revoke all on function public.app_customer_correction_handoff_read_v6(
  uuid, text
) from public, anon, authenticated;
grant execute on function public.app_customer_correction_handoff_read_v6(
  uuid, text
) to service_role;

comment on function public.app_evidence_review_correction_publish_v2(
  uuid, text, uuid, text, text, text, text, timestamptz
) is
  'Service-only correction publication authority. It requires one immutable customer-safe plain-text cover message, preserves exact workforce and case authority, and serializes against active customer information requests.';
comment on function public.app_evidence_review_correction_supersede_v2(
  uuid, text, text, jsonb, text, text, text, text, text, text, timestamptz
) is
  'Service-only immutable correction supersession authority. Every successor requires its own customer-safe plain-text cover message while preserving lineage, item-set and workforce authority guards.';
comment on function public.app_correction_customer_publication_snapshot_v1(
  uuid
) is
  'Private grantless projector for the exact immutable customer publication snapshot and hash shared by portal reads and a future correction-mail intent builder. Legacy v1/v2 handoffs return null snapshot and hash.';
comment on function public.app_customer_correction_handoff_read_v6(uuid, text)
is
  'R7-authorized customer correction read. It extends v5 only with the private immutable customer-publication snapshot; legacy v1/v2 handoffs project a null cover message.';

commit;

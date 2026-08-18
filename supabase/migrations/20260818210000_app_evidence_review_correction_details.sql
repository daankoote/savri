begin;

-- REVIEW12 extends the immutable REVIEW02 decision row. Existing rows remain
-- byte-for-byte untouched; nullable legacy compatibility is bounded by the new
-- insert guard and by removing service-role access to the v1 write RPC.

alter table public.app_evidence_review_decisions
  add column correction_contract_version smallint,
  add column correction_reason text,
  add column correction_instruction text;

alter table public.app_evidence_review_decisions
  add constraint app_evidence_review_decisions_correction_v1_chk check (
    (
      decision = 'ACCEPTED'
      and correction_contract_version is null
      and correction_reason is null
      and correction_instruction is null
    )
    or
    (
      decision = 'CORRECTION_REQUIRED'
      and (
        (
          correction_contract_version is null
          and correction_reason is null
          and correction_instruction is null
        )
        or
        (
          correction_contract_version = 1
          and correction_reason is not null
          and correction_reason in (
            'MISSING_INFORMATION',
            'INCORRECT_INFORMATION',
            'INCONSISTENT_INFORMATION',
            'UNREADABLE_DOCUMENT',
            'WRONG_DOCUMENT',
            'OTHER'
          )
          and correction_instruction = pg_catalog.btrim(correction_instruction)
          and pg_catalog.char_length(correction_instruction) between 1 and 1000
          and correction_instruction ~ '[[:alnum:]]'
        )
      )
    )
  );

comment on column public.app_evidence_review_decisions.correction_contract_version is
  'Null on ACCEPTED and historical pre-REVIEW12 rows; 1 identifies the closed REVIEW12 correction-detail contract.';
comment on column public.app_evidence_review_decisions.correction_reason is
  'Closed REVIEW12 reason for a new CORRECTION_REQUIRED decision; never a free-text reason code.';
comment on column public.app_evidence_review_decisions.correction_instruction is
  'Trimmed concise reviewer instruction for a new CORRECTION_REQUIRED decision; immutable with the decision and at most 1000 characters.';

create function public.app_evidence_review_correction_insert_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.decision = 'ACCEPTED' then
    if new.correction_contract_version is not null
       or new.correction_reason is not null
       or new.correction_instruction is not null then
      raise exception 'accepted evidence decision cannot carry correction details'
        using errcode = '23514';
    end if;
  elsif new.decision = 'CORRECTION_REQUIRED' then
    if new.correction_contract_version is distinct from 1
       or new.correction_reason is null
       or new.correction_reason not in (
         'MISSING_INFORMATION',
         'INCORRECT_INFORMATION',
         'INCONSISTENT_INFORMATION',
         'UNREADABLE_DOCUMENT',
         'WRONG_DOCUMENT',
         'OTHER'
       )
       or new.correction_instruction is null
       or new.correction_instruction <> pg_catalog.btrim(
         new.correction_instruction
       )
       or pg_catalog.char_length(new.correction_instruction) not between 1 and 1000
       or new.correction_instruction !~ '[[:alnum:]]' then
      raise exception 'correction-required evidence decision needs valid details'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger app_evidence_review_decisions_correction_insert_guard_v1
before insert on public.app_evidence_review_decisions
for each row execute function public.app_evidence_review_correction_insert_guard_v1();

create function public.app_evidence_review_decide_v2(
  p_auth_user_id uuid,
  p_evidence_version_id uuid,
  p_decision text,
  p_correction_reason text,
  p_correction_instruction text,
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
  v_case_id uuid;
  v_auth jsonb;
  v_scope text;
  v_begin jsonb;
  v_existing public.app_evidence_review_decisions%rowtype;
  v_decision_id uuid;
  v_response jsonb;
begin
  if p_evidence_version_id is null
     or p_decision not in ('ACCEPTED', 'CORRECTION_REQUIRED')
     or coalesce(pg_catalog.btrim(p_request_id), '') = ''
     or pg_catalog.char_length(p_request_id) > 128
     or coalesce(pg_catalog.btrim(p_idempotency_key), '') = ''
     or pg_catalog.char_length(p_idempotency_key) > 200
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or (
       p_decision = 'ACCEPTED'
       and (
         p_correction_reason is not null
         or p_correction_instruction is not null
       )
     )
     or (
       p_decision = 'CORRECTION_REQUIRED'
       and (
         p_correction_reason is null
         or p_correction_reason not in (
           'MISSING_INFORMATION',
           'INCORRECT_INFORMATION',
           'INCONSISTENT_INFORMATION',
           'UNREADABLE_DOCUMENT',
           'WRONG_DOCUMENT',
           'OTHER'
         )
         or p_correction_instruction is null
         or p_correction_instruction <> pg_catalog.btrim(
           p_correction_instruction
         )
         or pg_catalog.char_length(p_correction_instruction) not between 1 and 1000
         or p_correction_instruction !~ '[[:alnum:]]'
       )
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'evidence_review:v1:' || p_evidence_version_id::text, 0
    )
  );
  select evidence_file.case_id into v_case_id
  from public.app_evidence_versions evidence_version
  join public.app_evidence_files evidence_file
    on evidence_file.id = evidence_version.evidence_file_id
  where evidence_version.id = p_evidence_version_id
    and evidence_version.status = 'confirmed_awaiting_review';
  if v_case_id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'evidence_version_missing'
    );
  end if;

  v_auth := public.app_workforce_authorize_v1(
    p_auth_user_id, 'evidence.review.decide', v_case_id, null, v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;

  v_scope := 'evidence_review_decide:v1:workforce:' ||
    (v_auth->>'workforce_identity_id') || ':evidence_version:' ||
    p_evidence_version_id::text;
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_sha256,
    p_idempotency_expires_at, 'worker', v_auth->>'actor_ref', p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;

  select * into v_existing
  from public.app_evidence_review_decisions
  where evidence_version_id = p_evidence_version_id;
  if found then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'evidence_already_decided',
      'evidence_version_id', p_evidence_version_id,
      'review_state', v_existing.decision
    );
    return public.app_evidence_review_idempotency_complete_v1(
      v_scope, p_idempotency_key, v_response
    );
  end if;

  insert into public.app_evidence_review_decisions (
    evidence_version_id, case_id, decision,
    correction_contract_version, correction_reason, correction_instruction,
    reviewer_workforce_identity_id, reviewer_scope_assignment_id,
    capability_code, authorization_policy_version_id, payload_sha256,
    request_id, idempotency_key, decided_at
  ) values (
    p_evidence_version_id, v_case_id, p_decision,
    case when p_decision = 'CORRECTION_REQUIRED' then 1 else null end,
    p_correction_reason, p_correction_instruction,
    (v_auth->>'workforce_identity_id')::uuid,
    (v_auth->>'scope_assignment_id')::uuid,
    'evidence.review.decide', (v_auth->>'policy_version_id')::uuid,
    p_payload_sha256, p_request_id, p_idempotency_key, v_now
  ) returning id into v_decision_id;

  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'ok',
    'evidence_version_id', p_evidence_version_id,
    'review_decision_id', v_decision_id,
    'review_state', p_decision,
    'correction_reason', p_correction_reason,
    'correction_instruction', p_correction_instruction
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

create function public.app_evidence_review_case_detail_read_v2(
  p_auth_user_id uuid,
  p_case_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_response jsonb;
  v_evidence jsonb;
begin
  v_response := public.app_evidence_review_case_detail_read_v1(
    p_auth_user_id, p_case_ref
  );
  if v_response->>'ok' <> 'true' then return v_response; end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      evidence.item || pg_catalog.jsonb_build_object(
        'correction_reason', decision.correction_reason,
        'correction_instruction', decision.correction_instruction
      ) order by evidence.ordinality
    ),
    '[]'::jsonb
  ) into v_evidence
  from pg_catalog.jsonb_array_elements(v_response->'evidence')
    with ordinality as evidence(item, ordinality)
  left join public.app_evidence_review_decisions decision
    on decision.evidence_version_id =
      (evidence.item->>'evidence_version_ref')::uuid;

  return pg_catalog.jsonb_set(v_response, '{evidence}', v_evidence, true);
end;
$$;

revoke all on function public.app_evidence_review_correction_insert_guard_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.app_evidence_review_decide_v1(
  uuid, uuid, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.app_evidence_review_decide_v2(
  uuid, uuid, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.app_evidence_review_decide_v2(
  uuid, uuid, text, text, text, text, text, text, timestamptz
) to service_role;

revoke all on function public.app_evidence_review_case_detail_read_v2(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.app_evidence_review_case_detail_read_v2(uuid, text)
  to service_role;

comment on function public.app_evidence_review_decide_v2(
  uuid, uuid, text, text, text, text, text, text, timestamptz
) is
  'Service-role-only REVIEW12 decision authority. It preserves REVIEW02 locking, exact workforce/case authorization and idempotency while atomically requiring closed immutable correction details for every new CORRECTION_REQUIRED decision.';
comment on function public.app_evidence_review_case_detail_read_v2(uuid, text) is
  'Service-role-only REVIEW07 detail projection with optional immutable REVIEW12 correction reason and instruction. It reuses the existing exact-case authorization and adds no server call or worklist state.';

commit;

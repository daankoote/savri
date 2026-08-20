begin;

-- CUSTOMER04C3A: append-only correction-handoff supersession. Existing handoff
-- rows stay immutable; only a newly inserted successor records predecessor
-- lineage, workforce reason, changed response requirements and provenance.

alter table public.app_workforce_capability_catalog
  drop constraint app_workforce_capability_shape_chk;
alter table public.app_workforce_capability_catalog
  add constraint app_workforce_capability_shape_chk check (
    (
      capability_code in (
        'location.root.create',
        'evidence.review.view',
        'evidence.review.decide'
      )
      and scope_kind = 'case'
      and (
        capability_code not in (
          'evidence.review.view', 'evidence.review.decide'
        )
        or (
          floor_seniority = 'member'
          and default_seniority = case capability_code
            when 'evidence.review.view' then 'member'
            else 'reviewer'
          end
        )
      )
    )
    or (
      capability_code = 'evidence.review.correction.publish'
      and scope_kind = 'case'
      and floor_seniority = 'reviewer'
      and default_seniority = 'reviewer'
    )
    or (
      capability_code = 'evidence.review.correction.supersede'
      and scope_kind = 'case'
      and floor_seniority = 'admin'
      and default_seniority = 'admin'
    )
    or (
      capability_code in (
        'location.observation.record',
        'location.version.accept.prepare',
        'location.version.accept.approve',
        'location.version.correct.prepare',
        'location.version.correct.approve'
      )
      and scope_kind = 'case_location'
    )
    or (
      capability_code in (
        'workforce.member.manage',
        'workforce.policy.manage',
        'case.assignment.manage'
      )
      and scope_kind = 'global'
      and floor_seniority = 'admin'
      and default_seniority = 'admin'
    )
    or (
      capability_code in (
        'compliance.delivery_year.view',
        'compliance.delivery_year.record'
      )
      and scope_kind = 'tenant_wide'
      and floor_seniority = 'member'
      and default_seniority = 'reviewer'
    )
  );

insert into public.app_workforce_capability_catalog (
  capability_code, catalogue_version, floor_seniority,
  default_seniority, scope_kind
) values (
  'evidence.review.correction.supersede', 'pilot_v1',
  'admin', 'admin', 'case'
);

alter table public.app_workforce_capability_assignments
  drop constraint app_workforce_capability_assignments_capability_chk;
alter table public.app_workforce_capability_assignments
  add constraint app_workforce_capability_assignments_capability_chk check (
    capability_code in (
      'location.root.create',
      'location.observation.record',
      'location.version.accept.prepare',
      'location.version.accept.approve',
      'location.version.correct.prepare',
      'location.version.correct.approve',
      'workforce.member.manage',
      'workforce.policy.manage',
      'case.assignment.manage',
      'compliance.delivery_year.view',
      'compliance.delivery_year.record',
      'evidence.review.view',
      'evidence.review.decide',
      'evidence.review.correction.publish',
      'evidence.review.correction.supersede'
    )
  );

alter table public.app_workforce_scope_assignments
  drop constraint app_workforce_scope_assignments_capability_chk;
alter table public.app_workforce_scope_assignments
  add constraint app_workforce_scope_assignments_capability_chk check (
    capability_code in (
      'location.root.create',
      'location.observation.record',
      'location.version.accept.prepare',
      'location.version.accept.approve',
      'location.version.correct.prepare',
      'location.version.correct.approve',
      'evidence.review.view',
      'evidence.review.decide',
      'evidence.review.correction.publish',
      'evidence.review.correction.supersede'
    )
  );
alter table public.app_workforce_scope_assignments
  drop constraint app_workforce_scope_assignments_shape_chk;
alter table public.app_workforce_scope_assignments
  add constraint app_workforce_scope_assignments_shape_chk check (
    (
      capability_code in (
        'location.root.create',
        'evidence.review.view',
        'evidence.review.decide',
        'evidence.review.correction.publish',
        'evidence.review.correction.supersede'
      )
      and location_id is null
      and case_location_relation_id is null
    )
    or (
      capability_code in (
        'location.observation.record',
        'location.version.accept.prepare',
        'location.version.accept.approve',
        'location.version.correct.prepare',
        'location.version.correct.approve'
      )
      and location_id is not null
      and case_location_relation_id is not null
    )
  );

insert into public.app_workforce_policy_versions (
  id, policy_ref, catalogue_version, require_distinct_maker_checker,
  canonical_sha256, created_by_workforce_identity_id,
  created_by_actor_ref, decision_ref, request_id
) values (
  '00000000-0000-4000-8000-000000003501',
  'enval_default_v6', 'pilot_v1', true,
  pg_catalog.encode(extensions.digest(
    'customer04c3a|enval_default_v6|evidence.review.correction.supersede=admin',
    'sha256'
  ), 'hex'),
  null, 'system:customer04c3a_migration',
  'customer04c3a_default_policy', 'customer04c3a-default-policy-v6'
);

insert into public.app_workforce_policy_requirements (
  policy_version_id, capability_code, minimum_seniority
)
select
  '00000000-0000-4000-8000-000000003501'::uuid,
  catalog.capability_code,
  catalog.default_seniority
from public.app_workforce_capability_catalog catalog;

do $$
declare
  v_effective_at timestamptz := pg_catalog.clock_timestamp();
  identity_row record;
begin
  insert into public.app_workforce_policy_activations (
    id, policy_version_id, effective_at, recorded_at,
    activated_by_workforce_identity_id, activated_by_actor_ref,
    decision_ref, request_id
  ) values (
    '00000000-0000-4000-8000-000000003502',
    '00000000-0000-4000-8000-000000003501',
    v_effective_at, v_effective_at, null,
    'system:customer04c3a_migration',
    'customer04c3a_default_policy',
    'customer04c3a-default-policy-activation-v6'
  );
  insert into public.app_audit_events (
    event_type, scope_type, scope_id, request_id, actor_type, actor_ref,
    event_data, authorization_policy_version_id, created_at
  ) values
    (
      'workforce_policy_version_created', 'workforce_policy',
      '00000000-0000-4000-8000-000000003501',
      'customer04c3a-default-policy-v6', 'system',
      'system:customer04c3a_migration',
      '{"catalogue_version":"pilot_v1","policy_ref":"enval_default_v6"}',
      '00000000-0000-4000-8000-000000003501', v_effective_at
    ),
    (
      'workforce_policy_activated', 'workforce_policy',
      '00000000-0000-4000-8000-000000003501',
      'customer04c3a-default-policy-activation-v6', 'system',
      'system:customer04c3a_migration',
      '{"catalogue_version":"pilot_v1","policy_ref":"enval_default_v6"}',
      '00000000-0000-4000-8000-000000003501', v_effective_at
    );
  for identity_row in
    select id from public.app_workforce_identities order by id
  loop
    perform public.app_workforce_reconcile_capabilities_v1(
      identity_row.id, v_effective_at,
      'system:customer04c3a_migration',
      'customer04c3a_default_policy',
      'customer04c3a-reconcile-' || pg_catalog.md5(identity_row.id::text)
    );
  end loop;

  insert into public.app_workforce_scope_assignments (
    scope_assignment_id, workforce_identity_id,
    capability_assignment_id, capability_code, case_id,
    location_id, case_location_relation_id, event_type,
    effective_at, valid_until, decision_ref, reason_ref,
    recorded_by_actor_ref, request_id, supersedes_scope_event_id
  )
  select
    gen_random_uuid(), source.workforce_identity_id,
    capability.id, 'evidence.review.correction.supersede', source.case_id,
    null, null, 'granted', v_effective_at, source.valid_until,
    'customer04c3a_admin_case_scope', null,
    'system:customer04c3a_migration',
    'customer04c3a-scope-' || pg_catalog.md5(
      source.workforce_identity_id::text || ':' || source.case_id::text
    ),
    null
  from (
    select distinct on (scope.workforce_identity_id, scope.case_id)
      scope.workforce_identity_id, scope.case_id, scope.valid_until
    from public.app_workforce_scope_assignments scope
    where scope.capability_code = 'evidence.review.correction.publish'
      and scope.event_type = 'granted'
      and scope.supersedes_scope_event_id is null
      and scope.effective_at <= v_effective_at
      and (scope.valid_until is null or v_effective_at < scope.valid_until)
      and not exists (
        select 1
        from public.app_workforce_scope_assignments revoke_event
        where revoke_event.scope_assignment_id = scope.scope_assignment_id
          and revoke_event.event_type = 'revoked'
          and revoke_event.effective_at <= v_effective_at
      )
    order by scope.workforce_identity_id, scope.case_id,
      scope.effective_at desc, scope.recorded_at desc
  ) source
  join lateral (
    select assignment.*
    from public.app_workforce_capability_assignments assignment
    where assignment.workforce_identity_id = source.workforce_identity_id
      and assignment.capability_code =
        'evidence.review.correction.supersede'
      and assignment.event_type = 'granted'
      and assignment.supersedes_assignment_event_id is null
      and assignment.effective_at <= v_effective_at
      and (
        assignment.valid_until is null
        or v_effective_at < assignment.valid_until
      )
      and not exists (
        select 1
        from public.app_workforce_capability_assignments revoke_event
        where revoke_event.assignment_id = assignment.assignment_id
          and revoke_event.event_type = 'revoked'
          and revoke_event.effective_at <= v_effective_at
      )
    order by assignment.effective_at desc, assignment.recorded_at desc
    limit 1
  ) capability on true;
end;
$$;

create or replace function public.app_customer_correction_handoff_read_v2(
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
  v_case public.app_cases%rowtype;
  v_manifest jsonb;
  v_handoff public.app_evidence_review_correction_handoffs%rowtype;
  v_items jsonb;
begin
  if p_auth_user_id is null or p_case_ref is null
     or p_case_ref <> pg_catalog.btrim(p_case_ref)
     or pg_catalog.char_length(p_case_ref) not between 8 and 64 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  if not exists (
    select 1
    from auth.users auth_user
    where auth_user.id = p_auth_user_id
      and auth_user.deleted_at is null
      and coalesce(auth_user.email_confirmed_at, auth_user.confirmed_at)
        is not null
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 401, 'code', 'authentication_required'
    );
  end if;
  select case_row.* into v_case
  from public.app_cases case_row
  join public.app_customers customer_row
    on customer_row.id = case_row.customer_id
   and customer_row.status = 'active'
  where case_row.case_reference = p_case_ref;
  if not found or not exists (
    select 1
    from public.app_customer_access_grants access_grant
    where access_grant.auth_user_id = p_auth_user_id
      and access_grant.customer_id = v_case.customer_id
      and (
        access_grant.granted_case_id is null
        or access_grant.granted_case_id = v_case.id
      )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'customer_case_access_denied'
    );
  end if;

  v_manifest := public.app_evidence_fact_review_manifest_v1(v_case.id);
  if v_manifest->>'ok' <> 'true' then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'status', 200, 'code', 'not_available',
      'case_ref', v_case.case_reference, 'handoff', null
    );
  end if;
  select handoff.* into v_handoff
  from public.app_evidence_review_correction_handoffs handoff
  where handoff.id = public.app_evidence_review_current_correction_handoff_v1(
    v_case.id,
    v_manifest->>'manifest_version',
    v_manifest->>'manifest_hash'
  )
    and handoff.target_customer_id = v_case.customer_id;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'status', 200, 'code', 'not_available',
      'case_ref', v_case.case_reference, 'handoff', null
    );
  end if;
  if v_handoff.bundle_sha256 <> pg_catalog.encode(
    extensions.digest(v_handoff.correction_bundle::text, 'sha256'), 'hex'
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500, 'code', 'handoff_integrity_failed'
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(
    pg_catalog.jsonb_build_object(
      'item_ref', public.app_customer_correction_item_ref_v1(
        v_handoff.id,
        v_case.id,
        v_case.customer_id,
        bundle.item->>'subject_ref'
      ),
      'document_label',
        bundle.item->'customer_safe'->>'document_label',
      'fact_label', bundle.item->'customer_safe'->>'fact_label',
      'current_value', bundle.item->'customer_safe'->'current_value',
      'correction_reason',
        bundle.item->'customer_safe'->>'correction_reason',
      'correction_reason_label',
        bundle.item->'customer_safe'->>'correction_reason_label',
      'correction_instruction',
        bundle.item->'customer_safe'->>'correction_instruction',
      'response_requirement', coalesce(
        bundle.item->>'response_requirement',
        public.app_customer_correction_action_requirement_v1(
          bundle.item,
          subject.item->>'value_status'
        )
      )
    )
  ) order by bundle.ordinality), '[]'::jsonb) into v_items
  from pg_catalog.jsonb_array_elements(v_handoff.correction_bundle->'items')
    with ordinality bundle(item, ordinality)
  join pg_catalog.jsonb_array_elements(v_manifest->'subjects') subject(item)
    on subject.item->>'subject_ref' = bundle.item->>'subject_ref';

  if pg_catalog.jsonb_array_length(v_items) <>
       pg_catalog.jsonb_array_length(v_handoff.correction_bundle->'items')
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(v_items) item(value)
       where item.value->>'item_ref' !~ '^CCI-[A-F0-9]{32}$'
          or item.value->>'response_requirement' not in (
            'VALUE_CORRECTION',
            'MISSING_VALUE',
            'DOCUMENT_REPLACEMENT',
            'VALUE_PLUS_DOCUMENT_REPLACEMENT'
          )
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500,
      'code', 'correction_handoff_reconstruction_failed'
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'status', 200,
    'code', 'ok',
    'case_ref', v_case.case_reference,
    'handoff', pg_catalog.jsonb_build_object(
      'handoff_ref', v_handoff.handoff_reference,
      'published_at', v_handoff.published_at,
      'items', v_items
    )
  );
end;
$$;

alter table public.app_evidence_review_correction_handoffs
  drop constraint app_evidence_review_correction_handoffs_round_id_key;
alter table public.app_evidence_review_correction_handoffs
  add column supersedes_handoff_id uuid
    references public.app_evidence_review_correction_handoffs(id)
    on delete restrict,
  add column supersession_reason text,
  add column supersession_explanation text;

create unique index app_evidence_review_correction_handoffs_round_root_uidx
  on public.app_evidence_review_correction_handoffs(round_id)
  where supersedes_handoff_id is null;
create unique index app_evidence_review_correction_handoffs_predecessor_uidx
  on public.app_evidence_review_correction_handoffs(supersedes_handoff_id)
  where supersedes_handoff_id is not null;

alter table public.app_evidence_review_correction_handoffs
  drop constraint app_evidence_review_correction_handoffs_capability_chk;
alter table public.app_evidence_review_correction_handoffs
  add constraint app_evidence_review_correction_handoffs_capability_chk check (
    (
      supersedes_handoff_id is null
      and capability_code = 'evidence.review.correction.publish'
      and supersession_reason is null
      and supersession_explanation is null
    )
    or (
      supersedes_handoff_id is not null
      and capability_code = 'evidence.review.correction.supersede'
      and supersession_reason in (
        'NEW_EVIDENCE_REQUIRED',
        'REQUIREMENT_CORRECTION',
        'PROCESS_CORRECTION',
        'OTHER'
      )
      and (
        (
          supersession_reason = 'OTHER'
          and supersession_explanation =
            pg_catalog.btrim(supersession_explanation)
          and pg_catalog.char_length(supersession_explanation)
            between 1 and 500
        )
        or (
          supersession_reason <> 'OTHER'
          and supersession_explanation is null
        )
      )
    )
  );
alter table public.app_evidence_review_correction_handoffs
  drop constraint app_evidence_review_correction_handoffs_bundle_chk;
alter table public.app_evidence_review_correction_handoffs
  add constraint app_evidence_review_correction_handoffs_bundle_chk check (
    pg_catalog.jsonb_typeof(correction_bundle) = 'object'
    and correction_bundle->>'schema_version' in (
      'evidence-review-correction-handoff-bundle-v1',
      'evidence-review-correction-handoff-bundle-v2'
    )
    and pg_catalog.jsonb_typeof(correction_bundle->'items') = 'array'
    and pg_catalog.jsonb_array_length(correction_bundle->'items') > 0
  );

create function public.app_evidence_review_correction_handoff_lineage_guard_v1()
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
       or new.correction_bundle->>'schema_version' <>
         'evidence-review-correction-handoff-bundle-v1' then
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
     or new.correction_bundle->>'schema_version' <>
       'evidence-review-correction-handoff-bundle-v2'
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

create trigger trg_app_evidence_review_correction_handoffs_lineage
before insert on public.app_evidence_review_correction_handoffs
for each row execute function
  public.app_evidence_review_correction_handoff_lineage_guard_v1();

create function public.app_evidence_review_current_correction_handoff_v1(
  p_case_id uuid,
  p_manifest_version text,
  p_manifest_hash text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select handoff.id
  from public.app_evidence_review_correction_handoffs handoff
  where handoff.case_id = p_case_id
    and handoff.manifest_version = p_manifest_version
    and handoff.manifest_hash = p_manifest_hash
    and not exists (
      select 1
      from public.app_evidence_review_customer_submissions submission
      where submission.handoff_id = handoff.id
    )
    and not exists (
      select 1
      from public.app_evidence_review_correction_handoffs successor
      where successor.supersedes_handoff_id = handoff.id
    )
  order by handoff.published_at desc, handoff.id desc
  limit 1;
$$;

create function public.app_evidence_review_correction_supersede_v1(
  p_auth_user_id uuid,
  p_case_ref text,
  p_predecessor_handoff_ref text,
  p_item_requirements jsonb,
  p_reason text,
  p_explanation text,
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
    'evidence_review_correction_supersede:v1:' || v_case.id::text, 0
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

  v_scope := 'evidence_review_correction_supersede:v1:case:' ||
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
      v_predecessor.correction_bundle,
      '{schema_version}',
      '"evidence-review-correction-handoff-bundle-v2"'::jsonb
    ),
    '{items}',
    v_items
  );
  select pg_catalog.encode(extensions.digest(v_bundle::text, 'sha256'), 'hex')
    into v_bundle_sha256;
  select 'CRH-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.encode(
    extensions.digest(
      'correction-handoff-supersession-v1|' || v_predecessor.id::text || '|' ||
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

create or replace function public.app_customer_correction_prepare_v1(
  p_auth_user_id uuid,
  p_case_ref text,
  p_responses jsonb
)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
declare
  v_case public.app_cases%rowtype;
  v_handoff public.app_evidence_review_correction_handoffs%rowtype;
  v_manifest jsonb;
  v_parent public.app_signup_signing_snapshots%rowtype;
  v_items jsonb;
  v_snapshot jsonb;
  v_facts jsonb;
  v_item record;
  v_fact_found boolean;
begin
  if p_auth_user_id is null or p_case_ref is null
     or p_case_ref <> pg_catalog.btrim(p_case_ref)
     or pg_catalog.char_length(p_case_ref) not between 8 and 64
     or pg_catalog.jsonb_typeof(p_responses) <> 'array'
     or pg_catalog.jsonb_array_length(p_responses) not between 1 and 100 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  if not exists (
    select 1 from auth.users auth_user
    where auth_user.id = p_auth_user_id
      and auth_user.deleted_at is null
      and coalesce(auth_user.email_confirmed_at, auth_user.confirmed_at)
        is not null
  ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 401, 'code', 'authentication_required'
  ); end if;
  select case_row.* into v_case
  from public.app_cases case_row
  join public.app_customers customer_row
    on customer_row.id = case_row.customer_id
   and customer_row.status = 'active'
  where case_row.case_reference = p_case_ref;
  if not found or not exists (
    select 1 from public.app_customer_access_grants access_grant
    where access_grant.auth_user_id = p_auth_user_id
      and access_grant.customer_id = v_case.customer_id
      and (access_grant.granted_case_id is null
        or access_grant.granted_case_id = v_case.id)
  ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 404, 'code', 'customer_case_access_denied'
  ); end if;

  v_manifest := public.app_evidence_fact_review_manifest_v1(v_case.id);
  if v_manifest->>'ok' <> 'true' then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'current_manifest_unavailable'
  ); end if;
  select handoff.* into v_handoff
  from public.app_evidence_review_correction_handoffs handoff
  where handoff.id = public.app_evidence_review_current_correction_handoff_v1(
    v_case.id,
    v_manifest->>'manifest_version',
    v_manifest->>'manifest_hash'
  )
    and handoff.target_customer_id = v_case.customer_id;
  if not found then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'current_unanswered_handoff_missing'
  ); end if;
  if v_handoff.bundle_sha256 <> pg_catalog.encode(
    extensions.digest(v_handoff.correction_bundle::text, 'sha256'), 'hex'
  ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 500, 'code', 'handoff_integrity_failed'
  ); end if;
  if pg_catalog.jsonb_array_length(p_responses) <>
       pg_catalog.jsonb_array_length(v_handoff.correction_bundle->'items')
     or exists (
       select 1 from pg_catalog.jsonb_array_elements(p_responses) response(item)
       where pg_catalog.jsonb_typeof(response.item) <> 'object'
          or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(response.item)) <> 2
          or not (response.item ? 'itemIndex')
          or not (response.item ? 'correctedValue')
          or pg_catalog.jsonb_typeof(response.item->'itemIndex') <> 'number'
          or pg_catalog.jsonb_typeof(response.item->'correctedValue') <> 'string'
     )
     or (select pg_catalog.count(distinct (item->>'itemIndex')::integer)
         from pg_catalog.jsonb_array_elements(p_responses) response(item)) <>
        pg_catalog.jsonb_array_length(p_responses) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'response_set_mismatch'
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'item_index', bundle.ordinality - 1,
    'handoff_subject_ref', bundle.item->>'subject_ref',
    'fact_id', subject.item->>'fact_id',
    'fact_key', subject.item->>'fact_key',
    'scope_ref', subject.item->>'scope_ref',
    'evidence_file_id', subject.item->>'evidence_file_id',
    'evidence_version_id', subject.item->>'evidence_version_id',
    'evidence_sha256', evidence_version.sha256,
    'action_requirement', public.app_customer_correction_action_requirement_v1(
      bundle.item, subject.item->>'value_status'
    ),
    'prior_value', subject.item->'value',
    'prior_value_sha256', subject.item->>'value_sha256',
    'corrected_value', public.app_customer_correction_normalize_value_v1(
      subject.item->>'fact_key', response.item->>'correctedValue'
    )
  ) order by bundle.ordinality), '[]'::jsonb) into v_items
  from pg_catalog.jsonb_array_elements(v_handoff.correction_bundle->'items')
    with ordinality bundle(item, ordinality)
  join pg_catalog.jsonb_array_elements(v_manifest->'subjects') subject(item)
    on subject.item->>'subject_ref' = bundle.item->>'subject_ref'
  join public.app_evidence_versions evidence_version
    on evidence_version.id = (subject.item->>'evidence_version_id')::uuid
  left join pg_catalog.jsonb_array_elements(p_responses) response(item)
    on (response.item->>'itemIndex')::integer = bundle.ordinality - 1;

  if pg_catalog.jsonb_array_length(v_items) <>
       pg_catalog.jsonb_array_length(p_responses)
     or exists (
       select 1 from pg_catalog.jsonb_array_elements(v_items) item(value)
       where item.value->>'action_requirement' not in (
         'VALUE_CORRECTION', 'MISSING_VALUE'
       ) or item.value->>'corrected_value' is null
     ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'unsupported_or_invalid_correction'
  ); end if;

  select snapshot.* into v_parent
  from public.app_signup_signing_snapshots snapshot
  where snapshot.id = (
    select (subject.item->>'signing_snapshot_id')::uuid
    from pg_catalog.jsonb_array_elements(v_manifest->'subjects') subject(item)
    limit 1
  );
  if not found or exists (
    select 1 from pg_catalog.jsonb_array_elements(v_manifest->'subjects') subject(item)
    where subject.item->>'signing_snapshot_id' <> v_parent.id::text
  ) then return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'parent_snapshot_ambiguous'
  ); end if;

  v_snapshot := v_parent.canonical_snapshot;
  v_facts := coalesce(v_snapshot #> '{canonical_facts,facts}', '[]'::jsonb);
  for v_item in select item.value
    from pg_catalog.jsonb_array_elements(v_items) item(value)
    order by (item.value->>'item_index')::integer
  loop
    select exists (
      select 1 from pg_catalog.jsonb_array_elements(v_facts) fact(value)
      where fact.value->>'fact_id' = v_item.value->>'fact_id'
    ) into v_fact_found;
    select coalesce(pg_catalog.jsonb_agg(
      case when fact.value->>'fact_id' = v_item.value->>'fact_id'
        then pg_catalog.jsonb_set(
          pg_catalog.jsonb_set(fact.value, '{value}',
            pg_catalog.to_jsonb(v_item.value->>'corrected_value')),
          '{resolution_state}', '"review_required"'::jsonb
        )
        else fact.value end order by fact.ordinality
    ), '[]'::jsonb) into v_facts
    from pg_catalog.jsonb_array_elements(v_facts)
      with ordinality fact(value, ordinality);
    if not v_fact_found then
      v_facts := v_facts || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'fact_id', v_item.value->>'fact_id',
          'fact_key', v_item.value->>'fact_key',
          'value', v_item.value->>'corrected_value',
          'resolution_state', 'review_required',
          'required', true
        )
      );
    end if;
  end loop;
  v_snapshot := pg_catalog.jsonb_set(
    v_snapshot, '{canonical_facts,facts}', v_facts
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 200, 'code', 'prepared',
    'case_id', v_case.id, 'customer_id', v_case.customer_id,
    'handoff_id', v_handoff.id,
    'handoff_ref', v_handoff.handoff_reference,
    'handoff_bundle_sha256', v_handoff.bundle_sha256,
    'source_round_id', v_handoff.round_id,
    'source_manifest_version', v_handoff.manifest_version,
    'source_manifest_hash', v_handoff.manifest_hash,
    'parent_snapshot_id', v_parent.id,
    'parent_snapshot_sha256', v_parent.canonical_snapshot_sha256,
    'snapshot_draft', v_snapshot,
    'items', v_items,
    'responses', p_responses
  );
end;
$$;

create or replace function public.app_evidence_review_overall_status_v1(
  p_case_id uuid,
  p_manifest_version text,
  p_manifest_hash text
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_round public.app_evidence_review_rounds%rowtype;
begin
  if p_case_id is null
     or p_manifest_version <> 'fact-review-manifest-v1'
     or p_manifest_hash !~ '^[0-9a-f]{64}$' then
    return 'REVIEW_MODEL_UNAVAILABLE';
  end if;
  select round_row.* into v_round
  from public.app_evidence_review_rounds round_row
  where round_row.case_id = p_case_id
    and round_row.manifest_version = p_manifest_version
    and round_row.manifest_hash = p_manifest_hash;
  if not found then return 'TO_REVIEW'; end if;
  if v_round.outcome = 'CORRECTIONS_REQUIRED' then
    if public.app_evidence_review_current_correction_handoff_v1(
      p_case_id,
      p_manifest_version,
      p_manifest_hash
    ) is not null then
      return 'WAITING_CUSTOMER';
    end if;
    return 'CORRECTION_REQUIRED';
  end if;
  if v_round.outcome = 'ALL_FACTS_ACCEPTED' then
    return 'REVIEW_COMPLETE';
  end if;
  return 'REVIEW_MODEL_UNAVAILABLE';
end;
$$;

revoke all on function
  public.app_evidence_review_correction_handoff_lineage_guard_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.app_evidence_review_current_correction_handoff_v1(
  uuid, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.app_evidence_review_correction_supersede_v1(
  uuid, text, text, jsonb, text, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.app_evidence_review_correction_supersede_v1(
  uuid, text, text, jsonb, text, text, text, text, text, timestamptz
) to service_role;

comment on column
  public.app_evidence_review_correction_handoffs.supersedes_handoff_id is
  'Immutable predecessor lineage. A non-null value exists only on a new successor; the predecessor row is never updated.';
comment on function public.app_evidence_review_current_correction_handoff_v1(
  uuid, text, text
) is
  'Private immutable current-tail derivation: published, unanswered and without a successor for the exact current case manifest.';
comment on function public.app_evidence_review_correction_supersede_v1(
  uuid, text, text, jsonb, text, text, text, text, text, timestamptz
) is
  'Service-role-only atomic admin/exact-case supersession. It preserves the correction item set and predecessor, inserts one immutable successor, records reason/provenance, and fails closed on stale, changed-idempotency or branching attempts.';

commit;

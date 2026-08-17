begin;

-- REG03H adds one authenticated workforce capture route to the immutable
-- REG03G ledger. The fixed capability, regulated actor, provenance mapping,
-- tenant scope, recorder and policy context remain server/database owned.

alter table public.app_workforce_capability_catalog
  drop constraint app_workforce_capability_shape_chk;
alter table public.app_workforce_capability_catalog
  add constraint app_workforce_capability_shape_chk check (
    (capability_code = 'location.root.create' and scope_kind = 'case')
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
  'compliance.delivery_year.record', 'pilot_v1',
  'member', 'reviewer', 'tenant_wide'
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
      'compliance.delivery_year.record'
    )
  );

alter table public.app_workforce_tenant_scope_assignments
  drop constraint app_workforce_tenant_scope_capability_chk;
alter table public.app_workforce_tenant_scope_assignments
  add constraint app_workforce_tenant_scope_capability_chk check (
    capability_code in (
      'compliance.delivery_year.view',
      'compliance.delivery_year.record'
    )
  );

create or replace function public.app_workforce_tenant_scope_sync_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  scope_grant public.app_workforce_tenant_scope_assignments%rowtype;
begin
  if new.capability_code not in (
    'compliance.delivery_year.view',
    'compliance.delivery_year.record'
  ) then
    return new;
  end if;
  if new.event_type = 'granted' then
    insert into public.app_workforce_tenant_scope_assignments (
      scope_assignment_id, workforce_identity_id, capability_assignment_id,
      capability_code, scope_kind, tenant_scope_ref, event_type,
      effective_at, valid_until, decision_ref, reason_ref,
      recorded_by_actor_ref, request_id, supersedes_scope_event_id
    ) values (
      gen_random_uuid(), new.workforce_identity_id, new.id,
      new.capability_code, 'TENANT_WIDE', 'CURRENT_TENANT_DATA_PLANE',
      'granted', new.effective_at, new.valid_until, new.decision_ref, null,
      new.recorded_by_actor_ref,
      pg_catalog.left(new.request_id, 115) || ':tenant', null
    );
  else
    select * into scope_grant
    from public.app_workforce_tenant_scope_assignments scope_event
    where scope_event.workforce_identity_id = new.workforce_identity_id
      and scope_event.capability_assignment_id =
          new.supersedes_assignment_event_id
      and scope_event.capability_code = new.capability_code
      and scope_event.event_type = 'granted'
      and scope_event.supersedes_scope_event_id is null
    for update;
    if not found then
      raise exception 'tenant scope grant missing for capability revocation'
        using errcode = '23514';
    end if;
    if exists (
      select 1
      from public.app_workforce_tenant_scope_assignments scope_revoke
      where scope_revoke.supersedes_scope_event_id = scope_grant.id
    ) then
      return new;
    end if;
    insert into public.app_workforce_tenant_scope_assignments (
      scope_assignment_id, workforce_identity_id, capability_assignment_id,
      capability_code, scope_kind, tenant_scope_ref, event_type,
      effective_at, valid_until, decision_ref, reason_ref,
      recorded_by_actor_ref, request_id, supersedes_scope_event_id
    ) values (
      scope_grant.scope_assignment_id, scope_grant.workforce_identity_id,
      scope_grant.capability_assignment_id, scope_grant.capability_code,
      scope_grant.scope_kind, scope_grant.tenant_scope_ref, 'revoked',
      new.effective_at, null, new.decision_ref,
      coalesce(new.reason_ref, 'capability_revoked'),
      new.recorded_by_actor_ref,
      pg_catalog.left(new.request_id, 115) || ':tenant', scope_grant.id
    );
  end if;
  return new;
end;
$$;

create or replace function public.app_workforce_policy_complete_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select count(*)
    from public.app_workforce_policy_requirements requirement
    where requirement.policy_version_id = new.id
  ) <> 11 then
    raise exception 'workforce policy must contain exactly eleven capabilities'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create or replace function public.app_workforce_policy_activation_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('workforce_policy_active:v1', 0)
  );
  if (
    select count(*)
    from public.app_workforce_policy_requirements requirement
    where requirement.policy_version_id = new.policy_version_id
  ) <> 11 then
    raise exception 'incomplete workforce policy cannot activate'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.app_workforce_policy_manage_v1(
  p_auth_user_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_payload_sha256 text,
  p_idempotency_expires_at timestamptz,
  p_action text,
  p_policy_version_id uuid,
  p_policy_ref text,
  p_require_distinct_maker_checker boolean,
  p_requirements jsonb,
  p_effective_at timestamptz,
  p_decision_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_auth jsonb;
  v_scope text;
  v_begin jsonb;
  v_policy_id uuid;
  v_count integer;
  requirement record;
  identity_row record;
  v_response jsonb;
begin
  v_auth := public.app_workforce_authorize_v1(
    p_auth_user_id, 'workforce.policy.manage', null, null, v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;
  if p_action not in ('create', 'activate')
     or coalesce(btrim(p_decision_ref), '') = ''
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or (p_action = 'activate' and (
       p_effective_at is null or p_effective_at < v_now - interval '5 minutes'
     )) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  v_scope := 'workforce_policy_manage:v1:' ||
    coalesce(p_policy_version_id::text, p_policy_ref, 'missing');
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_sha256,
    p_idempotency_expires_at, 'admin', v_auth->>'actor_ref', p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('workforce_policy_active:v1', 0)
  );

  if p_action = 'create' then
    if p_policy_version_id is not null
       or coalesce(btrim(p_policy_ref), '') = ''
       or p_require_distinct_maker_checker is null
       or p_requirements is null
       or pg_catalog.jsonb_typeof(p_requirements) <> 'object' then
      raise exception 'policy create input invalid' using errcode = '23514';
    end if;
    select count(*) into v_count
    from pg_catalog.jsonb_object_keys(p_requirements);
    if v_count <> 11 then
      raise exception 'policy capability count invalid' using errcode = '23514';
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_requirements)
        as supplied(capability_code)
      where not exists (
        select 1
        from public.app_workforce_capability_catalog catalog
        where catalog.capability_code = supplied.capability_code
      )
    ) then
      raise exception 'custom capability rejected' using errcode = '23514';
    end if;
    insert into public.app_workforce_policy_versions (
      policy_ref, catalogue_version, require_distinct_maker_checker,
      canonical_sha256, created_by_workforce_identity_id,
      created_by_actor_ref, decision_ref, request_id
    ) values (
      p_policy_ref, 'pilot_v1', p_require_distinct_maker_checker,
      p_payload_sha256, (v_auth->>'workforce_identity_id')::uuid,
      v_auth->>'actor_ref', p_decision_ref, p_request_id || ':policy'
    ) returning id into v_policy_id;
    for requirement in
      select catalog.capability_code, catalog.floor_seniority,
        p_requirements->>catalog.capability_code as minimum_seniority
      from public.app_workforce_capability_catalog catalog
    loop
      if requirement.minimum_seniority not in ('member', 'reviewer', 'admin')
         or public.app_workforce_seniority_rank_v1(
              requirement.minimum_seniority
            ) < public.app_workforce_seniority_rank_v1(
              requirement.floor_seniority
            ) then
        raise exception 'policy weakens software floor' using errcode = '42501';
      end if;
      insert into public.app_workforce_policy_requirements (
        policy_version_id, capability_code, minimum_seniority
      ) values (
        v_policy_id, requirement.capability_code,
        requirement.minimum_seniority
      );
    end loop;
  else
    if p_policy_version_id is null or p_effective_at is null
       or not exists (
         select 1
         from public.app_workforce_policy_versions policy_version
         where policy_version.id = p_policy_version_id
       ) then
      raise exception 'policy activation input invalid' using errcode = '23514';
    end if;
    v_policy_id := p_policy_version_id;
    insert into public.app_workforce_policy_activations (
      policy_version_id, effective_at, activated_by_workforce_identity_id,
      activated_by_actor_ref, decision_ref, request_id
    ) values (
      v_policy_id, p_effective_at,
      (v_auth->>'workforce_identity_id')::uuid, v_auth->>'actor_ref',
      p_decision_ref, p_request_id || ':activation'
    );
    for identity_row in
      select id from public.app_workforce_identities
    loop
      perform public.app_workforce_reconcile_capabilities_v1(
        identity_row.id, p_effective_at, v_auth->>'actor_ref',
        p_decision_ref,
        p_request_id || ':' || pg_catalog.md5(identity_row.id::text)
      );
    end loop;
  end if;
  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'status', 201, 'code', 'ok',
    'action', p_action, 'policy_version_id', v_policy_id
  );
  return public.app_workforce_admin_complete_v1(
    v_scope, p_idempotency_key,
    case p_action when 'create' then 'workforce_policy_version_created'
      else 'workforce_policy_activated' end,
    'workforce_policy', v_policy_id, p_request_id, v_auth->>'actor_ref',
    pg_catalog.jsonb_build_object(
      'capability', 'workforce.policy.manage', 'action', p_action,
      'decision', 'allowed'
    ), case when p_action = 'activate' then v_policy_id
      else (v_auth->>'policy_version_id')::uuid end, v_response
  );
exception when unique_violation or check_violation or foreign_key_violation then
  return pg_catalog.jsonb_build_object(
    'ok', false, 'status', 409, 'code', 'policy_change_rejected'
  );
end;
$$;

alter table public.app_audit_events
  drop constraint app_audit_events_actor_type_chk;
alter table public.app_audit_events
  add constraint app_audit_events_actor_type_chk check (
    actor_type in (
      'customer', 'system', 'support', 'admin', 'workforce',
      'edge_function', 'worker', 'provider', 'unknown'
    )
  );

insert into public.app_workforce_policy_versions (
  id, policy_ref, catalogue_version, require_distinct_maker_checker,
  canonical_sha256, created_by_workforce_identity_id,
  created_by_actor_ref, decision_ref, request_id
) values (
  '00000000-0000-4000-8000-000000003201',
  'enval_default_v3', 'pilot_v1', true,
  'ea78a45e5bfed983244f19abc3871ec737967b7c06e7ab9127446d7c77fdc5c3',
  null, 'system:reg03h_migration',
  'reg03h_default_policy', 'reg03h-default-policy-v3'
);

insert into public.app_workforce_policy_requirements (
  policy_version_id, capability_code, minimum_seniority
)
select
  '00000000-0000-4000-8000-000000003201'::uuid,
  capability_code,
  default_seniority
from public.app_workforce_capability_catalog;

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
    '00000000-0000-4000-8000-000000003202',
    '00000000-0000-4000-8000-000000003201',
    v_effective_at, v_effective_at, null,
    'system:reg03h_migration', 'reg03h_default_policy',
    'reg03h-default-policy-activation-v3'
  );

  insert into public.app_audit_events (
    event_type, scope_type, scope_id, request_id, actor_type, actor_ref,
    event_data, authorization_policy_version_id, created_at
  ) values
    (
      'workforce_policy_version_created', 'workforce_policy',
      '00000000-0000-4000-8000-000000003201',
      'reg03h-default-policy-v3', 'system', 'system:reg03h_migration',
      '{"catalogue_version":"pilot_v1","policy_ref":"enval_default_v3"}',
      '00000000-0000-4000-8000-000000003201', v_effective_at
    ),
    (
      'workforce_policy_activated', 'workforce_policy',
      '00000000-0000-4000-8000-000000003201',
      'reg03h-default-policy-activation-v3', 'system',
      'system:reg03h_migration',
      '{"catalogue_version":"pilot_v1","policy_ref":"enval_default_v3"}',
      '00000000-0000-4000-8000-000000003201', v_effective_at
    );

  for identity_row in
    select id from public.app_workforce_identities order by id
  loop
    perform public.app_workforce_reconcile_capabilities_v1(
      identity_row.id, v_effective_at, 'system:reg03h_migration',
      'reg03h_default_policy',
      'reg03h-reconcile-' || pg_catalog.md5(identity_row.id::text)
    );
  end loop;
end;
$$;

create function public.app_compliance_source_event_capture_v1(
  p_auth_user_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_idempotency_expires_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_auth jsonb;
  v_scope text;
  v_begin jsonb;
  v_key_count integer;
  v_delivery_year integer;
  v_event_kind text;
  v_occurred_at timestamptz;
  v_evidence_sha256 text;
  v_evidence_version_id uuid;
  v_evidence_version_number integer;
  v_external_reference text;
  v_verification_result_reference text;
  v_statement_reference text;
  v_findings_report_reference text;
  v_evidence public.app_evidence_versions%rowtype;
  v_event_id text;
  v_source_event_id uuid;
  v_recorded_at timestamptz;
  v_evidence_reference text;
  v_regulated_actor text;
  v_provenance_kind text;
  v_response jsonb;
begin
  v_auth := public.app_workforce_authorize_v1(
    p_auth_user_id,
    'compliance.delivery_year.record',
    'CURRENT_TENANT_DATA_PLANE',
    null,
    null,
    v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;

  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or coalesce(pg_catalog.btrim(p_request_id), '') = ''
     or coalesce(pg_catalog.btrim(p_idempotency_key), '') = '' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  select count(*) into v_key_count from pg_catalog.jsonb_object_keys(p_payload);
  if v_key_count <> 10 or exists (
    select 1 from pg_catalog.jsonb_object_keys(p_payload) supplied(key)
    where supplied.key not in (
      'delivery_year', 'event_kind', 'occurred_at', 'evidence_sha256',
      'evidence_version_id', 'evidence_version_number',
      'external_reference', 'verification_result_reference',
      'statement_reference', 'findings_report_reference'
    )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;

  if pg_catalog.jsonb_typeof(p_payload->'delivery_year') <> 'number'
     or p_payload->>'delivery_year' !~ '^[0-9]{4}$'
     or pg_catalog.jsonb_typeof(p_payload->'event_kind') <> 'string'
     or pg_catalog.jsonb_typeof(p_payload->'occurred_at') <> 'string'
     or pg_catalog.jsonb_typeof(p_payload->'evidence_sha256') <> 'string'
     or p_payload->>'evidence_sha256' !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;

  v_delivery_year := (p_payload->>'delivery_year')::integer;
  v_event_kind := p_payload->>'event_kind';
  v_occurred_at := (p_payload->>'occurred_at')::timestamptz;
  v_evidence_sha256 := p_payload->>'evidence_sha256';
  v_external_reference := p_payload->>'external_reference';
  v_verification_result_reference :=
    p_payload->>'verification_result_reference';
  v_statement_reference := p_payload->>'statement_reference';
  v_findings_report_reference := p_payload->>'findings_report_reference';

  if v_delivery_year < 2000 or v_delivery_year > 9999
     or v_occurred_at > v_now
     or v_event_kind not in (
       'INBOOKING_COMPLETED',
       'VERIFICATION_STATEMENT_POSSESSED',
       'FINDINGS_REPORT_RECEIVED',
       'STATEMENT_SUBMITTED_TO_NEA',
       'VERIFICATION_RESULT_REGISTERED_IN_REV'
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;

  if p_payload->>'evidence_version_id' is not null then
    if p_payload->>'evidence_version_id' !~
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or pg_catalog.jsonb_typeof(p_payload->'evidence_version_number') <>
          'number'
       or p_payload->>'evidence_version_number' !~ '^[1-9][0-9]*$' then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 400, 'code', 'invalid_input'
      );
    end if;
    v_evidence_version_id := (p_payload->>'evidence_version_id')::uuid;
    v_evidence_version_number :=
      (p_payload->>'evidence_version_number')::integer;
  elsif p_payload->>'evidence_version_number' is not null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;

  if (
    v_event_kind in (
      'VERIFICATION_STATEMENT_POSSESSED',
      'FINDINGS_REPORT_RECEIVED'
    ) and (
      v_evidence_version_id is null
      or v_external_reference is not null
    )
  ) or (
    v_event_kind not in (
      'VERIFICATION_STATEMENT_POSSESSED',
      'FINDINGS_REPORT_RECEIVED'
    ) and (
      v_evidence_version_id is not null
      or v_external_reference is null
    )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 422, 'code', 'provenance_rejected'
    );
  end if;

  if v_external_reference is not null and (
       v_external_reference <> pg_catalog.btrim(v_external_reference)
       or v_external_reference !~ '^[a-z0-9][a-z0-9._:-]{2,127}$'
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 422, 'code', 'provenance_rejected'
    );
  end if;
  if exists (
    select 1 from (values
      (v_verification_result_reference),
      (v_statement_reference),
      (v_findings_report_reference)
    ) reference(value)
    where reference.value is not null and (
      reference.value <> pg_catalog.btrim(reference.value)
      or reference.value !~ '^[a-z0-9][a-z0-9._:-]{2,127}$'
    )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 422, 'code', 'provenance_rejected'
    );
  end if;

  if v_event_kind = 'INBOOKING_COMPLETED' then
    if v_verification_result_reference is not null
       or v_statement_reference is not null
       or v_findings_report_reference is not null then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 422, 'code', 'provenance_rejected'
      );
    end if;
    v_regulated_actor := 'INBOEKER';
    v_provenance_kind := 'REV_INBOOKING_COMPLETION';
  elsif v_event_kind = 'VERIFICATION_STATEMENT_POSSESSED' then
    if v_verification_result_reference is null
       or v_statement_reference is null
       or v_findings_report_reference is not null then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 422, 'code', 'provenance_rejected'
      );
    end if;
    v_regulated_actor := 'INBOEKER';
    v_provenance_kind := 'VERIFIER_STATEMENT_ARTIFACT';
  elsif v_event_kind = 'FINDINGS_REPORT_RECEIVED' then
    if v_verification_result_reference is null
       or v_statement_reference is not null
       or v_findings_report_reference is null then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 422, 'code', 'provenance_rejected'
      );
    end if;
    v_regulated_actor := 'INBOEKER';
    v_provenance_kind := 'VERIFIER_FINDINGS_ARTIFACT';
  elsif v_event_kind = 'STATEMENT_SUBMITTED_TO_NEA' then
    if v_verification_result_reference is not null
       or v_statement_reference is null
       or v_findings_report_reference is not null then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 422, 'code', 'provenance_rejected'
      );
    end if;
    v_regulated_actor := 'INBOEKER';
    v_provenance_kind := 'NEA_SUBMISSION_CONFIRMATION';
  else
    if v_verification_result_reference is null
       or v_statement_reference is not null
       or v_findings_report_reference is not null then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 422, 'code', 'provenance_rejected'
      );
    end if;
    v_regulated_actor := 'VERIFIER';
    v_provenance_kind := 'VERIFIER_REV_REGISTRATION_CONFIRMATION';
  end if;

  if v_evidence_version_id is not null then
    select * into v_evidence
    from public.app_evidence_versions evidence
    where evidence.id = v_evidence_version_id;
    if not found
       or v_evidence.version_number <> v_evidence_version_number
       or v_evidence.sha256 <> v_evidence_sha256
       or v_evidence.status <> 'confirmed_awaiting_review' then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'status', 422, 'code', 'evidence_mismatch'
      );
    end if;
    v_evidence_reference :=
      'app_evidence_version:' || v_evidence_version_id::text;
  else
    v_evidence_reference := v_external_reference;
  end if;

  v_scope := 'compliance_source_event_capture:v1:' ||
    (v_auth->>'workforce_identity_id');
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_hash,
    p_idempotency_expires_at, 'edge_function', v_auth->>'actor_ref', p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;

  v_event_id := 'compliance.' || v_delivery_year::text || '.' ||
    pg_catalog.lower(v_event_kind);
  insert into public.app_delivery_year_compliance_source_events (
    source_contract_version, event_schema_version, event_id, delivery_year,
    event_kind, occurred_at, regulated_actor_kind, recorded_at,
    recorder_kind, recorder_reference, provenance_kind, evidence_reference,
    evidence_sha256, evidence_version_id, verification_result_reference,
    statement_reference, findings_report_reference
  ) values (
    'delivery-year-compliance-source-event-v1',
    'delivery-year-compliance-event-v1', v_event_id, v_delivery_year,
    v_event_kind, v_occurred_at, v_regulated_actor, v_now,
    'WORKFORCE', v_auth->>'actor_ref', v_provenance_kind,
    v_evidence_reference, v_evidence_sha256, v_evidence_version_id,
    v_verification_result_reference, v_statement_reference,
    v_findings_report_reference
  ) returning id, recorded_at into v_source_event_id, v_recorded_at;

  v_response := pg_catalog.jsonb_build_object(
    'ok', true,
    'status', 201,
    'code', 'ok',
    'source_event_id', v_source_event_id,
    'delivery_year', v_delivery_year,
    'event_kind', v_event_kind,
    'occurred_at', v_occurred_at,
    'recorded_at', v_recorded_at,
    'idempotency_status', 'recorded'
  );

  insert into public.app_audit_events (
    event_type, scope_type, scope_id, request_id, idempotency_key,
    actor_type, actor_ref, event_data, authorization_policy_version_id,
    created_at
  ) values (
    'compliance_source_event_recorded', 'result', v_source_event_id,
    p_request_id, p_idempotency_key, 'workforce', v_auth->>'actor_ref',
    pg_catalog.jsonb_build_object(
      'capability', 'compliance.delivery_year.record',
      'decision', 'allowed',
      'delivery_year', v_delivery_year,
      'event_kind', v_event_kind
    ), (v_auth->>'policy_version_id')::uuid, v_recorded_at
  );
  update public.app_idempotency_keys
  set response_status = 201,
      response_body = v_response,
      completed_at = pg_catalog.clock_timestamp()
  where scope = v_scope and key = p_idempotency_key
    and response_status is null and response_body is null;
  if not found then
    raise exception 'compliance capture idempotency completion failed';
  end if;
  return v_response;
exception
  when unique_violation then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'compliance_fact_conflict'
    );
  when check_violation or foreign_key_violation then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 422, 'code', 'provenance_rejected'
    );
  when invalid_text_representation or datetime_field_overflow then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
end;
$$;

revoke all on function public.app_compliance_source_event_capture_v1(
  uuid, text, text, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.app_compliance_source_event_capture_v1(
  uuid, text, text, text, timestamptz, jsonb
) to service_role;

comment on function public.app_compliance_source_event_capture_v1(
  uuid, text, text, text, timestamptz, jsonb
) is
  'Service-role-only authenticated workforce capture for one accepted externally evidenced REG03G fact. It derives regulated actor, recorder, tenant scope, policy context and server time; it performs no regulated act, correction, approval or worklist persistence.';
comment on table public.app_workforce_tenant_scope_assignments is
  'Immutable explicit TENANT_WIDE scope for compliance delivery-year capabilities in the current tenant data plane. It is never a wildcard case/location/customer scope.';

commit;

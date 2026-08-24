begin;

-- CUSTOMER04C3C9E: immutable current-candidate selection truth. Existing
-- candidates remain legacy-current only until the first explicit event for
-- their exact handoff target.

create table public.app_customer_correction_replacement_candidate_events (
  id uuid primary key,
  event_sequence bigint generated always as identity unique,
  handoff_id uuid not null
    references public.app_evidence_review_correction_handoffs(id)
    on delete restrict,
  replacement_target_ref text not null,
  candidate_id uuid not null
    references public.app_customer_correction_replacement_candidates(id)
    on delete restrict,
  event_type text not null,
  case_id uuid not null references public.app_cases(id) on delete restrict,
  customer_id uuid not null
    references public.app_customers(id) on delete restrict,
  acted_by_auth_user_id uuid not null references auth.users(id)
    on delete restrict,
  acted_by_customer_identity_id uuid not null
    references public.app_customer_identities(id) on delete restrict,
  actor_ref text not null,
  request_id text not null,
  idempotency_key text not null,
  payload_sha256 text not null,
  environment text not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint app_customer_correction_candidate_event_target_chk check (
    replacement_target_ref ~ '^CRT-[A-F0-9]{32}$'
  ),
  constraint app_customer_correction_candidate_event_type_chk check (
    event_type in ('SELECTED', 'WITHDRAWN')
  ),
  constraint app_customer_correction_candidate_event_meta_chk check (
    pg_catalog.btrim(actor_ref) <> ''
    and pg_catalog.btrim(request_id) <> ''
    and pg_catalog.btrim(idempotency_key) <> ''
    and payload_sha256 ~ '^[0-9a-f]{64}$'
    and environment in ('local', 'test', 'staging', 'production')
    and occurred_at <= recorded_at
  )
);

comment on table public.app_customer_correction_replacement_candidate_events is
  'Append-only customer correction replacement candidate current-selection truth. SELECTED and WITHDRAWN preserve candidate, parser and private object history.';

create index app_customer_correction_candidate_events_target_idx
  on public.app_customer_correction_replacement_candidate_events(
    handoff_id, replacement_target_ref, event_sequence desc
  );

create unique index app_customer_correction_candidate_selected_once_idx
  on public.app_customer_correction_replacement_candidate_events(candidate_id)
  where event_type = 'SELECTED';

create trigger trg_app_customer_correction_candidate_events_immutable
before update or delete
on public.app_customer_correction_replacement_candidate_events
for each row execute function public.app_customer_correction_immutable_guard_v1();

alter table public.app_customer_correction_replacement_candidate_events
  enable row level security;
create policy deny_all
  on public.app_customer_correction_replacement_candidate_events
  for all to anon, authenticated using (false) with check (false);

create function public.app_customer_correction_candidate_select_on_confirm_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    new.handoff_id::text || '|' || new.replacement_target_ref,
    0
  ));
  insert into public.app_customer_correction_replacement_candidate_events (
    id, handoff_id, replacement_target_ref, candidate_id, event_type,
    case_id, customer_id, acted_by_auth_user_id,
    acted_by_customer_identity_id, actor_ref, request_id, idempotency_key,
    payload_sha256, environment, occurred_at, recorded_at
  ) values (
    gen_random_uuid(), new.handoff_id, new.replacement_target_ref, new.id,
    'SELECTED', new.case_id, new.customer_id,
    new.confirmed_by_auth_user_id, new.confirmed_by_customer_identity_id,
    new.actor_ref, new.request_id, new.idempotency_key,
    new.payload_sha256, new.environment, new.confirmed_at,
    pg_catalog.clock_timestamp()
  );
  return new;
end;
$$;

create trigger trg_app_customer_correction_candidate_select_on_confirm
after insert on public.app_customer_correction_replacement_candidates
for each row execute function
  public.app_customer_correction_candidate_select_on_confirm_v1();

create or replace function public.app_customer_correction_replacement_upload_resolve_v1(
  p_auth_user_id uuid,
  p_case_ref text,
  p_upload_ref text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_upload public.app_customer_correction_replacement_uploads%rowtype;
  v_authority jsonb;
begin
  if p_upload_ref !~ '^CRU-[A-F0-9]{32}$' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  select upload.* into v_upload
  from public.app_customer_correction_replacement_uploads upload
  join public.app_cases case_row on case_row.id = upload.case_id
  where upload.upload_reference = p_upload_ref
    and case_row.case_reference = p_case_ref;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'upload_not_found'
    );
  end if;
  v_authority := public.app_customer_correction_replacement_authority_v1(
    p_auth_user_id, p_case_ref, v_upload.replacement_target_ref
  );
  if v_authority->>'ok' <> 'true' then return v_authority; end if;
  if v_upload.handoff_id <> (v_authority->>'handoff_id')::uuid
     or v_upload.customer_id <> (v_authority->>'customer_id')::uuid
     or v_upload.expires_at <= pg_catalog.clock_timestamp() then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'upload_not_current'
    );
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 200, 'code', 'ok',
    'upload_id', v_upload.id,
    'upload_ref', v_upload.upload_reference,
    'replacement_target_ref', v_upload.replacement_target_ref,
    'storage_bucket', v_upload.storage_bucket,
    'storage_path', v_upload.storage_path,
    'original_filename', v_upload.original_filename,
    'declared_mime_type', v_upload.declared_mime_type,
    'declared_size_bytes', v_upload.declared_size_bytes,
    'parser_profile', v_upload.parser_profile,
    'item_refs', v_upload.item_refs,
    'fact_keys', v_upload.fact_keys
  );
end;
$$;

create function public.app_customer_correction_replacement_resolution_v2(
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
  v_targets jsonb;
  v_resolved jsonb;
begin
  select case_row.* into v_case
  from public.app_cases case_row
  join public.app_customer_access_grants access_grant
    on access_grant.customer_id = case_row.customer_id
   and access_grant.auth_user_id = p_auth_user_id
   and (
     access_grant.granted_case_id is null
     or access_grant.granted_case_id = case_row.id
   )
  where case_row.case_reference = p_case_ref;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'customer_case_access_denied'
    );
  end if;
  v_manifest := public.app_evidence_fact_review_manifest_v1(v_case.id);
  if v_manifest->>'ok' <> 'true' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'correction_handoff_not_current'
    );
  end if;
  select handoff.* into v_handoff
  from public.app_evidence_review_correction_handoffs handoff
  where handoff.id = public.app_evidence_review_current_correction_handoff_v1(
    v_case.id,
    v_manifest->>'manifest_version',
    v_manifest->>'manifest_hash'
  );
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'correction_handoff_not_current'
    );
  end if;
  v_targets := public.app_customer_correction_replacement_targets_v1(
    v_handoff.id
  );
  select coalesce(pg_catalog.jsonb_agg(
    target.value || pg_catalog.jsonb_build_object(
      'candidate_ref', candidate.candidate_reference,
      'original_filename', candidate.original_filename,
      'parser_observation', observation.envelope,
      'currentness_authority', case
        when latest_event.id is null then 'legacy_latest_confirmed'
        else 'explicit_selection_event'
      end
    ) order by target.value->>'replacement_target_ref'
  ), '[]'::jsonb) into v_resolved
  from pg_catalog.jsonb_array_elements(v_targets) target(value)
  left join lateral (
    select event_row.*
    from public.app_customer_correction_replacement_candidate_events event_row
    where event_row.handoff_id = v_handoff.id
      and event_row.replacement_target_ref =
        target.value->>'replacement_target_ref'
    order by event_row.event_sequence desc
    limit 1
  ) latest_event on true
  left join lateral (
    select candidate_row.*, upload.original_filename
    from public.app_customer_correction_replacement_candidates candidate_row
    join public.app_customer_correction_replacement_uploads upload
      on upload.id = candidate_row.upload_id
    where candidate_row.handoff_id = v_handoff.id
      and candidate_row.replacement_target_ref =
        target.value->>'replacement_target_ref'
      and (
        latest_event.id is null
        or (
          latest_event.event_type = 'SELECTED'
          and candidate_row.id = latest_event.candidate_id
        )
      )
    order by candidate_row.confirmed_at desc, candidate_row.id desc
    limit 1
  ) candidate on latest_event.id is null
    or latest_event.event_type = 'SELECTED'
  left join lateral (
    select observation_row.envelope
    from public.app_parser_observation_envelopes observation_row
    where observation_row.correction_replacement_candidate_id = candidate.id
    order by observation_row.observed_at desc, observation_row.id desc
    limit 1
  ) observation on true;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 200, 'code', 'ok',
    'handoff_ref', v_handoff.handoff_reference,
    'targets', v_resolved,
    'all_required_candidates_confirmed', not exists (
      select 1 from pg_catalog.jsonb_array_elements(v_resolved) resolved(value)
      where resolved.value->>'candidate_ref' is null
    )
  );
end;
$$;

create or replace function public.app_customer_correction_replacement_resolution_v1(
  p_auth_user_id uuid,
  p_case_ref text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  return public.app_customer_correction_replacement_resolution_v2(
    p_auth_user_id,
    p_case_ref
  );
end;
$$;

create function public.app_customer_correction_replacement_withdraw_v1(
  p_auth_user_id uuid,
  p_case_ref text,
  p_replacement_target_ref text,
  p_candidate_ref text,
  p_request_id text,
  p_idempotency_key text,
  p_payload_sha256 text,
  p_idempotency_expires_at timestamptz,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_authority jsonb;
  v_resolution jsonb;
  v_target jsonb;
  v_candidate public.app_customer_correction_replacement_candidates%rowtype;
  v_scope text;
  v_begin jsonb;
  v_response jsonb;
begin
  if p_candidate_ref !~ '^CRC-[A-F0-9]{32}$'
     or p_payload_sha256 !~ '^[0-9a-f]{64}$'
     or p_environment not in ('local', 'test', 'staging', 'production') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;
  v_authority := public.app_customer_correction_replacement_authority_v1(
    p_auth_user_id, p_case_ref, p_replacement_target_ref
  );
  if v_authority->>'ok' <> 'true' then return v_authority; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_authority->>'handoff_id' || '|' || p_replacement_target_ref,
    0
  ));
  v_scope := 'customer_correction_replacement_withdraw:v1:handoff:' ||
    v_authority->>'handoff_id' || ':target:' || p_replacement_target_ref;
  v_begin := public.app_location_write_idempotency_begin_v1(
    v_scope, p_idempotency_key, p_payload_sha256,
    p_idempotency_expires_at, 'customer', v_authority->>'actor_ref',
    p_request_id
  );
  if v_begin->>'state' = 'return' then return v_begin->'response'; end if;

  v_resolution := public.app_customer_correction_replacement_resolution_v2(
    p_auth_user_id, p_case_ref
  );
  if v_resolution->>'ok' <> 'true' then return v_resolution; end if;
  select target.value into v_target
  from pg_catalog.jsonb_array_elements(v_resolution->'targets') target(value)
  where target.value->>'replacement_target_ref' =
    p_replacement_target_ref;
  if not found then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'status', 404, 'code', 'replacement_target_not_available'
    );
  elsif v_target->>'candidate_ref' is null then
    v_response := pg_catalog.jsonb_build_object(
      'ok', true, 'status', 200, 'code', 'already_withdrawn',
      'replacement_target_ref', p_replacement_target_ref,
      'candidate_ref', p_candidate_ref
    );
  elsif v_target->>'candidate_ref' <> p_candidate_ref then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'status', 409, 'code', 'replacement_candidate_not_current'
    );
  else
    select candidate.* into strict v_candidate
    from public.app_customer_correction_replacement_candidates candidate
    where candidate.handoff_id = (v_authority->>'handoff_id')::uuid
      and candidate.replacement_target_ref = p_replacement_target_ref
      and candidate.candidate_reference = p_candidate_ref;
    insert into public.app_customer_correction_replacement_candidate_events (
      id, handoff_id, replacement_target_ref, candidate_id, event_type,
      case_id, customer_id, acted_by_auth_user_id,
      acted_by_customer_identity_id, actor_ref, request_id, idempotency_key,
      payload_sha256, environment, occurred_at, recorded_at
    ) values (
      gen_random_uuid(), v_candidate.handoff_id,
      v_candidate.replacement_target_ref, v_candidate.id, 'WITHDRAWN',
      v_candidate.case_id, v_candidate.customer_id, p_auth_user_id,
      (v_authority->>'customer_identity_id')::uuid,
      v_authority->>'actor_ref', p_request_id, p_idempotency_key,
      p_payload_sha256, p_environment, v_now, v_now
    );
    insert into public.app_audit_events (
      event_type, scope_type, scope_id, customer_id, request_id,
      idempotency_key, actor_type, actor_ref, event_data, created_at
    ) values (
      'customer_correction_replacement_candidate_withdrawn',
      'case', v_candidate.case_id, v_candidate.customer_id, p_request_id,
      p_idempotency_key, 'customer', v_authority->>'actor_ref',
      pg_catalog.jsonb_build_object(
        'handoff_id', v_candidate.handoff_id,
        'replacement_target_ref', v_candidate.replacement_target_ref,
        'candidate_ref', v_candidate.candidate_reference
      ), v_now
    );
    v_response := pg_catalog.jsonb_build_object(
      'ok', true, 'status', 200, 'code', 'withdrawn',
      'replacement_target_ref', p_replacement_target_ref,
      'candidate_ref', p_candidate_ref
    );
  end if;
  return public.app_evidence_review_idempotency_complete_v1(
    v_scope, p_idempotency_key, v_response
  );
end;
$$;

create function public.app_customer_correction_handoff_read_v5(
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
  v_resolution jsonb;
  v_candidates jsonb;
begin
  v_read := public.app_customer_correction_handoff_read_v4(
    p_auth_user_id,
    p_case_ref
  );
  if v_read->>'ok' <> 'true' or v_read->'handoff' is null then
    return v_read;
  end if;
  v_resolution := public.app_customer_correction_replacement_resolution_v2(
    p_auth_user_id,
    p_case_ref
  );
  if v_resolution->>'ok' <> 'true'
     or v_resolution->>'handoff_ref' <>
       v_read #>> '{handoff,handoff_ref}' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500,
      'code', 'correction_handoff_reconstruction_failed'
    );
  end if;
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'replacement_target_ref', target.value->>'replacement_target_ref',
      'candidate_ref', target.value->>'candidate_ref',
      'file_name', target.value->>'original_filename',
      'parser_observation', case
        when target.value->'parser_observation' is null then null
        else pg_catalog.jsonb_build_object(
          'schema_version',
            'customer-correction-replacement-observation-v1',
          'parser_profile',
            target.value #>> '{parser_observation,parserProfile}',
          'outcome', target.value #>> '{parser_observation,outcome}',
          'observed_facts', (
            select coalesce(pg_catalog.jsonb_agg(
              case when matched.match_count = 1 then
                pg_catalog.jsonb_build_object(
                  'fact_key', fact_key.value,
                  'status', matched.item->>'status',
                  'observed_value', matched.item->'observedValue',
                  'extraction_method',
                    matched.item #>> '{sourceLocator,extractionMethod}'
                )
              else pg_catalog.jsonb_build_object(
                'fact_key', fact_key.value,
                'status', 'not_observed',
                'observed_value', null,
                'extraction_method', null
              ) end
              order by fact_key.ordinality
            ), '[]'::jsonb)
            from pg_catalog.jsonb_array_elements_text(
              target.value->'fact_keys'
            ) with ordinality fact_key(value, ordinality)
            left join lateral (
              select pg_catalog.count(*) match_count,
                (pg_catalog.jsonb_agg(
                  observation.value order by observation.ordinality
                )->0) item
              from pg_catalog.jsonb_array_elements(
                target.value #> '{parser_observation,observedFacts}'
              ) with ordinality observation(value, ordinality)
              where observation.value->>'factKey' = fact_key.value
            ) matched on true
          )
        )
        end
    ) order by target.value->>'replacement_target_ref'
  ), '[]'::jsonb) into v_candidates
  from pg_catalog.jsonb_array_elements(v_resolution->'targets') target(value)
  where target.value->>'candidate_ref' is not null;
  return pg_catalog.jsonb_set(
    v_read,
    '{handoff,current_replacement_candidates}',
    v_candidates,
    true
  );
end;
$$;

revoke all on table
  public.app_customer_correction_replacement_candidate_events
  from public, anon, authenticated, service_role;
grant select on table
  public.app_customer_correction_replacement_candidate_events
  to service_role;

revoke all on function
  public.app_customer_correction_candidate_select_on_confirm_v1()
  from public, anon, authenticated, service_role;
revoke all on function
  public.app_customer_correction_replacement_resolution_v2(uuid, text)
  from public, anon, authenticated;
grant execute on function
  public.app_customer_correction_replacement_resolution_v2(uuid, text)
  to service_role;
revoke all on function
  public.app_customer_correction_replacement_withdraw_v1(
    uuid, text, text, text, text, text, text, timestamptz, text
  ) from public, anon, authenticated;
grant execute on function
  public.app_customer_correction_replacement_withdraw_v1(
    uuid, text, text, text, text, text, text, timestamptz, text
  ) to service_role;
revoke all on function
  public.app_customer_correction_handoff_read_v5(uuid, text)
  from public, anon, authenticated;
grant execute on function
  public.app_customer_correction_handoff_read_v5(uuid, text)
  to service_role;

comment on function public.app_customer_correction_replacement_resolution_v2(
  uuid, text
) is
  'Customer-authorized current replacement resolution: explicit immutable event tail first, otherwise legacy latest-confirmed fallback.';
comment on function public.app_customer_correction_replacement_withdraw_v1(
  uuid, text, text, text, text, text, text, timestamptz, text
) is
  'Authenticated idempotent append-only withdrawal of the exact current correction replacement candidate; candidate, parser observation and private object history remain immutable.';
comment on function public.app_customer_correction_handoff_read_v5(uuid, text)
is
  'Customer-safe correction handoff read with event-derived current candidates, stored safe original filenames and parser extraction-method semantics.';

commit;

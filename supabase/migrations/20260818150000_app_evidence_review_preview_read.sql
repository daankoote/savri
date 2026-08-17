begin;

-- REVIEW08 adds one private, read-only resolution boundary for an exact
-- evidence version after the existing workforce and exact-case authorization
-- decision. Storage identity is returned only to the service-role Edge
-- function and is never part of the browser response.

create function public.app_evidence_review_preview_source_read_v1(
  p_auth_user_id uuid,
  p_case_ref text,
  p_evidence_version_ref uuid
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
  v_source jsonb;
begin
  if p_auth_user_id is null
     or p_evidence_version_ref is null
     or p_case_ref is null
     or p_case_ref <> pg_catalog.btrim(p_case_ref)
     or p_case_ref !~* '^CASE-([0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 400, 'code', 'invalid_input'
    );
  end if;

  select case_row.id into v_case_id
  from public.app_cases case_row
  where case_row.case_reference = p_case_ref;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 403, 'code', 'case_scope_denied'
    );
  end if;

  v_auth := public.app_workforce_authorize_v1(
    p_auth_user_id,
    'evidence.review.view',
    v_case_id,
    null,
    v_now
  );
  if v_auth->>'ok' <> 'true' then return v_auth; end if;

  select pg_catalog.jsonb_build_object(
    'ok', true,
    'status', 200,
    'code', 'ok',
    'evidence_version_ref', evidence_version.id,
    'original_filename', intake_file.original_filename,
    'mime_type', evidence_version.detected_mime_type,
    'storage_bucket', evidence_version.storage_bucket,
    'storage_path', evidence_version.storage_path
  ) into v_source
  from public.app_evidence_versions evidence_version
  join public.app_evidence_files evidence_file
    on evidence_file.id = evidence_version.evidence_file_id
   and evidence_file.case_id = v_case_id
  join public.app_signup_intake_files intake_file
    on intake_file.id = evidence_version.source_intake_file_id
  where evidence_version.id = p_evidence_version_ref;

  if v_source is null then
    -- Do not distinguish a guessed version from a cross-case version.
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 404,
      'code', 'evidence_not_found_or_forbidden'
    );
  end if;

  return v_source;
end;
$$;

revoke all on function public.app_evidence_review_preview_source_read_v1(
  uuid, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.app_evidence_review_preview_source_read_v1(
  uuid, text, uuid
) to service_role;

comment on function public.app_evidence_review_preview_source_read_v1(
  uuid, text, uuid
) is
  'Service-role-only exact evidence-version storage resolver for REVIEW08. It hard-binds evidence.review.view and exact active case scope through the central evaluator, returns immutable private storage identity only to the Edge function, and performs no write or audit-on-view.';

commit;

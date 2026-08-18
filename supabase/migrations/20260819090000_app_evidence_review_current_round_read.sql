begin;

-- REVIEW16 keeps finalized FACT-review truth inside the existing exact-case
-- detail boundary. It returns only the round matching the server-recomputed
-- current manifest; historical rounds remain private audit truth.

create function public.app_evidence_review_case_detail_read_v5(
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
  v_case_id uuid;
  v_round public.app_evidence_review_rounds%rowtype;
  v_decisions jsonb;
  v_decision_count integer;
begin
  -- v4 remains the singular exact-case evidence.review.view authority and
  -- current-manifest constructor. REVIEW16 performs no second authorization.
  v_response := public.app_evidence_review_case_detail_read_v4(
    p_auth_user_id, p_case_ref
  );
  if v_response ->> 'ok' <> 'true' then return v_response; end if;

  select case_row.id into v_case_id
  from public.app_cases case_row
  where case_row.case_reference = p_case_ref;
  if v_case_id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500, 'code', 'internal_error'
    );
  end if;

  select round_row.* into v_round
  from public.app_evidence_review_rounds round_row
  where round_row.case_id = v_case_id
    and round_row.manifest_version = v_response ->> 'review_manifest_version'
    and round_row.manifest_hash = v_response ->> 'review_manifest_hash';

  if not found then
    return v_response || pg_catalog.jsonb_build_object(
      'current_review_round', null
    );
  end if;

  select
    coalesce(pg_catalog.jsonb_agg(
      case
        when decision.disposition = 'ACCEPTED' then
          pg_catalog.jsonb_build_object(
            'subject_ref', decision.subject_ref,
            'disposition', decision.disposition
          )
        else
          pg_catalog.jsonb_build_object(
            'subject_ref', decision.subject_ref,
            'disposition', decision.disposition,
            'correction_reason', decision.correction_reason,
            'correction_instruction', decision.correction_instruction
          )
      end order by decision.subject_ref
    ), '[]'::jsonb),
    pg_catalog.count(*)::integer
  into v_decisions, v_decision_count
  from public.app_evidence_review_round_subject_decisions decision
  where decision.round_id = v_round.id;

  -- Fail closed if immutable storage ever diverges from the exact current
  -- subject set. No partial or historical decision projection is returned.
  if v_decision_count < 1
     or v_decision_count <>
       pg_catalog.jsonb_array_length(v_response -> 'review_subjects')
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(
         v_response -> 'review_subjects'
       ) subject(item)
       where not exists (
         select 1
         from public.app_evidence_review_round_subject_decisions decision
         where decision.round_id = v_round.id
           and decision.subject_ref = subject.item ->> 'subject_ref'
       )
     )
     or exists (
       select 1
       from public.app_evidence_review_round_subject_decisions decision
       where decision.round_id = v_round.id
         and not exists (
           select 1
           from pg_catalog.jsonb_array_elements(
             v_response -> 'review_subjects'
           ) subject(item)
           where subject.item ->> 'subject_ref' = decision.subject_ref
         )
     ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'status', 500, 'code', 'internal_error'
    );
  end if;

  return v_response || pg_catalog.jsonb_build_object(
    'current_review_round', pg_catalog.jsonb_build_object(
      'round_ref', v_round.id,
      'manifest_version', v_round.manifest_version,
      'manifest_hash', v_round.manifest_hash,
      'outcome', v_round.outcome,
      'finalized_at', pg_catalog.to_char(
        v_round.finalized_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ),
      'decisions', v_decisions
    )
  );
end;
$$;

revoke all on function public.app_evidence_review_case_detail_read_v4(uuid, text)
  from service_role;
revoke all on function public.app_evidence_review_case_detail_read_v5(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.app_evidence_review_case_detail_read_v5(uuid, text)
  to service_role;

comment on function public.app_evidence_review_case_detail_read_v5(uuid, text) is
  'Service-role-only REVIEW16 exact-case detail projection. It reuses the existing evidence.review.view authorization and returns only the immutable FACT-review round whose case, manifest version, manifest hash and complete subject set match current server truth.';

commit;

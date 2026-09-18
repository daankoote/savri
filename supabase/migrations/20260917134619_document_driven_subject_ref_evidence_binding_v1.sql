-- DOCUMENT_DRIVEN_CUSTOMER_CORRECTION_V1 follow-up.
-- Resolve the immutable evidence hash from the server-owned evidence version;
-- the customer-safe manifest intentionally does not project that hash.
create or replace function public.app_customer_correction_submission_subject_ref_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_submission public.app_evidence_review_customer_submissions%rowtype;
begin
  select submission.* into strict v_submission
  from public.app_evidence_review_customer_submissions submission
  where submission.id = new.submission_id;

  select subject.item->>'subject_ref' into strict new.resulting_subject_ref
  from pg_catalog.jsonb_array_elements(
    public.app_evidence_fact_review_manifest_v1(v_submission.case_id)->'subjects'
  ) subject(item)
  join public.app_evidence_versions evidence_version
    on evidence_version.id = new.evidence_version_id
   and evidence_version.evidence_file_id = new.evidence_file_id
   and evidence_version.sha256 = new.evidence_sha256
  where subject.item->>'signing_snapshot_id' =
      v_submission.resulting_snapshot_id::text
    and subject.item->>'evidence_file_id' = new.evidence_file_id::text
    and subject.item->>'evidence_version_id' = new.evidence_version_id::text
    and subject.item->>'fact_id' = new.fact_id
    and subject.item->>'fact_key' = new.fact_key
    and subject.item->>'scope_ref' = new.scope_ref
    and subject.item->>'value_sha256' = new.resulting_value_sha256
    and subject.item->>'value_status' = 'PRESENT';
  return new;
exception
  when no_data_found or too_many_rows then
    raise exception 'customer correction resulting subject authority unavailable';
end;
$$;

revoke all on function
  public.app_customer_correction_submission_subject_ref_v1()
  from public, anon, authenticated, service_role;

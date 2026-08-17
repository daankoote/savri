begin;

-- REG03G stores only accepted source facts for deterministic REG02 replay.
-- The isolated tenant data plane is the tenant boundary; delivery_year is the
-- compliance-cycle scope. Derived state, actions and worklists remain code-only.

create table public.app_delivery_year_compliance_source_events (
  id uuid primary key default gen_random_uuid(),
  source_contract_version text not null,
  event_schema_version text not null,
  event_id text not null unique,
  delivery_year integer not null,
  event_kind text not null,
  occurred_at timestamptz not null,
  regulated_actor_kind text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  recorder_kind text not null,
  recorder_reference text not null,
  provenance_kind text not null,
  evidence_reference text not null,
  evidence_sha256 text not null,
  evidence_version_id uuid
    references public.app_evidence_versions(id) on delete restrict,
  verification_result_reference text,
  statement_reference text,
  findings_report_reference text,

  constraint app_compliance_source_contract_version_chk check (
    source_contract_version = 'delivery-year-compliance-source-event-v1'
  ),
  constraint app_compliance_source_event_schema_version_chk check (
    event_schema_version = 'delivery-year-compliance-event-v1'
  ),
  constraint app_compliance_source_delivery_year_chk check (
    delivery_year between 2000 and 9999
  ),
  constraint app_compliance_source_event_kind_chk check (
    event_kind in (
      'INBOOKING_COMPLETED',
      'VERIFICATION_STATEMENT_POSSESSED',
      'FINDINGS_REPORT_RECEIVED',
      'STATEMENT_SUBMITTED_TO_NEA',
      'VERIFICATION_RESULT_REGISTERED_IN_REV'
    )
  ),
  constraint app_compliance_source_recorded_after_occurrence_chk check (
    recorded_at >= occurred_at
  ),
  constraint app_compliance_source_recorder_chk check (
    recorder_kind in ('SYSTEM', 'WORKFORCE')
    and recorder_reference = btrim(recorder_reference)
    and recorder_reference ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'
  ),
  constraint app_compliance_source_event_id_chk check (
    event_id = btrim(event_id)
    and event_id ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'
  ),
  constraint app_compliance_source_evidence_ref_chk check (
    evidence_reference = btrim(evidence_reference)
    and evidence_reference ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'
  ),
  constraint app_compliance_source_evidence_hash_chk check (
    evidence_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint app_compliance_source_actor_provenance_chk check (
    (
      event_kind = 'INBOOKING_COMPLETED'
      and regulated_actor_kind = 'INBOEKER'
      and provenance_kind = 'REV_INBOOKING_COMPLETION'
    )
    or (
      event_kind = 'VERIFICATION_STATEMENT_POSSESSED'
      and regulated_actor_kind = 'INBOEKER'
      and provenance_kind = 'VERIFIER_STATEMENT_ARTIFACT'
    )
    or (
      event_kind = 'FINDINGS_REPORT_RECEIVED'
      and regulated_actor_kind = 'INBOEKER'
      and provenance_kind = 'VERIFIER_FINDINGS_ARTIFACT'
    )
    or (
      event_kind = 'STATEMENT_SUBMITTED_TO_NEA'
      and regulated_actor_kind = 'INBOEKER'
      and provenance_kind = 'NEA_SUBMISSION_CONFIRMATION'
    )
    or (
      event_kind = 'VERIFICATION_RESULT_REGISTERED_IN_REV'
      and regulated_actor_kind = 'VERIFIER'
      and provenance_kind = 'VERIFIER_REV_REGISTRATION_CONFIRMATION'
    )
  ),
  constraint app_compliance_source_reference_shape_chk check (
    (
      event_kind = 'INBOOKING_COMPLETED'
      and verification_result_reference is null
      and statement_reference is null
      and findings_report_reference is null
    )
    or (
      event_kind = 'VERIFICATION_STATEMENT_POSSESSED'
      and verification_result_reference is not null
      and verification_result_reference ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'
      and statement_reference is not null
      and statement_reference ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'
      and findings_report_reference is null
    )
    or (
      event_kind = 'FINDINGS_REPORT_RECEIVED'
      and verification_result_reference is not null
      and verification_result_reference ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'
      and findings_report_reference is not null
      and findings_report_reference ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'
      and statement_reference is null
    )
    or (
      event_kind = 'STATEMENT_SUBMITTED_TO_NEA'
      and statement_reference is not null
      and statement_reference ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'
      and verification_result_reference is null
      and findings_report_reference is null
    )
    or (
      event_kind = 'VERIFICATION_RESULT_REGISTERED_IN_REV'
      and verification_result_reference is not null
      and verification_result_reference ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'
      and statement_reference is null
      and findings_report_reference is null
    )
  )
);

create unique index app_compliance_source_fact_uidx
  on public.app_delivery_year_compliance_source_events(
    delivery_year, event_kind
  );
create unique index app_compliance_source_outcome_uidx
  on public.app_delivery_year_compliance_source_events(delivery_year)
  where event_kind in (
    'VERIFICATION_STATEMENT_POSSESSED',
    'FINDINGS_REPORT_RECEIVED'
  );
create index app_compliance_source_replay_idx
  on public.app_delivery_year_compliance_source_events(
    delivery_year, occurred_at, event_id
  );

create function public.app_compliance_source_event_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_evidence_hash text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'compliance_source_event:v1:' || new.delivery_year::text,
      0
    )
  );

  if new.evidence_version_id is not null then
    select evidence.sha256 into existing_evidence_hash
    from public.app_evidence_versions evidence
    where evidence.id = new.evidence_version_id;

    if not found or existing_evidence_hash <> new.evidence_sha256 then
      raise exception 'compliance source evidence version/hash mismatch'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger app_compliance_source_event_insert_guard
before insert on public.app_delivery_year_compliance_source_events
for each row execute function public.app_compliance_source_event_insert_guard();
create trigger app_compliance_source_event_immutable
before update or delete on public.app_delivery_year_compliance_source_events
for each row execute function public.app_wp2b_i_immutable_guard();
create trigger app_compliance_source_event_truncate_guard
before truncate on public.app_delivery_year_compliance_source_events
for each statement execute function public.app_wp2b_i_immutable_guard();

alter table public.app_delivery_year_compliance_source_events
  enable row level security;
create policy deny_all
on public.app_delivery_year_compliance_source_events
for all to anon, authenticated using (false) with check (false);

revoke all on table public.app_delivery_year_compliance_source_events
  from public, anon, authenticated, service_role;
grant select on table public.app_delivery_year_compliance_source_events
  to service_role;
revoke all on function public.app_compliance_source_event_insert_guard()
  from public, anon, authenticated, service_role;

comment on table public.app_delivery_year_compliance_source_events is
  'Immutable tenant-data-plane-local accepted source facts for deterministic REG02 replay. No derived compliance state, action plan or worklist is stored.';
comment on column public.app_delivery_year_compliance_source_events.evidence_version_id is
  'Optional provenance link only. Referencing app_evidence_versions does not mutate or reclassify the underlying evidence row; this event is the explicit semantic acceptance.';
comment on column public.app_delivery_year_compliance_source_events.regulated_actor_kind is
  'REG02 regulated actor; structurally independent from the internal recorder.';
comment on column public.app_delivery_year_compliance_source_events.recorder_reference is
  'Opaque internal recorder provenance only; it grants no workforce authority.';

commit;

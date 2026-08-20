-- CUSTOMER04C2: immutable, observation-only parser result persistence.

create table public.app_parser_observation_envelopes (
  id uuid primary key,
  source_kind text not null,
  signup_intake_file_id uuid
    references public.app_signup_intake_files(id) on delete restrict,
  evidence_version_id uuid
    references public.app_evidence_versions(id) on delete restrict,
  evidence_version_ref text not null,
  byte_sha256 text not null,
  parser_core_version text not null,
  parser_profile text not null,
  profile_version text not null,
  provider_adapter_id text not null,
  provider_adapter_version text not null,
  provider_config_fingerprint text not null,
  observed_at timestamptz not null,
  parser_outcome text not null,
  execution_identity_sha256 text not null unique,
  envelope_hash text not null unique,
  envelope jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint app_parser_observation_source_kind_chk check (
    source_kind in ('signup_intake_file', 'evidence_version')
  ),
  constraint app_parser_observation_source_ref_chk check (
    (source_kind = 'signup_intake_file'
      and signup_intake_file_id is not null
      and evidence_version_id is null)
    or
    (source_kind = 'evidence_version'
      and signup_intake_file_id is null
      and evidence_version_id is not null)
  ),
  constraint app_parser_observation_refs_not_blank_chk check (
    btrim(evidence_version_ref) <> ''
    and btrim(parser_core_version) <> ''
    and btrim(parser_profile) <> ''
    and btrim(profile_version) <> ''
    and btrim(provider_adapter_id) <> ''
    and btrim(provider_adapter_version) <> ''
  ),
  constraint app_parser_observation_hashes_chk check (
    byte_sha256 ~ '^[0-9a-f]{64}$'
    and provider_config_fingerprint ~ '^[0-9a-f]{64}$'
    and execution_identity_sha256 ~ '^[0-9a-f]{64}$'
    and envelope_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint app_parser_observation_outcome_chk check (
    parser_outcome in ('completed', 'completed_with_limitations', 'failed')
  ),
  constraint app_parser_observation_envelope_chk check (
    jsonb_typeof(envelope) = 'object'
    and envelope ->> 'envelopeVersion' = 'parser_observation_envelope_v1'
    and envelope ->> 'observationRef' = id::text
    and envelope ->> 'byteSha256' = byte_sha256
    and envelope ->> 'parserCoreVersion' = parser_core_version
    and envelope ->> 'parserProfile' = parser_profile
    and envelope ->> 'profileVersion' = profile_version
    and envelope ->> 'providerAdapterId' = provider_adapter_id
    and envelope ->> 'providerAdapterVersion' = provider_adapter_version
    and envelope ->> 'providerConfigFingerprint' = provider_config_fingerprint
    and envelope ->> 'outcome' = parser_outcome
    and envelope ->> 'executionIdentitySha256' = execution_identity_sha256
    and envelope ->> 'envelopeHash' = envelope_hash
    and jsonb_typeof(envelope -> 'observedFacts') = 'array'
    and jsonb_typeof(envelope -> 'limitations') = 'array'
  )
);

comment on table public.app_parser_observation_envelopes is
  'Immutable OBSERVED/DERIVED parser envelopes. Rows never confer evidence acceptance, canonical fact truth, signing authority, case state or workforce review decisions.';

create index app_parser_observation_source_intake_idx
  on public.app_parser_observation_envelopes(signup_intake_file_id, observed_at)
  where signup_intake_file_id is not null;

create index app_parser_observation_evidence_version_idx
  on public.app_parser_observation_envelopes(evidence_version_id, observed_at)
  where evidence_version_id is not null;

create function public.app_parser_observation_immutable_guard_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'app_parser_observation_envelopes are immutable';
end;
$$;

create trigger trg_app_parser_observation_envelopes_immutable
before update or delete on public.app_parser_observation_envelopes
for each row execute function public.app_parser_observation_immutable_guard_v1();

alter table public.app_parser_observation_envelopes enable row level security;

create policy deny_all on public.app_parser_observation_envelopes
  for all to anon, authenticated using (false) with check (false);

revoke all on table public.app_parser_observation_envelopes from public, anon, authenticated;
grant select, insert on table public.app_parser_observation_envelopes to service_role;

revoke all on function public.app_parser_observation_immutable_guard_v1()
  from public, anon, authenticated;
grant execute on function public.app_parser_observation_immutable_guard_v1()
  to service_role;

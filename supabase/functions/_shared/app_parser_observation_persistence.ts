import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import {
  isParserObservationEnvelopeV1,
  type ParserObservationEnvelopeV1,
} from "../../../platform/runtime/document-parsing/document_parser_contract.ts";

const TABLE = "app_parser_observation_envelopes";

async function sourceMatchesTrustedEnvelope(
  client: SupabaseClient,
  envelope: ParserObservationEnvelopeV1,
): Promise<boolean> {
  const source = envelope.evidenceSource;
  if (source.kind === "signup_intake_file") {
    const { data, error } = await client.from("app_signup_intake_files")
      .select("id,revision_number,server_sha256,status")
      .eq("id", source.signupIntakeFileRef).maybeSingle();
    return !error && !!data &&
      ["confirmed_quarantine", "promoted"].includes(String(data.status)) &&
      Number(data.revision_number) === source.revisionNumber &&
      String(data.server_sha256 || "") === envelope.byteSha256 &&
      source.evidenceVersionRef ===
        `signup_intake_file:${source.signupIntakeFileRef}:revision:${source.revisionNumber}`;
  }
  if (source.kind === "evidence_version") {
    const { data, error } = await client.from("app_evidence_versions")
      .select("id,version_number,sha256")
      .eq("id", source.evidenceVersionId).maybeSingle();
    return !error && !!data &&
      String(data.sha256 || "") === envelope.byteSha256 &&
      source.evidenceVersionRef ===
        `evidence_version:${source.evidenceVersionId}:version:${
          Number(data.version_number)
        }`;
  }
  const { data, error } = await client.from(
    "app_customer_correction_replacement_candidates",
  )
    .select("id,candidate_reference,server_sha256")
    .eq("id", source.replacementCandidateId).maybeSingle();
  return !error && !!data &&
    String(data.candidate_reference || "") === source.replacementCandidateRef &&
    String(data.server_sha256 || "") === envelope.byteSha256 &&
    source.evidenceVersionRef ===
      `correction_replacement_candidate:${source.replacementCandidateId}`;
}

export async function findPersistedParserObservation(
  client: SupabaseClient,
  executionIdentitySha256: string,
): Promise<ParserObservationEnvelopeV1 | null> {
  const { data, error } = await client.from(TABLE)
    .select("envelope")
    .eq("execution_identity_sha256", executionIdentitySha256)
    .maybeSingle();
  if (error || !data || !isParserObservationEnvelopeV1(data.envelope)) {
    return null;
  }
  return data.envelope;
}

export async function persistParserObservation(
  client: SupabaseClient,
  envelope: ParserObservationEnvelopeV1,
): Promise<ParserObservationEnvelopeV1 | null> {
  if (!await sourceMatchesTrustedEnvelope(client, envelope)) return null;
  const source = envelope.evidenceSource;
  const row = {
    id: envelope.observationRef,
    source_kind: source.kind,
    signup_intake_file_id: source.kind === "signup_intake_file"
      ? source.signupIntakeFileRef
      : null,
    evidence_version_id: source.kind === "evidence_version"
      ? source.evidenceVersionId
      : null,
    correction_replacement_candidate_id:
      source.kind === "correction_replacement_candidate"
        ? source.replacementCandidateId
        : null,
    evidence_version_ref: source.evidenceVersionRef,
    byte_sha256: envelope.byteSha256,
    parser_core_version: envelope.parserCoreVersion,
    parser_profile: envelope.parserProfile,
    profile_version: envelope.profileVersion,
    provider_adapter_id: envelope.providerAdapterId,
    provider_adapter_version: envelope.providerAdapterVersion,
    provider_config_fingerprint: envelope.providerConfigFingerprint,
    observed_at: envelope.serverObservedAt,
    parser_outcome: envelope.outcome,
    execution_identity_sha256: envelope.executionIdentitySha256,
    envelope_hash: envelope.envelopeHash,
    envelope,
  };
  const { data, error } = await client.from(TABLE).insert(row)
    .select("envelope").maybeSingle();
  if (!error && data && isParserObservationEnvelopeV1(data.envelope)) {
    return data.envelope;
  }
  return await findPersistedParserObservation(
    client,
    envelope.executionIdentitySha256,
  );
}

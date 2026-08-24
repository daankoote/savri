import { payloadHash } from "../../supabase/functions/_shared/app_foundation.ts";
import {
  createDocumentParserPort,
} from "../../platform/runtime/document-parsing/document_parser_core.ts";
import {
  DOCUMENT_PARSER_PROFILE_REGISTRY,
} from "../../platform/runtime/document-parsing/document_parser_profiles.ts";
import type {
  DocumentParserProviderAdapter,
  ParserObservationEnvelopeV1,
  ParserProviderFactCandidate,
} from "../../platform/runtime/document-parsing/document_parser_contract.ts";

const ROOT = new URL("../../", import.meta.url);
const LOCAL = Deno.args.includes("--local");
const INTAKE_ID = "d1000000-0000-4000-8000-000000000001";
const FILE_ID = "d1000000-0000-4000-8000-000000000002";

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

function candidate(
  factKey: ParserProviderFactCandidate["factKey"],
  value: string,
): ParserProviderFactCandidate {
  return {
    factKey,
    rawValue: value,
    normalizedValue: value,
    sourcePage: 1,
    sourceRegion: "proof-region",
    confidence: "high",
    extractionMethod: "proof_deterministic_text",
    displayable: true,
    rejectionReason: null,
    ...(factKey === "structuredAddress"
      ? {
        structuredAddress: {
          street: "Bewijsstraat",
          houseNumber: "12",
          houseNumberAddition: null,
          postalCode: "1234AB",
          city: "Proefstad",
          country: "Nederland",
        },
      }
      : {}),
  };
}

const ALL_CANDIDATES = [
  candidate("energySupplier", "Pilot Energie Nederland B.V."),
  candidate("electricityEan", "871685900012345678"),
  candidate("gasEan", "871685900012345679"),
  candidate("partyName", "Voorbeeld Persoon"),
  candidate("structuredAddress", "Bewijsstraat 12, 1234AB Proefstad"),
  candidate("chargerBrand", "Voorbeeld Merk"),
  candidate("chargerModel", "Model P"),
  candidate("midNumber", "MID-123"),
  candidate("serialNumber", "SERIAL-123"),
  candidate("installerOrSupplier", "Installateur B.V."),
  candidate("organizationName", "Voorbeeld Organisatie B.V."),
  candidate("registeredAddress", "Handelsweg 1, 1234AB Proefstad"),
  candidate("legalForm", "Besloten vennootschap"),
  candidate("tradeName", "Voorbeeld Organisatie"),
  candidate("directorOrBoardMember", "Voorbeeld Bestuurder"),
  candidate("directorTitle", "Bestuurder"),
  candidate("representationAuthorityText", "Gezamenlijk bevoegd"),
  candidate("kvkNumber", "12345678"),
] as const;

function provider(
  version: string,
  candidates: ReadonlyArray<ParserProviderFactCandidate> = ALL_CANDIDATES,
  failure: string | null = null,
): DocumentParserProviderAdapter {
  return Object.freeze({
    adapterId: "proof_parser_adapter",
    adapterVersion: version,
    configFingerprint: "c".repeat(64),
    async extract() {
      return failure ? { ok: false as const, limitation: failure } : {
        ok: true as const,
        contentSha256: "a".repeat(64),
        pageCount: 1,
        documentTypeCandidates: [],
        factCandidates: candidates,
        limitations: [],
      };
    },
  });
}

function context(observationRef: string) {
  return {
    provenanceAuthority: "trusted_server" as const,
    observationRef,
    source: {
      kind: "signup_intake_file" as const,
      signupIntakeFileRef: FILE_ID,
      revisionNumber: 1,
      evidenceVersionRef: `signup_intake_file:${FILE_ID}:revision:1`,
    },
    byteSha256: "a".repeat(64),
    serverObservedAt: "2026-08-20T12:00:00.000Z",
  };
}

function observedKeys(envelope: ParserObservationEnvelopeV1): string[] {
  return envelope.observedFacts.filter((item) => item.status === "observed")
    .map((item) => item.factKey);
}

const parser = createDocumentParserPort(provider("v1"), payloadHash);
const bytes = new TextEncoder().encode("%PDF-1.4\nproof\n%%EOF");
const energy = await parser.parse(
  bytes,
  "energy_document_v1",
  context("d1000000-0000-4000-8000-000000000010"),
);
const installation = await parser.parse(
  bytes,
  "installation_invoice_v1",
  context("d1000000-0000-4000-8000-000000000011"),
);
const kvk = await parser.parse(
  bytes,
  "kvk_extract_v1",
  context("d1000000-0000-4000-8000-000000000012"),
);
const charger = await parser.parse(
  bytes,
  "generic_charger_evidence_v1",
  context("d1000000-0000-4000-8000-000000000013"),
);
const closedVocabulary = await createDocumentParserPort(
  provider("v1-closed", [{
    ...candidate("partyName", "Voorbeeld Persoon"),
    factKey: "arbitraryFreeFormFact",
    extractionMethod: "semantic_contract_holder_block",
  } as unknown as ParserProviderFactCandidate]),
  payloadHash,
).parse(
  bytes,
  "energy_document_v1",
  context("d1000000-0000-4000-8000-000000000018"),
);

assert(
  Object.keys(DOCUMENT_PARSER_PROFILE_REGISTRY).sort().join("|") ===
    [
      "energy_document_v1",
      "generic_charger_evidence_v1",
      "installation_invoice_v1",
      "kvk_extract_v1",
    ].join("|"),
  "closed_profile_registry_invalid",
);
assert(
  !observedKeys(closedVocabulary).includes("arbitraryFreeFormFact"),
  "closed_canonical_fact_vocabulary_bypassed",
);
assert(
  [
    "energySupplier",
    "electricityEan",
    "gasEan",
    "partyName",
    "structuredAddress",
  ]
    .every((key) => observedKeys(energy).includes(key)),
  "energy_profile_observations_missing",
);
assert(
  [
    "chargerBrand",
    "chargerModel",
    "midNumber",
    "serialNumber",
    "partyName",
    "structuredAddress",
  ]
    .every((key) => observedKeys(installation).includes(key)),
  "installation_profile_observations_missing",
);
assert(
  [
    "organizationName",
    "kvkNumber",
    "registeredAddress",
    "directorOrBoardMember",
  ]
    .every((key) => observedKeys(kvk).includes(key)),
  "kvk_profile_observations_missing",
);
assert(
  ["chargerBrand", "chargerModel", "midNumber", "serialNumber"]
    .every((key) => observedKeys(charger).includes(key)) &&
    !observedKeys(charger).includes("energySupplier"),
  "generic_charger_profile_scope_invalid",
);

const missing = await createDocumentParserPort(provider("v1", []), payloadHash)
  .parse(
    bytes,
    "energy_document_v1",
    context("d1000000-0000-4000-8000-000000000014"),
  );
assert(
  missing.observedFacts.filter((item) => item.status === "not_observed")
        .length === 4 &&
    missing.observedFacts.every((item) => item.observedValue === null),
  "missing_fact_was_fabricated",
);
const failed = await createDocumentParserPort(
  provider("v1", [], "extraction_unavailable"),
  payloadHash,
).parse(
  bytes,
  "energy_document_v1",
  context("d1000000-0000-4000-8000-000000000015"),
);
assert(
  failed.outcome === "failed" &&
    failed.limitations.includes("extraction_unavailable"),
  "parser_failure_not_represented_as_data",
);
let hashMismatchRejected = false;
try {
  await parser.parse(bytes, "energy_document_v1", {
    ...context("d1000000-0000-4000-8000-000000000017"),
    byteSha256: "b".repeat(64),
  });
} catch (error) {
  hashMismatchRejected = error instanceof Error &&
    error.message === "parser_document_hash_mismatch";
}
assert(hashMismatchRejected, "parser_byte_hash_mismatch_not_rejected");

const repeated = await parser.parse(
  bytes,
  "energy_document_v1",
  context("d1000000-0000-4000-8000-000000000010"),
);
assert(
  repeated.executionIdentitySha256 === energy.executionIdentitySha256 &&
    repeated.envelopeHash === energy.envelopeHash,
  "exact_reparse_not_deterministic",
);
const newer = await createDocumentParserPort(provider("v2"), payloadHash).parse(
  bytes,
  "energy_document_v1",
  context("d1000000-0000-4000-8000-000000000016"),
);
assert(
  newer.executionIdentitySha256 !== energy.executionIdentitySha256 &&
    energy.providerAdapterVersion === "v1",
  "new_parser_version_not_append_only",
);
assert(
  Object.isFrozen(energy) && Object.isFrozen(energy.observedFacts) &&
    Object.isFrozen(energy.observedFacts[0]),
  "observation_envelope_not_immutable",
);
const publicShape = JSON.stringify([energy, installation, kvk, charger]);
for (
  const forbidden of [
    "acceptedEvidence",
    "workforceAccepted",
    "customerConfirmed",
    "reviewDecision",
    "signerAuthority",
    "caseLifecycle",
  ]
) {
  assert(
    !publicShape.includes(forbidden),
    `decision_field_leaked:${forbidden}`,
  );
}

const intakeSource = await Deno.readTextFile(
  new URL("app/src/features/signup/DocumentFirstDocumentsStep.tsx", ROOT),
);
const energyStart = intakeSource.indexOf("const handleEnergyDocument");
const energyEnd = intakeSource.indexOf("const handleChargerDocument");
const energySource = intakeSource.slice(energyStart, energyEnd);
assert(
  energySource.includes("upload.receipt.parserObservation") &&
    energySource.includes("projectParserObservationForCurrentIntake") &&
    !energySource.includes("parseInvoicePdfInput"),
  "current_energy_intake_not_single_shared_parser_path",
);
const confirmSource = await Deno.readTextFile(
  new URL("supabase/functions/api-app-signup-upload-confirm/index.ts", ROOT),
);
assert(
  confirmSource.includes('document_type") === "energy_bill_or_contract"') &&
    confirmSource.includes("DOCUMENT_PARSER.parse") &&
    confirmSource.includes("persistParserObservation"),
  "trusted_energy_server_parser_wiring_missing",
);
for (
  const legacy of [
    "assets/js/analyse/analyse_invoice_parser.js",
    "supabase/functions/_shared/analysis.ts",
    "scripts/analysis_worker/pdf_extract.py",
  ]
) await Deno.stat(new URL(legacy, ROOT));

console.log("PARSER_SHARED_CORE_Q01_Q14=PASS");

if (LOCAL) {
  const sql = `
begin;
insert into public.app_signup_intakes (
  id, status, submitted_payload, submitted_payload_sha256,
  accepted_legal_versions, email_normalized, expires_at
) values (
  '${INTAKE_ID}', 'collecting', '{}'::jsonb, '${"b".repeat(64)}',
  '{"items":[]}'::jsonb, 'parser-proof@example.invalid',
  clock_timestamp() + interval '1 day'
);
insert into public.app_signup_intake_files (
  id, intake_id, client_slot_id, document_type, original_filename,
  declared_mime_type, detected_mime_type, size_bytes, sha256,
  storage_bucket, storage_path, status, confirmed_at, expires_at,
  revision_number, server_size_bytes, server_sha256
) values (
  '${FILE_ID}', '${INTAKE_ID}', 'proof-energy', 'energy_bill_or_contract',
  'proof.pdf', 'application/pdf', 'application/pdf', 10, '${"a".repeat(64)}',
  'app-documents', 'signup-quarantine/proof.pdf', 'confirmed_quarantine',
  clock_timestamp(), clock_timestamp() + interval '1 day', 1, 10,
  '${"a".repeat(64)}'
);
insert into public.app_parser_observation_envelopes (
  id, source_kind, signup_intake_file_id, evidence_version_ref,
  byte_sha256, parser_core_version, parser_profile, profile_version,
  provider_adapter_id, provider_adapter_version,
  provider_config_fingerprint, observed_at, parser_outcome,
  execution_identity_sha256, envelope_hash, envelope
) values (
  '${energy.observationRef}', 'signup_intake_file', '${FILE_ID}',
  '${energy.evidenceSource.evidenceVersionRef}', '${energy.byteSha256}',
  '${energy.parserCoreVersion}', '${energy.parserProfile}', '${energy.profileVersion}',
  '${energy.providerAdapterId}', '${energy.providerAdapterVersion}',
  '${energy.providerConfigFingerprint}', '${energy.serverObservedAt}',
  '${energy.outcome}', '${energy.executionIdentitySha256}', '${energy.envelopeHash}',
  '${JSON.stringify(energy).replaceAll("'", "''")}'::jsonb
);
do $$
begin
  begin
    update public.app_parser_observation_envelopes
      set parser_outcome = 'failed' where id = '${energy.observationRef}';
    raise exception 'immutable update unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%are immutable%' then raise; end if;
  end;
  begin
    delete from public.app_parser_observation_envelopes
      where id = '${energy.observationRef}';
    raise exception 'immutable delete unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%are immutable%' then raise; end if;
  end;
  begin
    set local role authenticated;
    insert into public.app_parser_observation_envelopes select *
      from public.app_parser_observation_envelopes where false;
    reset role;
    raise exception 'authenticated insert unexpectedly succeeded';
  exception when insufficient_privilege then
    reset role;
  end;
end;
$$;
select concat_ws('|',
  (select count(*) from public.app_parser_observation_envelopes
    where signup_intake_file_id = '${FILE_ID}'),
  (select relrowsecurity::text from pg_class
    where oid = 'public.app_parser_observation_envelopes'::regclass),
  has_table_privilege('service_role',
    'public.app_parser_observation_envelopes','SELECT')::text,
  has_table_privilege('service_role',
    'public.app_parser_observation_envelopes','INSERT')::text,
  has_table_privilege('authenticated',
    'public.app_parser_observation_envelopes','SELECT')::text,
  has_table_privilege('anon',
    'public.app_parser_observation_envelopes','INSERT')::text
);
rollback;`;
  const command = new Deno.Command("docker", {
    args: [
      "exec",
      "-i",
      "supabase_db_enval",
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const writer = command.stdin.getWriter();
  await writer.write(new TextEncoder().encode(sql));
  await writer.close();
  const result = await command.output();
  const output = new TextDecoder().decode(result.stdout).trim();
  const error = new TextDecoder().decode(result.stderr).replaceAll(/\s+/g, " ")
    .slice(0, 300);
  assert(result.code === 0, `local_persistence_sql_failed:${error}`);
  assert(
    output.endsWith("1|true|true|true|false|false"),
    `local_catalog_boundary_invalid:${output}`,
  );
  console.log("PARSER_OBSERVATION_LOCAL_Q15_Q22=PASS");
}

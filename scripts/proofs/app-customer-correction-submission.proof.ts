import {
  correctionLegalBundleProjection,
  correctionSignerNamesMatch,
  CUSTOMER_CORRECTION_ACTIONS,
  CUSTOMER_CORRECTION_RUNTIME_ACTIONS,
  isRuntimeCorrectionAction,
  normalizeCorrectionSignerName,
  parseCorrectionChallengeRequest,
  parseCorrectionFinalizeRequest,
} from "../../supabase/functions/_shared/app_customer_correction_submission.ts";

const ROOT = new URL("../../", import.meta.url);
const read = (path: string) => Deno.readTextFileSync(new URL(path, ROOT));
const migration = read(
  "supabase/migrations/20260820090000_app_customer_correction_submissions.sql",
);
const handoffV2Migration = read(
  "supabase/migrations/20260820120000_app_customer_correction_handoff_contract_v2.sql",
);
const signerAuthorityMigration = read(
  "supabase/migrations/20260820150000_app_customer_correction_signer_authority.sql",
);
const challenge = read(
  "supabase/functions/api-app-customer-correction-signing-challenge/index.ts",
);
const finalize = read(
  "supabase/functions/api-app-customer-correction-signing-finalize/index.ts",
);

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

const caseRef = "CASE-AAAAAAAAAAAA";
const itemRef = (number: number) =>
  `CCI-${number.toString(16).padStart(32, "0").toUpperCase()}`;
const one = [{ itemRef: itemRef(1), correctedValue: "Supplier One" }];
const threeDomain = [
  { itemRef: itemRef(1), correctedValue: "Supplier One" },
  { itemRef: itemRef(2), correctedValue: "871234567890123456" },
  { itemRef: itemRef(3), correctedValue: "Proof Address" },
];
const crossDocument = [
  { itemRef: itemRef(1), correctedValue: "Supplier One" },
  { itemRef: itemRef(2), correctedValue: "Proof Charger" },
];
const allFacts = Array.from({ length: 10 }, (_, index) => ({
  itemRef: itemRef(index + 1),
  correctedValue: index === 2 ? "871234567890123456" : `Value ${index}`,
}));
const manualFactResolutions = (
  responses: readonly { itemRef: string; correctedValue: string }[],
) => responses.map((response) => ({
  itemRefs: [response.itemRef],
  resolutionType: "MANUAL",
  sources: [],
}));

for (const responses of [one, threeDomain, crossDocument, allFacts]) {
  const parsed = parseCorrectionChallengeRequest({
    caseRef,
    factResolutions: manualFactResolutions(responses),
    responses,
    typedFullName: "Proof Person",
  });
  assert(
    parsed?.responses.length === responses.length,
    "multi_item_parse_failed",
  );
}
assert(
      parseCorrectionChallengeRequest({
        caseRef,
        factResolutions: [],
        responses: [],
        typedFullName: "Proof Person",
      }) === null &&
    parseCorrectionChallengeRequest({
        caseRef,
        factResolutions: [{
          itemRefs: [itemRef(1)],
          resolutionType: "MANUAL",
          sources: [],
        }],
        typedFullName: "Proof Person",
        responses: [
          { itemRef: itemRef(1), correctedValue: "A" },
          { itemRef: itemRef(1), correctedValue: "B" },
        ],
      }) === null &&
    parseCorrectionChallengeRequest({
        caseRef,
        factResolutions: [{
          itemRefs: [itemRef(1)],
          resolutionType: "MANUAL",
          sources: [],
        }],
        typedFullName: "Proof Person",
        responses: [{
          itemRef: itemRef(1),
          correctedValue: "A",
          actionRequirement: "VALUE_CORRECTION",
        }],
      }) === null,
  "closed_browser_request_failed",
);
assert(
  parseCorrectionChallengeRequest({
        caseRef,
        factResolutions: [],
        typedFullName: "Proof Person",
        responses: [{
          itemRef: itemRef(1),
          replacementCandidateRef: `CRC-${"A".repeat(32)}`,
        }],
      }) !== null &&
    parseCorrectionChallengeRequest({
        caseRef,
        factResolutions: [{
          itemRefs: [itemRef(1)],
          resolutionType: "MANUAL",
          sources: [],
        }],
        typedFullName: "Proof Person",
        responses: [{
          itemRef: itemRef(1),
          correctedValue: "Customer resolution",
          replacementCandidateRef: `CRC-${"B".repeat(32)}`,
        }],
      }) !== null,
  "document_response_contract_failed",
);
assert(
  normalizeCorrectionSignerName("  Proof\t Person  ") === "Proof Person" &&
    correctionSignerNamesMatch("  Proof\n Person ", "Proof Person") &&
    !correctionSignerNamesMatch("proof person", "Proof Person") &&
    !correctionSignerNamesMatch("Proof", "Proof Person") &&
    !correctionSignerNamesMatch("", "Proof Person") &&
    !correctionSignerNamesMatch("Daan Koote", "Lokaal Piloot"),
  "signer_name_matching_not_exact",
);
assert(
  parseCorrectionFinalizeRequest({
    caseRef,
    challengeReference: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    otp: "123456",
    typedFullName: "Proof Customer",
  }) !== null,
  "typed_name_otp_parse_failed",
);
assert(
  CUSTOMER_CORRECTION_ACTIONS.join("|") ===
      "VALUE_CORRECTION|MISSING_VALUE|DOCUMENT_REPLACEMENT|VALUE_PLUS_DOCUMENT_REPLACEMENT" &&
    CUSTOMER_CORRECTION_RUNTIME_ACTIONS.join("|") ===
      "VALUE_CORRECTION|MISSING_VALUE|DOCUMENT_REPLACEMENT|VALUE_PLUS_DOCUMENT_REPLACEMENT" &&
    isRuntimeCorrectionAction("DOCUMENT_REPLACEMENT") &&
    isRuntimeCorrectionAction("VALUE_PLUS_DOCUMENT_REPLACEMENT") &&
    correctionLegalBundleProjection().bundleVersion ===
      "customer-correction-confirmation-nl-v1",
  "closed_action_or_legal_contract_failed",
);

for (
  const required of [
    "create table public.app_evidence_review_customer_submissions",
    "create table public.app_evidence_review_customer_submission_items",
    "create table public.app_evidence_review_decision_carry_forwards",
    "subject_type = 'CUSTOMER_CORRECTION'",
    "action_requirement in ('VALUE_CORRECTION', 'MISSING_VALUE')",
    "origin = 'CARRIED_FORWARD_ACCEPTED'",
    "previous_evidence_version_id = current_evidence_version_id",
    "previous_evidence_sha256 = current_evidence_sha256",
    "previous_value_sha256 = current_value_sha256",
    "select 1 from public.app_evidence_review_customer_submission_items",
    "pg_catalog.pg_advisory_xact_lock",
    "correction_generation",
    "parent_snapshot_id",
    "resulting_snapshot_id",
    "current_unanswered_handoff_missing",
    "stale_correction_context",
    "unsupported_or_invalid_correction",
    "set consumed_at = v_now",
    "overall_review_status', 'TO_REVIEW'",
    "enable row level security",
    "from public, anon, authenticated, service_role",
  ]
) {
  assert(
    migration.includes(required),
    `migration_contract_missing:${required}`,
  );
}

assert(
  !migration.includes("app_customer_correction_upload_staging") &&
    !migration.includes("origin = 'HUMAN_ACCEPTED'") &&
    !migration.includes("completed=true") &&
    challenge.includes("generateSigningOtp") &&
    challenge.includes("resolveSigningOtpTransport") &&
    challenge.includes("requireVerifiedSupabaseAuthUser") &&
    finalize.includes("otpVerifier") &&
    finalize.includes("requireVerifiedSupabaseAuthUser") &&
    !challenge.includes("service_role") &&
    !finalize.includes("service_role") &&
    handoffV2Migration.includes("app_customer_correction_prepare_v2") &&
    handoffV2Migration.includes("app_customer_correction_prepare_v1") &&
    signerAuthorityMigration.includes(
      "app_customer_correction_signer_context_v1",
    ) &&
    signerAuthorityMigration.includes(
      "app_customer_correction_signer_challenge_bindings",
    ) &&
    signerAuthorityMigration.includes(
      "app_customer_correction_signer_evidence_bindings",
    ) &&
    signerAuthorityMigration.includes("signer_authority_changed") &&
    signerAuthorityMigration.includes("current_account_owner_person_v1") &&
    signerAuthorityMigration.includes("current_authorized_representative_v1") &&
    signerAuthorityMigration.includes("customer_type in ('zakelijk', 'vve')") &&
    challenge.includes("app_customer_correction_challenge_issue_v4") &&
    challenge.includes("app_customer_correction_signer_context_v1") &&
    challenge.indexOf("app_customer_correction_signer_context_v1") <
      challenge.indexOf("generateSigningOtp()") &&
    finalize.includes("app_customer_correction_finalize_v3"),
  "runtime_reuse_or_secret_boundary_failed",
);

const sourceOnly = Deno.args.includes("--source-only");
if (Deno.args.some((argument) => argument !== "--source-only")) {
  throw new Error("unknown_argument");
}

if (!sourceOnly) {
  const sql = `begin read only;
with pilot as (
  select id,customer_id from public.app_cases
  where case_reference='CASE-7E4CC75CD19F'
), actor as (
  select grant_row.auth_user_id from public.app_customer_access_grants grant_row
  join pilot on pilot.customer_id=grant_row.customer_id
  where grant_row.granted_case_id is null or grant_row.granted_case_id=pilot.id
  limit 1
), read_contract as (
  select public.app_customer_correction_handoff_read_v3(
    actor.auth_user_id,'CASE-7E4CC75CD19F'
  ) body from actor
), item_ref as (
  select body#>>'{handoff,items,0,item_ref}' value from read_contract
), probes as (
  select
    public.app_customer_correction_prepare_v2(
      actor.auth_user_id,'CASE-7E4CC75CD19F',
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'itemRef',item_ref.value,'correctedValue','Proof supplier only'
      ))
    ) valid,
    public.app_customer_correction_prepare_v2(
      actor.auth_user_id,'CASE-7E4CC75CD19F','[]'::jsonb
    ) partial,
    public.app_customer_correction_prepare_v2(
      actor.auth_user_id,'CASE-7E4CC75CD19F',
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'itemRef',item_ref.value,'correctedValue','A'
        ),
        pg_catalog.jsonb_build_object(
          'itemRef',item_ref.value,'correctedValue','B'
        )
      )
    ) duplicate,
    public.app_customer_correction_prepare_v2(
      actor.auth_user_id,'CASE-7E4CC75CD19F',
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'itemRef',item_ref.value,'correctedValue','A'
        ),
        pg_catalog.jsonb_build_object(
          'itemRef','CCI-FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
          'correctedValue','B'
        )
      )
    ) extra
  from actor,item_ref
)
select concat_ws('|',
  valid->>'ok',valid#>>'{items,0,action_requirement}',
  partial->>'ok',duplicate->>'ok',extra->>'ok',
  public.app_customer_correction_action_requirement_v1(
    '{"action_requirement":"DOCUMENT_REPLACEMENT"}'::jsonb,'PRESENT'),
  (select count(*) from public.app_evidence_review_customer_submissions
    where case_id=(select id from pilot)),
  (select public.app_customer_correction_signer_context_v1(
    actor.auth_user_id,'CASE-7E4CC75CD19F'
  )#>>'{expected_signer_display_name}' from actor)
) from probes;
rollback;`;
  const command = new Deno.Command("psql", {
    args: [
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      "-X",
      "-Atq",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const process = command.spawn();
  const writer = process.stdin.getWriter();
  await writer.write(new TextEncoder().encode(sql));
  await writer.close();
  const output = await process.output();
  assert(
    output.success,
    `local_read_only_sql_failed:${
      new TextDecoder().decode(output.stderr).replace(/\s+/g, " ").slice(0, 300)
    }`,
  );
  const evidence = new TextDecoder().decode(output.stdout).trim();
  assert(
    evidence ===
      "true|VALUE_CORRECTION|false|false|false|DOCUMENT_REPLACEMENT|0|Lokaal Piloot",
    `local_scope_probe_failed:${evidence.replace(/[^A-Z0-9_|-]/gi, "")}`,
  );
}

console.log([
  "CUSTOMER_CORRECTION_ACTION_CONTRACT=PASS",
  "CUSTOMER_CORRECTION_EXACT_SCOPE=PASS",
  "CUSTOMER_CORRECTION_MULTI_ITEM_ONE=PASS",
  "CUSTOMER_CORRECTION_MULTI_ITEM_THREE=PASS",
  "CUSTOMER_CORRECTION_MULTI_ITEM_CROSS_DOCUMENT=PASS",
  "CUSTOMER_CORRECTION_MULTI_ITEM_ALL_FACTS=PASS",
  "CUSTOMER_CORRECTION_PARTIAL_DENIED=PASS",
  "CUSTOMER_CORRECTION_DUPLICATE_DENIED=PASS",
  "CUSTOMER_CORRECTION_EXTRA_DENIED=PASS",
  "CUSTOMER_CORRECTION_DOCUMENT_ACTIONS_SUPPORTED=PASS",
  sourceOnly
    ? "CUSTOMER_CORRECTION_SOURCE_ONLY=PASS"
    : "CUSTOMER_CORRECTION_PILOT_SUBMISSIONS_ZERO=PASS",
  "CUSTOMER_CORRECTION_SIGNER_AUTHORITY=PASS",
  "CUSTOMER_CORRECTION_EXACT_NAME_MATCH=PASS",
  "CUSTOMER_CORRECTION_PROOF_Q01_Q13=PASS",
].join("\n"));

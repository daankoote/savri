import {
  CUSTOMER_CORRECTION_RESPONSE_REQUIREMENTS,
  parseCustomerCorrectionHandoffSource,
} from "../../supabase/functions/_shared/app_evidence_review_correction_handoff.ts";
import {
  parseCorrectionChallengeRequest,
} from "../../supabase/functions/_shared/app_customer_correction_submission.ts";
import {
  decodeCustomerCorrectionHandoffResponse,
} from "../../app/src/features/dashboard/customerCorrectionHandoffClient.ts";

const ROOT = new URL("../../", import.meta.url);
const read = (path: string) => Deno.readTextFileSync(new URL(path, ROOT));
const MIGRATION = read(
  "supabase/migrations/20260820120000_app_customer_correction_handoff_contract_v2.sql",
);
const SIGNER_AUTHORITY_MIGRATION = read(
  "supabase/migrations/20260820150000_app_customer_correction_signer_authority.sql",
);
const FACT_IDENTITY_PROJECTION_MIGRATION = read(
  "supabase/migrations/20260822120000_app_customer_correction_handoff_fact_projection.sql",
);
const CANDIDATE_SELECTION_MIGRATION = read(
  "supabase/migrations/20260823120000_app_customer_correction_candidate_selection.sql",
);
const HANDOFF_ENDPOINT = read(
  "supabase/functions/api-app-customer-correction-handoff/index.ts",
);
const CHALLENGE_ENDPOINT = read(
  "supabase/functions/api-app-customer-correction-signing-challenge/index.ts",
);
const FINALIZE_ENDPOINT = read(
  "supabase/functions/api-app-customer-correction-signing-finalize/index.ts",
);
const CLIENT = read(
  "app/src/features/dashboard/customerCorrectionHandoffClient.ts",
);

const CASE_REF = "CASE-AAAAAAAAAAAA";
const ITEM_REF = (number: number) =>
  `CCI-${number.toString(16).padStart(32, "0").toUpperCase()}`;

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

function sourceItem({
  number,
  documentLabel = "Energiedocument",
  requirement = "VALUE_CORRECTION",
}: {
  number: number;
  documentLabel?: "Energiedocument" | "Installatiefactuur";
  requirement?: (typeof CUSTOMER_CORRECTION_RESPONSE_REQUIREMENTS)[number];
}) {
  const requiresReplacement = [
    "DOCUMENT_REPLACEMENT",
    "VALUE_PLUS_DOCUMENT_REPLACEMENT",
  ].includes(requirement);
  return {
    item_ref: ITEM_REF(number),
    document_label: documentLabel,
    fact_key: documentLabel === "Energiedocument"
      ? "energySupplier"
      : "serialNumber",
    fact_label: `Fact ${number}`,
    ...(requirement === "MISSING_VALUE"
      ? {}
      : { current_value: `Current ${number}` }),
    correction_reason: requirement === "MISSING_VALUE"
      ? "MISSING_INFORMATION"
      : "INCORRECT_INFORMATION",
    correction_reason_label: requirement === "MISSING_VALUE"
      ? "Gegeven ontbreekt"
      : "Gegeven onjuist",
    correction_instruction: `Corrigeer item ${number}`,
    response_requirement: requirement,
    ...(requiresReplacement
      ? {
        replacement_target: {
          replacement_target_ref: `CRT-${"A".repeat(31)}${number}`,
          document_label: documentLabel,
          accepted_mime_types: ["application/pdf"],
          maximum_file_size: 15 * 1024 * 1024,
        },
      }
      : {}),
  };
}

function source(items: unknown[]) {
  return {
    ok: true,
    status: 200,
    code: "ok",
    case_ref: CASE_REF,
    handoff: {
      current_replacement_candidates: [],
      handoff_ref: "CRH-0123456789ABCDEF",
      published_at: "2026-08-20T12:00:00.000Z",
      signer_authority: {
        status: "available",
        expected_signer_display_name: "Proof Person",
      },
      items,
    },
  };
}

const matrix = [
  [sourceItem({ number: 1 })],
  [
    sourceItem({ number: 1 }),
    sourceItem({ number: 2, requirement: "MISSING_VALUE" }),
    sourceItem({ number: 3 }),
  ],
  [
    sourceItem({ number: 1 }),
    sourceItem({ number: 2, documentLabel: "Installatiefactuur" }),
  ],
  [
    sourceItem({ number: 1 }),
    sourceItem({ number: 2, requirement: "DOCUMENT_REPLACEMENT" }),
  ],
  Array.from({ length: 8 }, (_, index) =>
    sourceItem({
      number: index + 1,
      documentLabel: index > 3 ? "Installatiefactuur" : "Energiedocument",
      requirement: index % 2 ? "MISSING_VALUE" : "VALUE_CORRECTION",
    })),
];

for (const items of matrix) {
  const parsed = parseCustomerCorrectionHandoffSource(source(items));
  assert(
    parsed?.handoff?.items.length === items.length,
    "source_matrix_failed",
  );
  if (
    parsed.handoff.items.every((item) =>
      ![
        "DOCUMENT_REPLACEMENT",
        "VALUE_PLUS_DOCUMENT_REPLACEMENT",
      ].includes(item.responseRequirement)
    )
  ) {
    const client = decodeCustomerCorrectionHandoffResponse({
      schemaVersion: "customer-correction-handoff-v5",
      caseRef: CASE_REF,
      handoff: {
        currentReplacementCandidates: parsed.handoff
          .currentReplacementCandidates,
        handoffRef: "CRH-0123456789ABCDEF",
        publishedAt: "2026-08-20T12:00:00.000Z",
        signerAuthority: parsed.handoff.signerAuthority,
        items: parsed.handoff.items,
      },
    }, CASE_REF);
    assert(client.ok, "value_only_client_matrix_failed");
  }
}

const mixed = parseCustomerCorrectionHandoffSource(source(matrix[3]));
assert(
  mixed?.handoff?.items[0].responseRequirement === "VALUE_CORRECTION" &&
    mixed.handoff.items[1].responseRequirement === "DOCUMENT_REPLACEMENT" &&
    mixed.handoff.items[1].replacementTarget?.acceptedMimeTypes[0] ===
      "application/pdf" &&
    !("replacementTarget" in mixed.handoff.items[0]),
  "mixed_document_requirement_not_distinguished",
);
const missing = parseCustomerCorrectionHandoffSource(source([
  sourceItem({ number: 1, requirement: "MISSING_VALUE" }),
]));
assert(
  missing?.handoff?.items[0].responseRequirement === "MISSING_VALUE" &&
    !("currentValue" in missing.handoff.items[0]),
  "missing_value_fabricated_current_value",
);
assert(
  !parseCustomerCorrectionHandoffSource(source([{
    ...sourceItem({ number: 1 }),
    subject_ref: "FRS-INTERNAL",
  }])) &&
    !parseCustomerCorrectionHandoffSource(source([{
      ...sourceItem({ number: 1 }),
      response_requirement: "UNKNOWN",
    }])) &&
    !parseCustomerCorrectionHandoffSource(source([
      sourceItem({ number: 1 }),
      sourceItem({ number: 1 }),
    ])),
  "closed_or_opaque_contract_not_fail_closed",
);

const challenge = parseCorrectionChallengeRequest({
  caseRef: CASE_REF,
  factResolutions: [{
    itemRefs: [ITEM_REF(1)],
    resolutionType: "MANUAL",
    sources: [],
  }],
  responses: [{ itemRef: ITEM_REF(1), correctedValue: "Corrected" }],
  typedFullName: "Proof Person",
});
assert(
  challenge?.responses[0].itemRef === ITEM_REF(1) &&
    !parseCorrectionChallengeRequest({
      caseRef: CASE_REF,
      factResolutions: [],
      typedFullName: "Proof Person",
      responses: [{ itemIndex: 0, correctedValue: "Corrected" }],
    }) &&
    !parseCorrectionChallengeRequest({
      caseRef: CASE_REF,
      factResolutions: [{
        itemRefs: [ITEM_REF(1)],
        resolutionType: "MANUAL",
        sources: [],
      }],
      typedFullName: "Proof Person",
      responses: [
        { itemRef: ITEM_REF(1), correctedValue: "A" },
        { itemRef: ITEM_REF(1), correctedValue: "B" },
      ],
    }),
  "item_ref_challenge_contract_failed",
);

for (
  const required of [
    "app_customer_correction_item_ref_v1",
    "app_customer_correction_handoff_read_v2",
    "app_customer_correction_action_requirement_v1",
    "app_customer_correction_prepare_v2",
    "app_customer_correction_prepare_v1",
    "app_customer_correction_challenge_issue_v2",
    "response_requirement",
    "^CCI-[A-F0-9]{32}$",
    "customer_case_access_denied",
    "handoff_integrity_failed",
  ]
) {
  assert(
    MIGRATION.includes(required),
    `migration_contract_missing:${required}`,
  );
}
assert(
  HANDOFF_ENDPOINT.includes("app_customer_correction_handoff_read_v5") &&
    CANDIDATE_SELECTION_MIGRATION.includes(
      "app_customer_correction_handoff_read_v5",
    ) &&
    CHALLENGE_ENDPOINT.includes("app_customer_correction_challenge_issue_v4") &&
    FINALIZE_ENDPOINT.includes("app_customer_correction_finalize_v3") &&
    SIGNER_AUTHORITY_MIGRATION.includes(
      "app_customer_correction_signer_context_v1",
    ) &&
    FACT_IDENTITY_PROJECTION_MIGRATION.includes(
      "'fact_key', subject.item->>'fact_key'",
    ) &&
    !FACT_IDENTITY_PROJECTION_MIGRATION.includes("fact_label") &&
    !FACT_IDENTITY_PROJECTION_MIGRATION.includes("'subject_ref',") &&
    MIGRATION.includes("return v_prepare") &&
    CLIENT.includes(
      "responseRequirement as CustomerCorrectionResponseRequirement",
    ) &&
    !CLIENT.includes("correctionReason ===") &&
    !CLIENT.includes("documentLabel ===") &&
    !CLIENT.includes("factLabel ==="),
  "authority_or_finalizer_compatibility_failed",
);

const local = Deno.args.includes("--local-read");
if (Deno.args.some((argument) => argument !== "--local-read")) {
  throw new Error("unknown_argument");
}
if (local) {
  const sql = `begin read only;
with pilot as (
  select id,customer_id,case_reference from public.app_cases
  where case_reference='CASE-7E4CC75CD19F'
), actor as (
  select grant_row.auth_user_id from public.app_customer_access_grants grant_row
  join pilot on pilot.customer_id=grant_row.customer_id
  where grant_row.granted_case_id is null or grant_row.granted_case_id=pilot.id
  limit 1
), first_read as (
  select public.app_customer_correction_handoff_read_v4(
    actor.auth_user_id,pilot.case_reference
  ) body from actor,pilot
), second_read as (
  select public.app_customer_correction_handoff_read_v4(
    actor.auth_user_id,pilot.case_reference
  ) body from actor,pilot
), unauthorized as (
  select public.app_customer_correction_handoff_read_v4(
    '00000000-0000-4000-8000-000000000001'::uuid,pilot.case_reference
  ) body from pilot
)
select concat_ws('|',
  first_read.body->>'ok',
  pg_catalog.jsonb_array_length(first_read.body#>'{handoff,items}'),
  first_read.body#>>'{handoff,items,0,response_requirement}',
  first_read.body#>>'{handoff,items,0,current_value}',
  first_read.body#>>'{handoff,items,0,item_ref}' =
    second_read.body#>>'{handoff,items,0,item_ref}',
  first_read.body#>>'{handoff,items,0,item_ref}' ~ '^CCI-[A-F0-9]{32}$',
  not (first_read.body#>'{handoff,items,0}' ? 'subject_ref'),
  first_read.body#>>'{handoff,items,0,fact_key}',
  first_read.body#>>'{handoff,signer_authority,status}',
  first_read.body#>>'{handoff,signer_authority,expected_signer_display_name}',
  unauthorized.body->>'code',
  (select count(*) from public.app_evidence_review_customer_submissions s
    join pilot on pilot.id=s.case_id)
)
from first_read,second_read,unauthorized;
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
    `local_read_failed:${
      new TextDecoder().decode(output.stderr).replace(/\s+/g, " ").slice(0, 300)
    }`,
  );
  const evidence = new TextDecoder().decode(output.stdout).trim();
  assert(
    evidence ===
      "true|1|VALUE_CORRECTION|Pilot Energie Nederland B.V.|t|t|t|energySupplier|available|Lokaal Piloot|authentication_required|0",
    `pilot_projection_failed:${evidence.replace(/[^A-Za-z0-9 ._|-]/g, "")}`,
  );
}

console.log([
  "CUSTOMER_CORRECTION_HANDOFF_V3_ACTION_AUTHORITY=PASS",
  "CUSTOMER_CORRECTION_HANDOFF_V3_OPAQUE_ITEM_REF=PASS",
  "CUSTOMER_CORRECTION_HANDOFF_V3_INTERNAL_REFS_PRIVATE=PASS",
  "CUSTOMER_CORRECTION_HANDOFF_V3_MULTI_ITEM_MATRIX=PASS",
  "CUSTOMER_CORRECTION_HANDOFF_V3_MIXED_DOCUMENT_ACTION=PASS",
  "CUSTOMER_CORRECTION_HANDOFF_V3_FINALIZER_COMPATIBILITY=PASS",
  "CUSTOMER_CORRECTION_HANDOFF_V3_SIGNER_AUTHORITY=PASS",
  local
    ? "CUSTOMER_CORRECTION_HANDOFF_V3_PILOT_LOCAL_READ=PASS"
    : "CUSTOMER_CORRECTION_HANDOFF_V3_SOURCE_ONLY=PASS",
  "CUSTOMER_CORRECTION_HANDOFF_V3_Q01_Q08=PASS",
].join("\n"));

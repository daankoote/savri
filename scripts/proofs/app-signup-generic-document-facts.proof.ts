import type { InvoicePdfParserResult } from "../../app/src/features/invoice-analysis/invoicePdfParserAdapter.ts";
import { parseInvoicePdfInput } from "../../app/src/features/invoice-analysis/invoicePdfParserAdapter.ts";
import type { DocumentFactObservation } from "../../app/src/features/signup/documentFactRegistry.ts";
import { decideDocumentFact } from "../../app/src/features/signup/documentFactDecisionPolicy.ts";
import {
  createFreshDocumentFirstSignupDraft,
  type DocumentFirstSignupDraft,
  documentFirstSignupReducer,
} from "../../app/src/features/signup/documentFirstSignupModel.ts";
import {
  projectDocumentFacts,
  projectEnergyEanCandidates,
} from "../../app/src/features/signup/documentSemanticProjector.ts";
import { selectDocumentReviewMatrix } from "../../app/src/features/signup/documentReviewMatrix.ts";

const ROOT = new URL("../../", import.meta.url);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function source(path: string): Promise<string> {
  return await Deno.readTextFile(new URL(path, ROOT));
}

async function requiredFixture(variable: string): Promise<Uint8Array> {
  const path = Deno.env.get(variable);
  assert(path, `required_fixture_env_missing:${variable}`);
  return await Deno.readFile(path);
}

function parsed(
  result: Awaited<ReturnType<typeof parseInvoicePdfInput>>,
): InvoicePdfParserResult {
  assert(result.ok, "fixture_parse_failed");
  return result;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256File(path: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    await Deno.readFile(new URL(path, ROOT)),
  );
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function sourceNeutralFacts(facts: ReadonlyArray<DocumentFactObservation>) {
  return facts.map((
    { sourceDocumentId: _id, sourceDocumentType: _type, ...fact },
  ) => fact);
}

function withSameDocumentInBothSlots(
  result: InvoicePdfParserResult,
  bytes: Uint8Array,
): {
  draft: DocumentFirstSignupDraft;
  locationId: string;
  chargerId: string;
  energyDocumentId: string;
  chargerDocumentId: string;
} {
  let draft = createFreshDocumentFirstSignupDraft("particulier");
  const locationId = draft.locationOrder[0];
  const chargerId = draft.chargerOrderByLocationId[locationId][0];
  const energyDocument = draft.energyDocumentsByLocationId[locationId];
  const chargerDocument = draft.chargerDocumentsByChargerId[chargerId].find(
    (document) => document.documentType === "installation_invoice",
  );
  assert(chargerDocument, "charger_document_slot_missing");
  draft = documentFirstSignupReducer(draft, {
    type: "update_energy_document",
    document: {
      ...energyDocument,
      file: new File([Uint8Array.from(bytes)], "fixture-a.pdf", {
        type: "application/pdf",
      }),
      status: "selected",
    },
  });
  draft = documentFirstSignupReducer(draft, {
    type: "update_charger_document",
    document: {
      ...chargerDocument,
      file: new File([Uint8Array.from(bytes)], "fixture-b.pdf", {
        type: "application/pdf",
      }),
      status: "selected",
      observation: null,
      parseStatus: "parsed",
    },
  });
  for (
    const documentId of [energyDocument.clientId, chargerDocument.clientId]
  ) {
    const envelope = result.observation_envelope;
    draft = documentFirstSignupReducer(draft, {
      type: "set_document_observation",
      documentId,
      value: {
        documentId,
        contentFingerprint: envelope.contentFingerprint,
        parserVersion: envelope.parserVersion,
        envelope,
      },
    });
  }
  const candidates = projectEnergyEanCandidates(result.observation_envelope);
  draft = documentFirstSignupReducer(draft, {
    type: "update_connection_declaration",
    locationId,
    value: {
      sourceMode: "document",
      preflightStatus: candidates.length === 1
        ? "electricity_candidate_found"
        : candidates.length > 1
        ? "multiple_candidates"
        : "no_candidate",
      candidates,
      selectedCandidateEan: candidates.length === 1
        ? candidates[0].normalizedEan
        : "",
      confirmedEan: "",
      manualEan: "",
      customerConfirmed: false,
    },
  });
  return {
    draft,
    locationId,
    chargerId,
    energyDocumentId: energyDocument.clientId,
    chargerDocumentId: chargerDocument.clientId,
  };
}

function foundObservation(
  factKey: DocumentFactObservation["factKey"],
  value: string,
  sourceDocumentId: string,
): DocumentFactObservation {
  return {
    factKey,
    value,
    sourceDocumentId,
    sourceDocumentType: sourceDocumentId === "left"
      ? "energy_bill_or_contract"
      : "installation_invoice",
    semanticRole: factKey === "electricityEan"
      ? "electricity_connection"
      : "charger_asset",
    extractionStatus: "found",
    confidence: "high",
    extractionMethod: "proof_candidate",
    sourcePage: null,
    displayable: true,
    rejectionReason: null,
  };
}

const adapterSource = await source(
  "app/src/features/invoice-analysis/invoicePdfParserAdapter.ts",
);
const documentsSource = await source(
  "app/src/features/signup/DocumentFirstDocumentsStep.tsx",
);
const internalTypeSignalsSource = await source(
  "app/src/features/invoice-analysis/documentTypeClassifier.ts",
);
const envelopeSource = await source(
  "app/src/features/invoice-analysis/documentObservationEnvelope.ts",
);
const chargerDocumentsSource = await source(
  "app/src/features/signup/ChargerDocumentsSection.tsx",
);
const connectionSource = await source(
  "app/src/features/signup/SignupConnectionSection.tsx",
);
const matrixSource = await source(
  "app/src/features/signup/documentReviewMatrix.ts",
);
const applicabilitySource = await source(
  "app/src/features/signup/documentFactApplicability.ts",
);
const matrixUiSource = await source(
  "app/src/features/signup/DocumentFirstCheckMatrix.tsx",
);
const factTableSource = await source(
  "app/src/features/signup/presentation/FactTable.tsx",
);
const organizationPanelSource = await source(
  "app/src/features/signup/OrganizationDocumentStepPanel.tsx",
);
const modelSource = await source(
  "app/src/features/signup/documentFirstSignupModel.ts",
);
const shellSource = await source("app/src/features/signup/SignupPageShell.tsx");
const mapperSource = await source(
  "app/src/features/signup/signupSubmitMapper.ts",
);
const activeCustomerSource = [
  documentsSource,
  chargerDocumentsSource,
  connectionSource,
  envelopeSource,
  matrixSource,
  matrixUiSource,
  organizationPanelSource,
  modelSource,
  shellSource,
].join("\n");

assert(
  (adapterSource.match(/export async function parseInvoicePdfInput\(/g) || [])
        .length === 1 &&
    parseInvoicePdfInput.length === 1 &&
    (documentsSource.match(/parseInvoicePdfInput\(document\.file\)/g)
            ?.length || 0) +
          (shellSource.match(/parseInvoicePdfInput\(document\.file\)/g)
            ?.length || 0) === 3,
  "single_technical_parser_entrypoint_missing",
);
const parserSignature = adapterSource.slice(
  adapterSource.indexOf("export async function parseInvoicePdfInput"),
  adapterSource.indexOf("export async function parseInvoicePdfInput") + 180,
);
for (
  const forbidden of [
    "uploadSlot",
    "expectedDocument",
    "locationId",
    "chargerId",
    "accountType",
    "matrixColumn",
  ]
) {
  assert(
    !parserSignature.includes(forbidden),
    `slot_context_in_parser_signature:${forbidden}`,
  );
}

for (
  const forbidden of [
    "wrong_document_type",
    "unknown_document_type",
    "ambiguous_document_type",
    "Verkeerd documenttype",
    "Documenttype niet herkend",
    "checkDocumentSlotCompatibility",
    "classifyDocumentType",
  ]
) {
  assert(
    !activeCustomerSource.includes(forbidden),
    `active_document_type_gate_remains:${forbidden}`,
  );
}
let compatibilityModuleExists = true;
try {
  await Deno.stat(
    new URL("app/src/features/signup/documentSlotCompatibility.ts", ROOT),
  );
} catch (error) {
  if (error instanceof Deno.errors.NotFound) compatibilityModuleExists = false;
  else throw error;
}
assert(
  !compatibilityModuleExists,
  "obsolete_slot_compatibility_module_remains",
);
assert(
  adapterSource.includes("deriveDocumentTypeCandidates") &&
    internalTypeSignalsSource.includes(
      "Internal descriptive envelope metadata only",
    ) &&
    !internalTypeSignalsSource.includes("classifyDocumentType") &&
    !activeCustomerSource.includes("documentTypeClassifier"),
  "document_type_signals_not_bounded_to_internal_envelope_metadata",
);
assert(
  matrixSource.includes("selectDocumentFactApplicability") &&
    applicabilitySource.includes("accountType") &&
    !adapterSource.includes("selectDocumentFactApplicability") &&
    !documentsSource.includes("selectDocumentFactApplicability"),
  "fact_applicability_leaked_into_generic_extraction",
);

const energyBytes = await requiredFixture("ENVAL_EAN_REAL_PDF");
const chargerBytes = await requiredFixture("ENVAL_CHARGER_REAL_PDF");
const energyA = parsed(await parseInvoicePdfInput(energyBytes));
const energyB = parsed(await parseInvoicePdfInput(energyBytes));
const chargerA = parsed(await parseInvoicePdfInput(chargerBytes));
const chargerB = parsed(await parseInvoicePdfInput(chargerBytes));

for (const [left, right] of [[energyA, energyB], [chargerA, chargerB]]) {
  assert(
    left.parser_version === right.parser_version &&
      await digest(left.observation_envelope) ===
        await digest(right.observation_envelope),
    "same_bytes_observation_digest_drift",
  );
}

for (const result of [energyA, chargerA]) {
  const energyColumnFacts = projectDocumentFacts(
    result.observation_envelope,
    "energy-source",
    "energy_bill_or_contract",
  );
  const chargerColumnFacts = projectDocumentFacts(
    result.observation_envelope,
    "charger-source",
    "installation_invoice",
  );
  assert(
    energyColumnFacts.map((fact) => fact.factKey).join("|") ===
      [
        "partyName",
        "organizationName",
        "registeredAddress",
        "legalForm",
        "tradeName",
        "directorOrBoardMember",
        "directorTitle",
        "representationAuthorityText",
        "structuredAddress",
        "electricityEan",
        "gasEan",
        "kvkNumber",
        "energySupplier",
        "installerOrSupplier",
        "contractStart",
        "contractEnd",
        "invoiceDate",
        "explicitInstallationDate",
        "chargerBrand",
        "chargerModel",
        "midNumber",
        "serialNumber",
      ].join("|"),
    "generic_fact_registry_projection_incomplete",
  );
  assert(
    await digest(sourceNeutralFacts(energyColumnFacts)) ===
      await digest(sourceNeutralFacts(chargerColumnFacts)),
    "upload_slot_changed_generic_fact_projection",
  );
  assert(
    energyColumnFacts.every((fact, index) => {
      const other = chargerColumnFacts[index];
      return fact.value === other.value &&
        fact.confidence === other.confidence &&
        fact.extractionMethod === other.extractionMethod &&
        fact.displayable === other.displayable &&
        fact.semanticRole === other.semanticRole;
    }),
    "upload_slot_changed_value_confidence_method_or_displayability",
  );
}

const energyBoth = withSameDocumentInBothSlots(energyA, energyBytes);
const energyMatrix = selectDocumentReviewMatrix(
  energyBoth.draft,
  energyBoth.locationId,
  energyBoth.chargerId,
);
assert(
  energyMatrix.rows.every((row) =>
    row.energyDocument.value === row.chargerDocument.value &&
    row.energyDocument.status === row.chargerDocument.status &&
    row.energyDocument.semanticRole === row.chargerDocument.semanticRole
  ),
  "energy_pdf_matrix_column_parity_failed",
);
for (
  const missingFact of [
    "chargerBrand",
    "chargerModel",
    "midNumber",
    "serialNumber",
  ]
) {
  assert(
    energyMatrix.blockers.some((row) => row.factKey === missingFact),
    `energy_pdf_missing_required_blocker:${missingFact}`,
  );
}
assert(!energyMatrix.canContinue, "energy_pdf_in_both_slots_allowed_progress");

const chargerBoth = withSameDocumentInBothSlots(chargerA, chargerBytes);
const chargerMatrix = selectDocumentReviewMatrix(
  chargerBoth.draft,
  chargerBoth.locationId,
  chargerBoth.chargerId,
);
assert(
  chargerMatrix.rows.every((row) =>
    row.energyDocument.value === row.chargerDocument.value &&
    row.energyDocument.status === row.chargerDocument.status &&
    row.energyDocument.semanticRole === row.chargerDocument.semanticRole
  ) &&
    chargerMatrix.blockers.some((row) => row.factKey === "electricityEan") &&
    !chargerMatrix.canContinue,
  "charger_pdf_matrix_parity_or_required_ean_gate_failed",
);

const noFactBytes = new TextEncoder().encode(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF",
);
const noFact = parsed(await parseInvoicePdfInput(noFactBytes));
assert(
  noFact.observation_envelope.factCandidates.length === 0,
  "random_pdf_generic_factset_not_empty",
);
const noFactBoth = withSameDocumentInBothSlots(noFact, noFactBytes);
const noFactMatrix = selectDocumentReviewMatrix(
  noFactBoth.draft,
  noFactBoth.locationId,
  noFactBoth.chargerId,
);
assert(
  noFactMatrix.rows.every((row) =>
    row.energyDocument.value === null && row.chargerDocument.value === null
  ) && noFactMatrix.blockers.length === 7 &&
    noFactMatrix.rows.filter((row) => row.action === "Invullen").length === 7 &&
    !noFactMatrix.canContinue,
  "random_pdf_missing_fact_gate_failed",
);
assert(
  (documentsSource.match(/Geen gegevens gevonden\./g) || []).length === 2 &&
    factTableSource.includes('row.canonicalValue || "—"') &&
    !factTableSource.includes("Niet gevonden"),
  "no_fact_customer_display_contract_failed",
);

for (const factKey of ["electricityEan", "midNumber"] as const) {
  const decision = decideDocumentFact({
    factKey,
    declaredValue: null,
    observations: [
      foundObservation(factKey, "fact-a", "left"),
      foundObservation(factKey, "fact-b", "right"),
    ],
    correctedValue: null,
    confirmedValue: null,
  });
  assert(
    decision.status === "blocked" && decision.blocksProgress,
    `material_fact_conflict_no_longer_blocks:${factKey}`,
  );
}
assert(
  projectDocumentFacts(
    energyA.observation_envelope,
    "energy-source",
    "energy_bill_or_contract",
  ).some((fact) =>
    fact.factKey === "partyName" &&
    fact.semanticRole === "contract_holder" && fact.displayable
  ) &&
    projectDocumentFacts(
      chargerA.observation_envelope,
      "charger-source",
      "installation_invoice",
    ).some((fact) =>
      fact.factKey === "partyName" &&
      fact.semanticRole === "buyer_or_customer" && fact.displayable
    ),
  "semantic_role_metadata_lost",
);
assert(
  modelSource.includes("parserObservations") &&
    modelSource.includes("customerConfirmations") &&
    modelSource.includes("manualCorrections") &&
    !mapperSource.includes("parserObservations") &&
    !mapperSource.includes("customerConfirmations") &&
    !mapperSource.includes("manualCorrections"),
  "observed_derived_confirmation_boundary_failed",
);
assert(
  ![documentsSource, matrixUiSource, shellSource].join("\n").includes(
    "style={{",
  ),
  "inline_css_added",
);

for (
  const [path, expected] of [
    [
      "supabase/migrations/20260730150000_app_signup_connection_declaration_sources.sql",
      "c9a82157dcc77577edf833950ee97eb886ebbaa645cfada20a98e492b2771ff8",
    ],
    [
      "supabase/migrations/20260730170000_app_assisted_connection_capture_correction.sql",
      "561a80fee5c04cc073d8c099e54b7ad721abff021b23522d4cfa8588f4afcb25",
    ],
    [
      "supabase/functions/api-app-signup-submit/index.ts",
      "fd4516c31328eb81b8904be4b5594218faed59d6133340c58a85e5dec4106be3",
    ],
  ] as const
) {
  assert(
    await sha256File(path) === expected,
    `protected_hash_mismatch:${path}`,
  );
}

const proofSource = await source(
  "scripts/proofs/app-signup-generic-document-facts.proof.ts",
);
assert(
  (proofSource.match(/console\.log\(/g) || []).length === 1 &&
    !/\b\d{18}\b/.test(proofSource),
  "proof_output_may_expose_pii_or_full_ean",
);

console.log("signup-generic-document-facts-05-proof-ok");

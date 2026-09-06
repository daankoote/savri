import { renderToStaticMarkup } from "react-dom/server";
import {
  allRequiredDocumentEvidenceReady,
  DocumentEvidenceWorkflow,
} from "./DocumentEvidenceWorkflow.tsx";
import { DocumentFactMatrix } from "./DocumentFactMatrix.tsx";
import { CustomerDocumentFactInteraction } from "./CustomerDocumentFactInteraction.tsx";
import { projectCustomerDocumentFactActiveSources } from "./customerDocumentFactActiveSourceProjector.ts";
import {
  createDocumentUploadCardModel,
  isDocumentUploadReady,
} from "../signup/DocumentUploadSlot.tsx";
import type {
  ChargerDocumentDraft,
  LocationDocumentDraft,
} from "../signup/signupTypes.ts";
import {
  selectCustomerDocumentFactRows,
} from "../signup/documentFactRegistry.ts";
import {
  type CustomerCorrectionWorkspaceItem,
  selectCustomerCorrectionActiveFactSources,
} from "../dashboard/customerCorrectionWorkspace.ts";
import { resolveCustomerFactResolutionPolicy } from "./customerDocumentFactSourceResolution.ts";
import {
  createSignupCustomerInteractionModel,
  projectSignupCustomerActiveSources,
} from "../signup/presentation/FactReviewControls.tsx";
import type { FactPresentationRow } from "../signup/presentation/factPresentationModel.ts";

declare const Deno: {
  readTextFile(path: URL): Promise<string>;
  exit(code: number): never;
};

const root = new URL("../../../../", import.meta.url);
const source = (path: string) => Deno.readTextFile(new URL(path, root));
function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

function renderMode(mode: "signup" | "correction", ready = true) {
  const longName =
    `${mode}-energiecontract-met-een-bewust-zeer-lange-bestandsnaam.pdf`;
  return renderToStaticMarkup(
    <DocumentEvidenceWorkflow
      evidenceSlots={[{
        id: `${mode}:energy-slot`,
        required: true,
        usableEvidenceReady: ready,
      }, {
        id: `${mode}:installation-slot`,
        required: true,
        usableEvidenceReady: true,
      }]}
      groups={[{
        id: "location",
        title: "Locatie 1",
        rows: [{
          id: "location:energy-supplier:location-1",
          given: "Energieleverancier",
          sources: [{
            id: `${mode}:energy`,
            fileName: longName,
            value: "Voorbeeld Energie B.V.",
          }, {
            id: `${mode}:invoice`,
            fileName: `${mode}-installatiefactuur.pdf`,
            value: "Voorbeeld Energie B.V.",
          }],
          customer: mode === "signup"
            ? {
              id: `${mode}:supplier`,
              label: "Energieleverancier",
              state: "SOURCE_UNRESOLVED",
              sourceValue: "Voorbeeld Energie B.V.",
              emptyValue: "",
              editor: "text",
              isValid: () => true,
              onConfirm: () => undefined,
            }
            : {
              id: `${mode}:supplier`,
              label: "Energieleverancier",
              state: "LOCKED",
              emptyValue: "",
              editor: "text",
              isValid: () => false,
            },
          enval: mode === "signup" ? "Nog te beoordelen" : "Akkoord",
        }],
      }, {
        id: "charger",
        title: "Laadpaal 1 · Locatie 1",
        rows: [{
          id: "charger:serial-number:charger-1",
          given: "Serienummer",
          sources: [{
            id: `${mode}:serial`,
            fileName: `${mode}-installatiefactuur.pdf`,
            value: null,
          }],
          customer: {
            id: `${mode}:serial`,
            label: "Serienummer",
            state: "MISSING_SOURCE_UNRESOLVED",
            emptyValue: "",
            editor: "text",
            isValid: (value) => typeof value === "string" && Boolean(value),
            onConfirm: () => undefined,
          },
          enval: "Correctie nodig",
        }],
      }]}
      id={`${mode}-workflow`}
      primaryAction={{
        label: mode === "signup" ? "Volgende" : "Wijzigingen indienen",
        onClick: () => undefined,
      }}
      uploads={[{
        id: "energy",
        card: {
          fileName: longName,
          onFileChange: () => undefined,
          scope: "Locatie 1",
          status: { label: "Document beschikbaar", state: "READY" },
          title: "Energienota of energiecontract",
        },
      }, {
        id: "invoice",
        card: {
          fileName: `${mode}-installatiefactuur.pdf`,
          onFileChange: () => undefined,
          scope: "Laadpaal 1",
          status: { label: "Document beschikbaar", state: "READY" },
          title: "Installatiefactuur",
        },
      }]}
    />,
  );
}

function sharedStructure(html: string): string[] {
  return [
    ...html.matchAll(
      /<(section|article|header|div|span|input|label)[^>]*class="([^"]+)"/g,
    ),
  ]
    .filter((match) =>
      /document-evidence-workflow|document-upload|document-slot|fact-review|fact-table/
        .test(match[2])
    )
    .map((match) => `${match[1]}:${match[2]}`);
}

const signup = renderMode("signup");
const correction = renderMode("correction");
const gatedSignup = renderMode("signup", false);
assert(
  JSON.stringify(sharedStructure(signup)) ===
    JSON.stringify(sharedStructure(correction)),
  "Q01_shared_structure_differs",
);
for (const html of [signup, correction]) {
  assert(
    ["Gegeven", "Bron", "Info uit bron", "Klant", "ENVAL"].every((header) =>
      html.includes(`>${header}</span>`)
    ) &&
      (html.match(/class="fact-table fact-table--customer"/g) || []).length ===
        2 &&
      (html.match(/class="document-slot-card"/g) || []).length === 2 &&
      html.includes("Laadpaal 1 · Locatie 1") &&
      html.includes(">-</span>") &&
      !html.includes("Niet gevonden") &&
      (html.includes("signup-installatiefactuur.pdf") ||
        html.includes("correction-installatiefactuur.pdf")) &&
      !html.includes(">+1</small>") &&
      (html.includes('title="signup-') ||
        html.includes('title="correction-')),
    "Q02_shared_exact_columns_sources_or_groups_invalid",
  );
}
assert(
  signup.includes('aria-label="Bevestigen"') &&
    gatedSignup.includes('aria-label="Bevestigen"') &&
    gatedSignup.includes('title="Corrigeren"') &&
    !gatedSignup.includes("Documentbewijs nog niet gereed") &&
    gatedSignup.includes('class="button button-primary" disabled=""'),
  "Q03_manual_interaction_or_submit_evidence_gate_invalid",
);

const partyDefinition = selectCustomerDocumentFactRows("location").find(
  (definition) => definition.factKey === "partyName",
);
assert(partyDefinition, "Q10_party_definition_missing");
const sourceScope = "location:proof";
const correctionSources = selectCustomerCorrectionActiveFactSources({
  definition: partyDefinition,
  items: [{
    item: {
      itemRef: "energy-party",
      documentLabel: "Energiedocument",
      factKey: "partyName",
    },
  }, {
    item: {
      itemRef: "invoice-address",
      documentLabel: "Installatiefactuur",
      factKey: "structuredAddress",
    },
  }] as unknown as readonly CustomerCorrectionWorkspaceItem[],
  scopeRef: sourceScope,
  sourceFileNameByItemRef: {
    "energy-party": "energie.pdf",
    "invoice-address": "installatie.pdf",
  },
  sourceContentFingerprintByItemRef: {
    "energy-party": "a".repeat(64),
    "invoice-address": "b".repeat(64),
  },
  observedValuesByItemRef: { "energy-party": "Voorbeeld Klant" },
  extractionMethodsByItemRef: {
    "energy-party": "semantic_contract_holder_block",
  },
  sourceIdentityByItemRef: {
    "energy-party": "candidate-energy",
    "invoice-address": "candidate-invoice",
  },
});
const correctionPolicy = resolveCustomerFactResolutionPolicy({
  canonicalFactKey: partyDefinition.factKey,
  scopeRef: sourceScope,
  comparisonRole: partyDefinition.id,
  editable: true,
  evidenceReady: true,
  browserResolution: "UNRESOLVED",
  actualReviewTruth: "Correctie nodig",
  sources: correctionSources,
});
const signupPolicySources = projectSignupCustomerActiveSources({
  id: partyDefinition.id + ":" + sourceScope,
  locationId: sourceScope,
  reviewRow: {
    factKey: partyDefinition.factKey,
    scopeKey: sourceScope,
  },
  workflowSources: correctionSources.map((source) => ({
    sourceRef: source.sourceRef,
    evidenceRootRef: source.evidenceRootRef,
    contentFingerprint: source.contentFingerprint,
    fileName: source.fileName,
    sourceDocumentType: source.sourceDocumentType,
    semanticRole: source.semanticRole,
    relationship: source.relationship,
    observedValue: source.observedValue,
    current: source.current,
  })),
} as unknown as FactPresentationRow);
const parityMatrix = renderToStaticMarkup(
  <DocumentFactMatrix
    rows={[{
      id: "source-parity",
      given: "Contracthouder",
      sources: correctionSources.map((source) => ({
        id: source.id,
        fileName: source.fileName,
        value: source.value,
      })),
      customer: {
        id: "source-parity:customer",
        label: "Contracthouder",
        state: "SOURCE_UNRESOLVED",
        sourceValue: "Voorbeeld Klant",
        emptyValue: "",
        editor: "text",
        isValid: () => true,
      },
      enval: "Wacht op klant",
    }]}
    variant="customer"
  />,
);
assert(
  correctionSources.length === 2 &&
    JSON.stringify(signupPolicySources.map((source) => ({
      fileName: source.fileName,
      value: source.value,
      relationship: source.relationship,
    }))) === JSON.stringify(correctionSources.map((source) => ({
      fileName: source.fileName,
      value: source.value,
      relationship: source.relationship,
    }))) &&
    correctionSources[0]?.value === "Voorbeeld Klant" &&
    correctionSources[1]?.value === null &&
    correctionSources[1]?.usable === false &&
    correctionPolicy.usableIndependentSourceCount === 1 &&
    parityMatrix.includes("energie.pdf") &&
    parityMatrix.includes("installatie.pdf") &&
    parityMatrix.includes(">-</span>") &&
    !parityMatrix.includes("Niet gevonden"),
  "Q10_current_source_row_or_policy_parity_invalid",
);

function chargerRemoveCard(disabled: boolean) {
  const card = createDocumentUploadCardModel({
    document: {
      clientId: "charger-document",
      documentType: "installation_invoice",
      file: null,
      quarantineStatus: "idle",
    } as unknown as ChargerDocumentDraft,
    onChange: () => undefined,
    scope: "Laadpaal 1",
    title: "Installatiefactuur",
  });
  return renderToStaticMarkup(
    <DocumentEvidenceWorkflow
      evidenceSlots={[]}
      groups={[]}
      id="charger-item-action"
      uploads={[{
        id: "charger-document",
        card,
        itemAction: (
          <button
            aria-label="Laadpaal verwijderen"
            className="document-upload-card-remove"
            disabled={disabled}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        ),
      }]}
    />,
  );
}
const singleCharger = chargerRemoveCard(true);
const multipleChargers = chargerRemoveCard(false);
assert(
  singleCharger.includes('class="document-upload-card-remove"') &&
    singleCharger.includes('aria-label="Laadpaal verwijderen"') &&
    singleCharger.includes('disabled=""') &&
    singleCharger.includes('<span aria-hidden="true">×</span>') &&
    !singleCharger.includes(">Laadpaal verwijderen</button>") &&
    multipleChargers.includes('class="document-upload-card-remove"') &&
    !multipleChargers.includes('disabled=""') &&
    multipleChargers.indexOf("Installatiefactuur") <
      multipleChargers.indexOf("document-upload-card-remove"),
  "Q11_charger_remove_header_icon_invalid",
);
assert(
  !allRequiredDocumentEvidenceReady([{
    id: "a",
    required: true,
    usableEvidenceReady: true,
  }, {
    id: "b",
    required: true,
    usableEvidenceReady: false,
  }]) &&
    allRequiredDocumentEvidenceReady([{
      id: "a",
      required: true,
      usableEvidenceReady: true,
    }, {
      id: "b",
      required: true,
      usableEvidenceReady: true,
    }]) &&
    !allRequiredDocumentEvidenceReady([{
      id: "a",
      required: true,
      usableEvidenceReady: true,
    }, {
      id: "b-replacement",
      required: true,
      replacementRequired: true,
      usableEvidenceReady: false,
    }]) &&
    allRequiredDocumentEvidenceReady([{
      id: "a",
      required: true,
      usableEvidenceReady: true,
    }, {
      id: "b-replacement",
      required: true,
      replacementRequired: true,
      usableEvidenceReady: true,
    }]) &&
    allRequiredDocumentEvidenceReady([{
      id: "existing-evidence",
      required: true,
      replacementRequired: false,
      usableEvidenceReady: true,
    }]),
  "Q04_required_evidence_transition_or_existing_evidence_invalid",
);

const readyEnergyDocument = {
  clientId: "signup-energy-ready",
  documentType: "energy_bill_or_contract",
  file: new File(["%PDF energy"], "signup-energy.pdf", {
    type: "application/pdf",
  }),
  locationClientId: "signup-location",
  status: "selected",
  quarantineStatus: "confirmed_quarantine",
  quarantineFileReference: "11111111-1111-4111-8111-111111111111",
  quarantineRevision: 1,
} satisfies LocationDocumentDraft;
const readyParsedChargerDocument = {
  clientId: "signup-installation-ready",
  documentType: "installation_invoice",
  file: new File(["%PDF installation"], "signup-installation.pdf", {
    type: "application/pdf",
  }),
  chargerClientId: "signup-charger",
  status: "selected",
  quarantineStatus: "idle",
  quarantineFileReference: null,
  quarantineRevision: null,
  observation: null,
  parseStatus: "parsed",
} satisfies ChargerDocumentDraft;
const signupReadySlots = [readyEnergyDocument, readyParsedChargerDocument].map(
  (document) => ({
    id: document.clientId,
    required: true,
    usableEvidenceReady: isDocumentUploadReady(document),
  }),
);
const legacySignupEvidenceReady = [
  readyEnergyDocument,
  readyParsedChargerDocument,
].every((document) =>
  document.quarantineStatus === "confirmed_quarantine" &&
  Boolean(document.quarantineFileReference) &&
  Boolean(document.quarantineRevision)
);
const signupSupplierRow = {
  id: "location:energy-supplier:signup-location",
  label: "Energieleverancier",
  reviewRow: {
    factKey: "energySupplier",
    scopeKey: "location:signup-location",
    proposedValue: "Voorbeeld Energie B.V.",
  },
  confirmationState: "unconfirmed",
  correctionState: "unchanged",
} as unknown as FactPresentationRow;
const signupSupplierSources = projectCustomerDocumentFactActiveSources([{
  sourceRef: "signup-energy-ready:energy-supplier",
  evidenceRootRef: "signup-energy-ready",
  contentFingerprint: "d".repeat(64),
  fileName: "signup-energy.pdf",
  canonicalFactKey: "energySupplier",
  scopeRef: "location:signup-location",
  comparisonRole: signupSupplierRow.id,
  sourceDocumentType: "energy_bill_or_contract",
  semanticRole: "energy_supplier",
  relationship: "direct",
  observedValue: "Voorbeeld Energie B.V.",
  current: true,
}]).matrixSources;
const beforeSignupInteraction = createSignupCustomerInteractionModel({
  activeSources: signupSupplierSources,
  evidenceReady: legacySignupEvidenceReady,
  onConfirm: () => undefined,
  onCorrect: () => undefined,
  onRestoreSource: () => undefined,
  row: signupSupplierRow,
});
const afterSignupInteraction = createSignupCustomerInteractionModel({
  activeSources: signupSupplierSources,
  evidenceReady: allRequiredDocumentEvidenceReady(signupReadySlots),
  onConfirm: () => undefined,
  onCorrect: () => undefined,
  onRestoreSource: () => undefined,
  row: signupSupplierRow,
});
const beforeSignupInteractionHtml = beforeSignupInteraction
  ? renderToStaticMarkup(
    <CustomerDocumentFactInteraction model={beforeSignupInteraction} />,
  )
  : "";
const afterSignupInteractionHtml = afterSignupInteraction
  ? renderToStaticMarkup(
    <CustomerDocumentFactInteraction model={afterSignupInteraction} />,
  )
  : "";
assert(
  !legacySignupEvidenceReady &&
    isDocumentUploadReady(readyEnergyDocument) &&
    isDocumentUploadReady(readyParsedChargerDocument) &&
    allRequiredDocumentEvidenceReady(signupReadySlots) &&
    beforeSignupInteraction?.state === "SINGLE_SOURCE_UNRESOLVED" &&
    beforeSignupInteraction.sourceValue === undefined &&
    beforeSignupInteraction.suggestedValue === "Voorbeeld Energie B.V." &&
    /aria-label="Bevestigen"[^>]*disabled/.test(
      beforeSignupInteractionHtml,
    ) &&
    afterSignupInteraction?.state === "SOURCE_UNRESOLVED" &&
    afterSignupInteraction.sourceValue === "Voorbeeld Energie B.V." &&
    !/aria-label="Bevestigen"[^>]*disabled/.test(afterSignupInteractionHtml),
  "Q13_signup_ready_uploads_did_not_open_confirm_gate",
);

const [
  workflowSource,
  signupSource,
  correctionSource,
  matrixSource,
  css,
  signupPresentationSource,
  correctionWorkspaceSource,
] =
  await Promise.all([
    source("app/src/features/documents/DocumentEvidenceWorkflow.tsx"),
    source("app/src/features/signup/DocumentFirstDocumentsStep.tsx"),
    source("app/src/features/dashboard/CustomerCorrectionHandoffPanel.tsx"),
    source("app/src/features/documents/DocumentFactMatrix.tsx"),
    source("app/src/styles/components.css"),
    source("app/src/features/signup/presentation/factPresentationModel.ts"),
    source("app/src/features/dashboard/customerCorrectionWorkspace.ts"),
  ]);
for (const caller of [signupSource, correctionSource]) {
  assert(
    caller.includes("<DocumentEvidenceWorkflow {...workflowModel} />") &&
      !caller.includes("<DocumentEvidenceUploadCard") &&
      !caller.includes("<DocumentFactMatrix") &&
      !caller.includes('className="document-upload-grid"') &&
      !caller.includes('className="fact-review-groups"') &&
      !caller.includes('className="fact-review-section-item"'),
    "Q05_inline_caller_workflow_remains",
  );
}
assert(
  workflowSource.includes("uploads.map") &&
    workflowSource.includes("allRequiredDocumentEvidenceReady") &&
    workflowSource.includes(
      "primaryAction.disabled || !requiredEvidenceReady",
    ) &&
    !workflowSource.includes("interactionAvailable") &&
    workflowSource.includes("<DocumentEvidenceUploadCard") &&
    workflowSource.includes("<DocumentFactMatrix") &&
    workflowSource.includes("inert={interactionLocked || undefined}") &&
    workflowSource.includes("primaryAction") &&
    matrixSource.includes("CUSTOMER_DOCUMENT_FACT_MATRIX_COLUMNS") &&
    matrixSource.includes('given: "Gegeven"') &&
    matrixSource.includes('source: "Bron"') &&
    matrixSource.includes('sourceInfo: "Info uit bron"') &&
    matrixSource.includes('customer: "Klant"') &&
    matrixSource.includes('enval: "ENVAL"'),
  "Q06_shared_owner_or_column_authority_invalid",
);
assert(
  css.includes(".fact-table--customer") &&
    css.includes("minmax(min(100%, 250px), 320px)") &&
    css.includes("justify-content: start") &&
    css.includes("text-overflow: ellipsis") &&
    !/customer-correction[^\n,{]*(?:document-slot-card|document-upload-grid|fact-table)/i
      .test(css) &&
    ![workflowSource, signupSource, correctionSource, matrixSource].some((
      value,
    ) => value.includes("style={{")),
  "Q07_shared_css_or_inline_style_invalid",
);
assert(
  !correctionSource.includes('"Bestaand dossier"') &&
    !correctionSource.includes('"Nieuw bewijsstuk"') &&
    correctionSource.includes("correctionInstruction") &&
    correctionSource.includes("customerCorrectionReasonLabel") &&
    !correctionSource.includes('"Controle nodig"') &&
    !correctionSource.includes('"Ingevuld"'),
  "Q08_correction_request_context_or_labels_invalid",
);
assert(
    signupSource.includes("const evidenceSlots") &&
    signupSource.includes("isDocumentUploadReady(document)") &&
    correctionSource.includes("createCustomerDocumentWorkflowModel") &&
    correctionSource.includes("interactionLocked:") &&
    correctionSource.includes("evidenceSlots,") &&
    correctionSource.includes(
      "<DocumentEvidenceWorkflow {...workflowModel} />",
    ) &&
    correctionSource.includes('upload?.status === "READY"') &&
    correctionSource.includes('upload?.status === "RETAINED"') &&
    correctionSource.includes("replacementRequired: false"),
  "Q09_signup_or_correction_evidence_adapter_invalid",
);
assert(
  signupPresentationSource.includes("activeSourceSlots") &&
    signupPresentationSource.includes("workflowSources") &&
    correctionWorkspaceSource.includes("const slots = new Map") &&
    correctionWorkspaceSource.includes(
      "customerDocumentVisibleEvidenceBindingFor",
    ) &&
    correctionSource.includes("items,") &&
    signupSource.includes("itemAction: (") &&
    css.includes(".document-upload-card-remove"),
  "Q12_signup_correction_adapter_or_charger_action_parity_invalid",
);

console.log("CUSTOMER04C3C7_ONE_EXTERNAL_WORKFLOW_Q01_Q06=PASS");
console.log("CUSTOMER04C3C9A_REQUIRED_EVIDENCE_GATE_Q01_Q09=PASS");
console.log("CUSTOMER04C3C9C_SUBMIT_GATE_COMPACT_UPLOAD_GRID=PASS");
console.log("CUSTOMER04C_UI_PARITY_SOURCE_ROWS=PASS");
console.log("CUSTOMER04C_UI_PARITY_CHARGER_REMOVE=PASS");
console.log("CUSTOMER04C_FINAL_H2_SIGNUP_READINESS_CONFIRM=PASS");
Deno.exit(0);

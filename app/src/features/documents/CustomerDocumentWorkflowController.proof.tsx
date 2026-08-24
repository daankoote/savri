import { renderToStaticMarkup } from "react-dom/server";
import type { DocumentFirstFactValue } from "../signup/documentFirstSignupModel.ts";
import {
  createCustomerDocumentWorkflowGroup,
  type CustomerDocumentWorkflowFactInput,
  type CustomerDocumentWorkflowSourceInput,
} from "./CustomerDocumentWorkflowController.ts";
import { DocumentFactMatrix } from "./DocumentFactMatrix.tsx";

declare const Deno: {
  readTextFile(path: URL): Promise<string>;
  exit(code: number): never;
};

const root = new URL("../../../../", import.meta.url);
const source = (path: string) => Deno.readTextFile(new URL(path, root));
function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

const sources: readonly CustomerDocumentWorkflowSourceInput[] = Object.freeze([
  Object.freeze({
    sourceRef: "energy-document:party",
    evidenceRootRef: "energy-document",
    contentFingerprint: "a".repeat(64),
    fileName: "energie.pdf",
    sourceDocumentType: "energy_bill_or_contract",
    semanticRole: "contract_holder",
    relationship: "direct",
    observedValue: "Voorbeeld Klant",
    current: true,
  }),
  Object.freeze({
    sourceRef: "installation-document:party",
    evidenceRootRef: "installation-document",
    contentFingerprint: "b".repeat(64),
    fileName: "installatie.pdf",
    sourceDocumentType: "installation_invoice",
    semanticRole: "buyer_or_customer",
    relationship: "supporting",
    observedValue: "Voorbeeld Klant",
    current: true,
  }),
]);

function parityFacts(
  resolution: "UNRESOLVED" | "CLEAN_SOURCE_CONFIRMED" | "MANUAL_EDIT",
  onConfirm: CustomerDocumentWorkflowFactInput["onConfirm"],
  onCancel: CustomerDocumentWorkflowFactInput["onCancel"],
): readonly CustomerDocumentWorkflowFactInput[] {
  return Object.freeze([
    Object.freeze({
      factKey: "energySupplier",
      sources: Object.freeze([Object.freeze({
        ...sources[0],
        sourceRef: "energy-document:supplier",
        semanticRole: "energy_supplier",
        observedValue: "Voorbeeld Energie B.V.",
      })]),
      editable: true,
      browserResolution: resolution,
      actualReviewTruth: "Correctie nodig",
      customerValue: resolution === "CLEAN_SOURCE_CONFIRMED"
        ? "Voorbeeld Energie B.V."
        : undefined,
      emptyValue: "",
      editor: "text",
      isValid: (value: DocumentFirstFactValue) =>
        typeof value === "string" && Boolean(value.trim()),
      normalize: (value: DocumentFirstFactValue) =>
        typeof value === "string" ? value.trim() : value,
      onConfirm,
      onCancel,
      onRestoreSource: onCancel,
    }),
    Object.freeze({
      factKey: "partyName",
      sources,
      editable: true,
      browserResolution: resolution,
      actualReviewTruth: "Correctie nodig",
      customerValue: resolution === "CLEAN_SOURCE_CONFIRMED"
        ? "Voorbeeld Klant"
        : undefined,
      emptyValue: "",
      editor: "text",
      isValid: (value: DocumentFirstFactValue) =>
        typeof value === "string" && Boolean(value.trim()),
      normalize: (value: DocumentFirstFactValue) =>
        typeof value === "string" ? value.trim() : value,
      onConfirm,
      onCancel,
      onRestoreSource: onCancel,
    }),
  ]);
}

function controlled(
  facts: readonly CustomerDocumentWorkflowFactInput[],
) {
  return createCustomerDocumentWorkflowGroup({
    group: "location",
    scopeRef: "location:parity",
    title: "Locatie parity",
    evidenceReady: true,
    facts,
  });
}

function snapshot(result: ReturnType<typeof controlled>) {
  return result.group.rows.map((row) => ({
    id: row.id,
    given: row.given,
    sources: row.sources.map((entry) => ({
      id: entry.id,
      fileName: entry.fileName,
      value: entry.value,
      relationship: entry.relationship,
      selected: entry.selected,
      selectable: entry.selectable,
    })),
    interaction: {
      id: row.customer.id,
      label: row.customer.label,
      state: row.customer.state,
      projectedEnvalRoute: row.customer.projectedEnvalRoute,
      sourceValue: row.customer.sourceValue,
      suggestedValue: row.customer.suggestedValue,
      customerValue: row.customer.customerValue,
      canRestoreSources: row.customer.canRestoreSources,
      emptyValue: row.customer.emptyValue,
      editor: row.customer.editor,
    },
    enval: row.enval,
  }));
}

const signupConfirmed: unknown[] = [];
const correctionConfirmed: unknown[] = [];
let signupCancelled = 0;
let correctionCancelled = 0;
const signup = controlled(parityFacts(
  "UNRESOLVED",
  (value, resolution) => signupConfirmed.push([value, resolution]),
  () => {
    signupCancelled += 1;
  },
));
const correction = controlled(parityFacts(
  "UNRESOLVED",
  (value, resolution) => correctionConfirmed.push([value, resolution]),
  () => {
    correctionCancelled += 1;
  },
));
assert(
  JSON.stringify(snapshot(signup)) === JSON.stringify(snapshot(correction)) &&
    signup.group.rows.map((row) => row.id).join("|") ===
      "location:party-name:location:parity|location:energy-supplier:location:parity" &&
    signup.group.rows.every((row) =>
      row.customer.state === "SOURCE_UNRESOLVED" &&
      typeof row.customer.sourceValue === "string"
    ),
  "Q01_same_input_row_or_interaction_model_differs",
);
signup.group.rows[0].customer.onConfirm?.("Voorbeeld Klant", "source");
correction.group.rows[0].customer.onConfirm?.("Voorbeeld Klant", "source");
assert(
  JSON.stringify(signupConfirmed) === JSON.stringify(correctionConfirmed) &&
    JSON.stringify(signupConfirmed) ===
      JSON.stringify([["Voorbeeld Klant", "source"]]),
  "Q02_confirm_transition_differs",
);

const signupResolved = controlled(parityFacts(
  "CLEAN_SOURCE_CONFIRMED",
  () => undefined,
  () => {
    signupCancelled += 1;
  },
));
const correctionResolved = controlled(parityFacts(
  "CLEAN_SOURCE_CONFIRMED",
  () => undefined,
  () => {
    correctionCancelled += 1;
  },
));
assert(
  JSON.stringify(snapshot(signupResolved)) ===
      JSON.stringify(snapshot(correctionResolved)) &&
    signupResolved.group.rows.every((row) =>
      row.customer.state === "SOURCE_CONFIRMED" &&
      row.customer.projectedEnvalRoute === "Klant bevestigd"
    ),
  "Q03_confirmed_projection_differs",
);
signupResolved.group.rows[0].customer.onCancelResolution?.();
correctionResolved.group.rows[0].customer.onCancelResolution?.();
assert(
  signupCancelled === 1 && correctionCancelled === 1 &&
    JSON.stringify(snapshot(controlled(parityFacts(
        "UNRESOLVED",
        () => undefined,
        () => undefined,
      )))) === JSON.stringify(snapshot(signup)),
  "Q04_cancel_transition_differs",
);

const signupEdit = controlled(parityFacts(
  "MANUAL_EDIT",
  () => undefined,
  () => undefined,
));
const correctionEdit = controlled(parityFacts(
  "MANUAL_EDIT",
  () => undefined,
  () => undefined,
));
const signupEditHtml = renderToStaticMarkup(
  <DocumentFactMatrix rows={signupEdit.group.rows} variant="customer" />,
);
const correctionEditHtml = renderToStaticMarkup(
  <DocumentFactMatrix rows={correctionEdit.group.rows} variant="customer" />,
);
assert(
  JSON.stringify(snapshot(signupEdit)) ===
      JSON.stringify(snapshot(correctionEdit)) &&
    signupEditHtml === correctionEditHtml &&
    signupEditHtml.includes('aria-label="Contracthouder nieuwe waarde"'),
  "Q05_edit_transition_or_rendered_matrix_differs",
);

const locked = createCustomerDocumentWorkflowGroup({
  group: "location",
  scopeRef: "location:parity",
  title: "Locatie parity",
  evidenceReady: true,
  facts: [Object.freeze({
    ...parityFacts("UNRESOLVED", () => undefined, () => undefined)[1],
    editable: false,
    browserResolution: "LOCKED",
    actualReviewTruth: "Akkoord",
    customerValue: "Voorbeeld Klant",
  })],
});
const lockedHtml = renderToStaticMarkup(
  <DocumentFactMatrix rows={locked.group.rows} variant="customer" />,
);
assert(
  locked.group.rows.length === 1 &&
    locked.group.rows[0].id === "location:party-name:location:parity" &&
    locked.group.rows[0].customer.state === "LOCKED" &&
    locked.group.rows[0].sources.length === 2 &&
    lockedHtml.includes("Vastgelegd") &&
    lockedHtml.includes("customer-fact-interaction"),
  "Q06_locked_fact_not_shared_row_state",
);

const [
  controllerSource,
  workflowSource,
  matrixSource,
  interactionSource,
  signupSource,
  signupMatrixSource,
  correctionSource,
  signupUploadSource,
  signupFactTableSource,
  css,
] = await Promise.all([
  source("app/src/features/documents/CustomerDocumentWorkflowController.ts"),
  source("app/src/features/documents/DocumentEvidenceWorkflow.tsx"),
  source("app/src/features/documents/DocumentFactMatrix.tsx"),
  source("app/src/features/documents/CustomerDocumentFactInteraction.tsx"),
  source("app/src/features/signup/DocumentFirstDocumentsStep.tsx"),
  source("app/src/features/signup/DocumentFirstCheckMatrix.tsx"),
  source("app/src/features/dashboard/CustomerCorrectionHandoffPanel.tsx"),
  source("app/src/features/signup/DocumentUploadSlot.tsx"),
  source("app/src/features/signup/presentation/FactTable.tsx"),
  source("app/src/styles/components.css"),
]);
assert(
  signupSource.includes("createCustomerDocumentWorkflowModel") &&
    correctionSource.includes("createCustomerDocumentWorkflowModel") &&
    signupMatrixSource.includes("createCustomerDocumentWorkflowGroup") &&
    correctionSource.includes("createCustomerDocumentWorkflowGroup") &&
    signupSource.includes("<DocumentEvidenceWorkflow {...workflowModel} />") &&
    correctionSource.includes(
      "<DocumentEvidenceWorkflow {...workflowModel} />",
    ),
  "Q07_lifecycles_do_not_call_same_controller_and_workflow",
);
assert(
  controllerSource.includes("selectCustomerDocumentFactRows") &&
    controllerSource.includes("projectCustomerDocumentFactActiveSources") &&
    controllerSource.includes("resolveCustomerFactResolutionPolicy") &&
    controllerSource.includes("createCustomerDocumentUploadCardModel") &&
    controllerSource.includes("customerDocumentUploadStatus") &&
    controllerSource.includes("sourceValue") &&
    controllerSource.includes("projectedEnvalRoute") &&
    controllerSource.includes("onCancelResolution") &&
    controllerSource.includes("onRestoreSource") &&
    !signupMatrixSource.includes("resolveCustomerFactResolutionPolicy") &&
    !correctionSource.includes("resolveCustomerFactResolutionPolicy") &&
    !signupMatrixSource.includes("sourceValue") &&
    !correctionSource.includes("const sourceValue") &&
    !interactionSource.includes("resolveCustomerFactResolutionPolicy") &&
    !correctionSource.includes("correctionMatrixRows") &&
    !signupFactTableSource.includes("createCustomerDocumentFactRows") &&
    !signupFactTableSource.includes("createCustomerDocumentWorkflowGroup"),
  "Q08_controller_ownership_or_duplicate_live_builder_invalid",
);
assert(
  workflowSource.includes("<DocumentEvidenceUploadCard") &&
    workflowSource.includes("<DocumentFactMatrix") &&
    matrixSource.includes("<CustomerDocumentFactInteraction") &&
    signupUploadSource.includes("createCustomerDocumentUploadCardModel") &&
    correctionSource.includes("createCustomerDocumentUploadCardModel") &&
    signupSource.includes("itemAction: (") &&
    signupSource.includes('aria-label="Laadpaal verwijderen"') &&
    signupSource.includes(".length <= 1") &&
    !signupUploadSource.includes("scopeAction") &&
    !signupUploadSource.includes("Laadpaal verwijderen") &&
    !css.includes("customer-correction-fact-table"),
  "Q09_shared_components_css_or_charger_item_action_invalid",
);

console.log("CUSTOMER04C_MODULARITY_ONE_CONTROLLER_PARITY_Q01_Q09=PASS");
console.log("CUSTOMER04C_MODULARITY_LOCKED_ROW_STATE=PASS");
Deno.exit(0);

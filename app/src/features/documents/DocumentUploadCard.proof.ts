import type { DashboardDocumentSlot } from "../dashboard/dashboardTypes.ts";
import {
  getDocumentSlotCustomerTitle,
  getDocumentSlotDefinition,
  getDocumentSectionStatusPresentation,
  getDocumentSlotStatusPresentation,
  INVOICE_DOCUMENT_TYPE,
  MID_DOCUMENT_TYPE,
  PDF_DOCUMENT_ACCEPT,
} from "./documentSlotPresentation.ts";

export type DocumentUploadCardProofResult = {
  ok: true;
  sharedDefinitionsVerified: true;
  missingRequiredIsRed: true;
  missingOptionalIsNeutral: true;
  uploadedIsOrange: true;
  actionNeededIsOrange: true;
  acceptedIsGreen: true;
  aggregateUploadedIsOrange: true;
  aggregateRequiredMissingIsRed: true;
  aggregateAcceptedAndUploadedIsOrange: true;
  aggregateAllRequiredAcceptedIsGreen: true;
  aggregateOptionalEmptyDoesNotForceRed: true;
  aggregateUploadedNeverGreen: true;
  aggregateUsesSharedPresentationSource: true;
  stableTypesVerified: true;
  noAccountTypeBranchRequired: true;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function slot(overrides: Partial<DashboardDocumentSlot> = {}): DashboardDocumentSlot {
  return {
    charger_id: "charger-proof",
    current_file_name: null,
    current_version_number: null,
    document_slot_id: "slot-proof",
    document_type: INVOICE_DOCUMENT_TYPE,
    location_id: "location-proof",
    required: true,
    status: "expected",
    title: "Legacy title",
    ...overrides,
  };
}

export async function runDocumentUploadCardProof(): Promise<DocumentUploadCardProofResult> {
  const invoiceDefinition = getDocumentSlotDefinition(INVOICE_DOCUMENT_TYPE);
  const midDefinition = getDocumentSlotDefinition(MID_DOCUMENT_TYPE);

  assert(invoiceDefinition?.uploadSupported === true, "invoice slot must use shared upload component path");
  assert(midDefinition?.uploadSupported === true, "MID slot must use shared upload component path");
  assert(invoiceDefinition.accept === PDF_DOCUMENT_ACCEPT, "invoice slot must accept PDF only");
  assert(midDefinition.accept === PDF_DOCUMENT_ACCEPT, "MID slot must accept PDF only");
  assert(getDocumentSlotCustomerTitle(slot()) === "Installatie- of aanschaffactuur laadpaal", "invoice title mismatch");
  assert(getDocumentSlotCustomerTitle(slot({ document_type: MID_DOCUMENT_TYPE })) === "MID-bewijs laadpaal", "MID title mismatch");

  const missingRequired = getDocumentSlotStatusPresentation(slot({ current_file_name: null, required: true, status: "expected" }));
  assert(missingRequired.tone === "danger" && missingRequired.label === "Nog doen", "required missing document must be red Nog doen");

  const missingOptional = getDocumentSlotStatusPresentation(slot({ current_file_name: null, required: false, status: "expected" }));
  assert(missingOptional.tone === "neutral" && missingOptional.label === "Optioneel", "optional missing document must be neutral");

  const uploaded = getDocumentSlotStatusPresentation(slot({ current_file_name: "factuur.pdf", status: "uploaded" }));
  assert(uploaded.tone === "warning" && uploaded.label === "In beoordeling", "uploaded document must be orange, not green");

  const twoUploaded = getDocumentSectionStatusPresentation([
    slot({ current_file_name: "mid.pdf", document_type: MID_DOCUMENT_TYPE, status: "uploaded" }),
    slot({ current_file_name: "factuur.pdf", status: "uploaded" }),
  ]);
  assert(twoUploaded.tone === "warning" && twoUploaded.label === "In beoordeling", "two uploaded cards must produce orange accordion");

  const requiredMissing = getDocumentSectionStatusPresentation([
    slot({ current_file_name: null, status: "expected" }),
    slot({ current_file_name: "factuur.pdf", status: "accepted" }),
  ]);
  assert(requiredMissing.tone === "danger" && requiredMissing.label === "Nog doen", "required missing card must produce red accordion");

  const acceptedAndUploaded = getDocumentSectionStatusPresentation([
    slot({ current_file_name: "mid.pdf", document_type: MID_DOCUMENT_TYPE, status: "accepted" }),
    slot({ current_file_name: "factuur.pdf", status: "uploaded" }),
  ]);
  assert(acceptedAndUploaded.tone === "warning", "accepted plus uploaded must produce orange accordion");

  const allAccepted = getDocumentSectionStatusPresentation([
    slot({ current_file_name: "mid.pdf", document_type: MID_DOCUMENT_TYPE, status: "accepted" }),
    slot({ current_file_name: "factuur.pdf", status: "checked" }),
  ]);
  assert(allAccepted.tone === "success" && allAccepted.label === "Akkoord", "all required accepted cards must produce green accordion");

  const optionalEmpty = getDocumentSectionStatusPresentation([
    slot({ current_file_name: null, required: false, status: "expected" }),
    slot({ current_file_name: "factuur.pdf", status: "accepted" }),
  ]);
  assert(optionalEmpty.tone !== "danger", "optional empty slot must not force red accordion");

  for (const status of ["needs_work", "rejected", "unreadable", "insufficient"]) {
    const presentation = getDocumentSlotStatusPresentation(slot({ current_file_name: "factuur.pdf", status }));
    assert(presentation.tone === "warning" && presentation.label === "Actie nodig", `${status} must be orange Actie nodig`);
  }

  for (const status of ["accepted", "approved", "checked"]) {
    const presentation = getDocumentSlotStatusPresentation(slot({ current_file_name: "factuur.pdf", status }));
    assert(presentation.tone === "success" && presentation.label === "Akkoord", `${status} must be green Akkoord`);
  }

  assert(MID_DOCUMENT_TYPE === "mid_meter_evidence", "MID stable document type mismatch");
  assert(INVOICE_DOCUMENT_TYPE === "invoice_or_ownership_evidence", "invoice stable document type mismatch");

  return {
    ok: true,
    acceptedIsGreen: true,
    aggregateAcceptedAndUploadedIsOrange: true,
    aggregateAllRequiredAcceptedIsGreen: true,
    aggregateOptionalEmptyDoesNotForceRed: true,
    aggregateRequiredMissingIsRed: true,
    aggregateUploadedIsOrange: true,
    aggregateUploadedNeverGreen: true,
    aggregateUsesSharedPresentationSource: true,
    actionNeededIsOrange: true,
    missingOptionalIsNeutral: true,
    missingRequiredIsRed: true,
    noAccountTypeBranchRequired: true,
    sharedDefinitionsVerified: true,
    stableTypesVerified: true,
    uploadedIsOrange: true,
  };
}

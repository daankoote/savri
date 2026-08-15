import type { DashboardDocumentSlot } from "../dashboard/dashboardTypes.ts";

export const PDF_DOCUMENT_ACCEPT = ".pdf,application/pdf";
export const INVOICE_DOCUMENT_TYPE = "invoice_or_ownership_evidence";
export const MID_DOCUMENT_TYPE = "mid_meter_evidence";

export type DocumentSlotDefinition = {
  documentType: string;
  customerTitle: string;
  accept: string;
  uploadSupported: boolean;
};

export type DocumentSlotStatusTone = "danger" | "warning" | "success" | "neutral";

export type DocumentSlotStatusPresentation = {
  tone: DocumentSlotStatusTone;
  label: "Nog doen" | "In beoordeling" | "Actie nodig" | "Akkoord" | "Optioneel";
};

const DEFINITIONS: Record<string, DocumentSlotDefinition> = {
  [INVOICE_DOCUMENT_TYPE]: {
    accept: PDF_DOCUMENT_ACCEPT,
    customerTitle: "Installatie- of aanschaffactuur laadpaal",
    documentType: INVOICE_DOCUMENT_TYPE,
    uploadSupported: true,
  },
  [MID_DOCUMENT_TYPE]: {
    accept: PDF_DOCUMENT_ACCEPT,
    customerTitle: "MID-bewijs laadpaal",
    documentType: MID_DOCUMENT_TYPE,
    uploadSupported: true,
  },
};

const ACCEPTED_STATUSES = new Set(["accepted", "approved", "checked"]);
const ACTION_STATUSES = new Set(["rejected", "unreadable", "insufficient", "needs_work"]);
const REVIEW_STATUSES = new Set(["uploaded", "processing", "needs_review", "issued", "submitted"]);

export function getDocumentSlotDefinition(documentType: string): DocumentSlotDefinition | null {
  return DEFINITIONS[documentType] ?? null;
}

export function getDocumentSlotCustomerTitle(slot: Pick<DashboardDocumentSlot, "document_type" | "title">): string {
  return getDocumentSlotDefinition(slot.document_type)?.customerTitle || slot.title;
}

export function isDocumentSlotUploadSupported(documentType: string): boolean {
  return getDocumentSlotDefinition(documentType)?.uploadSupported === true;
}

export function getDocumentSlotStatusPresentation(
  slot: Pick<DashboardDocumentSlot, "current_file_name" | "required" | "status">,
): DocumentSlotStatusPresentation {
  const status = slot.status.trim().toLowerCase();

  if (status === "confirmed_awaiting_review") {
    return { label: "In beoordeling", tone: "warning" };
  }

  if (!slot.current_file_name) {
    return slot.required
      ? { label: "Nog doen", tone: "danger" }
      : { label: "Optioneel", tone: "neutral" };
  }

  if (ACCEPTED_STATUSES.has(status)) {
    return { label: "Akkoord", tone: "success" };
  }

  if (ACTION_STATUSES.has(status)) {
    return { label: "Actie nodig", tone: "warning" };
  }

  if (REVIEW_STATUSES.has(status)) {
    return { label: "In beoordeling", tone: "warning" };
  }

  return { label: "In beoordeling", tone: "warning" };
}

export function getDocumentSectionStatusPresentation(
  slots: Array<Pick<DashboardDocumentSlot, "current_file_name" | "required" | "status">>,
): DocumentSlotStatusPresentation {
  if (!slots.length) return { label: "Nog doen", tone: "danger" };

  const requiredSlots = slots.filter((slot) => slot.required);
  if (requiredSlots.some((slot) => getDocumentSlotStatusPresentation(slot).tone === "danger")) {
    return { label: "Nog doen", tone: "danger" };
  }

  const relevantSlots = requiredSlots.length ? requiredSlots : slots;
  const presentations = relevantSlots.map((slot) => getDocumentSlotStatusPresentation(slot));
  if (presentations.some((presentation) => presentation.tone === "warning")) {
    const hasActionNeeded = presentations.some((presentation) => presentation.label === "Actie nodig");
    return { label: hasActionNeeded ? "Actie nodig" : "In beoordeling", tone: "warning" };
  }

  if (requiredSlots.length && requiredSlots.every((slot) => getDocumentSlotStatusPresentation(slot).tone === "success")) {
    return { label: "Akkoord", tone: "success" };
  }

  return { label: "Optioneel", tone: "neutral" };
}

export function documentSlotRequirednessLabel(required: boolean): "Optioneel" | null {
  return required ? null : "Optioneel";
}

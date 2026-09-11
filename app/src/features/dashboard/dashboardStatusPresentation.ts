import type {
  DashboardTimelineEvent,
  DashboardTimelineEventType,
} from "./dashboardTypes";

export type DashboardStatusPresentation = {
  label: string;
  currentStep: string;
  customerAction: string;
};

type DashboardStatusInput = {
  dossierStatus: string;
  timeline: DashboardTimelineEvent[];
  hasPublishedCorrection: boolean;
};

const IN_TREATMENT_STATUSES = new Set([
  "submitted",
  "submitted_for_review",
  "under_review",
]);

const STATUS_PRESENTATIONS = Object.freeze({
  actionNeeded: Object.freeze({
    label: "Actie nodig",
    currentStep: "ENVAL wacht op uw aanvulling.",
    customerAction: "Ja",
  }),
  correctionReview: Object.freeze({
    label: "Aanvulling wordt beoordeeld",
    currentStep: "ENVAL controleert uw aanvulling.",
    customerAction: "Nee",
  }),
  dataChecked: Object.freeze({
    label: "In behandeling",
    currentStep: "ENVAL verwerkt uw dossier.",
    customerAction: "Nee",
  }),
  inTreatment: Object.freeze({
    label: "In behandeling",
    currentStep: "ENVAL controleert uw dossier.",
    customerAction: "Nee",
  }),
  unavailable: Object.freeze({
    label: "Status niet beschikbaar",
    currentStep: "Neem contact op met ENVAL.",
    customerAction: "Ja",
  }),
});

export function getDashboardStatusPresentation({
  dossierStatus,
  timeline,
  hasPublishedCorrection,
}: DashboardStatusInput): DashboardStatusPresentation {
  if (hasPublishedCorrection) return STATUS_PRESENTATIONS.actionNeeded;

  const latestEventType = timeline[0]?.event_type as
    | DashboardTimelineEventType
    | undefined;
  if (latestEventType === "review_completed") {
    return STATUS_PRESENTATIONS.dataChecked;
  }
  if (latestEventType === "correction_submitted") {
    return STATUS_PRESENTATIONS.correctionReview;
  }
  if (latestEventType === "correction_requested") {
    return STATUS_PRESENTATIONS.actionNeeded;
  }
  if (latestEventType === "dossier_submitted") {
    return STATUS_PRESENTATIONS.inTreatment;
  }

  return IN_TREATMENT_STATUSES.has(dossierStatus.trim().toLowerCase())
    ? STATUS_PRESENTATIONS.inTreatment
    : STATUS_PRESENTATIONS.unavailable;
}

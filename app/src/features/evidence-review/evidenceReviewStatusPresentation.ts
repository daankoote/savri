import type { EvidenceReviewOperationalStatus } from "../../../../supabase/functions/_shared/app_evidence_review_overall_status.ts";
import type {
  EvidenceFactReviewFinalizedDecisionV1,
  EvidenceReviewCanonicalFactV1,
} from "../../../../supabase/functions/_shared/app_evidence_review_case_detail.ts";

export const EVIDENCE_REVIEW_STATUS_PRESENTATION: Readonly<
  Record<
    EvidenceReviewOperationalStatus,
    Readonly<{ className: string; label: string }>
  >
> = Object.freeze({
  TO_REVIEW: { className: "status-pill-warning", label: "ENVAL beoordelen" },
  CORRECTION_REQUIRED: {
    className: "status-pill-danger",
    label: "Correctie nodig",
  },
  WAITING_CUSTOMER: {
    className: "status-pill-warning",
    label: "Wacht op klant",
  },
  REVIEW_COMPLETE: {
    className: "status-pill-ok",
    label: "Beoordeling afgerond",
  },
  REVIEW_MODEL_UNAVAILABLE: {
    className: "status-pill-danger",
    label: "Beoordelingsmodel niet beschikbaar",
  },
});

export function evidenceReviewFactStatusPresentation(
  fact: Pick<EvidenceReviewCanonicalFactV1, "truthClass">,
  finalized?: Pick<EvidenceFactReviewFinalizedDecisionV1, "disposition">,
): Readonly<{ className: string; label: string }> {
  if (finalized?.disposition === "ACCEPTED") {
    return { className: "status-pill-ok", label: "Geaccepteerd" };
  }
  if (finalized?.disposition === "CORRECTION_REQUIRED") {
    return { className: "status-pill-danger", label: "Correctie nodig" };
  }
  return fact.truthClass === "CUSTOMER_CONFIRMED"
    ? { className: "status-pill-ok", label: "Door klant bevestigd" }
    : { className: "status-pill-warning", label: "Beoordeling nodig" };
}

import { useRef } from "react";
import { parseInvoicePdfInput } from "../invoice-analysis/invoicePdfParserAdapter";
import { projectChargerDocumentObservation } from "./documentSemanticProjector";
import { DocumentUploadSlot } from "./DocumentUploadSlot";
import { InvoicePdfPreviewPanel } from "./InvoicePdfPreviewPanel";
import type { SignupPartyNameFocusTarget } from "./signupPartyNameCrossCheck";
import type {
  AddressDraft,
  ChargerDocumentDraft,
  ChargerDraft,
  SignupDraft,
  SignupFieldErrors,
} from "./signupTypes";
import { firstSignupFieldError } from "./signupValidation";

type ChargerDocumentsSectionProps = {
  charger: ChargerDraft;
  documents: ChargerDocumentDraft[];
  draft: SignupDraft;
  draftGeneration: number;
  fieldErrors: SignupFieldErrors;
  isDraftGenerationCurrent: (generation: number) => boolean;
  location: AddressDraft;
  onDocumentChange: (document: ChargerDocumentDraft) => void;
  onReviewParty: (target: SignupPartyNameFocusTarget) => void;
  onReviewLocation: () => void;
};

export function ChargerDocumentsSection({
  charger,
  documents,
  draft,
  draftGeneration,
  fieldErrors,
  isDraftGenerationCurrent,
  location,
  onDocumentChange,
  onReviewParty,
  onReviewLocation,
}: ChargerDocumentsSectionProps) {
  const parserAttempt = useRef(0);
  const invoice = documents.find((document) =>
    document.documentType === "installation_invoice"
  );

  if (!invoice) return null;

  const handleDocumentChange = async (document: ChargerDocumentDraft) => {
    const generation = draftGeneration;
    parserAttempt.current += 1;
    const attempt = parserAttempt.current;
    const reset: ChargerDocumentDraft = {
      ...document,
      observation: null,
      parseStatus: document.file ? "parsing" : "idle",
    };
    onDocumentChange(reset);
    if (!document.file) return;

    const result = await parseInvoicePdfInput(document.file);
    if (
      parserAttempt.current !== attempt ||
      !isDraftGenerationCurrent(generation)
    ) return;
    const observation = result.ok
      ? projectChargerDocumentObservation(result.observation_envelope)
      : null;
    onDocumentChange({
      ...reset,
      observation,
      parseStatus: observation ? "parsed" : "error",
    });
  };

  return (
    <div className="signup-subsection">
      <h3>Laadpaal- en MID-document</h3>
      <div className="document-slot-column">
        <DocumentUploadSlot
          document={invoice}
          error={firstSignupFieldError(
            fieldErrors,
            `chargers.${invoice.chargerClientId}.invoice`,
          )}
          onChange={(document) => void handleDocumentChange(document)}
        />
        <InvoicePdfPreviewPanel
          charger={charger}
          document={invoice}
          draft={draft}
          location={location}
          onReviewParty={onReviewParty}
          onReviewLocation={onReviewLocation}
        />
      </div>
    </div>
  );
}

import type { ParserObservationEnvelopeV1 } from "../../../../platform/runtime/document-parsing/document_parser_contract.ts";
import type {
  DocumentObservationEnvelope,
  GenericDocumentFactCandidate,
  GenericDocumentFactKey,
} from "./documentObservationEnvelope.ts";

/** Compatibility projection for the existing CURRENT intake preview/review UI. */
export function projectParserObservationForCurrentIntake(
  envelope: ParserObservationEnvelopeV1,
): DocumentObservationEnvelope {
  const factCandidates: GenericDocumentFactCandidate[] = envelope.observedFacts
    .filter((item) => item.status === "observed" && item.observedValue &&
      item.normalizedObservedValue && item.factKey !== "partyRole")
    .map((item) => ({
      factKey: item.factKey as GenericDocumentFactKey,
      rawValue: item.observedValue || "",
      normalizedValue: item.normalizedObservedValue || "",
      ...(item.structuredAddress
        ? { structuredAddress: { ...item.structuredAddress } }
        : {}),
      sourcePage: item.sourceLocator?.page ?? null,
      sourceRegion: item.sourceLocator?.region ?? null,
      confidence: item.confidence,
      extractionMethod: item.sourceLocator?.extractionMethod || "not_found",
      displayable: true,
      rejectionReason: null,
    }));
  return {
    parserVersion:
      `${envelope.parserCoreVersion}:${envelope.parserProfile}:${envelope.profileVersion}:${envelope.providerAdapterVersion}`,
    contentFingerprint: envelope.byteSha256,
    pageCount: envelope.pageCount,
    documentTypeCandidates: envelope.documentTypeCandidates.map((candidate) => ({
      documentType: candidate.documentType as
        | "organization_extract"
        | "energy_document"
        | "charger_installation_invoice",
      score: candidate.score,
      indicators: [...candidate.indicators],
    })),
    factCandidates,
    extractionWarnings: [...envelope.limitations],
    rejectedCandidates: [],
  };
}

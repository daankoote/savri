import type { DocumentFactKey } from "./document_fact_vocabulary.ts";

export const PARSER_OBSERVATION_ENVELOPE_VERSION =
  "parser_observation_envelope_v1" as const;

export type DocumentParserProfileKey =
  | "energy_document_v1"
  | "installation_invoice_v1"
  | "kvk_extract_v1"
  | "generic_charger_evidence_v1";

export type ParserEvidenceSource =
  | {
    kind: "signup_intake_file";
    signupIntakeFileRef: string;
    revisionNumber: number;
    evidenceVersionRef: string;
  }
  | {
    kind: "evidence_version";
    evidenceVersionId: string;
    evidenceVersionRef: string;
  }
  | {
    kind: "correction_replacement_candidate";
    replacementCandidateId: string;
    replacementCandidateRef: string;
    evidenceVersionRef: string;
  };

export type TrustedParserContext = Readonly<{
  provenanceAuthority: "trusted_server";
  observationRef: string;
  source: ParserEvidenceSource;
  byteSha256: string;
  serverObservedAt: string;
}>;

export type ParserSourceLocator = Readonly<{
  page: number | null;
  region: string | null;
  extractionMethod: string;
}>;

export type ParserStructuredAddress = Readonly<{
  street: string | null;
  houseNumber: string | null;
  houseNumberAddition: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
}>;

export type ParserObservedFactItem = Readonly<{
  factKey: DocumentFactKey;
  status: "observed" | "not_observed";
  observedValue: string | null;
  normalizedObservedValue: string | null;
  structuredAddress?: ParserStructuredAddress;
  sourceLocator: ParserSourceLocator | null;
  confidence: "high" | "medium" | "low" | "unavailable";
  limitation: string | null;
}>;

export type ParserDocumentTypeCandidate = Readonly<{
  documentType: string;
  score: number;
  indicators: ReadonlyArray<string>;
}>;

export type ParserObservationEnvelopeV1 = Readonly<{
  envelopeVersion: typeof PARSER_OBSERVATION_ENVELOPE_VERSION;
  provenanceAuthority: "trusted_server";
  observationRef: string;
  evidenceSource: ParserEvidenceSource;
  byteSha256: string;
  parserCoreVersion: string;
  parserProfile: DocumentParserProfileKey;
  profileVersion: string;
  providerAdapterId: string;
  providerAdapterVersion: string;
  providerConfigFingerprint: string;
  serverObservedAt: string;
  pageCount: number;
  documentTypeCandidates: ReadonlyArray<ParserDocumentTypeCandidate>;
  observedFacts: ReadonlyArray<ParserObservedFactItem>;
  outcome: "completed" | "completed_with_limitations" | "failed";
  limitations: ReadonlyArray<string>;
  executionIdentitySha256: string;
  envelopeHash: string;
}>;

export type ParserProviderFactCandidate = Readonly<{
  factKey: DocumentFactKey;
  rawValue: string;
  normalizedValue: string;
  structuredAddress?: ParserStructuredAddress;
  sourcePage: number | null;
  sourceRegion: string | null;
  confidence: "high" | "medium" | "low" | "unavailable";
  extractionMethod: string;
  displayable: boolean;
  rejectionReason: string | null;
}>;

export type ParserProviderExtraction =
  | Readonly<{
    ok: true;
    contentSha256: string;
    pageCount: number;
    documentTypeCandidates: ReadonlyArray<ParserDocumentTypeCandidate>;
    factCandidates: ReadonlyArray<ParserProviderFactCandidate>;
    limitations: ReadonlyArray<string>;
  }>
  | Readonly<{
    ok: false;
    limitation: string;
  }>;

export interface DocumentParserProviderAdapter {
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly configFingerprint: string;
  extract(document: Uint8Array): Promise<ParserProviderExtraction>;
}

export interface DocumentParserPort {
  parse(
    document: Uint8Array,
    profile: DocumentParserProfileKey,
    context: TrustedParserContext,
  ): Promise<ParserObservationEnvelopeV1>;
}

export function isParserObservationEnvelopeV1(
  value: unknown,
): value is ParserObservationEnvelopeV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.envelopeVersion === PARSER_OBSERVATION_ENVELOPE_VERSION &&
    record.provenanceAuthority === "trusted_server" &&
    typeof record.observationRef === "string" &&
    typeof record.byteSha256 === "string" &&
    /^[0-9a-f]{64}$/.test(record.byteSha256) &&
    typeof record.parserCoreVersion === "string" &&
    typeof record.parserProfile === "string" &&
    typeof record.profileVersion === "string" &&
    typeof record.providerAdapterId === "string" &&
    typeof record.providerAdapterVersion === "string" &&
    typeof record.providerConfigFingerprint === "string" &&
    typeof record.serverObservedAt === "string" &&
    Array.isArray(record.observedFacts) &&
    Array.isArray(record.limitations) &&
    typeof record.executionIdentitySha256 === "string" &&
    /^[0-9a-f]{64}$/.test(record.executionIdentitySha256) &&
    typeof record.envelopeHash === "string" &&
    /^[0-9a-f]{64}$/.test(record.envelopeHash);
}

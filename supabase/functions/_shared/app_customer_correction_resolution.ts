export const CUSTOMER_CORRECTION_RESOLUTION_TYPES = Object.freeze([
  "SOURCE_CONFIRMED",
  "DOCUMENT_TRANSCRIPTION",
] as const);

export type CustomerCorrectionResolutionType =
  (typeof CUSTOMER_CORRECTION_RESOLUTION_TYPES)[number];

export const CUSTOMER_CORRECTION_EVIDENCE_STRENGTHS = Object.freeze([
  "NO_SOURCE",
  "SINGLE_SOURCE",
  "MULTI_SOURCE_MATCH",
  "SOURCE_CONFLICT",
] as const);

export type CustomerCorrectionEvidenceStrength =
  (typeof CUSTOMER_CORRECTION_EVIDENCE_STRENGTHS)[number];

export type CustomerCorrectionResolutionEvidence = Readonly<{
  contentSha256: string;
  normalizedValue: string;
}>;

export type CustomerCorrectionResolutionRoute = Readonly<{
  resolutionType: CustomerCorrectionResolutionType;
  evidenceStrength: CustomerCorrectionEvidenceStrength;
  requiresEnvalAttention: boolean;
  downstreamVerificationBypassAllowed: false;
}>;

export function deriveCustomerCorrectionEvidenceStrength(
  sources: readonly CustomerCorrectionResolutionEvidence[],
): CustomerCorrectionEvidenceStrength | null {
  const valuesByContentSha = new Map<string, string>();
  for (const source of sources) {
    const contentSha256 = source.contentSha256.trim().toLowerCase();
    const normalizedValue = source.normalizedValue.trim();
    if (!/^[0-9a-f]{64}$/.test(contentSha256) || !normalizedValue) return null;
    const existing = valuesByContentSha.get(contentSha256);
    if (existing !== undefined && existing !== normalizedValue) return null;
    valuesByContentSha.set(contentSha256, normalizedValue);
  }
  if (valuesByContentSha.size === 0) return "NO_SOURCE";
  if (valuesByContentSha.size === 1) return "SINGLE_SOURCE";
  return new Set(valuesByContentSha.values()).size === 1
    ? "MULTI_SOURCE_MATCH"
    : "SOURCE_CONFLICT";
}

export function deriveCustomerCorrectionResolutionRoute(
  resolutionType: CustomerCorrectionResolutionType,
  sources: readonly CustomerCorrectionResolutionEvidence[],
): CustomerCorrectionResolutionRoute | null {
  const evidenceStrength = deriveCustomerCorrectionEvidenceStrength(sources);
  if (!evidenceStrength) return null;
  if (
    resolutionType === "SOURCE_CONFIRMED" &&
    evidenceStrength !== "SINGLE_SOURCE" &&
    evidenceStrength !== "MULTI_SOURCE_MATCH"
  ) return null;
  if (
    resolutionType === "DOCUMENT_TRANSCRIPTION" &&
    evidenceStrength !== "NO_SOURCE"
  ) return null;
  return Object.freeze({
    resolutionType,
    evidenceStrength,
    requiresEnvalAttention: resolutionType !== "SOURCE_CONFIRMED",
    downstreamVerificationBypassAllowed: false,
  });
}
